import { EventSystem } from "../../ecs/System";
import { CityGovernance, CityTreasury, Gold, Inventory, Market, Merchant, Name, Ship, IsPlayerOwned, PlayerControlled, type TradeGood } from "../components";
import { HUDcontroller } from "../../render/HUDcontroller";
import { NotificationManager } from "../../render/NotificationManager";
import { MayorSystem } from "./MayorSystem";

export interface TradeOrder {
    /** "buy"  — ship purchases goods from the city market.
     *  "sell" — ship delivers goods to the city market. */
    direction: "buy" | "sell";
    shipId: string;
    cityId: string;
    good: TradeGood;
    quantity: number;
}

/**
 * Processes a trade transaction between a ship and a city market.
 * All checks are atomic — either the full transaction succeeds or nothing changes.
 */
export class TradeSystem extends EventSystem<TradeOrder> {
    override handle(order: TradeOrder): void {
        console.log("[MayorReputation] trade received", {
            direction: order.direction,
            shipId: order.shipId,
            cityId: order.cityId,
            good: order.good.name,
            quantity: order.quantity,
        });

        const ship = this.world.getEntityById(order.shipId);
        const city = this.world.getEntityById(order.cityId);
        if (!ship || !city) {
            console.log("[MayorReputation] aborted: ship or city missing", {
                hasShip: !!ship,
                hasCity: !!city,
            });
            return;
        }

        const playerCompany = (ship.hasComponent(PlayerControlled) || ship.hasComponent(IsPlayerOwned))
            ? this.world.query(Merchant, Gold, IsPlayerOwned)[0] ?? null
            : null;
        const shipGold = playerCompany?.getComponent(Gold) ?? ship.getComponent(Gold);
        const shipInv  = ship.getComponent(Inventory);
        const shipComp = ship.getComponent(Ship);
        const cityMkt  = city.getComponent(Market);
        const cityTreasury = city.getComponent(CityTreasury);
        const governance = city.getComponent(CityGovernance);
        const marketEntryBefore = cityMkt!.getEntry(order.good);
        const marketStateBefore = MayorSystem.classifyMarketState(order.good, cityMkt!);

        if (!shipGold || !shipInv || !cityMkt) {
            console.log("[MayorReputation] aborted: missing required components", {
                hasShipGold: !!shipGold,
                hasInventory: !!shipInv,
                hasMarket: !!cityMkt,
            });
            return;
        }

        if (order.direction === "buy") {
            const unitPrice = cityMkt.currentPrice(order.good);
            const totalCost = unitPrice * order.quantity;
            const entry     = cityMkt.getEntry(order.good);

            if (!entry || entry.supply < order.quantity) {
                console.log("[MayorReputation] buy rejected: insufficient city stock", {
                    entrySupply: entry?.supply ?? null,
                    requested: order.quantity,
                });
                return;
            }
            if (shipGold.amount < totalCost) {
                console.log("[MayorReputation] buy rejected: insufficient gold", {
                    gold: shipGold.amount,
                    totalCost,
                });
                return;
            }
            if (shipComp && shipInv.totalUnits() + order.quantity > shipComp.cargoCapacity) {
                console.log("[MayorReputation] buy rejected: capacity exceeded", {
                    currentCargo: shipInv.totalUnits(),
                    requested: order.quantity,
                    capacity: shipComp.cargoCapacity,
                });
                return;
            }

            // Commit
            shipInv.add(order.good, order.quantity);
            shipGold.amount -= totalCost;
            if (cityTreasury) cityTreasury.amount += totalCost;
            cityMkt.update(order.good, { supply: Math.max(0, entry.supply - order.quantity) });

            console.log("[MayorReputation] buy classification", {
                city: city.getComponent(Name)?.value ?? "City",
                good: order.good.name,
                marketState: marketStateBefore,
                reputationBefore: governance?.reputationPercent ?? null,
            });
            if (governance) {
                let reputationDelta = 0;
                // Buying surplus goods helps a city; buying scarce goods hurts it.
                if (marketStateBefore === "overflow") {
                    reputationDelta = Math.min(5, Math.ceil(order.quantity / 10));
                } else if (marketStateBefore === "scarce") {
                    reputationDelta = -Math.min(5, Math.ceil(order.quantity / 10));
                }
                this._applyReputation(city.getComponent(Name)?.value ?? "City", governance, reputationDelta);
            } else {
                console.log("[MayorReputation] buy no governance component on city");
            }

            HUDcontroller.getInstance().notifyDataChange();

        } else {
            // sell: ship → city
            const entry = cityMkt.getEntry(order.good);
            if (!entry) {
                console.log("[MayorReputation] sell rejected: city has no entry for good", {
                    good: order.good.name,
                });
                return;
            }

            const unitPrice = cityMkt.currentPrice(order.good);
            const totalRevenue = unitPrice * order.quantity;

            if (!shipInv.remove(order.good, order.quantity)) {
                console.log("[MayorReputation] sell rejected: inventory too low", {
                    good: order.good.name,
                    requested: order.quantity,
                });
                return;
            }

            shipGold.amount += totalRevenue;
            if (cityTreasury) cityTreasury.amount = Math.max(0, cityTreasury.amount - totalRevenue);
            cityMkt.update(order.good, { supply: entry.supply + order.quantity });

            console.log("[MayorReputation] sell classification", {
                city: city.getComponent(Name)?.value ?? "City",
                good: order.good.name,
                marketState: marketStateBefore,
                reputationBefore: governance?.reputationPercent ?? null,
            });
            if (governance) {
                // Selling goods to a scarce city helps; dumping into an oversupplied city hurts.
                let reputationDelta = 0;
                if (marketStateBefore === "scarce") {
                    reputationDelta = Math.min(5, Math.ceil(order.quantity / 10));
                } else if (marketStateBefore === "overflow") {
                    reputationDelta = -Math.min(5, Math.ceil(order.quantity / 10));
                }
                this._applyReputation(city.getComponent(Name)?.value ?? "City", governance, reputationDelta);
            } else {
                console.log("[MayorReputation] sell no reputation change (market balanced)");
            }

            HUDcontroller.getInstance().notifyDataChange();
        }
    }

    private _applyReputation(cityName: string, governance: CityGovernance, delta: number): void {
        const before = governance.reputationPercent;
        const after = Math.max(0, Math.min(100, before + delta));
        governance.reputationPercent = after;
        console.log("[MayorReputation] reputation updated", {
            city: cityName,
            delta,
            before,
            after,
        });

        if (before < 50 && after >= 50) {
            NotificationManager.getInstance().push({
                title: `${cityName}: Reputation milestone`,
                message: "You now have enough reputation to win a mayor election.",
                type: "success",
            });
        }
        if (before >= 50 && after < 50) {
            NotificationManager.getInstance().push({
                title: `${cityName}: Reputation dropped`,
                message: "You are below the 50% election threshold in this city.",
                type: "warning",
            });
        }
    }
}
