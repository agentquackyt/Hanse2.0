import { TickSystem } from "../../ecs/System";
import { Position, Ship, TravelRoute, NavigationPath, City, Name } from "../components";
import { HUDcontroller } from "../../render/HUDcontroller";

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

                // Find the city entity at the destination
                const destinationCity = this.findCityAtPosition(route.destination);
                if (destinationCity) {
                    // Clear the "on sea" flag FIRST so updateCityInfo is not blocked
                    const hud = HUDcontroller.getInstance();
                    hud.setOnSeaState(false);
                    this.triggerHUDController(destinationCity);
                }

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

    /** Find a city entity at the given map position. */
    private findCityAtPosition(pos: { x: number; y: number }): any {
        const epsilon = 0.001; // Small tolerance for floating-point comparison
        for (const entity of this.world.query(Position, City)) {
            const entityPos = entity.getComponent(Position)!;
            if (Math.abs(entityPos.x - pos.x) < epsilon && Math.abs(entityPos.y - pos.y) < epsilon) {
                return entity;
            }
        }
        return null;
    }

    /** Trigger the HUD controller to display city information. */
    private triggerHUDController(city: any): void {
        const hud = HUDcontroller.getInstance();
        const nameComp = city.getComponent(Name);
        const cityComp = city.getComponent(City);

        if (nameComp && cityComp) {
            const cityName = nameComp.value;
            const population = cityComp.population;
            hud.updateCityInfo(cityName, population);
        }
    }
}
