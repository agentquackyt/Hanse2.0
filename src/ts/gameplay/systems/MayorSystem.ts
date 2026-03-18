import { EventSystem } from "../../ecs/System";
import { HUDcontroller } from "../../render/HUDcontroller";
import { NotificationManager } from "../../render/NotificationManager";
import {
    City,
    CityFacilities,
    CityGovernance,
    CityTreasury,
    Gold,
    IsPlayerOwned,
    Market,
    Merchant,
    PlayerIsMayor,
    type TradeGood,
} from "../components";
import { GoodsRegistry } from "../GoodsRegistry";
import { GameTime } from "../GameTime";
import { ELECTION_FEE_GOLD } from "./ElectionSystem";

export const MAYOR_POPULATION_GOLD_COST = 15_000;
export const MAYOR_POPULATION_GAIN = 1_000;

const MAX_LEDGER_ENTRIES = 200;
const DEFAULT_FACILITY_COST = 25_000;

export interface MayorAction {
    readonly type: "declare_candidacy" | "city_to_player" | "player_to_city" | "invest_population" | "build_facility";
    readonly cityId: string;
    readonly amount?: number;
    readonly goodName?: string;
}

export class MayorSystem extends EventSystem<MayorAction> {
    override handle(action: MayorAction): void {
        const city = this.world.getEntityById(action.cityId);
        if (!city) return;

        const cityComp = city.getComponent(City);
        const cityTreasury = city.getComponent(CityTreasury);
        const governance = city.getComponent(CityGovernance);
        const market = city.getComponent(Market);
        const playerCompany = this.world.query(Merchant, Gold, IsPlayerOwned)[0];
        const playerGold = playerCompany?.getComponent(Gold);

        if (!cityComp || !cityTreasury || !governance || !playerGold || !market) return;

        switch (action.type) {
            case "declare_candidacy": {
                if (city.hasComponent(PlayerIsMayor)) {
                    NotificationManager.getInstance().push({
                        title: "Already mayor",
                        message: "You already hold the mayor office in this city.",
                        type: "info",
                    });
                    return;
                }

                if (governance.candidateForElection) {
                    NotificationManager.getInstance().push({
                        title: "Candidacy already active",
                        message: "You are already registered for the next election cycle.",
                        type: "info",
                    });
                    return;
                }

                if (playerGold.amount < ELECTION_FEE_GOLD) {
                    NotificationManager.getInstance().push({
                        title: "Candidacy failed",
                        message: `Need ${ELECTION_FEE_GOLD.toLocaleString()} gold to register.`,
                        type: "warning",
                    });
                    return;
                }

                playerGold.amount -= ELECTION_FEE_GOLD;
                governance.candidateForElection = true;
                governance.candidacyPaidWeek = GameTime.getInstance().snapshot().week;
                this._log(governance, {
                    timestamp: Date.now(),
                    type: "election_fee",
                    amount: ELECTION_FEE_GOLD,
                    cityBalanceAfter: cityTreasury.amount,
                    playerBalanceAfter: playerGold.amount,
                    note: "Paid candidacy fee for next election",
                });
                NotificationManager.getInstance().push({
                    title: "Candidacy registered",
                    message: `Paid ${ELECTION_FEE_GOLD.toLocaleString()} gold. You will run in the next election cycle.`,
                    type: "success",
                });
                break;
            }
            case "city_to_player": {
                if (!city.hasComponent(PlayerIsMayor)) {
                    NotificationManager.getInstance().push({
                        title: "Mayor authority required",
                        message: "You can only manage funds in cities where you are the incumbent mayor.",
                        type: "warning",
                    });
                    return;
                }
                const amount = Math.max(0, Math.floor(action.amount ?? 0));
                if (amount <= 0 || cityTreasury.amount < amount) {
                    NotificationManager.getInstance().push({
                        title: "Transfer failed",
                        message: "The city treasury does not have enough gold for this transfer.",
                        type: "warning",
                    });
                    return;
                }

                cityTreasury.amount -= amount;
                playerGold.amount += amount;
                this._log(governance, {
                    timestamp: Date.now(),
                    type: "city_to_player",
                    amount,
                    cityBalanceAfter: cityTreasury.amount,
                    playerBalanceAfter: playerGold.amount,
                    note: "Treasury transfer to mayor company",
                });
                NotificationManager.getInstance().push({
                    title: "Treasury transfer",
                    message: `Moved ${amount.toLocaleString()} gold from city treasury to your company.`,
                    type: "success",
                });
                break;
            }
            case "player_to_city": {
                if (!city.hasComponent(PlayerIsMayor)) {
                    NotificationManager.getInstance().push({
                        title: "Mayor authority required",
                        message: "You can only manage funds in cities where you are the incumbent mayor.",
                        type: "warning",
                    });
                    return;
                }
                const amount = Math.max(0, Math.floor(action.amount ?? 0));
                if (amount <= 0 || playerGold.amount < amount) {
                    NotificationManager.getInstance().push({
                        title: "Transfer failed",
                        message: "Your company does not have enough gold for this transfer.",
                        type: "warning",
                    });
                    return;
                }

                playerGold.amount -= amount;
                cityTreasury.amount += amount;
                this._log(governance, {
                    timestamp: Date.now(),
                    type: "player_to_city",
                    amount,
                    cityBalanceAfter: cityTreasury.amount,
                    playerBalanceAfter: playerGold.amount,
                    note: "Mayor contribution to treasury",
                });
                NotificationManager.getInstance().push({
                    title: "Treasury reinforced",
                    message: `Deposited ${amount.toLocaleString()} gold into the city treasury.`,
                    type: "success",
                });
                break;
            }
            case "invest_population": {
                console.log("[MayorSystem] invest_population action", { cityId: action.cityId, amount: action.amount });
                if (!city.hasComponent(PlayerIsMayor)) {
                    console.log("[MayorSystem] Not mayor, aborting");
                    NotificationManager.getInstance().push({
                        title: "Mayor authority required",
                        message: "You can only manage funds in cities where you are the incumbent mayor.",
                        type: "warning",
                    });
                    return;
                }
                const batches = Math.max(1, Math.floor(action.amount ?? 1));
                const totalCost = batches * MAYOR_POPULATION_GOLD_COST;
                console.log("[MayorSystem] Population investment - cost:", totalCost, "available:", cityTreasury.amount);
                if (cityTreasury.amount < totalCost) {
                    NotificationManager.getInstance().push({
                        title: "Population program failed",
                        message: `Need ${totalCost.toLocaleString()} gold in city treasury.`,
                        type: "warning",
                    });
                    return;
                }

                cityTreasury.amount -= totalCost;
                cityComp.population += MAYOR_POPULATION_GAIN * batches;
                console.log("[MayorSystem] Population increased from", cityComp.population - (MAYOR_POPULATION_GAIN * batches), "to", cityComp.population);
                this._log(governance, {
                    timestamp: Date.now(),
                    type: "population_investment",
                    amount: totalCost,
                    cityBalanceAfter: cityTreasury.amount,
                    playerBalanceAfter: playerGold.amount,
                    note: `Population expanded by ${(MAYOR_POPULATION_GAIN * batches).toLocaleString()} citizens`,
                });

                NotificationManager.getInstance().push({
                    title: "Population increased",
                    message: `City invested ${totalCost.toLocaleString()} gold and gained ${(MAYOR_POPULATION_GAIN * batches).toLocaleString()} citizens.`,
                    type: "success",
                });
                break;
            }
            case "build_facility": {
                if (!city.hasComponent(PlayerIsMayor)) {
                    NotificationManager.getInstance().push({
                        title: "Mayor authority required",
                        message: "You can only manage funds in cities where you are the incumbent mayor.",
                        type: "warning",
                    });
                    return;
                }
                const goodName = action.goodName;
                if (!goodName) return;

                const good = GoodsRegistry.getInstance().getGood(goodName);
                if (!good) return;

                const facilityCost = Math.max(DEFAULT_FACILITY_COST, Math.round(good.buyPrice * 140));
                if (cityTreasury.amount < facilityCost) {
                    NotificationManager.getInstance().push({
                        title: "Facility financing failed",
                        message: `Need ${facilityCost.toLocaleString()} gold to establish this facility.`,
                        type: "warning",
                    });
                    return;
                }

                let facilities = city.getComponent(CityFacilities);
                if (!facilities) {
                    facilities = new CityFacilities();
                    city.addComponent(facilities);
                }

                const weeklyOutput = Math.max(8, Math.round((GoodsRegistry.getInstance().getBaseProduction(goodName) + 1) * 35));
                const ok = facilities.addFacility({
                    goodName,
                    weeklyOutput,
                    treasuryCost: facilityCost,
                });
                if (!ok) return;

                cityTreasury.amount -= facilityCost;
                this._log(governance, {
                    timestamp: Date.now(),
                    type: "facility_construction",
                    amount: facilityCost,
                    cityBalanceAfter: cityTreasury.amount,
                    playerBalanceAfter: playerGold.amount,
                    note: `Built ${goodName} production facility (+${weeklyOutput}/week)`,
                });

                NotificationManager.getInstance().push({
                    title: "New city facility",
                    message: `${goodName} facility established using city funds.`,
                    type: "success",
                });
                break;
            }
        }

        HUDcontroller.getInstance().notifyDataChange();
    }

    public static classifyMarketState(good: TradeGood, market: Market): "scarce" | "overflow" | "balanced" {
        const entry = market.getEntry(good);
        if (!entry) return "balanced";

        const demand = entry.demand > 0 ? entry.demand : good.base_demand;
        if (demand <= 0) return "balanced";

        const scarceThreshold = demand * 1.5;
        const overflowThreshold = demand * 5.0;

        if (entry.supply <= scarceThreshold) return "scarce";
        if (entry.supply >= overflowThreshold) return "overflow";
        return "balanced";
    }

    private _log(governance: CityGovernance, entry: {
        timestamp: number;
        type: "election_fee" | "city_to_player" | "player_to_city" | "population_investment" | "facility_construction";
        amount: number;
        cityBalanceAfter: number;
        playerBalanceAfter: number;
        note: string;
    }): void {
        governance.treasuryLog.unshift(entry);
        if (governance.treasuryLog.length > MAX_LEDGER_ENTRIES) {
            governance.treasuryLog.length = MAX_LEDGER_ENTRIES;
        }
    }
}
