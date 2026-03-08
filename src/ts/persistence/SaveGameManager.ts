import type { World } from "../ecs/Engine";
import { City, Gold, Inventory, IsPlayerOwned, Kontor, Market, Merchant, Name, NavigationPath, PlayerControlled, Position, Ship, TravelRoute } from "../gameplay/components";
import { GameTime } from "../gameplay/GameTime";
import { GoodsRegistry } from "../gameplay/GoodsRegistry";

const SAVEGAME_KEY = "hanse2.savegame";
const INTRO_SEEN_KEY = "hanse2.intro-seen";
const SAVEGAME_VERSION = 1;
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

export interface SaveGameData {
    version: number;
    savedAt: string;
    elapsedRealSeconds: number;
    playerCompany: {
        gold: number;
    };
    playerShip: {
        position: { x: number; y: number };
        gold: number;
        inventory: SavedInventory;
        travelRoute: SavedTravelRoute | null;
        navigationPath: SavedNavigationPath | null;
    };
    kontors: Array<{
        name: string;
        gold: number;
        inventory: SavedInventory;
    }>;
    cities: Array<{
        name: string;
        gold: number;
        market: Record<string, SavedMarketEntry>;
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
            if (parsed.version !== SAVEGAME_VERSION) {
                this.clearSave();
                return null;
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
        const playerShip = world.query(Ship, PlayerControlled, Position, Inventory)[0];

        if (playerCompany) {
            const gold = playerCompany.getComponent(Gold);
            if (gold) gold.amount = saveData.playerCompany.gold;
        }

        if (playerShip) {
            const position = playerShip.getComponent(Position);
            const gold = playerShip.getComponent(Gold);
            const inventory = playerShip.getComponent(Inventory);

            if (position) {
                position.x = saveData.playerShip.position.x;
                position.y = saveData.playerShip.position.y;
            }
            if (gold) gold.amount = saveData.playerShip.gold;
            if (inventory) this.restoreInventory(inventory, saveData.playerShip.inventory, registry);

            playerShip.removeComponent(TravelRoute);
            playerShip.removeComponent(NavigationPath);

            if (saveData.playerShip.navigationPath) {
                const navigationPath = new NavigationPath(saveData.playerShip.navigationPath.waypoints);
                navigationPath.currentIndex = saveData.playerShip.navigationPath.currentIndex;
                playerShip.addComponent(navigationPath);
            }

            if (saveData.playerShip.travelRoute) {
                const travelRoute = new TravelRoute(
                    saveData.playerShip.travelRoute.origin,
                    saveData.playerShip.travelRoute.destination,
                );
                travelRoute.progress = saveData.playerShip.travelRoute.progress;
                playerShip.addComponent(travelRoute);
            }
        }

        const kontorsByName = new Map(
            world.query(Kontor, Name, Inventory).map(entity => [entity.getComponent(Name)?.value, entity]),
        );

        for (const savedKontor of saveData.kontors) {
            const entity = kontorsByName.get(savedKontor.name);
            if (!entity) continue;
            const inventory = entity.getComponent(Inventory);
            const gold = entity.getComponent(Gold);
            if (inventory) this.restoreInventory(inventory, savedKontor.inventory, registry);
            if (gold) gold.amount = savedKontor.gold;
        }

        const citiesByName = new Map(
            world.query(City, Name, Market).map(entity => [entity.getComponent(Name)?.value, entity]),
        );

        for (const savedCity of saveData.cities) {
            const entity = citiesByName.get(savedCity.name);
            if (!entity) continue;

            const gold = entity.getComponent(Gold);
            const market = entity.getComponent(Market);
            if (gold) gold.amount = savedCity.gold;
            if (!market) continue;

            for (const [goodName, marketEntry] of Object.entries(savedCity.market)) {
                const good = registry.getGood(goodName);
                if (!good) continue;
                market.update(good, {
                    supply: marketEntry.supply,
                    demandFactor: marketEntry.demandFactor,
                });
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
        const playerShip = world.query(Ship, PlayerControlled, Position, Inventory)[0];

        if (!playerCompany || !playerShip) return null;

        const playerCompanyGold = playerCompany.getComponent(Gold);
        const shipPosition = playerShip.getComponent(Position);
        const shipGold = playerShip.getComponent(Gold);
        const shipInventory = playerShip.getComponent(Inventory);
        const travelRoute = playerShip.getComponent(TravelRoute);
        const navigationPath = playerShip.getComponent(NavigationPath);

        if (!playerCompanyGold || !shipPosition || !shipGold || !shipInventory) return null;

        return {
            version: SAVEGAME_VERSION,
            savedAt: new Date().toISOString(),
            elapsedRealSeconds: GameTime.getInstance().elapsedRealSeconds,
            playerCompany: {
                gold: playerCompanyGold.amount,
            },
            playerShip: {
                position: { x: shipPosition.x, y: shipPosition.y },
                gold: shipGold.amount,
                inventory: this.serializeInventory(shipInventory),
                travelRoute: travelRoute
                    ? {
                        origin: { ...travelRoute.origin },
                        destination: { ...travelRoute.destination },
                        progress: travelRoute.progress,
                    }
                    : null,
                navigationPath: navigationPath
                    ? {
                        waypoints: navigationPath.waypoints.map(waypoint => ({ ...waypoint })),
                        currentIndex: navigationPath.currentIndex,
                    }
                    : null,
            },
            kontors: world.query(Kontor, Name, Inventory).map(entity => ({
                name: entity.getComponent(Name)?.value ?? "Kontor",
                gold: entity.getComponent(Gold)?.amount ?? 0,
                inventory: this.serializeInventory(entity.getComponent(Inventory)!),
            })),
            cities: world.query(City, Name, Market).map(entity => ({
                name: entity.getComponent(Name)?.value ?? "City",
                gold: entity.getComponent(Gold)?.amount ?? 0,
                market: this.serializeMarket(entity.getComponent(Market)!),
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