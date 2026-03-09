import { Engine } from "./ecs/Engine";
import { Entity } from "./ecs/Entity";
import {
    Position, Name, City, Ship, Gold, Inventory,
    Market, PlayerControlled, CityProduction,
    IsPlayerOwned, Kontor, Merchant, ShadowProducer,
    type TradeGood, type MarketEntry,
} from "./gameplay/components";
import { HUDcontroller } from "./render/HUDcontroller";
import { GameTimeSystem, MovementSystem, MarketSystem, TradeSystem } from "./gameplay/systems";
import { MapRenderSystem } from "./render/RenderSystem";
import { loadMapData } from "./navigation/MapData";
import { NavigationGraph } from "./navigation/Graph";
import { GoodsRegistry } from "./gameplay/GoodsRegistry";
import { SpriteManager } from "./render/SpriteManager";
import { GameTime } from "./gameplay/GameTime";
import { TravelRoute } from "./gameplay/components";
import type { SaveGameData } from "./persistence/SaveGameManager";
import { SaveGameManager } from "./persistence/SaveGameManager";
import { demandAlgorithm } from "./gameplay/algorithms/EconomyAlgorithms";

interface CitiesJson {
    production: Record<string, Record<string, number>>;
    citizens: Record<string, number>;
}

// ---- Canvas ----
const canvas = document.getElementById("world-map") as HTMLCanvasElement;

const engine = Engine.getInstance();
const world  = engine.world;

const renderSystem = new MapRenderSystem(canvas);

world
    .addTickSystem(new GameTimeSystem())
    .addTickSystem(new MovementSystem())
    .addTickSystem(new MarketSystem())
    .addTickSystem(renderSystem);

export const tradeSystem = new TradeSystem();
export { renderSystem };
tradeSystem.world = world;

/** Initialise the game world from JSON data files. Must be awaited before engine.start(). */
export async function initWorld(saveGame: SaveGameData | null = null): Promise<void> {
    // Load all data in parallel.
    const [mapData, registry, citiesRes] = await Promise.all([
        loadMapData(),
        GoodsRegistry.load(),
        fetch("/assets/data/cities.json").then(r => r.json() as Promise<CitiesJson>),
    ]);

    const graph = new NavigationGraph(mapData);

    // Wire graph into the render system for click-to-travel.
    renderSystem.graph = graph;
    renderSystem.harbourNames = Object.keys(mapData.harbour);

    // Pre-load all good icons.
    SpriteManager.getInstance().loadGoodIcons(registry.getAllGoods());

    const allGoods = registry.getAllGoods();

    // Create harbour entities.
    for (const [name, pos] of Object.entries(mapData.harbour)) {
        const citizens    = citiesRes.citizens[name] ?? 500;
        const prodData    = citiesRes.production[name] ?? {};
        const multipliers = new Map(Object.entries(prodData));

        // Build market entries for all known goods (supply starts at 0).
        const marketEntries: [TradeGood, MarketEntry][] = allGoods.map(good => [
            good,
            { basePrice: good.buyPrice, supply: demandAlgorithm(good, citizens) * (6 * Math.random()), demand: NaN },
        ]);

        const city = new Entity()
            .addComponent(new Position(pos.x, pos.y))
            .addComponent(new Name(name))
            .addComponent(new City(citizens))
            .addComponent(new Gold(10_000))
            .addComponent(new CityProduction(citizens, multipliers))
            .addComponent(new Market(marketEntries));
        world.addEntity(city);
    }

    // Player ship starts at Lübeck.
    const startPos = mapData.harbour["Lübeck"]!;
    const playerCompany = new Entity()
        .addComponent(new Name("Hanse Trading Company"))
        .addComponent(new Merchant("Hanse Trading Company"))
        .addComponent(new IsPlayerOwned(true))
        .addComponent(new Gold(1500));
    world.addEntity(playerCompany);

    const playerShip = new Entity()
        .addComponent(new Position(startPos.x, startPos.y))
        .addComponent(new Name("Adler von Lübeck"))
        .addComponent(new Ship(250, 0.025))
        .addComponent(new Gold(0))
        .addComponent(new Inventory())
        .addComponent(new PlayerControlled());

    world.addEntity(playerShip);

    // Default kontor at Lübeck.
    const kontorLuebeck = new Entity()
        .addComponent(new Position(startPos.x, startPos.y))
        .addComponent(new Name("Kontor Lübeck"))
        .addComponent(new Kontor(250))
        .addComponent(new IsPlayerOwned(true))
        .addComponent(new Inventory())
        .addComponent(new Gold(0));
    world.addEntity(kontorLuebeck);

    // Virtual shadow producer — acts as a world-market balancer.
    const shadowProducer = new Entity()
        .addComponent(new ShadowProducer())
        .addComponent(new Gold(1_000_000))
        .addComponent(new Inventory());
    world.addEntity(shadowProducer);

    HUDcontroller.getInstance().setTradeSystem(tradeSystem);
    HUDcontroller.getInstance().setPlayerShip(playerShip);
    HUDcontroller.getInstance().setPlayerCompany(playerCompany);

    if (saveGame) {
        SaveGameManager.restoreWorld(world, saveGame);
    }

    const hud = HUDcontroller.getInstance();
    hud.updateGameTime(GameTime.getInstance().formatHudLabel());
    hud.notifyDataChange();

    if (playerShip.getComponent(TravelRoute)) {
        hud.updateOnSeaInfo(playerShip);
    } else {
        const shipPos = playerShip.getComponent(Position)!;
        const currentCity = world.query(City, Position, Name).find(entity => {
            const cityPos = entity.getComponent(Position)!;
            return Math.abs(cityPos.x - shipPos.x) < 0.001 && Math.abs(cityPos.y - shipPos.y) < 0.001;
        });

        hud.setOnSeaState(false);
        hud.updateCityInfo(
            currentCity?.getComponent(Name)?.value ?? "Lübeck",
            currentCity?.getComponent(City)?.population ?? citiesRes.citizens["Lübeck"] ?? 500,
        );
    }
}

export default engine;