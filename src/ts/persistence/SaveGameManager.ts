import type { World } from "../ecs/Engine";
import { City, CityFacilities, CityGovernance, CityTreasury, Gold, Inventory, IsPlayerOwned, Kontor, Market, Merchant, Name, NavigationPath, PlayerControlled, PlayerIsMayor, Position, Ship, TravelRoute, ActiveShip, ShipType, ShipBuildOrder } from "../gameplay/components";
import { GameTime } from "../gameplay/GameTime";
import { GoodsRegistry } from "../gameplay/GoodsRegistry";
import { Entity } from "../ecs/Entity";
import type { ShipClassName } from "../gameplay/components/identity";

const SAVEGAME_KEY = "hanse2.savegame";
const INTRO_SEEN_KEY = "hanse2.intro-seen";
const TUTORIAL_SEEN_KEY = "hanse2.tutorial-seen";
const SAVEGAME_VERSION = 4;
const AUTOSAVE_INTERVAL_MS = 15000;

interface SavedInventory {
    [goodName: string]: number;
}

interface SavedMarketEntry {
    supply: number;
    demandFactor: number;
}

interface SavedTravelRoute {
    origin: { x: number; y: number };
    destination: { x: number; y: number };
    progress: number;
}

interface SavedNavigationPath {
    waypoints: Array<{ x: number; y: number }>;
    currentIndex: number;
}

interface SavedShip {
    name: string;
    shipType: ShipClassName | null;
    position: { x: number; y: number };
    gold: number;
    inventory: SavedInventory;
    travelRoute: SavedTravelRoute | null;
    navigationPath: SavedNavigationPath | null;
    isActive: boolean;
}

interface SavedBuildOrder {
    cityName: string;
    shipType: ShipClassName;
    goldCost: number;
    materialsRequired: Record<string, number>;
    materialsCollected: Record<string, number>;
    buildStartRealSeconds: number | null;
    buildDurationRealSeconds: number;
}

interface SavedTreasuryLogEntry {
    timestamp: number;
    type: "election_fee" | "election_win" | "city_to_player" | "player_to_city" | "population_investment" | "facility_construction";
    amount: number;
    cityBalanceAfter: number;
    playerBalanceAfter: number;
    note: string;
}

interface SavedFacility {
    goodName: string;
    weeklyOutput: number;
    treasuryCost: number;
}

interface SavedGovernance {
    reputationPercent: number;
    lastElectionWeek: number;
    incumbentLocked: boolean;
    candidateForElection: boolean;
    candidacyPaidWeek: number;
    electionEligible: boolean;
    treasuryLog: SavedTreasuryLogEntry[];
}

export interface SaveGameData {
    version: number;
    savedAt: string;
    elapsedRealSeconds: number;
    playerCompany: {
        gold: number;
    };
    /** @deprecated v1 single ship — kept for migration. */
    playerShip?: {
        position: { x: number; y: number };
        gold: number;
        inventory: SavedInventory;
        travelRoute: SavedTravelRoute | null;
        navigationPath: SavedNavigationPath | null;
    };
    /** v2 multi-ship fleet. */
    playerShips?: SavedShip[];
    shipBuildOrders?: SavedBuildOrder[];
    kontors: Array<{
        name: string;
        cityName?: string;
        gold: number;
        inventory: SavedInventory;
    }>;
    cities: Array<{
        name: string;
        gold: number;
        treasury: number;
        market: Record<string, SavedMarketEntry>;
        governance?: SavedGovernance;
        facilities?: SavedFacility[];
        playerIsMayor?: boolean;
    }>;
}

export class SaveGameManager {
    private static _autosaveTimer: number | null = null;
    private static _detachLifecycle: (() => void) | null = null;

    public static hasSave(): boolean {
        return !!localStorage.getItem(SAVEGAME_KEY);
    }

    public static load(): SaveGameData | null {
        const raw = localStorage.getItem(SAVEGAME_KEY);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as SaveGameData;
            // Accept v1/v2/v3 for migration and v4 current format.
            if (parsed.version !== SAVEGAME_VERSION && parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
                this.clearSave();
                return null;
            }
            // Migrate v1 → v2
            if (parsed.version === 1 && parsed.playerShip && !parsed.playerShips) {
                parsed.playerShips = [{
                    name: "Adler von Lübeck",
                    shipType: "Kogge",
                    position: parsed.playerShip.position,
                    gold: parsed.playerShip.gold,
                    inventory: parsed.playerShip.inventory,
                    travelRoute: parsed.playerShip.travelRoute,
                    navigationPath: parsed.playerShip.navigationPath,
                    isActive: true,
                }];
                parsed.shipBuildOrders = [];
                parsed.version = 2;
            }
            // Migrate older saves to v4 with a separate city treasury.
            if (parsed.version === 2 || parsed.version === 3) {
                parsed.version = 4;
                parsed.cities = parsed.cities.map(city => ({
                    ...city,
                    treasury: city.gold,
                    gold: 10_000,
                    governance: {
                        reputationPercent: city.governance?.reputationPercent ?? 0,
                        lastElectionWeek: city.governance?.lastElectionWeek ?? 0,
                        incumbentLocked: city.governance?.incumbentLocked ?? false,
                        candidateForElection: city.governance?.candidateForElection ?? false,
                        candidacyPaidWeek: city.governance?.candidacyPaidWeek ?? 0,
                        electionEligible: city.governance?.electionEligible ?? true,
                        treasuryLog: city.governance?.treasuryLog ?? [],
                    },
                    facilities: city.facilities ?? [],
                    playerIsMayor: city.playerIsMayor ?? false,
                }));
            }
            return parsed;
        } catch {
            this.clearSave();
            return null;
        }
    }

    public static clearSave(): void {
        localStorage.removeItem(SAVEGAME_KEY);
    }

    public static hasSeenIntro(): boolean {
        return localStorage.getItem(INTRO_SEEN_KEY) === "true";
    }

    public static markIntroSeen(): void {
        localStorage.setItem(INTRO_SEEN_KEY, "true");
    }

    public static hasSeenTutorial(): boolean {
        return localStorage.getItem(TUTORIAL_SEEN_KEY) === "true";
    }

    public static markTutorialSeen(): void {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    }

    public static saveWorld(world: World): boolean {
        const saveData = this.serializeWorld(world);
        if (!saveData) return false;

        localStorage.setItem(SAVEGAME_KEY, JSON.stringify(saveData));
        return true;
    }

    public static restoreWorld(world: World, saveData: SaveGameData): void {
        const registry = GoodsRegistry.getInstance();

        GameTime.getInstance().setElapsedRealSeconds(saveData.elapsedRealSeconds);

        const playerCompany = world.query(Merchant, Gold, IsPlayerOwned)[0];

        if (playerCompany) {
            const gold = playerCompany.getComponent(Gold);
            if (gold) gold.amount = saveData.playerCompany.gold;
        }

        // ---- Multi-ship restore (v2) ----
        const savedShips = saveData.playerShips ?? [];

        // The first player ship was created during initWorld — restore it from index 0.
        const existingShips = world.query(Ship, PlayerControlled, Position, Inventory);
        const firstShip = existingShips[0];

        for (let i = 0; i < savedShips.length; i++) {
            const saved = savedShips[i]!;
            let ship: Entity;

            if (i === 0 && firstShip) {
                // Restore the default ship created in initWorld.
                ship = firstShip;
            } else {
                // Spawn additional ships.
                ship = new Entity()
                    .addComponent(new Position(saved.position.x, saved.position.y))
                    .addComponent(new Name(saved.name))
                    .addComponent(new Ship(350, 0.035))
                    .addComponent(new Gold(saved.gold))
                    .addComponent(new Inventory())
                    .addComponent(new PlayerControlled());
                world.addEntity(ship);
            }

            // Restore ship properties.
            const nameComp = ship.getComponent(Name);
            if (nameComp) nameComp.value = saved.name;

            const position = ship.getComponent(Position);
            if (position) {
                position.x = saved.position.x;
                position.y = saved.position.y;
            }

            const gold = ship.getComponent(Gold);
            if (gold) gold.amount = saved.gold;

            const inventory = ship.getComponent(Inventory);
            if (inventory) this.restoreInventory(inventory, saved.inventory, registry);

            // Ship type
            if (saved.shipType) {
                ship.removeComponent(ShipType);
                ship.addComponent(new ShipType(saved.shipType));
                const cfg = registry.getShipType(saved.shipType);
                if (cfg) {
                    const shipComp = ship.getComponent(Ship);
                    if (shipComp) {
                        shipComp.cargoCapacity = cfg.capacity;
                        shipComp.speedUnitsPerSecond = cfg.speed;
                    }
                }
            }

            // Active ship tag
            ship.removeComponent(ActiveShip);
            if (saved.isActive) {
                ship.addComponent(new ActiveShip());
            }

            // Navigation state
            ship.removeComponent(TravelRoute);
            ship.removeComponent(NavigationPath);

            if (saved.navigationPath) {
                const navigationPath = new NavigationPath(saved.navigationPath.waypoints);
                navigationPath.currentIndex = saved.navigationPath.currentIndex;
                ship.addComponent(navigationPath);
            }

            if (saved.travelRoute) {
                const travelRoute = new TravelRoute(
                    saved.travelRoute.origin,
                    saved.travelRoute.destination,
                );
                travelRoute.progress = saved.travelRoute.progress;
                ship.addComponent(travelRoute);
            }
        }

        // ---- Restore build orders ----
        if (saveData.shipBuildOrders) {
            // Map city names to entity IDs for build orders.
            const citiesByName = new Map(
                world.query(City, Name).map(e => [e.getComponent(Name)!.value, e.id]),
            );

            for (const saved of saveData.shipBuildOrders) {
                const cityId = citiesByName.get(saved.cityName);
                if (!cityId) continue;

                const materialsRequired = new Map(Object.entries(saved.materialsRequired));
                const order = new ShipBuildOrder(
                    cityId,
                    saved.shipType,
                    saved.goldCost,
                    materialsRequired,
                    saved.buildDurationRealSeconds,
                );
                order.buildStartRealSeconds = saved.buildStartRealSeconds;
                for (const [mat, qty] of Object.entries(saved.materialsCollected)) {
                    order.materialsCollected.set(mat, qty);
                }

                const orderEntity = new Entity().addComponent(order);
                world.addEntity(orderEntity);
            }
        }

        // ---- Kontors ----
        const citiesByName = new Map(
            world.query(City, Name, Position).map(entity => [entity.getComponent(Name)?.value, entity]),
        );

        const kontorsByName = new Map(
            world.query(Kontor, Name, Inventory).map(entity => [entity.getComponent(Name)?.value, entity]),
        );

        for (const savedKontor of saveData.kontors) {
            let entity = kontorsByName.get(savedKontor.name);

            if (!entity) {
                const derivedCityName = savedKontor.cityName ?? savedKontor.name.replace(/^Kontor\s+/, "");
                const cityEntity = citiesByName.get(derivedCityName);
                const cityPos = cityEntity?.getComponent(Position);

                if (cityPos) {
                    entity = new Entity()
                        .addComponent(new Position(cityPos.x, cityPos.y))
                        .addComponent(new Name(savedKontor.name))
                        .addComponent(new Kontor(250))
                        .addComponent(new IsPlayerOwned(true))
                        .addComponent(new Inventory())
                        .addComponent(new Gold(0));

                    world.addEntity(entity);
                    kontorsByName.set(savedKontor.name, entity);
                }
            }

            if (!entity) continue;
            const inventory = entity.getComponent(Inventory);
            const gold = entity.getComponent(Gold);
            if (inventory) this.restoreInventory(inventory, savedKontor.inventory, registry);
            if (gold) gold.amount = savedKontor.gold;
        }

        const citiesWithMarketByName = new Map(
            world.query(City, Name, Market).map(entity => [entity.getComponent(Name)?.value, entity]),
        );

        for (const savedCity of saveData.cities) {
            const entity = citiesWithMarketByName.get(savedCity.name);
            if (!entity) continue;

            const gold = entity.getComponent(Gold);
            const market = entity.getComponent(Market);
            if (gold) gold.amount = savedCity.gold;

            let treasury = entity.getComponent(CityTreasury);
            if (!treasury) {
                treasury = new CityTreasury();
                entity.addComponent(treasury);
            }
            treasury.amount = savedCity.treasury ?? savedCity.gold;
            if (!market) continue;

            for (const [goodName, marketEntry] of Object.entries(savedCity.market)) {
                const good = registry.getGood(goodName);
                if (!good) continue;
                market.update(good, {
                    supply: marketEntry.supply,
                    demandFactor: marketEntry.demandFactor,
                });
            }

            const governance = entity.getComponent(CityGovernance);
            if (governance && savedCity.governance) {
                governance.reputationPercent = savedCity.governance.reputationPercent;
                governance.lastElectionWeek = savedCity.governance.lastElectionWeek;
                governance.incumbentLocked = savedCity.governance.incumbentLocked;
                governance.candidateForElection = savedCity.governance.candidateForElection;
                governance.candidacyPaidWeek = savedCity.governance.candidacyPaidWeek;
                governance.electionEligible = savedCity.governance.electionEligible;
                governance.treasuryLog.length = 0;
                governance.treasuryLog.push(...savedCity.governance.treasuryLog);
            }

            let facilities = entity.getComponent(CityFacilities);
            if (!facilities) {
                facilities = new CityFacilities();
                entity.addComponent(facilities);
            }
            facilities.restore(savedCity.facilities ?? []);

            entity.removeComponent(PlayerIsMayor);
            if (savedCity.playerIsMayor) {
                entity.addComponent(new PlayerIsMayor());
            }
        }
    }

    public static startAutosave(world: World): void {
        this.stopAutosave();

        this._autosaveTimer = window.setInterval(() => {
            this.saveWorld(world);
        }, AUTOSAVE_INTERVAL_MS);

        const onPageHide = (): void => {
            this.saveWorld(world);
        };
        const onVisibilityChange = (): void => {
            if (document.hidden) this.saveWorld(world);
        };

        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("visibilitychange", onVisibilityChange);

        this._detachLifecycle = () => {
            window.removeEventListener("pagehide", onPageHide);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }

    public static stopAutosave(): void {
        if (this._autosaveTimer !== null) {
            window.clearInterval(this._autosaveTimer);
            this._autosaveTimer = null;
        }
        this._detachLifecycle?.();
        this._detachLifecycle = null;
    }

    private static serializeWorld(world: World): SaveGameData | null {
        const playerCompany = world.query(Merchant, Gold, IsPlayerOwned)[0];
        const playerShips = world.query(Ship, PlayerControlled, Position, Inventory);

        if (!playerCompany || playerShips.length === 0) return null;

        const playerCompanyGold = playerCompany.getComponent(Gold);
        if (!playerCompanyGold) return null;

        // ---- Serialize all player ships ----
        const serializedShips: SavedShip[] = [];
        for (const ship of playerShips) {
            const pos = ship.getComponent(Position);
            const gold = ship.getComponent(Gold);
            const inv = ship.getComponent(Inventory);
            if (!pos || !gold || !inv) continue;

            const travelRoute = ship.getComponent(TravelRoute);
            const navigationPath = ship.getComponent(NavigationPath);
            const nameComp = ship.getComponent(Name);
            const shipType = ship.getComponent(ShipType);

            serializedShips.push({
                name: nameComp?.value ?? "Ship",
                shipType: (shipType?.shipClass ?? "Kogge") as ShipClassName,
                position: { x: pos.x, y: pos.y },
                gold: gold.amount,
                inventory: this.serializeInventory(inv),
                isActive: ship.hasComponent(ActiveShip),
                travelRoute: travelRoute
                    ? {
                        origin: { ...travelRoute.origin },
                        destination: { ...travelRoute.destination },
                        progress: travelRoute.progress,
                    }
                    : null,
                navigationPath: navigationPath
                    ? {
                        waypoints: navigationPath.waypoints.map(w => ({ ...w })),
                        currentIndex: navigationPath.currentIndex,
                    }
                    : null,
            });
        }

        const cities = world.query(City, Name, Position);

        // ---- Serialize build orders ----
        const buildOrders: SavedBuildOrder[] = [];
        for (const entity of world.query(ShipBuildOrder)) {
            const order = entity.getComponent(ShipBuildOrder)!;
            const cityEntity = world.getEntityById(order.cityEntityId);
            const cityName = cityEntity?.getComponent(Name)?.value ?? "Unknown";

            buildOrders.push({
                cityName,
                shipType: order.shipType,
                goldCost: order.goldCost,
                materialsRequired: Object.fromEntries(order.materialsRequired),
                materialsCollected: Object.fromEntries(order.materialsCollected),
                buildStartRealSeconds: order.buildStartRealSeconds,
                buildDurationRealSeconds: order.buildDurationRealSeconds,
            });
        }

        return {
            version: SAVEGAME_VERSION,
            savedAt: new Date().toISOString(),
            elapsedRealSeconds: GameTime.getInstance().elapsedRealSeconds,
            playerCompany: {
                gold: playerCompanyGold.amount,
            },
            playerShip: serializedShips[0] ? {
                position: serializedShips[0].position,
                gold: serializedShips[0].gold,
                inventory: serializedShips[0].inventory,
                travelRoute: serializedShips[0].travelRoute,
                navigationPath: serializedShips[0].navigationPath,
            } : { position: { x: 0, y: 0 }, gold: 0, inventory: {}, travelRoute: null, navigationPath: null },
            playerShips: serializedShips,
            shipBuildOrders: buildOrders,
            kontors: world.query(Kontor, Name, Inventory).map(entity => {
                const name = entity.getComponent(Name)?.value ?? "Kontor";
                const pos = entity.getComponent(Position);
                const cityName = pos
                    ? cities.find(city => {
                        const cityPos = city.getComponent(Position);
                        return !!cityPos && Math.abs(cityPos.x - pos.x) < 0.001 && Math.abs(cityPos.y - pos.y) < 0.001;
                    })?.getComponent(Name)?.value
                    : undefined;

                return {
                    name,
                    cityName,
                    gold: entity.getComponent(Gold)?.amount ?? 0,
                    inventory: this.serializeInventory(entity.getComponent(Inventory)!),
                };
            }),
            cities: world.query(City, Name, Market).map(entity => ({
                name: entity.getComponent(Name)?.value ?? "City",
                gold: entity.getComponent(Gold)?.amount ?? 0,
                treasury: entity.getComponent(CityTreasury)?.amount ?? 0,
                market: this.serializeMarket(entity.getComponent(Market)!),
                governance: (() => {
                    const governance = entity.getComponent(CityGovernance);
                    if (!governance) return undefined;
                    return {
                        reputationPercent: governance.reputationPercent,
                        lastElectionWeek: governance.lastElectionWeek,
                        incumbentLocked: governance.incumbentLocked,
                        candidateForElection: governance.candidateForElection,
                        candidacyPaidWeek: governance.candidacyPaidWeek,
                        electionEligible: governance.electionEligible,
                        treasuryLog: governance.treasuryLog.map(entry => ({
                            timestamp: entry.timestamp,
                            type: entry.type,
                            amount: entry.amount,
                            cityBalanceAfter: entry.cityBalanceAfter,
                            playerBalanceAfter: entry.playerBalanceAfter,
                            note: entry.note,
                        })),
                    };
                })(),
                facilities: entity.getComponent(CityFacilities)?.serialize() ?? [],
                playerIsMayor: entity.hasComponent(PlayerIsMayor),
            })),
        };
    }

    private static serializeInventory(inventory: Inventory): SavedInventory {
        const data: SavedInventory = {};
        for (const [good, quantity] of inventory.entries()) {
            if (quantity > 0) data[good.name] = quantity;
        }
        return data;
    }

    private static restoreInventory(inventory: Inventory, serialized: SavedInventory, registry: GoodsRegistry): void {
        for (const [goodName, quantity] of Object.entries(serialized)) {
            const good = registry.getGood(goodName);
            if (!good || quantity <= 0) continue;
            inventory.add(good, quantity);
        }
    }

    private static serializeMarket(market: Market): Record<string, SavedMarketEntry> {
        const data: Record<string, SavedMarketEntry> = {};
        for (const [good, entry] of market.goods()) {
            data[good.name] = {
                supply: entry.supply,
                demandFactor: entry.demandFactor,
            };
        }
        return data;
    }
}