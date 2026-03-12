import { Component } from "../../ecs/Entity";
import type { ShipClassName } from "./identity";

/** Tracks an in-progress ship building order at a city. */
export class ShipBuildOrder extends Component {
    /** Materials gathered so far (good name → quantity). */
    readonly materialsCollected = new Map<string, number>();

    /** Real-seconds timestamp when construction began (null = still gathering). */
    buildStartRealSeconds: number | null = null;

    /** Whether the order is fully complete and the ship has been spawned. */
    complete = false;

    constructor(
        /** Entity ID of the city where the ship is being built. */
        public readonly cityEntityId: string,
        /** Which ship class is being built. */
        public readonly shipType: ShipClassName,
        /** Total gold cost (already deducted when order is placed). */
        public readonly goldCost: number,
        /** Total materials required (good name → quantity). */
        public readonly materialsRequired: ReadonlyMap<string, number>,
        /** Build duration in real seconds once all materials are gathered. */
        public readonly buildDurationRealSeconds: number,
    ) { super(); }

    /** Check whether all required materials have been collected. */
    get allMaterialsCollected(): boolean {
        for (const [good, required] of this.materialsRequired) {
            if ((this.materialsCollected.get(good) ?? 0) < required) return false;
        }
        return true;
    }
}
