/**
 * The algorithm is responsible for calculating the satisfaction of the citizens 
 * in a city based on the goods available in the market and the demand for those 
 * goods. It takes into account the demand for each good, the population of the 
 * city, and the supply of goods in the market to determine how satisfied the 
 * citizens are with their current situation. 
 * 
 * The satisfaction level influences various aspects of the game, such as the 
 * growth of the city.
 * 
 * if not satisfied: no growth
 * if satisfied: normal growth
 * if very satisfied and city wealthy (in top 10): increased growth
 * if very very satisfied and city very wealthy (in top 3): further increased growth
 */
import type { World } from "../../ecs/Engine";
import type { Entity } from "../../ecs/Entity";
import { City, Gold, Market, type TradeGood } from "../components";

// ---- Satisfaction thresholds ----
const NOT_SATISFIED_THRESHOLD = 0.5;
const VERY_SATISFIED_THRESHOLD = 0.8;
const VERY_VERY_SATISFIED_THRESHOLD = 0.95;

// ---- Growth: citizens gained per week ----
const BASE_GROWTH_PER_WEEK = 100;
const NO_GROWTH = 0;
const NORMAL_GROWTH = 1.0;
const INCREASED_GROWTH = 5.0;
const FURTHER_INCREASED_GROWTH = 10.0;

// ---- Wealth rank thresholds ----
const WEALTHY_RANK = 10;
const VERY_WEALTHY_RANK = 3;

export enum SatisfactionLevel {
    NotSatisfied = "not_satisfied",
    Satisfied = "satisfied",
    VerySatisfied = "very_satisfied",
    VeryVerySatisfied = "very_very_satisfied",
}

export const GROWTH_BASE_PER_WEEK = BASE_GROWTH_PER_WEEK;

export interface CitySatisfaction {
    satisfaction: number;
    level: SatisfactionLevel;
    growthMultiplier: number;
    growthPerWeek: number;
    wealthRank: number;
}

export class SatisfactionAlgorithm {

    /** Cached results from the last `evaluate()` call, keyed by entity id. */
    private static _cache = new Map<string, CitySatisfaction>();

    /** Look up the last evaluated satisfaction for a city entity by id. */
    static getCached(entityId: string): CitySatisfaction | undefined {
        return SatisfactionAlgorithm._cache.get(entityId);
    }

    /**
     * Calculate the fulfillment ratio for a city's market.
     * Weighted average of min(supply / demand, 1) across all demanded goods,
     * weighted by each good's demand. Returns 0–1.
     */
    static calculateSatisfaction(market: Market): number {
        let weightedFulfillment = 0;
        let totalDemand = 0;
        let mostScarceRatio = Infinity;
        let mostScarceGood: TradeGood | undefined = undefined;

        for (const [good, entry] of market.goods()) {
            const demand = entry.demand ?? 0;
            const supply = entry.supply ?? 0;
            if (!(demand > 0)) continue;
            const ratio = Math.min(supply / (demand * 2), 1.0);
            if(ratio < mostScarceRatio && ratio < 1.0) {
                mostScarceRatio = ratio;
                mostScarceGood = good;
            }
            weightedFulfillment += ratio;
            totalDemand++;
        }
        
        market.setMostScarceGood(mostScarceGood);
        if (totalDemand === 0) return 1.0; // No demand means fully satisfied    
        return weightedFulfillment / totalDemand;
    }

    /** Map a numeric satisfaction score to a discrete level. */
    static getSatisfactionLevel(satisfaction: number): SatisfactionLevel {
        if (satisfaction >= VERY_VERY_SATISFIED_THRESHOLD) return SatisfactionLevel.VeryVerySatisfied;
        if (satisfaction >= VERY_SATISFIED_THRESHOLD) return SatisfactionLevel.VerySatisfied;
        if (satisfaction >= NOT_SATISFIED_THRESHOLD) return SatisfactionLevel.Satisfied;
        return SatisfactionLevel.NotSatisfied;
    }

    /**
     * Rank all cities by their Gold amount (descending).
     * Returns a Map from entity id to 1-based rank.
     */
    static rankCitiesByWealth(cities: Entity[]): Map<string, number> {
        const ranked = cities
            .map(c => ({ id: c.id, gold: c.getComponent(Gold)?.amount ?? 0 }))
            .sort((a, b) => b.gold - a.gold);

        const ranks = new Map<string, number>();
        for (let i = 0; i < ranked.length; i++) {
            ranks.set(ranked[i]!.id, i + 1);
        }
        return ranks;
    }

    /**
     * Determine the population growth multiplier for a city.
     *
     * - not satisfied              → 0   (no growth)
     * - satisfied                  → 1.0 (normal growth)
     * - very satisfied + top 10    → 1.5 (increased growth)
     * - very very satisfied + top 3 → 2.0 (further increased growth)
     */
    static calculateGrowthMultiplier(level: SatisfactionLevel, wealthRank: number): number {
        if (level === SatisfactionLevel.NotSatisfied) return NO_GROWTH;

        if (level === SatisfactionLevel.VeryVerySatisfied && wealthRank <= VERY_WEALTHY_RANK) {
            return FURTHER_INCREASED_GROWTH; 
        }

        if (
            (level === SatisfactionLevel.VerySatisfied || level === SatisfactionLevel.VeryVerySatisfied)
            && wealthRank <= WEALTHY_RANK
        ) {
            return INCREASED_GROWTH;
        }

        return NORMAL_GROWTH;
    }

    /** Evaluate all cities in the world and return their satisfaction data. */
    static evaluate(world: World): Map<Entity, CitySatisfaction> {
        const cities = world.query(City, Market);
        const wealthRanks = SatisfactionAlgorithm.rankCitiesByWealth(cities);
        const results = new Map<Entity, CitySatisfaction>();

        for (const city of cities) {
            const market = city.getComponent(Market)!;
            const satisfaction = SatisfactionAlgorithm.calculateSatisfaction(market);
            const level = SatisfactionAlgorithm.getSatisfactionLevel(satisfaction);
            const wealthRank = wealthRanks.get(city.id) ?? cities.length;
            const growthMultiplier = SatisfactionAlgorithm.calculateGrowthMultiplier(level, wealthRank);

            const growthPerWeek = growthMultiplier * BASE_GROWTH_PER_WEEK;
            const entry = { satisfaction, level, growthMultiplier, growthPerWeek, wealthRank };
            results.set(city, entry);
            SatisfactionAlgorithm._cache.set(city.id, entry);
        }

        return results;
    }
}