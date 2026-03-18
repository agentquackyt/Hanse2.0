import { Component } from "../../ecs/Entity";
import { priceAlgorithm } from "../algorithms/EconomyAlgorithms";

/** All tradeable commodities in the game. */
export interface TradeGood {
    readonly name: string;
    readonly img: string;
    readonly productionPrice: number;
    readonly buyPrice: number;
    readonly sellPrice: number;
    readonly base_demand: number;
}

/** A crafting recipe: which ingredients are consumed to produce a good. */
export interface Recipe {
    readonly product: string;
    readonly ingredients: Readonly<Record<string, number>>;
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

/** City production capabilities loaded from cities.json. */
export class CityProduction extends Component {
    constructor(
        public citizens: number,
        public readonly multipliers: ReadonlyMap<string, number>,
    ) { super(); }
}

export interface MarketEntry {
    readonly basePrice: number;
    supply: number;
    demand: number;
}

/** City marketplace — tracks supply, demand, and dynamic pricing per good. */
export class Market extends Component {
    private readonly _entries = new Map<TradeGood, MarketEntry>();
    private _mostScarceGood?: TradeGood | undefined = undefined;

    constructor(entries?: Iterable<[TradeGood, MarketEntry]>) {
        super();
        if (entries) {
            for (const [good, entry] of entries) {
                this._entries.set(good, { ...entry });
            }
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
        return priceAlgorithm(good, this);
    }

    goods(): IterableIterator<[TradeGood, MarketEntry]> {
        return this._entries.entries();
    }

    update(good: TradeGood, patch: Partial<MarketEntry>): void {
        const e = this._entries.get(good);
        if (e) Object.assign(e, patch);
    }


    // Satisfaction algorithm
    setMostScarceGood(good: TradeGood | undefined): void {
        this._mostScarceGood = good;
    }
    
    getMostScarceGood(): TradeGood | undefined {
        return this._mostScarceGood;
    }
}

/** A player-owned trading post in a city. */
export class Kontor extends Component {
    constructor(public capacity: number = 100) { super(); }
}
