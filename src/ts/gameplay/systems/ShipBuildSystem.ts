import { TickSystem } from "../../ecs/System";
import { Entity } from "../../ecs/Entity";
import {
    ShipBuildOrder, Position, Name, Ship, Gold, Inventory,
    PlayerControlled, ShipType, Kontor, IsPlayerOwned, Market,
} from "../components";
import { GoodsRegistry } from "../GoodsRegistry";
import { GameTime, REAL_SECONDS_PER_DAY } from "../GameTime";
import { HUDcontroller } from "../../render/HUDcontroller";

/** Counter for auto-naming newly built ships. */
const builtCounts: Record<string, number> = {};
let shipNameTemplates: string[] = [];
let shipNameTemplatesPromise: Promise<string[]> | null = null;

async function ensureShipNameTemplatesLoaded(): Promise<string[]> {
    if (shipNameTemplates.length > 0) return shipNameTemplates;
    if (shipNameTemplatesPromise) return shipNameTemplatesPromise;

    shipNameTemplatesPromise = fetch("./assets/data/ship_names.json")
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ship names: ${response.status}`);
            }
            return response.json() as Promise<unknown>;
        })
        .then(data => {
            if (!Array.isArray(data)) {
                throw new Error("Ship names JSON must be an array of strings.");
            }
            shipNameTemplates = data.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
            return shipNameTemplates;
        })
        .catch(error => {
            console.warn("[ShipBuildSystem] Could not load ship names, using fallback names.", error);
            shipNameTemplates = [];
            return shipNameTemplates;
        });

    return shipNameTemplatesPromise;
}

/**
 * Processes all active ShipBuildOrder entities each tick:
 *   1. Gathers materials from player kontor or city market.
 *   2. Once materials are complete, starts the build timer.
 *   3. When timer expires, spawns a new ship entity.
 */
export class ShipBuildSystem extends TickSystem {
    /** Accumulates real time; only runs logic every ~10 seconds. */
    private _accumulated = 0;
    private readonly _interval = 10; // same cadence as MarketSystem

    public static async preloadShipNames(): Promise<void> {
        await ensureShipNameTemplatesLoaded();
    }

    override update(dt: number): void {
        this._accumulated += dt;
        if (this._accumulated < this._interval) return;
        this._accumulated -= this._interval;

        const registry = GoodsRegistry.getInstance();
        const gameTime = GameTime.getInstance();

        for (const orderEntity of this.world.query(ShipBuildOrder)) {
            const order = orderEntity.getComponent(ShipBuildOrder)!;
            if (order.complete) continue;

            // --- Phase 1: material gathering ---
            if (!order.allMaterialsCollected) {
                this._gatherMaterials(order, registry);
            }

            // --- Phase 2: start build timer once all materials gathered ---
            if (order.allMaterialsCollected && order.buildStartRealSeconds === null) {
                order.buildStartRealSeconds = gameTime.elapsedRealSeconds;
            }

            // --- Phase 3: complete build ---
            if (order.buildStartRealSeconds !== null) {
                const elapsed = gameTime.elapsedRealSeconds - order.buildStartRealSeconds;
                if (elapsed >= order.buildDurationRealSeconds) {
                    this._completeBuild(order, orderEntity);
                }
            }
        }
    }

    /**
     * Try to collect each missing material from:
     *  1. Player kontor at the build city (free transfer).
     *  2. City market (bought at market price, deducted from company gold).
     */
    private _gatherMaterials(order: ShipBuildOrder, registry: GoodsRegistry): void {
        const cityEntity = this.world.getEntityById(order.cityEntityId);
        if (!cityEntity) return;

        const cityPos = cityEntity.getComponent(Position);
        if (!cityPos) return;

        // Find player kontor at this city.
        let kontorInventory: Inventory | null = null;
        for (const k of this.world.query(Kontor, IsPlayerOwned, Position, Inventory)) {
            const kp = k.getComponent(Position)!;
            if (Math.abs(kp.x - cityPos.x) < 0.001 && Math.abs(kp.y - cityPos.y) < 0.001) {
                kontorInventory = k.getComponent(Inventory)!;
                break;
            }
        }

        // City market for buying.
        const market = cityEntity.getComponent(Market);

        // Player company gold.
        const companyGold = this._getPlayerCompanyGold();

        for (const [matName, required] of order.materialsRequired) {
            const collected = order.materialsCollected.get(matName) ?? 0;
            let needed = required - collected;
            if (needed <= 0) continue;

            const good = registry.getGood(matName);
            if (!good) continue;

            // 1. Take from kontor
            if (kontorInventory && needed > 0) {
                const available = kontorInventory.get(good);
                const take = Math.min(available, needed);
                if (take > 0) {
                    kontorInventory.remove(good, take);
                    order.materialsCollected.set(matName, collected + take);
                    needed -= take;
                }
            }

            // 2. Buy from market
            if (market && needed > 0 && companyGold) {
                const entry = market.getEntry(good);
                if (entry && entry.supply > 0) {
                    const canAfford = Math.floor(companyGold.amount / market.currentPrice(good));
                    const available = Math.floor(entry.supply);
                    const buy = Math.min(needed, available, canAfford);
                    if (buy > 0) {
                        const cost = market.currentPrice(good) * buy;
                        companyGold.amount -= cost;
                        market.update(good, { supply: Math.max(0, entry.supply - buy) });
                        order.materialsCollected.set(matName, (order.materialsCollected.get(matName) ?? 0) + buy);
                    }
                }
            }
        }
    }

    /** Spawn the new ship entity and clean up the build order. */
    private _completeBuild(order: ShipBuildOrder, orderEntity: Entity): void {
        const cityEntity = this.world.getEntityById(order.cityEntityId);
        if (!cityEntity) return;
        const cityPos = cityEntity.getComponent(Position);
        const cityName = cityEntity.getComponent(Name)?.value ?? "Unknown Port";
        if (!cityPos) return;

        const registry = GoodsRegistry.getInstance();
        const cfg = registry.getShipType(order.shipType);
        if (!cfg) return;

        // Auto-name the ship
        builtCounts[order.shipType] = (builtCounts[order.shipType] ?? 0) + 1;
        const shipName = this._generateShipName(cityName, order.shipType);

        const ship = new Entity()
            .addComponent(new Position(cityPos.x, cityPos.y))
            .addComponent(new Name(shipName))
            .addComponent(new Ship(cfg.capacity, cfg.speed))
            .addComponent(new ShipType(order.shipType))
            .addComponent(new Gold(0))
            .addComponent(new Inventory())
            .addComponent(new PlayerControlled());

        this.world.addEntity(ship);

        // Mark complete and remove the order entity.
        order.complete = true;
        this.world.removeEntity(orderEntity);

        // Notify HUD
        HUDcontroller.getInstance().notifyDataChange();
    }

    /** Get the shared player company Gold component. */
    private _getPlayerCompanyGold(): Gold | null {
        // Company entity has Merchant + Gold + IsPlayerOwned
        const companies = this.world.query(Gold, IsPlayerOwned);
        for (const e of companies) {
            if (e.getComponent(IsPlayerOwned)?.isPlayerOwned) {
                return e.getComponent(Gold) ?? null;
            }
        }
        return null;
    }

    private _generateShipName(cityName: string, shipType: string): string {
        if (shipNameTemplates.length === 0) {
            return `${shipType} ${builtCounts[shipType]}`;
        }

        const template = shipNameTemplates[Math.floor(Math.random() * shipNameTemplates.length)]!;
        const rendered = template
            .replaceAll("$CITY", cityName)
            .replaceAll("$city", cityName)
            .replaceAll("$TYP", shipType)
            .replaceAll("$typ", shipType);

        return rendered.trim() || `${shipType} ${builtCounts[shipType]}`;
    }
}
