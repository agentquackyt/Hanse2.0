/**
 * This class is responsible for keeping the simulation balanced by adjusting production
 * levels based on the global total supply and demand of goods. It acts as a "shadow" producer that can step in to
 * produce goods when there is a shortage. This helps to prevent extreme price fluctuations and keeps the economy 
 * stable.
 * 
 * Essentially, it monitors for all cities and their production levels, and transfers some of the production to
 * itself when it detects that the supply of a good is too low compared to the demand. The shadow producer can then
 * produce the good and sell it on the market, helping to meet the demand and stabilize prices. It can also reduce
 * its production when there is an oversupply, by buying goods from the market and trade them to the cities that need 
 * them. 
 * 
 * The system is designed to be an replacement of for AI traders, which would have been more complex to implement and 
 * less efficient. By using a shadow production algorithm, we can ensure that the economy remains balanced and responsive 
 * to changes in supply and demand without the need for complex AI behavior.
 */

import type { World } from "../../ecs/Engine";
import { City, Gold, Inventory, Market, Name, ShadowProducer, type MarketEntry, type TradeGood } from "../components";
import { REAL_SECONDS_PER_DAY } from "../GameTime";

// ---- Tuning constants ----

/** Shadow production kicks in when global supply falls below this fraction of demand. */
const SHORTAGE_THRESHOLD = 0.9;
/** Shadow entity absorbs stock when a city's supply exceeds this multiple of demand. */
const OVERFLOW_THRESHOLD = 5.0;
/** Cities import from the shadow entity when their supply is below this fraction of demand. */
const IMPORT_THRESHOLD = 1.4;
/** Target supply level the shadow entity fills cities up to during global-shortage distribution. */
const IMPORT_TARGET = 1.5;
/** Fraction of the daily deficit that the shadow entity generates per tick. */
const PRODUCTION_RATE = 0.8;
/** Maximum units a single city can import from the shadow entity per tick. */
const MAX_PER_TRADE = 75;
/** A city is considered overflowing for inter-city trade when supply exceeds this multiple of demand. */
const INTERCITY_OVERFLOW_THRESHOLD = 2.0;
/** Maximum units transferred in a single inter-city trade per good per tick. */
const MAX_INTERCITY_TRADE = 40;

interface GlobalMetric {
    totalSupply: number;
    totalDemand: number;
}

export class ShadowProductionAlgorithm {

    /**
     * Run once per market tick. Aggregates global supply/demand, generates
     * goods for shortages into the shadow entity, absorbs oversupply from
     * cities, and distributes goods to cities that need them.
     */
    static run(world: World, elapsed: number): void {
        const shadow = world.query(ShadowProducer, Inventory, Gold)[0];
        if (!shadow) return;

        const shadowInv  = shadow.getComponent(Inventory)!;
        const shadowGold = shadow.getComponent(Gold)!;

        const cities = world.query(City, Market);
        if (cities.length === 0) return;

        // ---- 1. Aggregate global supply & demand per good ----
        const metrics = new Map<TradeGood, GlobalMetric>();
        for (const city of cities) {
            const market = city.getComponent(Market)!;
            for (const [good, entry] of market.goods()) {
                if (!(entry.demand > 0)) continue; // skip NaN / zero / negative demand
                let m = metrics.get(good);
                if (!m) { m = { totalSupply: 0, totalDemand: 0 }; metrics.set(good, m); }
                m.totalSupply += entry.supply;
                m.totalDemand += entry.demand;
            }
        }

        const dayFraction = elapsed / REAL_SECONDS_PER_DAY;
        console.groupCollapsed(`[ShadowProducer] tick  gold=${shadowGold.amount.toFixed(0)}  inv=${[...metrics.keys()].reduce((s, g) => s + shadowInv.get(g), 0).toFixed(1)} units`);

        // ---- 2. Shadow production (global shortage relief) ----
        const shortageGoods = new Set<TradeGood>();
        for (const [good, m] of metrics) {
            if (m.totalDemand <= 0) continue;
            if (m.totalSupply < m.totalDemand * SHORTAGE_THRESHOLD) {
                shortageGoods.add(good);
                const deficit    = m.totalDemand - m.totalSupply;
                const toGenerate = deficit * PRODUCTION_RATE * dayFraction;
                if (toGenerate > 0) {
                    shadowInv.add(good, toGenerate);
                    console.log(`  [produce] ${good.name}  deficit=${deficit.toFixed(1)}  generated=${toGenerate.toFixed(2)}  inv→${shadowInv.get(good).toFixed(1)}`);
                }
            }
        }

        // ---- 3. Shadow absorption (oversupply removal) ----
        for (const city of cities) {
            const market   = city.getComponent(Market)!;
            const cityGold = city.getComponent(Gold);
            const cityName = city.getComponent(Name)?.value ?? city.id;

            for (const [good, entry] of market.goods()) {
                if (!(entry.demand > 0)) continue;
                if (entry.supply > entry.demand * OVERFLOW_THRESHOLD) {
                    const excess = entry.supply - entry.demand * OVERFLOW_THRESHOLD;
                    const toBuy  = Math.min(excess * PRODUCTION_RATE * dayFraction, MAX_PER_TRADE);
                    if (toBuy <= 0) continue;

                    const unitCost = good.buyPrice;
                    const totalCost = toBuy * unitCost;
                    if (shadowGold.amount < totalCost) continue;

                    shadowGold.amount -= totalCost;
                    if (cityGold) cityGold.amount += totalCost;
                    market.update(good, { supply: entry.supply - toBuy });
                    shadowInv.add(good, toBuy);
                    console.log(`  [absorb]  ${cityName} / ${good.name}  absorbed=${toBuy.toFixed(2)}  citySupply→${(entry.supply - toBuy).toFixed(1)}`);
                }
            }
        }

        // ---- 4. Inter-city trade (overflow city → lowest-supply city, one pair per good per tick) ----
        for (const [good] of metrics) {
            // Find candidate sellers (overflow cities) and the single best buyer.
            let bestSeller: { market: Market; entry: MarketEntry; name: string | number } | null = null;
            let bestSellerRatio = INTERCITY_OVERFLOW_THRESHOLD;

            let bestBuyer: { market: Market; entry: MarketEntry; name: string | number } | null = null;
            let bestBuyerRatio = Infinity;

            for (const city of cities) {
                const market = city.getComponent(Market)!;
                const entry  = market.getEntry(good);
                if (!entry || !(entry.demand > 0)) continue;
                const ratio = entry.supply / entry.demand;
                const cityName = city.getComponent(Name)?.value ?? city.id;

                if (ratio > bestSellerRatio) {
                    bestSellerRatio = ratio;
                    bestSeller = { market, entry, name: cityName };
                }
                if (ratio < bestBuyerRatio) {
                    bestBuyerRatio = ratio;
                    bestBuyer = { market, entry, name: cityName };
                }
            }

            if (!bestSeller || !bestBuyer || bestSeller.market === bestBuyer.market) continue;
            // Only trade if the buyer genuinely needs goods
            if (bestBuyerRatio >= IMPORT_THRESHOLD) continue;

            const available = bestSeller.entry.supply - bestSeller.entry.demand * INTERCITY_OVERFLOW_THRESHOLD;
            if (available <= 0) continue;

            const want = bestBuyer.entry.demand * IMPORT_TARGET - bestBuyer.entry.supply;
            if (want <= 0) continue;

            const qty = Math.min(available, want, MAX_INTERCITY_TRADE);
            if (qty <= 0) continue;

            bestSeller.market.update(good, { supply: bestSeller.entry.supply - qty });
            bestBuyer.market.update(good, { supply: bestBuyer.entry.supply + qty });
            console.log(`  [intercity] ${bestSeller.name} → ${bestBuyer.name} / ${good.name}  qty=${qty.toFixed(1)}`);
        }

        // ---- 5. City distribution (import from shadow, only for shortage goods) ----
        // For each shortage good, sort eligible cities by current price (highest = lowest supply =
        // most urgent) and fill them up to IMPORT_TARGET × demand, restricted to cities that are
        // still below IMPORT_THRESHOLD × demand.
        interface EligibleCity {
            market: Market;
            entry: MarketEntry;
            cityGold: Gold | undefined;
            cityName: string | number;
        }

        for (const good of shortageGoods) {
            if (shadowInv.get(good) <= 0) continue;

            const eligible: EligibleCity[] = [];
            for (const city of cities) {
                const market = city.getComponent(Market)!;
                const entry  = market.getEntry(good);
                if (!entry || !(entry.demand > 0)) continue;
                if (entry.supply >= entry.demand * IMPORT_THRESHOLD) continue;
                eligible.push({
                    market,
                    entry,
                    cityGold: city.getComponent(Gold),
                    cityName: city.getComponent(Name)?.value ?? city.id,
                });
            }

            // Highest price first → city with lowest supply ratio receives goods first
            eligible.sort((a, b) => b.market.currentPrice(good) - a.market.currentPrice(good));

            for (const { market, entry, cityGold, cityName } of eligible) {
                const available = shadowInv.get(good);
                if (available <= 0) break;

                const target = entry.demand * IMPORT_TARGET - entry.supply;
                if (target <= 0) continue;

                const affordable = cityGold ? Math.floor(cityGold.amount / good.buyPrice) : MAX_PER_TRADE;
                const qty = Math.min(target, available, affordable, MAX_PER_TRADE);
                if (qty <= 0) continue;

                const cost = qty * good.buyPrice;
                shadowInv.remove(good, qty);
                if (cityGold) cityGold.amount -= cost;
                shadowGold.amount += cost;
                market.update(good, { supply: entry.supply + qty });
                console.log(`  [distrib] ${cityName} / ${good.name}  qty=${qty.toFixed(2)}  cost=${cost.toFixed(0)}  citySupply→${(entry.supply + qty).toFixed(1)}`);
            }
        }

        console.groupEnd();
    }
}