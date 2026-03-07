import { Engine } from "./ecs/Engine";
import { Entity } from "./ecs/Entity";
import {
    Position, Name, City, Ship, Gold, Inventory,
    Market, PlayerControlled, TradeGood,
    type MarketEntry,
} from "./gameplay/components";
import { MovementSystem, MarketSystem, TradeSystem } from "./gameplay/systems";
import { MapRenderSystem } from "./render/RenderSystem";
import { loadMapData } from "./navigation/MapData";
import { NavigationGraph } from "./navigation/Graph";

// ---- Canvas ----
const canvas = document.getElementById("world-map") as HTMLCanvasElement;

const engine = Engine.getInstance();
const world  = engine.world;

const renderSystem = new MapRenderSystem(canvas);

world
    .addTickSystem(new MovementSystem())
    .addTickSystem(new MarketSystem())
    .addTickSystem(renderSystem);

export const tradeSystem = new TradeSystem();
tradeSystem.world = world;

// ---- Per-city market configuration (historically themed) ----
const CITY_MARKETS: Record<string, Partial<Record<TradeGood, MarketEntry>>> = {
    "Lübeck":       { [TradeGood.Grain]: { basePrice: 10, supply: 80, demandFactor: 1.0 }, [TradeGood.Fish]: { basePrice: 8, supply: 40, demandFactor: 1.2 }, [TradeGood.Cloth]: { basePrice: 20, supply: 60, demandFactor: 1.0 }, [TradeGood.Timber]: { basePrice: 12, supply: 30, demandFactor: 1.3 } },
    "Hamburg":      { [TradeGood.Grain]: { basePrice: 11, supply: 60, demandFactor: 1.1 }, [TradeGood.Beer]: { basePrice: 9, supply: 90, demandFactor: 0.9 }, [TradeGood.Salt]: { basePrice: 15, supply: 50, demandFactor: 1.0 }, [TradeGood.Iron]: { basePrice: 25, supply: 20, demandFactor: 1.4 } },
    "Danzig":       { [TradeGood.Grain]: { basePrice: 8, supply: 120, demandFactor: 0.9 }, [TradeGood.Timber]: { basePrice: 10, supply: 100, demandFactor: 0.8 }, [TradeGood.Fur]: { basePrice: 30, supply: 25, demandFactor: 1.5 }, [TradeGood.Salt]: { basePrice: 18, supply: 15, demandFactor: 1.6 } },
    "Brügge":       { [TradeGood.Cloth]: { basePrice: 18, supply: 90, demandFactor: 0.9 }, [TradeGood.Fur]: { basePrice: 28, supply: 30, demandFactor: 1.3 }, [TradeGood.Fish]: { basePrice: 12, supply: 55, demandFactor: 1.0 }, [TradeGood.Iron]: { basePrice: 22, supply: 35, demandFactor: 1.1 } },
    "Riga":         { [TradeGood.Fur]: { basePrice: 25, supply: 70, demandFactor: 0.9 }, [TradeGood.Timber]: { basePrice: 8, supply: 110, demandFactor: 0.7 }, [TradeGood.Grain]: { basePrice: 12, supply: 40, demandFactor: 1.2 }, [TradeGood.Salt]: { basePrice: 20, supply: 10, demandFactor: 1.8 } },
    "Rostock":      { [TradeGood.Fish]: { basePrice: 7, supply: 70, demandFactor: 1.0 }, [TradeGood.Grain]: { basePrice: 10, supply: 60, demandFactor: 1.0 }, [TradeGood.Beer]: { basePrice: 10, supply: 50, demandFactor: 1.1 }, [TradeGood.Timber]: { basePrice: 14, supply: 25, demandFactor: 1.2 } },
    "Aarhus":       { [TradeGood.Fish]: { basePrice: 6, supply: 90, demandFactor: 0.8 }, [TradeGood.Grain]: { basePrice: 11, supply: 50, demandFactor: 1.1 }, [TradeGood.Salt]: { basePrice: 16, supply: 30, demandFactor: 1.2 } },
    "Kopenhaven":   { [TradeGood.Fish]: { basePrice: 7, supply: 80, demandFactor: 0.9 }, [TradeGood.Cloth]: { basePrice: 22, supply: 35, demandFactor: 1.2 }, [TradeGood.Beer]: { basePrice: 8, supply: 60, demandFactor: 1.0 }, [TradeGood.Iron]: { basePrice: 24, supply: 15, demandFactor: 1.5 } },
    "Göteborg":     { [TradeGood.Fish]: { basePrice: 6, supply: 85, demandFactor: 0.8 }, [TradeGood.Iron]: { basePrice: 20, supply: 45, demandFactor: 1.0 }, [TradeGood.Timber]: { basePrice: 9, supply: 80, demandFactor: 0.9 } },
    "Oslo":         { [TradeGood.Timber]: { basePrice: 7, supply: 120, demandFactor: 0.7 }, [TradeGood.Fish]: { basePrice: 8, supply: 60, demandFactor: 1.0 }, [TradeGood.Iron]: { basePrice: 18, supply: 40, demandFactor: 1.1 }, [TradeGood.Fur]: { basePrice: 26, supply: 35, demandFactor: 1.2 } },
    "Visby":        { [TradeGood.Grain]: { basePrice: 9, supply: 70, demandFactor: 1.0 }, [TradeGood.Fish]: { basePrice: 7, supply: 55, demandFactor: 1.1 }, [TradeGood.Cloth]: { basePrice: 19, supply: 40, demandFactor: 1.1 } },
    "Stockholm":    { [TradeGood.Iron]: { basePrice: 15, supply: 80, demandFactor: 0.8 }, [TradeGood.Fur]: { basePrice: 22, supply: 50, demandFactor: 1.0 }, [TradeGood.Timber]: { basePrice: 8, supply: 90, demandFactor: 0.8 }, [TradeGood.Grain]: { basePrice: 13, supply: 30, demandFactor: 1.3 } },
    "Stavanger":    { [TradeGood.Fish]: { basePrice: 5, supply: 100, demandFactor: 0.7 }, [TradeGood.Timber]: { basePrice: 10, supply: 60, demandFactor: 1.0 }, [TradeGood.Salt]: { basePrice: 17, supply: 20, demandFactor: 1.4 } },
    "Bergen":       { [TradeGood.Fish]: { basePrice: 4, supply: 130, demandFactor: 0.6 }, [TradeGood.Timber]: { basePrice: 9, supply: 70, demandFactor: 0.9 }, [TradeGood.Cloth]: { basePrice: 24, supply: 15, demandFactor: 1.6 }, [TradeGood.Salt]: { basePrice: 19, supply: 10, demandFactor: 1.8 } },
    "Edinburgh":    { [TradeGood.Cloth]: { basePrice: 16, supply: 70, demandFactor: 0.9 }, [TradeGood.Fish]: { basePrice: 9, supply: 50, demandFactor: 1.1 }, [TradeGood.Beer]: { basePrice: 11, supply: 40, demandFactor: 1.2 }, [TradeGood.Fur]: { basePrice: 32, supply: 10, demandFactor: 1.7 } },
    "London":       { [TradeGood.Cloth]: { basePrice: 15, supply: 100, demandFactor: 0.8 }, [TradeGood.Iron]: { basePrice: 20, supply: 50, demandFactor: 1.0 }, [TradeGood.Beer]: { basePrice: 10, supply: 70, demandFactor: 0.9 }, [TradeGood.Grain]: { basePrice: 12, supply: 60, demandFactor: 1.0 } },
    "Bremerhaven":  { [TradeGood.Fish]: { basePrice: 7, supply: 65, demandFactor: 1.0 }, [TradeGood.Grain]: { basePrice: 10, supply: 55, demandFactor: 1.1 }, [TradeGood.Beer]: { basePrice: 9, supply: 75, demandFactor: 0.9 }, [TradeGood.Salt]: { basePrice: 14, supply: 40, demandFactor: 1.1 } },
    "Groningen":    { [TradeGood.Grain]: { basePrice: 9, supply: 80, demandFactor: 0.9 }, [TradeGood.Cloth]: { basePrice: 21, supply: 30, demandFactor: 1.3 }, [TradeGood.Beer]: { basePrice: 8, supply: 60, demandFactor: 1.0 } },
};

/** Initialise the game world from map_data.json. Must be awaited before engine.start(). */
export async function initWorld(): Promise<void> {
    const mapData = await loadMapData();
    const graph   = new NavigationGraph(mapData);

    // Wire graph into the render system for click-to-travel.
    renderSystem.graph = graph;
    renderSystem.harbourNames = Object.keys(mapData.harbour);

    // Create harbour entities.
    for (const [name, pos] of Object.entries(mapData.harbour)) {
        const marketData = CITY_MARKETS[name] ?? {};
        const city = new Entity()
            .addComponent(new Position(pos.x, pos.y))
            .addComponent(new Name(name))
            .addComponent(new City())
            .addComponent(new Gold(10_000))
            .addComponent(new Market(marketData));
        world.addEntity(city);
    }

    // Player ship starts at Lübeck.
    const startPos = mapData.harbour["Lübeck"]!;
    const playerShip = new Entity()
        .addComponent(new Position(startPos.x, startPos.y))
        .addComponent(new Name("Adler von Lübeck"))
        .addComponent(new Ship(150, 0.04))
        .addComponent(new Gold(500))
        .addComponent(new Inventory())
        .addComponent(new PlayerControlled());

    world.addEntity(playerShip);
}

export default engine;