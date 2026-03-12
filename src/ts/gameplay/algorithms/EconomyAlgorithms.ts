import type { Entity } from "../../ecs/Entity";
import { City, Market, type MarketEntry, type TradeGood } from "../components";

export function priceAlgorithm(good: TradeGood, market: Market): number {
    const basePrice = good.buyPrice;
    const maxPrice = good.sellPrice;
    const oversaturatedPrice = Math.ceil(good.buyPrice * 0.1);
    const marketEntry = market.getEntry(good) as MarketEntry | undefined;
    let { supply, demand } = marketEntry ?? { supply: 5, demand: 10 };
    const oversupplyStart = 2;
    const oversupplyCap = 30;

    /**
     * The base price is the price at which the good is traded when demand and supply are balanced.
     * Supply counts as balanced when the amount of the good in the market is between 1x and 2x demand.
     * If the supply is higher than that, the price starts to drop, until it reaches the oversaturated price at 30 times demand.
     * If the supply is lower than demand, the price starts to rise, until it reaches the maximum price at 0.5 times demand.
     */

    if(!market) return basePrice;
    let estimatedPrice = basePrice;

    if (!Number.isFinite(demand) || demand <= 0) demand = 15;
    if (!Number.isFinite(supply) || supply <= 0) return maxPrice;

    if (supply > demand * oversupplyStart) {
        const excessSupply = Math.min(supply - demand * oversupplyStart, demand * oversupplyCap - demand * oversupplyStart);
        const priceDrop = (excessSupply / (demand * oversupplyCap - demand * oversupplyStart)) ** 1.5;
        estimatedPrice = basePrice - (basePrice - oversaturatedPrice) * priceDrop;
    } else if (supply < demand) {
        const shortage = Math.min(demand - supply, demand * 0.5);
        const priceIncrease = (shortage / (demand * 0.5)) ** 5;
        estimatedPrice = basePrice + (maxPrice - basePrice) * priceIncrease;
    }
    return Math.ceil(estimatedPrice);
}


export function demandAlgorithm(good: TradeGood, city?: Entity | number): number {
    const baseDemand = good.base_demand;
    const citizens = typeof city === "number" ? city : city?.getComponent(City)?.population || 500;
    const demand = (citizens/100) * baseDemand * 0.5;

    return Math.max(1, Math.ceil(demand));
}