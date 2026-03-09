import type { TradeGood, Recipe } from "./components/economy";

interface GoodsJsonGood {
    name: string;
    img: string;
    PP: number | null;
    BP: number;
    SP: number;
    base_demand: number;
}

interface GoodsJsonRecipe {
    product: string;
    ingredients: Record<string, number>;
}

interface GoodsJson {
    goods: GoodsJsonGood[];
    recipes: GoodsJsonRecipe[];
}

interface ConfigJson {
    production_tick_interval: number;
    base_production: Record<string, number>;
}

/**
 * Singleton registry that loads goods, recipes, and production config from
 * JSON data files. Must call `GoodsRegistry.load()` before first use.
 *
 * Each `TradeGood` is a single shared object instance so it can be used as a
 * `Map` key with reference equality in `Market` and `Inventory`.
 */
export class GoodsRegistry {
    private static _instance: GoodsRegistry | null = null;
    private static _loadingPromise: Promise<GoodsRegistry> | null = null;

    private readonly _goods = new Map<string, TradeGood>();
    private readonly _recipes = new Map<string, Recipe>();
    private readonly _baseProduction = new Map<string, number>();
    private _tickInterval = 10;

    private constructor() {}

    static getInstance(): GoodsRegistry {
        if (!GoodsRegistry._instance) {
            throw new Error("GoodsRegistry not loaded yet — call GoodsRegistry.load() first.");
        }
        return GoodsRegistry._instance;
    }

    /** Fetch JSON files and initialise the singleton. */
    static async load(): Promise<GoodsRegistry> {
        if (GoodsRegistry._instance) return GoodsRegistry._instance;
        if (GoodsRegistry._loadingPromise) return GoodsRegistry._loadingPromise;

        GoodsRegistry._loadingPromise = (async () => {
        const [goodsRes, configRes] = await Promise.all([
            fetch("./assets/data/goods.json"),
            fetch("./assets/data/config.json"),
        ]);
        const goodsJson: GoodsJson = await goodsRes.json();
        const configJson: ConfigJson = await configRes.json();

        const reg = new GoodsRegistry();

        // --- Goods ---
        for (const g of goodsJson.goods) {
            const good: TradeGood = Object.freeze({
                name: g.name,
                img: g.img,
                productionPrice: g.PP ?? 0,
                buyPrice: g.BP,
                sellPrice: g.SP,
                base_demand: g.base_demand,
            });
            reg._goods.set(g.name, good);
        }

        // --- Recipes ---
        for (const r of goodsJson.recipes) {
            const recipe: Recipe = Object.freeze({
                product: r.product,
                ingredients: Object.freeze({ ...r.ingredients }),
            });
            reg._recipes.set(r.product, recipe);
        }

        // --- Config ---
        for (const [name, val] of Object.entries(configJson.base_production)) {
            reg._baseProduction.set(name, val);
        }
        reg._tickInterval = configJson.production_tick_interval;

        GoodsRegistry._instance = reg;
        console.log(`GoodsRegistry: loaded ${reg._goods.size} goods, ${reg._recipes.size} recipes`);
        return reg;
        })();

        return GoodsRegistry._loadingPromise;
    }

    // ---- Accessors ----

    getGood(name: string): TradeGood | undefined {
        return this._goods.get(name);
    }

    getAllGoods(): TradeGood[] {
        return [...this._goods.values()];
    }

    getRecipe(productName: string): Recipe | undefined {
        return this._recipes.get(productName);
    }

    getBaseProduction(goodName: string): number {
        return this._baseProduction.get(goodName) ?? 1;
    }

    get tickInterval(): number {
        return this._tickInterval;
    }
}
