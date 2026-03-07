import { Engine } from "./ecs/Engine";
import { Entity } from "./ecs/Entity";
import {
    Position, Name, City, Ship, Gold, Inventory,
    Market, PlayerControlled, TradeGood,
    type MarketEntry,
} from "./gameplay/components";
import { MovementSystem, MarketSystem, TradeSystem } from "./gameplay/systems";
import { MapRenderSystem } from "./render/RenderSystem";
import { TravelRoute } from "./gameplay/components";


// ---- Canvas ----
const canvas = document.getElementById("world-map") as HTMLCanvasElement;

const engine = Engine.getInstance();
const world  = engine.world;

world
    .addTickSystem(new MovementSystem())
    .addTickSystem(new MarketSystem())
    .addTickSystem(new MapRenderSystem(canvas));

export const tradeSystem = new TradeSystem();
tradeSystem.world = world;

function makeCity(
    cityName: string,
    x: number, y: number,
    marketData: Partial<Record<TradeGood, MarketEntry>>,
): Entity {
    return new Entity()
        .addComponent(new Position(x, y))
        .addComponent(new Name(cityName))
        .addComponent(new City())
        .addComponent(new Gold(10_000))
        .addComponent(new Market(marketData));
}

const lubeck = makeCity("Lübeck", 540, 220, {
    [TradeGood.Grain]:  { basePrice: 10, supply: 80,  demandFactor: 1.0 },
    [TradeGood.Fish]:   { basePrice: 8,  supply: 40,  demandFactor: 1.2 },
    [TradeGood.Cloth]:  { basePrice: 20, supply: 60,  demandFactor: 1.0 },
    [TradeGood.Timber]: { basePrice: 12, supply: 30,  demandFactor: 1.3 },
});

const hamburg = makeCity("Hamburg", 390, 290, {
    [TradeGood.Grain]:  { basePrice: 11, supply: 60,  demandFactor: 1.1 },
    [TradeGood.Beer]:   { basePrice: 9,  supply: 90,  demandFactor: 0.9 },
    [TradeGood.Salt]:   { basePrice: 15, supply: 50,  demandFactor: 1.0 },
    [TradeGood.Iron]:   { basePrice: 25, supply: 20,  demandFactor: 1.4 },
});

const danzig = makeCity("Danzig", 720, 160, {
    [TradeGood.Grain]:  { basePrice: 8,  supply: 120, demandFactor: 0.9 },
    [TradeGood.Timber]: { basePrice: 10, supply: 100, demandFactor: 0.8 },
    [TradeGood.Fur]:    { basePrice: 30, supply: 25,  demandFactor: 1.5 },
    [TradeGood.Salt]:   { basePrice: 18, supply: 15,  demandFactor: 1.6 },
});

const bruges = makeCity("Brügge", 240, 370, {
    [TradeGood.Cloth]:  { basePrice: 18, supply: 90,  demandFactor: 0.9 },
    [TradeGood.Fur]:    { basePrice: 28, supply: 30,  demandFactor: 1.3 },
    [TradeGood.Fish]:   { basePrice: 12, supply: 55,  demandFactor: 1.0 },
    [TradeGood.Iron]:   { basePrice: 22, supply: 35,  demandFactor: 1.1 },
});

world.addEntity(lubeck).addEntity(hamburg).addEntity(danzig).addEntity(bruges);

const playerShip = new Entity()
    .addComponent(new Position(540, 220))
    .addComponent(new Name("Adler von Lübeck"))
    .addComponent(new Ship(150, 25))
    .addComponent(new Gold(500))
    .addComponent(new Inventory())
    .addComponent(new PlayerControlled());

world.addEntity(playerShip);

// ---- Demo: send the player ship towards Hamburg ----
playerShip.addComponent(
    new TravelRoute({ x: 540, y: 220 }, { x: 390, y: 290 }),
);


export default engine;