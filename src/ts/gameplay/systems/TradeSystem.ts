import { EventSystem } from "../../ecs/System";
import { Gold, Inventory, Market, Ship, type TradeGood } from "../components";

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
        const ship = this.world.getEntityById(order.shipId);
        const city = this.world.getEntityById(order.cityId);
        if (!ship || !city) return;

        const shipGold = ship.getComponent(Gold);
        const shipInv  = ship.getComponent(Inventory);
        const shipComp = ship.getComponent(Ship);
        const cityMkt  = city.getComponent(Market);
        const cityGold = city.getComponent(Gold);

        if (!shipGold || !shipInv || !cityMkt) return;

        if (order.direction === "buy") {
            const unitPrice = cityMkt.currentPrice(order.good);
            const totalCost = unitPrice * order.quantity;
            const entry     = cityMkt.getEntry(order.good);

            if (!entry || entry.supply < order.quantity) return;          // city out of stock
            if (shipGold.amount < totalCost) return;                      // ship can't afford
            if (shipComp && shipInv.totalUnits() + order.quantity > shipComp.cargoCapacity) return; // no hold space

            // Commit
            shipInv.add(order.good, order.quantity);
            shipGold.amount -= totalCost;
            if (cityGold) cityGold.amount += totalCost;
            cityMkt.update(order.good, { supply: Math.max(0, entry.supply - order.quantity) });

        } else {
            // sell: ship → city
            const entry = cityMkt.getEntry(order.good);
            if (!entry) return;                                           // city doesn't trade this good

            const unitPrice = cityMkt.currentPrice(order.good);
            const totalRevenue = unitPrice * order.quantity;

            if (!shipInv.remove(order.good, order.quantity)) return;     // ship doesn't have enough

            shipGold.amount += totalRevenue;
            if (cityGold) cityGold.amount = Math.max(0, cityGold.amount - totalRevenue);
            cityMkt.update(order.good, { supply: entry.supply + order.quantity });
        }
    }
}
