import type { MapData, MapPosition } from "./MapData";

interface Neighbor {
    readonly id: string;
    readonly distance: number;
}

/**
 * Weighted undirected graph built from map_data.json.
 * Nodes = harbours + travel_nodes.  Edges = bidirectional links with distance.
 */
export class NavigationGraph {
    private readonly _nodes = new Map<string, MapPosition>();
    private readonly _adj = new Map<string, Neighbor[]>();

    constructor(data: MapData) {
        // Register all harbour nodes.
        for (const [name, pos] of Object.entries(data.harbour)) {
            this._nodes.set(name, pos);
            this._adj.set(name, []);
        }
        // Register all travel nodes.
        for (const [id, pos] of Object.entries(data.travel_nodes)) {
            this._nodes.set(id, pos);
            this._adj.set(id, []);
        }
        // Add bidirectional edges.
        for (const edge of data.edge) {
            this._addEdge(edge.start, edge.end, edge.distance);
        }
    }

    private _addEdge(a: string, b: string, distance: number): void {
        this._adj.get(a)?.push({ id: b, distance });
        this._adj.get(b)?.push({ id: a, distance });
    }

    /** Get the world position of a node by its ID (harbour name or travel-node id). */
    getNodePosition(id: string): MapPosition | undefined {
        return this._nodes.get(id);
    }

    /** All node IDs in the graph. */
    nodeIds(): Iterable<string> {
        return this._nodes.keys();
    }

    /**
     * Find the graph node closest (Euclidean) to an arbitrary world position.
     * Useful for locating the nearest node to a mid-sea ship.
     */
    nearestNode(x: number, y: number): string {
        let bestId = "";
        let bestDist = Infinity;
        for (const [id, pos] of this._nodes) {
            const d = Math.hypot(pos.x - x, pos.y - y);
            if (d < bestDist) { bestDist = d; bestId = id; }
        }
        return bestId;
    }

    /**
     * Find the harbour node closest (Euclidean) to an arbitrary world position.
     */
    nearestHarbour(x: number, y: number, harbourNames: Iterable<string>): string {
        let bestId = "";
        let bestDist = Infinity;
        for (const name of harbourNames) {
            const pos = this._nodes.get(name);
            if (!pos) continue;
            const d = Math.hypot(pos.x - x, pos.y - y);
            if (d < bestDist) { bestDist = d; bestId = name; }
        }
        return bestId;
    }

    /**
     * Dijkstra's algorithm – returns the shortest path (list of node IDs,
     * including start and end) and its total weighted distance.
     * Returns null if no path exists.
     */
    findShortestPath(from: string, to: string): { path: string[]; totalDistance: number } | null {
        if (!this._nodes.has(from) || !this._nodes.has(to)) return null;
        if (from === to) return { path: [from], totalDistance: 0 };

        const dist = new Map<string, number>();
        const prev = new Map<string, string>();
        // Simple priority queue using a sorted array – graph is tiny (~100 nodes).
        const queue: string[] = [];

        for (const id of this._nodes.keys()) {
            dist.set(id, Infinity);
        }
        dist.set(from, 0);
        queue.push(from);

        while (queue.length > 0) {
            // Pick node with smallest tentative distance.
            queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
            const current = queue.shift()!;

            if (current === to) break;

            const neighbors = this._adj.get(current);
            if (!neighbors) continue;

            const currentDist = dist.get(current)!;
            for (const { id: neighbor, distance } of neighbors) {
                const alt = currentDist + distance;
                if (alt < dist.get(neighbor)!) {
                    dist.set(neighbor, alt);
                    prev.set(neighbor, current);
                    if (!queue.includes(neighbor)) queue.push(neighbor);
                }
            }
        }

        // Reconstruct path.
        if (!prev.has(to) && from !== to) return null;
        const path: string[] = [];
        let node: string | undefined = to;
        while (node !== undefined) {
            path.push(node);
            node = prev.get(node);
        }
        path.reverse();

        return { path, totalDistance: dist.get(to)! };
    }
}
