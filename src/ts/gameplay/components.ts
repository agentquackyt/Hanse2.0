import { Component } from "../ecs/Entity";

/** All tradeable commodities in the game. */
export enum TradeGood {
    Grain  = "Grain",
    Fish   = "Fish",
    Salt   = "Salt",
    Beer   = "Beer",
    Cloth  = "Cloth",
    Fur    = "Fur",
    Timber = "Timber",
    Iron   = "Iron",
}

// ----- Tag components (no data) -----

/** Marks this entity as directly controlled by the human player. */
export class PlayerControlled extends Component {}

/** Marks this entity as an AI-controlled actor. */
export class AiControlled extends Component {}

// ----- Spatial -----

/** 2-D position on the world map (logical units, not pixels). */
export class Position extends Component {
    constructor(public x: number, public y: number) { super(); }
}

// ----- Identity -----

/** Human-readable display name. */
export class Name extends Component {
    constructor(public value: string) { super(); }
}

/** Marks an entity as a city or harbour. */
export class City extends Component {
    constructor(public population: number = 1_000) { super(); }
}


/** Marks an entity as a sailing vessel. */
export class Ship extends Component {
    constructor(
        /** Maximum cargo in trade-good units. */
        public cargoCapacity: number = 100,
        /** World-map units per second at full sail. */
        public speedUnitsPerSecond: number = 20,
    ) { super(); }
}

// ----- Economy -----

/** A merchant's trading company information. */
export class Merchant extends Component {
    constructor(public companyName: string) { super(); }
}

/** Currency wallet. */
export class Gold extends Component {
    constructor(public amount: number = 0) { super(); }
}

/** Cargo hold (ships) — maps good to quantity in stock. */
export class Inventory extends Component {
    private readonly _goods = new Map<TradeGood, number>();

    add(good: TradeGood, qty: number): void {
        this._goods.set(good, (this._goods.get(good) ?? 0) + qty);
    }

    /** Returns false and makes no change if there is insufficient stock. */
    remove(good: TradeGood, qty: number): boolean {
        const current = this._goods.get(good) ?? 0;
        if (current < qty) return false;
        this._goods.set(good, current - qty);
        return true;
    }

    get(good: TradeGood): number {
        return this._goods.get(good) ?? 0;
    }

    totalUnits(): number {
        let n = 0;
        for (const qty of this._goods.values()) n += qty;
        return n;
    }

    entries(): IterableIterator<[TradeGood, number]> {
        return this._goods.entries();
    }
}

export interface MarketEntry {
    readonly basePrice: number;
    supply: number;
    /** >1 raises price, <1 lowers it. */
    demandFactor: number;
}

/** City marketplace — tracks supply, demand, and dynamic pricing per good. */
export class Market extends Component {
    private readonly _entries = new Map<TradeGood, MarketEntry>();

    constructor(initial: Partial<Record<TradeGood, MarketEntry>> = {}) {
        super();
        for (const key of Object.keys(initial) as TradeGood[]) {
            const entry = initial[key];
            if (entry !== undefined) this._entries.set(key, { ...entry });
        }
    }

    getEntry(good: TradeGood): MarketEntry | undefined {
        return this._entries.get(good);
    }

    /**
     * Effective price: basePrice × demandFactor / max(1, supply/50).
     * A well-stocked good (supply ≥ 50) is cheaper; scarce goods are expensive.
     */
    currentPrice(good: TradeGood): number {
        const e = this._entries.get(good);
        if (!e) return 0;
        return Math.max(1, Math.round(e.basePrice * e.demandFactor / Math.max(1, e.supply / 50)));
    }

    goods(): IterableIterator<[TradeGood, MarketEntry]> {
        return this._entries.entries();
    }

    update(good: TradeGood, patch: Partial<MarketEntry>): void {
        const e = this._entries.get(good);
        if (e) Object.assign(e, patch);
    }
}

// ----- Navigation -----
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
