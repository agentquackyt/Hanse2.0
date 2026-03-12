/**
 * Browser-console inspection utility.
 * Usage: Inspector.getOverview()
 * Downloads a JSON snapshot of the current economy state.
 */

import { Engine } from "./ecs/Engine";
import { City, CityProduction, Gold, Market, Name } from "./gameplay/components";
import { GoodsRegistry } from "./gameplay/GoodsRegistry";

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

interface GoodOverview {
    good: string;
    totalSupply: number;
    totalDemand: number;
    globalProduction: number;
    topSurplus: CityGoodEntry[];
    bottomStock: CityGoodEntry[];
}

interface Overview {
    timestamp: string;
    cityMoney: CityMoney[];
    goods: GoodOverview[];
}

function getOverview(): void {
    const world = Engine.getInstance().world;
    const cities = world.query(City, Market, Name);

    // ---- City money ----
    const cityMoney: CityMoney[] = cities.map(city => ({
        city: city.getComponent(Name)!.value as string,
        gold: Math.round(city.getComponent(Gold)?.amount ?? 0),
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
            row.globalProduction += baseProd * (citizens / 10) * multiplier;
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

export const Inspector = { getOverview };

// Attach to window so it is accessible from the browser console.
(window as unknown as Record<string, unknown>)["Inspector"] = Inspector;
