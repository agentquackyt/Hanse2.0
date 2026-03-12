import { priceAlgorithm } from "../src/ts/gameplay/algorithms/EconomyAlgorithms";
import { Market, type TradeGood } from "../src/ts/gameplay/components/economy";

function assertEqual(actual: number, expected: number, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function assertLessThan(actual: number, limit: number, message: string): void {
    if (!(actual < limit)) {
        throw new Error(`${message}: expected < ${limit}, got ${actual}`);
    }
}

let goods: TradeGood[] = [];
const text = await Bun.file("../assets/data/goods.json").text();
const data = JSON.parse(text);
goods = (data.goods as any[]).map(g => ({
    name: g.name,
    img: g.img,
    productionPrice: g.PP ?? g.productionPrice ?? -1,
    buyPrice: g.BP ?? g.buyPrice,
    sellPrice: g.SP ?? g.sellPrice,
    base_demand: g.base_demand
})) as TradeGood[];

let testGood: TradeGood = {
    name: "Spices",
    img: "gewuerze.png",
    productionPrice: -1,
    buyPrice: 600,
    sellPrice: 1000,
    base_demand: 0.1
};

let testCitizens = 1000;

// test specific good 
const GOOD_NAME = "Salt";
const foundGood = goods.find(g => g.name === GOOD_NAME);
if (foundGood) {
    testGood = foundGood;
    console.log(`Found good "${GOOD_NAME}" in goods.json, using it for tests.`);
} else {
    console.warn(`Good "${GOOD_NAME}" not found in goods.json, using default test good.`);
}

let testMarket = new Market([
    [testGood, { basePrice: testGood.buyPrice, supply: 0, demand: 0 }]
]);
console.log("Testing price algorithm with varying supply levels:", testGood);
console.log("Ideal demand at 1000 citizens:", (testCitizens / 100) * testGood.base_demand * 0.5);
for (let i = 1; i < 12; i++) {
    let x = Math.round(2 ** i);
    testMarket.update(testGood, { supply: x, demand: Math.ceil((testCitizens / 100) * testGood.base_demand * 0.5) });
    console.log(`Supply: ${x}, Price: ${priceAlgorithm(testGood, testMarket)}`);
}

const luebeckSaltMarket = new Market([
    [testGood, { basePrice: testGood.buyPrice, supply: 632, demand: Number.NaN }],
]);
const luebeckSaltPrice = priceAlgorithm(testGood, luebeckSaltMarket);

assertEqual(luebeckSaltPrice, Math.ceil(testGood.buyPrice * 0.1), "Salt with invalid demand should fall back to oversaturated pricing");
assertLessThan(luebeckSaltPrice, testGood.buyPrice, "Oversupplied salt should not stay at base price");

console.log(`Regression check passed for ${GOOD_NAME} at stock 632: ${luebeckSaltPrice}`);


