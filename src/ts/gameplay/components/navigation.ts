import { Component } from "../../ecs/Entity";

interface MapPosition {
    readonly x: number;
    readonly y: number;
}

/** Ship is currently travelling between two map positions. */
export class TravelRoute extends Component {
    /** 0 = at origin, 1 = arrived at destination. */
    progress: number = 0;

    constructor(
        public readonly origin: MapPosition,
        public readonly destination: MapPosition,
    ) { super(); }

    get totalDistance(): number {
        const dx = this.destination.x - this.origin.x;
        const dy = this.destination.y - this.origin.y;
        return Math.hypot(dx, dy);
    }
}

/** Full multi-hop route the ship must follow (shortest path result). */
export class NavigationPath extends Component {
    currentIndex: number = 0;

    constructor(
        /** Ordered waypoint positions from start to final destination. */
        public readonly waypoints: readonly MapPosition[],
    ) { super(); }

    get currentWaypoint(): MapPosition | undefined {
        return this.waypoints[this.currentIndex];
    }

    get nextWaypoint(): MapPosition | undefined {
        return this.waypoints[this.currentIndex + 1];
    }

    get finished(): boolean {
        return this.currentIndex >= this.waypoints.length - 1;
    }
}
