import { TickSystem } from "../../ecs/System";
import { Position, Ship, TravelRoute } from "../components";

/** Advances ships with an active TravelRoute along their path each frame. */
export class MovementSystem extends TickSystem {
    override update(dt: number): void {
        for (const entity of this.world.query(Position, Ship, TravelRoute)) {
            const ship  = entity.getComponent(Ship)!;
            const route = entity.getComponent(TravelRoute)!;
            const pos   = entity.getComponent(Position)!;

            const advance = (ship.speedUnitsPerSecond * dt) / Math.max(0.001, route.totalDistance);
            route.progress = Math.min(1, route.progress + advance);

            pos.x = route.origin.x + (route.destination.x - route.origin.x) * route.progress;
            pos.y = route.origin.y + (route.destination.y - route.origin.y) * route.progress;

            if (route.progress >= 1) {
                entity.removeComponent(TravelRoute); // arrived
            }
        }
    }
}
