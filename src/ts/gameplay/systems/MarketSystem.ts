import { TickSystem } from "../../ecs/System";
import { City, Market, CityProduction } from "../components";
import { GoodsRegistry } from "../GoodsRegistry";

/**
 * Production & demand system. Each tick:
 *
 * 1) **Production** — for every good the city produces:
 *    `amount = baseProduction × (citizens / 10) × cityMultiplier`
 *    If the good has a recipe, required ingredients are deducted from the
 *    market first. Production is **blocked** when any ingredient is missing.
 *
 * 2) **Demand** — the population consumes goods each tick:
 *    `consumed = good.base_demand × citizens / 1000`
 */
export class MarketSystem extends TickSystem {
    private _elapsed = 0;

    override update(dt: number): void {
        const registry = GoodsRegistry.getInstance();
        this._elapsed += dt;
        if (this._elapsed < registry.tickInterval) return;
        this._elapsed = 0;

        for (const entity of this.world.query(City, Market, CityProduction)) {
            const market     = entity.getComponent(Market)!;
            const production = entity.getComponent(CityProduction)!;
            const { citizens, multipliers } = production;

            // ---- Production ----
            for (const [goodName, cityMultiplier] of multipliers) {
                const good = registry.getGood(goodName);
                if (!good) continue;

                const baseProduction = registry.getBaseProduction(goodName);
                const amount = baseProduction * (citizens / 10) * cityMultiplier;
                if (amount <= 0) continue;

                const recipe = registry.getRecipe(goodName);
                if (recipe) {
                    // Check ingredient availability
                    let canProduce = true;
                    for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
                        const ingredientGood = registry.getGood(ingredientName);
                        if (!ingredientGood) { canProduce = false; break; }
                        const entry = market.getEntry(ingredientGood);
                        if (!entry || entry.supply < amount * ratio) {
                            canProduce = false;
                            break;
                        }
                    }
                    if (!canProduce) continue;

                    // Deduct ingredients
                    for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
                        const ingredientGood = registry.getGood(ingredientName)!;
                        const entry = market.getEntry(ingredientGood)!;
                        market.update(ingredientGood, { supply: entry.supply - amount * ratio });
                    }
                }

                // Add produced goods to market
                const entry = market.getEntry(good);
                if (entry) {
                    market.update(good, { supply: entry.supply + amount });
                }
            }

            // ---- Demand (population consumption) ----
            for (const [good, entry] of market.goods()) {
                if (good.base_demand <= 0) continue;
                const consumed = good.base_demand * citizens / 1000;
                const newSupply = Math.max(0, entry.supply - consumed);
                market.update(good, {
                    supply: newSupply,
                    demandFactor: newSupply < 20 ? 1.5 : newSupply > 100 ? 0.8 : 1.0,
                });
            }
        }
    }
}
