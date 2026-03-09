import type { Entity } from "../../ecs/Entity";
import { City, Market, type MarketEntry, type TradeGood } from "../components";

export function priceAlgorithm(good: TradeGood, market: Market): number {
    const basePrice = good.buyPrice;
    const maxPrice = good.sellPrice;
    const oversaturatedPrice = good.buyPrice / 10;

    /**
     * The base price is the price at which the good is traded when demand and supply are balanced.
     * Supply counts as balanced when the amount of the good in the market is equal or maximum 2 times the base demand.
     * If the supply is higher than that, the price starts to drop, until it reaches the oversaturated price at 25 times the base demand.
     * If the supply is lower than the base demand, the price starts to rise, until it reaches the maximum price at 0.5 times the base demand.
     * The price is calculated using a cubic curve, to create a smooth transition between the different price ranges.
     */

    if(!market) return basePrice;
    let estimatedPrice = basePrice;
    const marketEntry = market.getEntry(good) as MarketEntry;
    let { supply, demand } = marketEntry || { supply: 0, demand: 0 };

    if (supply > demand * 2) {
        const excessSupply = Math.min(supply - demand * 2, demand * 25 - demand * 2);
        const priceDrop = (excessSupply / (demand * 25 - demand * 2)) ** 3;
        estimatedPrice = basePrice - (basePrice - oversaturatedPrice) * priceDrop;
    } else if (supply < demand) {
        const shortage = Math.min(demand - supply, demand * 0.5);
        const priceIncrease = (shortage / (demand * 0.5)) ** 3;
        estimatedPrice = basePrice + (maxPrice - basePrice) * priceIncrease;
    }
    return Math.ceil(estimatedPrice);
}


export function demandAlgorithm(good: TradeGood, city?: Entity | number): number {
    const baseDemand = good.base_demand;
    if (baseDemand <= 0) return 0;
    const citizens = typeof city === "number" ? city : city?.getComponent(City)?.population || 500;
    const demand = (citizens/100) * baseDemand * 0.5;

    return Math.ceil(demand);
}