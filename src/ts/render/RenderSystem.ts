import { TickSystem } from "../ecs/System";
import { Position, Name, City, Ship, TravelRoute, PlayerControlled, Market, NavigationPath, Kontor, IsPlayerOwned } from "../gameplay/components";
import type { NavigationGraph } from "../navigation/Graph";
import type { Entity } from "../ecs/Entity";
import { HUDcontroller } from "./HUDcontroller";
import { getPreloadedImage, loadImageAsset } from "../boot/AssetPreloader";

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;
const SMOOTH_SAMPLES = 6;
const WORLD_MAP_URL = "/assets/images/world_map.svg";
const BACKGROUND_TEXTURE_URL = "/assets/images/texture_background.webp";
const SHIP_SPRITE_URL = "/assets/images/ship.svg";
const DEFAULT_MAP_ASPECT_RATIO = 196.45584 / 111.70967;

interface Pt { readonly x: number; readonly y: number }

/** Catmull-Rom interpolation between p1 and p2 using p0 and p3 as tangent guides. */
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const t2 = t * t, t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
}

/** Subdivide a polyline into a smooth curve using Catmull-Rom splines. */
function smoothPath(pts: readonly Pt[], samples = SMOOTH_SAMPLES): Pt[] {
    if (pts.length < 3) return [...pts];
    const out: Pt[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]!;
        const p1 = pts[i]!;
        const p2 = pts[i + 1]!;
        const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
        for (let s = 1; s <= samples; s++) {
            out.push(catmullRom(p0, p1, p2, p3, s / samples));
        }
    }
    return out;
}

/**
 * Renders the world map, cities, and ships onto a 2-D canvas each frame.
 *
 * World coordinates are normalised [0, 1]. The camera transform scales
 * them up to canvas-pixel space (× canvas.width / canvas.height) and
 * then applies zoom + pan.
 */
export class MapRenderSystem extends TickSystem {
    private readonly _ctx: CanvasRenderingContext2D;
    private readonly _canvas: HTMLCanvasElement;
    private _worldMapImage: HTMLImageElement | null = null;
    private _backgroundImage: HTMLImageElement | null = null;
    private _shipImage: HTMLImageElement | null = null;

    /** Set after map data is loaded so the click handler can route ships. */
    graph: NavigationGraph | null = null;
    /** Harbour names from map_data, kept for nearest-harbour lookups. */
    harbourNames: string[] = [];

    // ---- Camera state (in normalised world-space [0,1]) ----
    private _zoom = MIN_ZOOM;
    private _offsetX = 0;
    private _offsetY = 0;
    private _isDragging = false;
    private _dragLastX = 0;
    private _dragLastY = 0;
    private _hasInitialized = false;

    constructor(canvas: HTMLCanvasElement) {
        super();
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D rendering context from canvas.");
        this._ctx    = ctx;
        this._canvas = canvas;
        this._worldMapImage = getPreloadedImage(WORLD_MAP_URL);
        this._backgroundImage = getPreloadedImage(BACKGROUND_TEXTURE_URL);
        this._shipImage = getPreloadedImage(SHIP_SPRITE_URL);

        void loadImageAsset(WORLD_MAP_URL).then((img) => {
            this._worldMapImage = img;
        });
        void loadImageAsset(BACKGROUND_TEXTURE_URL).then((img) => {
            this._backgroundImage = img;
        });
        void loadImageAsset(SHIP_SPRITE_URL).then((img) => {
            this._shipImage = img;
        });
        this._bindInputEvents();
    }

    renderOnce(): void {
        this.update(0);
    }

    // ------------------------------------------------------------------ helpers

    private _getMapAspectRatio(): number {
        if (this._worldMapImage?.naturalWidth && this._worldMapImage.naturalHeight) {
            return this._worldMapImage.naturalWidth / this._worldMapImage.naturalHeight;
        }
        return DEFAULT_MAP_ASPECT_RATIO;
    }

    /**
     * Compute per-axis pixel scales so the map *covers* the full canvas
     * without shearing (like CSS background-size: cover).
     * scaleX / scaleY always equals the map's aspect ratio.
     */
    private _getBaseScale(): { scaleX: number; scaleY: number } {
        const ar = this._getMapAspectRatio();
        const w  = this._canvas.width;
        const h  = this._canvas.height;
        const scaleX = Math.max(w, h * ar);
        const scaleY = scaleX / ar;
        return { scaleX, scaleY };
    }

    /** Convert a screen-pixel position to normalised world coords. */
    private _screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
        const { scaleX, scaleY } = this._getBaseScale();
        return {
            wx: sx / (this._zoom * scaleX) + this._offsetX,
            wy: sy / (this._zoom * scaleY) + this._offsetY,
        };
    }

    /** Convert a normalised world position to screen pixels. */
    private _worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
        const { scaleX, scaleY } = this._getBaseScale();
        return {
            sx: (wx - this._offsetX) * this._zoom * scaleX,
            sy: (wy - this._offsetY) * this._zoom * scaleY,
        };
    }

    /** Pixels-per-world-unit for line/dash sizing (uniform, based on shorter axis). */
    private _scale(): number {
        const { scaleX, scaleY } = this._getBaseScale();
        return this._zoom * Math.min(scaleX, scaleY);
    }

    // ------------------------------------------------------------------ camera

    private _clampOffset(): void {
        const { scaleX, scaleY } = this._getBaseScale();
        const maxX = Math.max(0, 1 - this._canvas.width  / (this._zoom * scaleX));
        const maxY = Math.max(0, 1 - this._canvas.height / (this._zoom * scaleY));
        this._offsetX = Math.max(0, Math.min(this._offsetX, maxX));
        this._offsetY = Math.max(0, Math.min(this._offsetY, maxY));
    }

    private _centerOffset(): void {
        const { scaleX, scaleY } = this._getBaseScale();
        this._offsetX = Math.max(0, 1 - this._canvas.width  / (this._zoom * scaleX)) / 2;
        this._offsetY = Math.max(0, 1 - this._canvas.height / (this._zoom * scaleY)) / 2;
    }

    // ------------------------------------------------------------------ input

    private _bindInputEvents(): void {
        const canvas = this._canvas;

        // ---- Zoom: scroll wheel, pivot on cursor ----
        canvas.addEventListener("wheel", (e: WheelEvent) => {
            e.preventDefault();
            const factor  = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoom * factor));
            if (newZoom === this._zoom) return;

            const rect = canvas.getBoundingClientRect();
            const sx   = e.clientX - rect.left;
            const sy   = e.clientY - rect.top;
            const { wx, wy } = this._screenToWorld(sx, sy);
            this._zoom    = newZoom;
            const { scaleX, scaleY } = this._getBaseScale();
            this._offsetX = wx - sx / (this._zoom * scaleX);
            this._offsetY = wy - sy / (this._zoom * scaleY);
            this._clampOffset();
        }, { passive: false });

        // ---- Pan: right mouse button drag ----
        canvas.addEventListener("mousedown", (e: MouseEvent) => {
            if (e.button !== 2) return;
            this._isDragging = true;
            this._dragLastX  = e.clientX;
            this._dragLastY  = e.clientY;
            canvas.style.cursor = "grabbing";
        });

        canvas.addEventListener("mousemove", (e: MouseEvent) => {
            if (!this._isDragging) return;
            const { scaleX, scaleY } = this._getBaseScale();
            this._offsetX -= (e.clientX - this._dragLastX) / (this._zoom * scaleX);
            this._offsetY -= (e.clientY - this._dragLastY) / (this._zoom * scaleY);
            this._clampOffset();
            this._dragLastX = e.clientX;
            this._dragLastY = e.clientY;
        });

        const stopDrag = () => {
            if (!this._isDragging) return;
            this._isDragging = false;
            canvas.style.cursor = "grab";
        };

        canvas.addEventListener("mouseup",    (e: MouseEvent) => { if (e.button === 2) stopDrag(); });
        canvas.addEventListener("mouseleave", stopDrag);

        // Suppress the browser right-click context menu on the canvas.
        canvas.addEventListener("contextmenu", (e: Event) => e.preventDefault());

        // ---- Left click: Shift+click navigates ship, plain click opens city modal ----
        canvas.addEventListener("click", (e: MouseEvent) => {
            if (e.button !== 0) return;
            const rect = canvas.getBoundingClientRect();
            const { wx, wy } = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            if (e.shiftKey) {
                this._handleShipMovement(wx, wy);
            } else {
                this._handleCityModalClick(wx, wy);
            }
        });

        canvas.style.cursor = "grab";
    }

    // ------------------------------------------------------------------ click → travel

    /** Open the city overview modal if the player has access (docked ship or kontor). */
    private _handleCityModalClick(wx: number, wy: number): void {
        const CLICK_RADIUS = 0.025;
        let clickedCity: Entity | null = null;
        let bestDist = Infinity;
        for (const entity of this.world.query(Position, City)) {
            const pos = entity.getComponent(Position)!;
            const d = Math.hypot(pos.x - wx, pos.y - wy);
            if (d < bestDist && d < CLICK_RADIUS) {
                bestDist = d;
                clickedCity = entity;
            }
        }
        if (!clickedCity) return;

        const cityPos = clickedCity.getComponent(Position)!;

        // Access check A — player ship docked at this city (no active route).
        let playerShip: Entity | null = null;
        for (const ship of this.world.query(Position, Ship, PlayerControlled)) {
            if (ship.hasComponent(TravelRoute) || ship.hasComponent(NavigationPath)) continue;
            const sp = ship.getComponent(Position)!;
            if (Math.hypot(sp.x - cityPos.x, sp.y - cityPos.y) < 0.01) {
                playerShip = ship;
                break;
            }
        }

        // Access check B — player-owned kontor at this city.
        let kontorEntity: Entity | null = null;
        for (const k of this.world.query(Position, Kontor, IsPlayerOwned)) {
            const kp = k.getComponent(Position)!;
            if (Math.hypot(kp.x - cityPos.x, kp.y - cityPos.y) < 0.01) {
                kontorEntity = k;
                break;
            }
        }

        if (!playerShip && !kontorEntity) return;

        HUDcontroller.getInstance().createCityOverviewModal(clickedCity, playerShip, kontorEntity);
    }

    /** Shift+click: navigate the player ship to the clicked harbour. */
    private _handleShipMovement(wx: number, wy: number): void {
        const graph = this.graph;
        if (!graph) return;

        // Find the nearest city entity within a click radius (~0.02 in world space).
        const CLICK_RADIUS = 0.025;
        let clickedCity: Entity | null = null;
        let bestDist = Infinity;
        for (const entity of this.world.query(Position, City)) {
            const pos = entity.getComponent(Position)!;
            const d   = Math.hypot(pos.x - wx, pos.y - wy);
            if (d < bestDist && d < CLICK_RADIUS) {
                bestDist = d;
                clickedCity = entity;
            }
        }
        if (!clickedCity) return;

        const destName = clickedCity.getComponent(Name)?.value;
        if (!destName) return;

        // Find the player ship.
        const playerShips = this.world.query(Position, Ship, PlayerControlled);
        if (playerShips.length === 0) return;
        const ship = playerShips[0]!;
        const shipPos = ship.getComponent(Position)!;

        // Determine the nearest graph node to the ship's current position.
        const startNode = graph.nearestNode(shipPos.x, shipPos.y);
        if (startNode === destName) return; // already there

        // Update HUD immediately when attempting to travel to a different destination
        const hud = HUDcontroller.getInstance();
        hud.updateOnSeaInfo(ship);

        const result = graph.findShortestPath(startNode, destName);
        if (!result) return;

        // Convert path node IDs → world positions, then smooth the corners.
        const raw = result.path.map(id => graph.getNodePosition(id)!);
        const waypoints = smoothPath(raw);

        // Cancel any existing travel.
        if (ship.hasComponent(TravelRoute))    ship.removeComponent(TravelRoute);
        if (ship.hasComponent(NavigationPath)) ship.removeComponent(NavigationPath);

        // Set multi-hop navigation.
        ship.addComponent(new NavigationPath(waypoints));
        if (waypoints.length >= 2) {
            ship.addComponent(new TravelRoute(waypoints[0]!, waypoints[1]!));
            ship.getComponent(NavigationPath)!.currentIndex = 0;
        }
    }

    // ------------------------------------------------------------------ update

    override update(_dt: number): void {
        this._canvas.width  = this._canvas.clientWidth;
        this._canvas.height = this._canvas.clientHeight;

        if (!this._hasInitialized && this._canvas.width > 0 && this._canvas.height > 0) {
            this._centerOffset();
            this._hasInitialized = true;
        }

        this._clampOffset();

        const { scaleX, scaleY } = this._getBaseScale();

        // "Cover" camera transform: world [0,1]×[0,1] maps to pixels with a
        // uniform aspect-ratio-preserving scale that fills the entire canvas.
        this._ctx.setTransform(
            this._zoom * scaleX, 0,
            0, this._zoom * scaleY,
            -this._offsetX * this._zoom * scaleX,
            -this._offsetY * this._zoom * scaleY,
        );

        this._drawBackground();
        this._drawNavigationPaths();
        this._drawTravelRoutes();
        this._drawCities();
        this._drawShips();

        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ------------------------------------------------------------------ draw

    private _drawBackground(): void {
        const ctx = this._ctx;
        if (this._backgroundImage?.complete) {
            ctx.drawImage(this._backgroundImage, 0, 0, 1, 1);
        } else {
            ctx.fillStyle = "#1d0c00";
            ctx.fillRect(0, 0, 1, 1);
        }
        if (this._worldMapImage?.complete) {
            ctx.drawImage(this._worldMapImage, 0, 0, 1, 1);
        }
    }

    /** Draw the full planned multi-hop route as a dashed polyline. */
    private _drawNavigationPaths(): void {
        const ctx = this._ctx;
        const s   = this._scale();
        for (const entity of this.world.query(Position, Ship, NavigationPath)) {
            const nav = entity.getComponent(NavigationPath)!;
            const wps = nav.waypoints;
            if (wps.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo(wps[0]!.x, wps[0]!.y);
            for (let i = 1; i < wps.length; i++) {
                ctx.lineTo(wps[i]!.x, wps[i]!.y);
            }
            ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
            ctx.setLineDash([4 / s, 6 / s]);
            ctx.lineWidth = 2 / s;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    private _drawTravelRoutes(): void {
        const ctx = this._ctx;
        const s   = this._scale();
        for (const entity of this.world.query(Position, Ship, TravelRoute)) {
            const route = entity.getComponent(TravelRoute)!;
            ctx.beginPath();
            ctx.moveTo(route.origin.x, route.origin.y);
            ctx.lineTo(route.destination.x, route.destination.y);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
            ctx.setLineDash([4 / s, 6 / s]);
            ctx.lineWidth = 1 / s;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    private _drawCities(): void {
        const ctx = this._ctx;

        // Collect positions where the player's ship is docked (no route, no nav path).
        const playerDockedPositions: Array<{ x: number; y: number }> = [];
        for (const ship of this.world.query(Position, Ship, PlayerControlled)) {
            if (!ship.hasComponent(TravelRoute) && !ship.hasComponent(NavigationPath)) {
                const p = ship.getComponent(Position)!;
                playerDockedPositions.push({ x: p.x, y: p.y });
            }
        }

        // Collect positions that have a player-owned kontor.
        const kontorPositions: Array<{ x: number; y: number }> = [];
        for (const k of this.world.query(Position, Kontor, IsPlayerOwned)) {
            const p = k.getComponent(Position)!;
            kontorPositions.push({ x: p.x, y: p.y });
        }

        for (const entity of this.world.query(Position, City)) {
            const pos    = entity.getComponent(Position)!;
            const name   = entity.getComponent(Name);

            const hasPlayerDocked = playerDockedPositions.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 0.01);
            const hasKontor       = kontorPositions.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 0.01);

            const { sx, sy } = this._worldToScreen(pos.x, pos.y);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            const scale = hasPlayerDocked ? 1.2 : 1.0;
            const outerRadius = (this._zoom > 1.5 ? 11 : 8.5) * scale;
            const innerRadius = (this._zoom > 1.5 ? 6.5 : 5) * scale;
            const coreRadius  = (this._zoom > 1.5 ? 3.1 : 2.4) * scale;

            // Outer glow
            ctx.beginPath();
            ctx.arc(sx, sy, outerRadius + 3, 0, Math.PI * 2);
            ctx.fillStyle = hasKontor
                ? "rgba(220, 60, 60, 0.20)"
                : hasPlayerDocked
                    ? "rgba(98, 139, 233, 0.18)"
                    : "rgba(240, 200, 120, 0.14)";
            ctx.fill();

            // Outer medallion
            ctx.beginPath();
            ctx.arc(sx, sy, outerRadius, 0, Math.PI * 2);
            const outerGradient = ctx.createRadialGradient(sx - 2, sy - 3, 1, sx, sy, outerRadius);
            outerGradient.addColorStop(0, hasKontor ? "#e4acac" : hasPlayerDocked ? "#acb6e4" : "#dcb98a");
            outerGradient.addColorStop(0.55, hasKontor ? "#b84f4f" : hasPlayerDocked ? "#4f76b8" : "#a8784b");
            outerGradient.addColorStop(1, "#8f6741");
            ctx.fillStyle = outerGradient;
            ctx.fill();
            ctx.strokeStyle = "#e0b87f";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner plate
            ctx.beginPath();
            ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2);
            const innerGradient = ctx.createRadialGradient(sx - 1, sy - 2, 1, sx, sy, innerRadius);
            innerGradient.addColorStop(0, hasKontor ? "#f89898" : hasPlayerDocked ? "#8890f8" : "#f3d7ab");
            innerGradient.addColorStop(1, hasKontor ? "#7a2d2d" : hasPlayerDocked ? "#4660ac" : "#7a4d2d");
            ctx.fillStyle = innerGradient;
            ctx.fill();

            // Core marker
            ctx.beginPath();
            ctx.arc(sx, sy, coreRadius, 0, Math.PI * 2);
            ctx.fillStyle = hasKontor ? "#7c2424" : hasPlayerDocked ? "#244c7c" : "#7a4d2d";
            ctx.fill();


            // Label
            if (name && this._zoom > 2) {
                ctx.font = '600 15px "Baskervville", serif';
                ctx.fillStyle = "#f3d7ab";
                ctx.shadowColor = "rgba(28, 13, 0, 0.85)";
                ctx.shadowBlur = 6;
                // center the label below the city dot
                const textWidth = ctx.measureText(name.value).width;
                ctx.fillText(name.value, sx - textWidth / 2, sy + 28);

                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    }

    private _drawShips(): void {
        const ctx = this._ctx;
        const SHIP_W = 40/3*2;
        const SHIP_H = 36/3*2;
        for (const entity of this.world.query(Position, Ship)) {
            const pos = entity.getComponent(Position)!;
            const isPlayer = entity.hasComponent(PlayerControlled);
            const route = entity.getComponent(TravelRoute);
            const navPath = entity.getComponent(NavigationPath);

            // Don't render the ship while it's docked (no active route or path).
            if (!route && !navPath) continue;

            // Flip horizontally when the ship is moving in the positive-x direction.
            const dx = route ? route.destination.x - route.origin.x : 0;
            const flipX = dx > 0 ? 1 : -1;

            const { sx, sy } = this._worldToScreen(pos.x, pos.y);
            ctx.save();
            ctx.setTransform(flipX, 0, 0, 1, sx, sy);

            if (this._shipImage?.complete && this._shipImage.naturalWidth > 0) {
                // 1,5x scaled up for maxium zoom 
                let zoomMultiplier = this._zoom > 2 ? 1.5 : 1;
                let width = SHIP_W * zoomMultiplier;
                let height = SHIP_H * zoomMultiplier;

                ctx.drawImage(this._shipImage,  -width / 2, -height / 2, width, height);
            } else {
                // Fallback triangle while the image loads.
                ctx.beginPath();
                ctx.moveTo(0, -9);
                ctx.lineTo(6, 7);
                ctx.lineTo(-6, 7);
                ctx.closePath();
                ctx.fillStyle = isPlayer ? "#5aafff" : "#ffaa44";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.restore();

            const name = entity.getComponent(Name);
            if (name && this._zoom > 2.5) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.font = "14px sans-serif";
                ctx.fillStyle = isPlayer ? "#8dcfff" : "#ffcc88";
                ctx.shadowColor = "#000";
                ctx.shadowBlur = 3;
                ctx.fillText(name.value, sx + 30, sy+10);
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }
    }
}
