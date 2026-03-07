import { TickSystem } from "../../ecs/System";
import { Position, Ship, TravelRoute, NavigationPath } from "../components";

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
                entity.removeComponent(TravelRoute);

                // If the ship has a multi-hop NavigationPath, advance to the next segment.
                const navPath = entity.getComponent(NavigationPath);
                if (navPath && !navPath.finished) {
                    navPath.currentIndex++;
                    const next = navPath.nextWaypoint;
                    if (next) {
                        const cur = navPath.currentWaypoint!;
                        entity.addComponent(new TravelRoute(cur, next));
                    } else {
                        entity.removeComponent(NavigationPath);
                    }
                } else if (navPath) {
                    entity.removeComponent(NavigationPath);
                }
            }
        }
    }
}
