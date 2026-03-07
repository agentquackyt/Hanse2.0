import { TickSystem } from "../ecs/System";
import { Position, Name, City, Ship, TravelRoute, PlayerControlled, Market } from "../gameplay/components";

/** Renders the world map, cities, and ships onto a 2-D canvas each frame. */
export class MapRenderSystem extends TickSystem {
    private readonly _ctx: CanvasRenderingContext2D;
    private readonly _canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        super();
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D rendering context from canvas.");
        this._ctx    = ctx;
        this._canvas = canvas;
    }

    override update(_dt: number): void {
        // Sync canvas resolution to its CSS size (handles window resize)
        this._canvas.width  = this._canvas.clientWidth;
        this._canvas.height = this._canvas.clientHeight;

        this._drawBackground();
        this._drawTravelRoutes();
        this._drawCities();
        this._drawShips();
    }

    private _drawBackground(): void {
        const { _ctx: ctx, _canvas: cv } = this;
        ctx.fillStyle = "#0d2240";
        ctx.fillRect(0, 0, cv.width, cv.height);

        // Subtle grid
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        for (let x = 0; x < cv.width; x += 60) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
        }
        for (let y = 0; y < cv.height; y += 60) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
        }
    }

    private _drawTravelRoutes(): void {
        const ctx = this._ctx;
        for (const entity of this.world.query(Position, Ship, TravelRoute)) {
            const route = entity.getComponent(TravelRoute)!;
            ctx.beginPath();
            ctx.moveTo(route.origin.x, route.origin.y);
            ctx.lineTo(route.destination.x, route.destination.y);
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.setLineDash([4, 6]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    private _drawCities(): void {
        const ctx = this._ctx;
        for (const entity of this.world.query(Position, City)) {
            const pos    = entity.getComponent(Position)!;
            const name   = entity.getComponent(Name);
            const market = entity.getComponent(Market);

            // Outer glow
            const glow = ctx.createRadialGradient(pos.x, pos.y, 4, pos.x, pos.y, 20);
            glow.addColorStop(0, "rgba(232,200,112,0.4)");
            glow.addColorStop(1, "rgba(232,200,112,0)");
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // City dot
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = "#e8c870";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label
            if (name) {
                ctx.font = "bold 13px sans-serif";
                ctx.fillStyle = "#fff";
                ctx.shadowColor = "#000";
                ctx.shadowBlur = 4;
                ctx.fillText(name.value, pos.x + 11, pos.y + 4);
                ctx.shadowBlur = 0;
            }

            // Good count badge
            if (market) {
                let count = 0;
                for (const [, entry] of market.goods()) count += entry.supply;
                ctx.font = "10px sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.fillText(`${count} units`, pos.x + 11, pos.y + 17);
            }
        }
    }

    private _drawShips(): void {
        const ctx = this._ctx;
        for (const entity of this.world.query(Position, Ship)) {
            const pos = entity.getComponent(Position)!;
            const isPlayer = entity.hasComponent(PlayerControlled);
            const route = entity.getComponent(TravelRoute);

            // Compute heading angle
            let angle = -Math.PI / 2; // pointing up by default
            if (route) {
                const dx = route.destination.x - route.origin.x;
                const dy = route.destination.y - route.origin.y;
                if (dx !== 0 || dy !== 0) angle = Math.atan2(dy, dx) - Math.PI / 2;
            }

            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(angle);

            // Ship silhouette (small triangle)
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

            ctx.restore();

            // Ship name label
            const name = entity.getComponent(Name);
            if (name) {
                ctx.font = "11px sans-serif";
                ctx.fillStyle = isPlayer ? "#8dcfff" : "#ffcc88";
                ctx.shadowColor = "#000";
                ctx.shadowBlur = 3;
                ctx.fillText(name.value, pos.x + 12, pos.y - 4);
                ctx.shadowBlur = 0;
            }
        }
    }
}
