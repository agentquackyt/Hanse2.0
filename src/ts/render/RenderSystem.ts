import { TickSystem } from "../ecs/System";
import { Position, Name, City, Ship, TravelRoute, PlayerControlled, Market, NavigationPath, Kontor, IsPlayerOwned } from "../gameplay/components";
import type { NavigationGraph } from "../navigation/Graph";
import type { Entity } from "../ecs/Entity";
import { HUDcontroller } from "./HUDcontroller";

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;
const SMOOTH_SAMPLES = 6;

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

    constructor(canvas: HTMLCanvasElement) {
        super();
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D rendering context from canvas.");
        this._ctx    = ctx;
        this._canvas = canvas;
        this._worldMapImage = new Image();
        this._worldMapImage.src = "/assets/images/world_map_2.svg";

        this._backgroundImage = new Image();
        this._backgroundImage.src = "/assets/images/texture_background.webp";

        this._shipImage = new Image();
        this._shipImage.src = "/assets/images/ship.svg";
        this._bindInputEvents();
    }

    // ------------------------------------------------------------------ helpers

    /** Convert a screen-pixel position to normalised world coords. */
    private _screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
        const w = this._canvas.width;
        const h = this._canvas.height;
        const wx = sx / (this._zoom * w) + this._offsetX;
        const wy = sy / (this._zoom * h) + this._offsetY;
        return { wx, wy };
    }

    /** Convert a normalised world position to screen pixels. */
    private _worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
        const w = this._canvas.width;
        const h = this._canvas.height;
        return {
            sx: (wx - this._offsetX) * this._zoom * w,
            sy: (wy - this._offsetY) * this._zoom * h,
        };
    }

    /** Pixels-per-world-unit for line/dash sizing (uniform, based on shorter axis). */
    private _scale(): number {
        return this._zoom * Math.min(this._canvas.width, this._canvas.height);
    }

    // ------------------------------------------------------------------ camera

    private _clampOffset(): void {
        const maxX = 1 - 1 / this._zoom;
        const maxY = 1 - 1 / this._zoom;
        this._offsetX = Math.max(0, Math.min(this._offsetX, maxX));
        this._offsetY = Math.max(0, Math.min(this._offsetY, maxY));
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
            this._offsetX = wx - sx / (this._zoom * canvas.width);
            this._offsetY = wy - sy / (this._zoom * canvas.height);
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
            this._offsetX -= (e.clientX - this._dragLastX) / (this._zoom * canvas.width);
            this._offsetY -= (e.clientY - this._dragLastY) / (this._zoom * canvas.height);
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
        this._clampOffset();

        const w = this._canvas.width;
        const h = this._canvas.height;

        // Camera transform: normalised [0,1] world → screen pixels.
        // screen_x = (world_x - offsetX) * zoom * canvasWidth
        this._ctx.setTransform(
            this._zoom * w, 0,
            0, this._zoom * h,
            -this._offsetX * this._zoom * w,
            -this._offsetY * this._zoom * h,
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
        // Collect positions of all docked ships (no route, no nav path).
        const dockedPositions: Array<{ x: number; y: number }> = [];
        for (const ship of this.world.query(Position, Ship)) {
            if (!ship.hasComponent(TravelRoute) && !ship.hasComponent(NavigationPath)) {
                const p = ship.getComponent(Position)!;
                dockedPositions.push({ x: p.x, y: p.y });
            }
        }

        for (const entity of this.world.query(Position, City)) {
            const pos    = entity.getComponent(Position)!;
            const name   = entity.getComponent(Name);
            const market = entity.getComponent(Market);

            // Check if any docked ship is at this city.
            const hasDocked = dockedPositions.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 0.01);

            const { sx, sy } = this._worldToScreen(pos.x, pos.y);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            // City dot
            ctx.beginPath();
            if(this._zoom > 1.5) {
                ctx.arc(sx, sy, 10, 0, Math.PI * 2);
            } else {
                ctx.arc(sx, sy, 8, 0, Math.PI * 2);
            }
            ctx.fillStyle = hasDocked ? "#5aafff" : "#ffdeca";
            ctx.fill();
            ctx.strokeStyle = hasDocked ? "#0053a0" : "#ae8871";
            ctx.lineWidth = 3;
            ctx.stroke();

            // Label
            if (name && this._zoom > 2) {
                ctx.font = "bold 15px sans-serif";
                ctx.fillStyle = "#ffdeca";
                ctx.shadowColor = "#1c0d007a";
                ctx.shadowBlur = 4;
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
        const SHIP_W = 40;
        const SHIP_H = 36;
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
                ctx.drawImage(this._shipImage, -SHIP_W / 2, -SHIP_H / 2, SHIP_W, SHIP_H);
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
