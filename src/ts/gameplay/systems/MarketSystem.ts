import { TickSystem } from "../../ecs/System";
import { City, Market } from "../components";

const MARKET_TICK_INTERVAL = 10; // seconds between restock cycles
const RESTOCK_PER_CYCLE    = 5;  // units added to supply per cycle

/**
 * Periodically restocks city markets and adjusts demand factors based on
 * current supply levels, creating organic price fluctuation over time.
 */
export class MarketSystem extends TickSystem {
    private _elapsed: number = 0;

    override update(dt: number): void {
        this._elapsed += dt;
        if (this._elapsed < MARKET_TICK_INTERVAL) return;
        this._elapsed = 0;

        for (const entity of this.world.query(City, Market)) {
            const market = entity.getComponent(Market)!;

            for (const [good, entry] of market.goods()) {
                const newSupply = entry.supply + RESTOCK_PER_CYCLE;
                market.update(good, {
                    supply:       newSupply,
                    demandFactor: newSupply < 20 ? 1.5 : newSupply > 100 ? 0.8 : 1.0,
                });
            }
        }
    }
}
