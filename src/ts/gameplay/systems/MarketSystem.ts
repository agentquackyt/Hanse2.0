import { TickSystem } from "../../ecs/System";
import { City, Market, CityProduction, type TradeGood } from "../components";
import { GoodsRegistry } from "../GoodsRegistry";
import { HUDcontroller } from "../../render/HUDcontroller";
import { DEMAND_DAYS_PER_WEEK, REAL_SECONDS_PER_DAY, REAL_SECONDS_PER_WEEK } from "../GameTime";
import { demandAlgorithm } from "../algorithms/EconomyAlgorithms";
import { ShadowProductionAlgorithm } from "../algorithms/ShadowProductionAlgorithm";
import { SatisfactionAlgorithm } from "../algorithms/SatisfactionAlgorithm";

/**
 * Production & demand system. Each tick:
 *
 * 1) **Production** — for every good the city produces:
 *    `amount = baseProduction × (citizens / 10) × cityMultiplier × (elapsed / REAL_SECONDS_PER_DAY) / 7`
 *    Time-scaled so production rate is comparable to demand consumption rate.
 *    If the good has a recipe, required ingredients are deducted from the
 *    market first. Production is **blocked** when any ingredient is missing.
 *
 * 2) **Demand** — the population consumes a weekly quota over time:
 *    `weeklyDemand = good.base_demand × citizens / 1000`
 *    `dailyDemand = weeklyDemand / 7`
 */
export class MarketSystem extends TickSystem {
    private _elapsed = 0;

    override update(dt: number): void {
        const registry = GoodsRegistry.getInstance();
        this._elapsed += dt;
        if (this._elapsed < registry.tickInterval) return;
        const elapsed = this._elapsed;
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
                const amount = baseProduction * (citizens / 10) * cityMultiplier * (elapsed / REAL_SECONDS_PER_DAY) / DEMAND_DAYS_PER_WEEK;
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

            // ---- Demand (population consumption + production ingredients) ----
            // First, tally weekly ingredient demand each recipe imposes on this market.
            const productionDemand = new Map<TradeGood, number>();
            for (const [goodName, cityMultiplier] of multipliers) {
                const recipe = registry.getRecipe(goodName);
                if (!recipe) continue;
                const baseProduction = registry.getBaseProduction(goodName);
                const weeklyProduction = baseProduction * (citizens / 10) * cityMultiplier;
                for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
                    const ingredientGood = registry.getGood(ingredientName);
                    if (!ingredientGood) continue;
                    productionDemand.set(
                        ingredientGood,
                        (productionDemand.get(ingredientGood) ?? 0) + weeklyProduction * ratio,
                    );
                }
            }

            for (const [good, entry] of market.goods()) {
                if (good.base_demand <= 0 && !productionDemand.has(good)) continue;
                const weeklyConsumerDemand = good.base_demand > 0 ? demandAlgorithm(good, entity) : 0;
                const weeklyProdDemand = productionDemand.get(good) ?? 0;
                const weeklyDemand = weeklyConsumerDemand + weeklyProdDemand;

                const dailyConsumerDemand = weeklyConsumerDemand / DEMAND_DAYS_PER_WEEK;
                const consumed = dailyConsumerDemand * (elapsed / REAL_SECONDS_PER_DAY);
                const newSupply = Math.max(0, entry.supply - consumed);
                market.update(good, {
                    supply: newSupply,
                    demand: weeklyDemand,
                });
            }
        }

        // ---- Population growth based on satisfaction ----
        const satisfactionResults = SatisfactionAlgorithm.evaluate(this.world);
        for (const [cityEntity, result] of satisfactionResults) {
            if (result.growthPerWeek <= 0) continue;
            const cityComp = cityEntity.getComponent(City)!;
            const growth = result.growthPerWeek * (elapsed / REAL_SECONDS_PER_WEEK);
            cityComp.population = Math.floor(cityComp.population + growth);
        }

        // Shadow economy balancer — gentle supply/demand corrections.
        ShadowProductionAlgorithm.run(this.world, elapsed);

        HUDcontroller.getInstance().notifyDataChange();
    }
}
