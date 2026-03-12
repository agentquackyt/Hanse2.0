import type { World } from "../ecs/Engine";
import type { Entity } from "../ecs/Entity";
import {
    Ship, PlayerControlled, Position, Inventory, ActiveShip,
    Name, City, TravelRoute,
} from "./components";
import { HUDcontroller } from "../render/HUDcontroller";

/**
 * Manages the player's fleet of ships.
 * Provides helpers for querying and cycling the active (selected) ship.
 */
export class FleetManager {
    private static _instance: FleetManager | null = null;
    private constructor() {}

    static getInstance(): FleetManager {
        if (!FleetManager._instance) FleetManager._instance = new FleetManager();
        return FleetManager._instance;
    }

    /** All player-owned ships in the world. */
    getPlayerShips(world: World): Entity[] {
        return world.query(Ship, PlayerControlled, Position, Inventory);
    }

    /** The currently selected ship (the one with the ActiveShip tag). */
    getActiveShip(world: World): Entity | undefined {
        return world.query(Ship, PlayerControlled, ActiveShip)[0];
    }

    /** Make the given player ship the active ship and refresh the HUD. */
    setActiveShip(world: World, ship: Entity): Entity {
        const ships = this.getPlayerShips(world);
        for (const candidate of ships) {
            if (candidate === ship) continue;
            if (candidate.hasComponent(ActiveShip)) {
                candidate.removeComponent(ActiveShip);
            }
        }

        if (!ship.hasComponent(ActiveShip)) {
            ship.addComponent(new ActiveShip());
        }

        this._notifyShipChanged(world, ship);
        return ship;
    }

    /**
     * Move the `ActiveShip` tag to the next player ship in the list.
     * Wraps around when reaching the end. Returns the new active ship.
     */
    cycleActiveShip(world: World): Entity | undefined {
        const ships = this.getPlayerShips(world);
        if (ships.length === 0) return undefined;

        const currentIndex = ships.findIndex(s => s.hasComponent(ActiveShip));

        // Remove tag from current
        if (currentIndex >= 0) {
            ships[currentIndex]!.removeComponent(ActiveShip);
        }

        const nextIndex = (currentIndex + 1) % ships.length;
        const next = ships[nextIndex]!;
        return this.setActiveShip(world, next);
    }

    /** Update HUD to reflect the newly active ship. */
    private _notifyShipChanged(world: World, ship: Entity): void {
        const hud = HUDcontroller.getInstance();
        hud.setPlayerShip(ship);

        if (ship.getComponent(TravelRoute)) {
            hud.updateOnSeaInfo(ship);
        } else {
            const shipPos = ship.getComponent(Position)!;
            const city = world.query(City, Position, Name).find(e => {
                const cp = e.getComponent(Position)!;
                return Math.abs(cp.x - shipPos.x) < 0.001 && Math.abs(cp.y - shipPos.y) < 0.001;
            });
            if (city) {
                hud.setOnSeaState(false);
                hud.updateCityInfo(
                    city.getComponent(Name)!.value,
                    city.getComponent(City)!.population,
                );
            } else {
                hud.updateOnSeaInfo(ship);
            }
        }

        hud.updateShipPanel(ship, world);
    }
}
