/**
 * Browser-console inspection utility.
 * Usage: Inspector.getOverview()
 *        Inspector.addMoney(5000)
 *        Inspector.setMoney(25000)
 * Downloads a JSON snapshot of the current economy state.
 */

import { Engine } from "./ecs/Engine";
import { HUDcontroller } from "./render/HUDcontroller";
import { City, CityProduction, CityTreasury, Gold, IsPlayerOwned, Market, Merchant, Name } from "./gameplay/components";
import { GoodsRegistry } from "./gameplay/GoodsRegistry";
import { DEMAND_DAYS_PER_WEEK } from "./gameplay/GameTime";

interface CityMoney {
    city: string;
    gold: number;
}

interface CityGoodEntry {
    city: string;
    supply: number;
    demand: number;
    surplus: number;
}

/**
 * Good overview includes:
 * - total supply & demand across all cities
 * - estimated global production rate (not accounting for ingredient shortages)
 * - top 2 cities with highest surplus (supply - demand)
 * - bottom 2 cities with lowest stock (supply)
 * This allows identifying which goods are most abundant/scarce and where.
 */
interface GoodOverview {
    good: string;
    totalSupply: number;
    totalDemand: number;
    globalProduction: number;
    topSurplus: CityGoodEntry[];
    bottomStock: CityGoodEntry[];
}

/**
 * Overall snapshot structure, containing timestamp, city money standings, and per-good overviews.
 */
interface Overview {
    timestamp: string;
    cityMoney: CityMoney[];
    goods: GoodOverview[];
}

/**
 * Retrieves the gold amount for the player's company.
 * @returns The gold component or null if not found.
 */
function getPlayerCompanyGold(): Gold | null {
    const world = Engine.getInstance().world;
    const company = world.query(Merchant, Gold, IsPlayerOwned)[0] ?? null;
    return company?.getComponent(Gold) ?? null;
}

function refreshHud(): void {
    HUDcontroller.getInstance().notifyDataChange();
}

/**
 * Generates an JSON snapshot of the current economy state, including city money standings and per-good supply/demand overviews, and triggers a download of this data.
 * The overview includes:
 * - For each city: its name and current gold amount.
 * - For each good: total supply, total demand, estimated global production rate, top 2 cities with highest surplus, and bottom 2 cities with lowest stock.
 * This allows analyzing the overall economic situation and identifying which goods are abundant or scarce and where.
 * The resulting JSON file is named "hanse-overview-{timestamp}.json".
 */
function getOverview(): void {
    const world = Engine.getInstance().world;
    const cities = world.query(City, Market, Name);

    // ---- City money ----
    const cityMoney: CityMoney[] = cities.map(city => ({
        city: city.getComponent(Name)!.value as string,
        gold: Math.round(city.getComponent(CityTreasury)?.amount ?? 0),
    })).sort((a, b) => b.gold - a.gold);

    // ---- Per-good aggregation ----
    // Collect all goods from the first city's market (all cities share the same goods set).
    const goodsMap = new Map<string, GoodOverview>();

    for (const city of cities) {
        const market   = city.getComponent(Market)!;
        const cityName = city.getComponent(Name)!.value as string;
        const registry = GoodsRegistry.getInstance();

        for (const [good, entry] of market.goods()) {
            if (!(entry.demand > 0)) continue;

            let row = goodsMap.get(good.name);
            if (!row) {
                row = { good: good.name, totalSupply: 0, totalDemand: 0, globalProduction: 0, topSurplus: [], bottomStock: [] };
                goodsMap.set(good.name, row);
            }

            row.totalSupply += entry.supply;
            row.totalDemand += entry.demand;
            const production = city.getComponent(CityProduction);
            const multiplier = production?.multipliers.get(good.name) ?? 0;
            const baseProd   = registry.getBaseProduction(good.name);
            const citizens   = production?.citizens ?? 0;
            row.globalProduction += baseProd * (citizens / 10) * multiplier / DEMAND_DAYS_PER_WEEK;
            row.topSurplus.push({
                city: cityName,
                supply: Math.round(entry.supply * 10) / 10,
                demand: Math.round(entry.demand * 10) / 10,
                surplus: Math.round((entry.supply - entry.demand) * 10) / 10,
            });
        }
    }

    // Sort and slice to top-2 / bottom-2 per good
    const goods: GoodOverview[] = [...goodsMap.values()].map(row => {
        const sorted = [...row.topSurplus].sort((a, b) => b.surplus - a.surplus);
        return {
            good: row.good,
            totalSupply: Math.round(row.totalSupply * 10) / 10,
            totalDemand: Math.round(row.totalDemand * 10) / 10,
            globalProduction: Math.round(row.globalProduction * 10) / 10,
            topSurplus:  sorted.slice(0, 2),
            bottomStock: sorted.slice(-2).reverse(),
        };
    }).sort((a, b) => a.good.localeCompare(b.good));

    const overview: Overview = {
        timestamp: new Date().toISOString(),
        cityMoney,
        goods,
    };

    // ---- Download ----
    const json = JSON.stringify(overview, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `hanse-overview-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log("[Inspector] Overview downloaded.", overview);
}

/**
 * Adds money to the player's company.
 * @param amount The amount of money to add.
 * @returns The updated gold amount or null if operation failed.
 */
function addMoney(amount: number = 1000): number | null {
    if (!Number.isFinite(amount)) {
        console.warn("[Inspector] addMoney expects a finite number.");
        return null;
    }

    const gold = getPlayerCompanyGold();
    if (!gold) {
        console.warn("[Inspector] Player company gold not found.");
        return null;
    }

    gold.amount += amount;
    refreshHud();
    console.log(`[Inspector] Added ${amount}£. Company gold is now ${gold.amount}£.`);
    return gold.amount;
}

/**
 * Sets the money amount for the player's company.
 * @param amount The new amount of money for the player's company.
 * @returns The updated gold amount or null if operation failed.
 */
function setMoney(amount: number): number | null {
    if (!Number.isFinite(amount)) {
        console.warn("[Inspector] setMoney expects a finite number.");
        return null;
    }

    const gold = getPlayerCompanyGold();
    if (!gold) {
        console.warn("[Inspector] Player company gold not found.");
        return null;
    }

    gold.amount = amount;
    refreshHud();
    console.log(`[Inspector] Company gold set to ${gold.amount}£.`);
    return gold.amount;
}

export const Inspector = { getOverview, addMoney, setMoney };

// Attach to window so it is accessible from the browser console.
(window as unknown as Record<string, unknown>)["Inspector"] = Inspector;
