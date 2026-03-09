/** Types and loader for assets/data/map_data.json. */

export interface MapPosition {
    readonly x: number;
    readonly y: number;
}

export interface EdgeData {
    readonly start: string;
    readonly end: string;
    readonly distance: number;
}

export interface MapData {
    /** Harbour name → normalised [0,1] position. */
    readonly harbour: Record<string, MapPosition>;
    /** Travel-node ID (string) → normalised [0,1] position. */
    readonly travel_nodes: Record<string, MapPosition>;
    /** Weighted edges connecting harbours and travel nodes. */
    readonly edge: readonly EdgeData[];
}

/** Fetch and parse the map data JSON. */
export async function loadMapData(): Promise<MapData> {
    const resp = await fetch("./assets/data/map_data.json");
    if (!resp.ok) throw new Error(`Failed to load map data: ${resp.status}`);
    return resp.json() as Promise<MapData>;
}
