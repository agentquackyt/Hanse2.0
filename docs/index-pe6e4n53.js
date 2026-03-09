// src/ts/ecs/Engine.ts
class World {
  id = crypto.randomUUID();
  _entities = new Map;
  _tickSystems = [];
  _entitySystems = [];
  addEntity(entity) {
    this._entities.set(entity.id, entity);
    for (const sys of this._entitySystems)
      sys.onEntityAdded(entity);
    return this;
  }
  removeEntity(entity) {
    if (this._entities.delete(entity.id)) {
      for (const sys of this._entitySystems)
        sys.onEntityRemoved(entity);
    }
    return this;
  }
  getEntityById(id) {
    return this._entities.get(id);
  }
  query(...types) {
    return [...this._entities.values()].filter((e) => e.hasAll(...types));
  }
  addTickSystem(system) {
    system.world = this;
    this._tickSystems.push(system);
    return this;
  }
  addEntitySystem(system) {
    system.world = this;
    this._entitySystems.push(system);
    return this;
  }
  tick(dt) {
    for (const sys of this._tickSystems)
      sys.update(dt);
  }
}

class Engine {
  static _instance = null;
  _world = new World;
  _lastTime = 0;
  _rafHandle = 0;
  _running = false;
  constructor() {}
  static getInstance() {
    if (!Engine._instance)
      Engine._instance = new Engine;
    return Engine._instance;
  }
  get world() {
    return this._world;
  }
  start() {
    if (this._running)
      return;
    this._running = true;
    this._lastTime = performance.now();
    this._rafHandle = requestAnimationFrame(this._loop.bind(this));
  }
  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafHandle);
  }
  _loop(timestamp) {
    const dt = (timestamp - this._lastTime) / 1000;
    this._lastTime = timestamp;
    this._world.tick(dt);
    if (this._running) {
      this._rafHandle = requestAnimationFrame(this._loop.bind(this));
    }
  }
}

// src/ts/ecs/Entity.ts
class Component {
}

class Entity {
  id = crypto.randomUUID();
  _components = new Map;
  addComponent(component) {
    this._components.set(component.constructor.name, component);
    return this;
  }
  removeComponent(type) {
    this._components.delete(type.name);
    return this;
  }
  getComponent(type) {
    return this._components.get(type.name);
  }
  hasComponent(type) {
    return this._components.has(type.name);
  }
  hasAll(...types) {
    return types.every((t) => this._components.has(t.name));
  }
}

// src/ts/gameplay/components/tags.ts
class PlayerControlled extends Component {
}
class ShadowProducer extends Component {
}
// src/ts/gameplay/components/spatial.ts
class Position extends Component {
  x;
  y;
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
  }
}
// src/ts/gameplay/components/identity.ts
class Name extends Component {
  value;
  constructor(value) {
    super();
    this.value = value;
  }
}

class City extends Component {
  population;
  constructor(population = 1000) {
    super();
    this.population = population;
  }
}

class Ship extends Component {
  cargoCapacity;
  speedUnitsPerSecond;
  constructor(cargoCapacity = 100, speedUnitsPerSecond = 10) {
    super();
    this.cargoCapacity = cargoCapacity;
    this.speedUnitsPerSecond = speedUnitsPerSecond;
  }
}

class IsPlayerOwned extends Component {
  isPlayerOwned;
  constructor(isPlayerOwned) {
    super();
    this.isPlayerOwned = isPlayerOwned;
  }
}

class Merchant extends Component {
  companyName;
  constructor(companyName) {
    super();
    this.companyName = companyName;
  }
}
// src/ts/gameplay/algorithms/EconomyAlgorithms.ts
function priceAlgorithm(good, market) {
  const basePrice = good.buyPrice;
  const maxPrice = good.sellPrice;
  const oversaturatedPrice = good.buyPrice / 10;
  if (!market)
    return basePrice;
  let estimatedPrice = basePrice;
  const marketEntry = market.getEntry(good);
  let { supply, demand } = marketEntry || { supply: 0, demand: 0 };
  if (supply > demand * 1.6) {
    const excessSupply = Math.min(supply - demand * 2, demand * 25 - demand * 2);
    const priceDrop = (excessSupply / (demand * 25 - demand * 2)) ** 3;
    estimatedPrice = basePrice - (basePrice - oversaturatedPrice) * priceDrop;
  } else if (supply < demand * 1.2) {
    const shortage = Math.min(demand - supply, demand * 0.5);
    const priceIncrease = (shortage / (demand * 0.5)) ** 3;
    estimatedPrice = basePrice + (maxPrice - basePrice) * priceIncrease;
  }
  return Math.ceil(estimatedPrice);
}
function demandAlgorithm(good, city) {
  const baseDemand = good.base_demand;
  if (baseDemand <= 0)
    return 0;
  const citizens = typeof city === "number" ? city : city?.getComponent(City)?.population || 500;
  const demand = citizens / 100 * baseDemand * 0.5;
  return Math.ceil(demand);
}

// src/ts/gameplay/components/economy.ts
class Gold extends Component {
  amount;
  constructor(amount = 0) {
    super();
    this.amount = amount;
  }
}

class Inventory extends Component {
  _goods = new Map;
  add(good, qty) {
    this._goods.set(good, (this._goods.get(good) ?? 0) + qty);
  }
  remove(good, qty) {
    const current = this._goods.get(good) ?? 0;
    if (current < qty)
      return false;
    this._goods.set(good, current - qty);
    return true;
  }
  get(good) {
    return this._goods.get(good) ?? 0;
  }
  totalUnits() {
    let n = 0;
    for (const qty of this._goods.values())
      n += qty;
    return n;
  }
  entries() {
    return this._goods.entries();
  }
}

class CityProduction extends Component {
  citizens;
  multipliers;
  constructor(citizens, multipliers) {
    super();
    this.citizens = citizens;
    this.multipliers = multipliers;
  }
}

class Market2 extends Component {
  _entries = new Map;
  constructor(entries) {
    super();
    if (entries) {
      for (const [good, entry] of entries) {
        this._entries.set(good, { ...entry });
      }
    }
  }
  getEntry(good) {
    return this._entries.get(good);
  }
  currentPrice(good) {
    const e = this._entries.get(good);
    if (!e)
      return 0;
    return priceAlgorithm(good, this);
  }
  goods() {
    return this._entries.entries();
  }
  update(good, patch) {
    const e = this._entries.get(good);
    if (e)
      Object.assign(e, patch);
  }
}

class Kontor extends Component {
  capacity;
  constructor(capacity = 100) {
    super();
    this.capacity = capacity;
  }
}
// src/ts/gameplay/components/navigation.ts
class TravelRoute extends Component {
  origin;
  destination;
  progress = 0;
  constructor(origin, destination) {
    super();
    this.origin = origin;
    this.destination = destination;
  }
  get totalDistance() {
    const dx = this.destination.x - this.origin.x;
    const dy = this.destination.y - this.origin.y;
    return Math.hypot(dx, dy);
  }
}

class NavigationPath extends Component {
  waypoints;
  currentIndex = 0;
  constructor(waypoints) {
    super();
    this.waypoints = waypoints;
  }
  get currentWaypoint() {
    return this.waypoints[this.currentIndex];
  }
  get nextWaypoint() {
    return this.waypoints[this.currentIndex + 1];
  }
  get finished() {
    return this.currentIndex >= this.waypoints.length - 1;
  }
}
// src/ts/gameplay/GoodsRegistry.ts
class GoodsRegistry {
  static _instance = null;
  static _loadingPromise = null;
  _goods = new Map;
  _recipes = new Map;
  _baseProduction = new Map;
  _tickInterval = 10;
  constructor() {}
  static getInstance() {
    if (!GoodsRegistry._instance) {
      throw new Error("GoodsRegistry not loaded yet — call GoodsRegistry.load() first.");
    }
    return GoodsRegistry._instance;
  }
  static async load() {
    if (GoodsRegistry._instance)
      return GoodsRegistry._instance;
    if (GoodsRegistry._loadingPromise)
      return GoodsRegistry._loadingPromise;
    GoodsRegistry._loadingPromise = (async () => {
      const [goodsRes, configRes] = await Promise.all([
        fetch("/assets/data/goods.json"),
        fetch("/assets/data/config.json")
      ]);
      const goodsJson = await goodsRes.json();
      const configJson = await configRes.json();
      const reg = new GoodsRegistry;
      for (const g of goodsJson.goods) {
        const good = Object.freeze({
          name: g.name,
          img: g.img,
          productionPrice: g.PP ?? 0,
          buyPrice: g.BP,
          sellPrice: g.SP,
          base_demand: g.base_demand
        });
        reg._goods.set(g.name, good);
      }
      for (const r of goodsJson.recipes) {
        const recipe = Object.freeze({
          product: r.product,
          ingredients: Object.freeze({ ...r.ingredients })
        });
        reg._recipes.set(r.product, recipe);
      }
      for (const [name, val] of Object.entries(configJson.base_production)) {
        reg._baseProduction.set(name, val);
      }
      reg._tickInterval = configJson.production_tick_interval;
      GoodsRegistry._instance = reg;
      console.log(`GoodsRegistry: loaded ${reg._goods.size} goods, ${reg._recipes.size} recipes`);
      return reg;
    })();
    return GoodsRegistry._loadingPromise;
  }
  getGood(name) {
    return this._goods.get(name);
  }
  getAllGoods() {
    return [...this._goods.values()];
  }
  getRecipe(productName) {
    return this._recipes.get(productName);
  }
  getBaseProduction(goodName) {
    return this._baseProduction.get(goodName) ?? 1;
  }
  get tickInterval() {
    return this._tickInterval;
  }
}

// src/ts/gameplay/GameTime.ts
var REAL_SECONDS_PER_DAY = 30;
var DAYS_PER_WEEK = 7;
var DEMAND_DAYS_PER_WEEK = 7;
var REAL_SECONDS_PER_WEEK = REAL_SECONDS_PER_DAY * DAYS_PER_WEEK;
var GAME_SECONDS_PER_DAY = 24 * 60 * 60;

class GameTime {
  static _instance = null;
  _elapsedRealSeconds = 0;
  constructor() {}
  static getInstance() {
    if (!GameTime._instance) {
      GameTime._instance = new GameTime;
    }
    return GameTime._instance;
  }
  advance(dt) {
    this._elapsedRealSeconds += Math.max(0, dt);
  }
  setElapsedRealSeconds(seconds) {
    this._elapsedRealSeconds = Math.max(0, seconds);
  }
  get elapsedRealSeconds() {
    return this._elapsedRealSeconds;
  }
  snapshot() {
    const totalDaysElapsed = Math.floor(this._elapsedRealSeconds / REAL_SECONDS_PER_DAY);
    const secondsIntoDay = this._elapsedRealSeconds % REAL_SECONDS_PER_DAY;
    const gameSecondsIntoDay = Math.floor(secondsIntoDay / REAL_SECONDS_PER_DAY * GAME_SECONDS_PER_DAY);
    return {
      week: Math.floor(totalDaysElapsed / DAYS_PER_WEEK) + 1,
      day: totalDaysElapsed % DAYS_PER_WEEK + 1,
      hour: Math.floor(gameSecondsIntoDay / 3600),
      minute: Math.floor(gameSecondsIntoDay % 3600 / 60)
    };
  }
  formatHudLabel() {
    const current = this.snapshot();
    return `Week ${current.week} · Day ${current.day}`;
  }
}

// src/ts/gameplay/algorithms/SatisfactionAlgorithm.ts
var NOT_SATISFIED_THRESHOLD = 0.5;
var VERY_SATISFIED_THRESHOLD = 0.8;
var VERY_VERY_SATISFIED_THRESHOLD = 0.95;
var BASE_GROWTH_PER_WEEK = 100;
var NO_GROWTH = 0;
var NORMAL_GROWTH = 1;
var INCREASED_GROWTH = 5;
var FURTHER_INCREASED_GROWTH = 10;
var WEALTHY_RANK = 10;
var VERY_WEALTHY_RANK = 3;
class SatisfactionAlgorithm {
  static _cache = new Map;
  static getCached(entityId) {
    return SatisfactionAlgorithm._cache.get(entityId);
  }
  static calculateSatisfaction(market) {
    let weightedFulfillment = 0;
    let totalDemand = 0;
    for (const [, entry] of market.goods()) {
      const demand = entry.demand ?? 0;
      const supply = entry.supply ?? 0;
      if (!(demand > 0))
        continue;
      const ratio = Math.min(supply / demand, 1);
      weightedFulfillment += ratio * demand;
      totalDemand += demand;
    }
    if (totalDemand === 0)
      return 1;
    return weightedFulfillment / totalDemand;
  }
  static getSatisfactionLevel(satisfaction) {
    if (satisfaction >= VERY_VERY_SATISFIED_THRESHOLD)
      return "very_very_satisfied" /* VeryVerySatisfied */;
    if (satisfaction >= VERY_SATISFIED_THRESHOLD)
      return "very_satisfied" /* VerySatisfied */;
    if (satisfaction >= NOT_SATISFIED_THRESHOLD)
      return "satisfied" /* Satisfied */;
    return "not_satisfied" /* NotSatisfied */;
  }
  static rankCitiesByWealth(cities) {
    const ranked = cities.map((c) => ({ id: c.id, gold: c.getComponent(Gold)?.amount ?? 0 })).sort((a, b) => b.gold - a.gold);
    const ranks = new Map;
    for (let i = 0;i < ranked.length; i++) {
      ranks.set(ranked[i].id, i + 1);
    }
    return ranks;
  }
  static calculateGrowthMultiplier(level, wealthRank) {
    if (level === "not_satisfied" /* NotSatisfied */)
      return NO_GROWTH;
    if (level === "very_very_satisfied" /* VeryVerySatisfied */ && wealthRank <= VERY_WEALTHY_RANK) {
      return FURTHER_INCREASED_GROWTH;
    }
    if ((level === "very_satisfied" /* VerySatisfied */ || level === "very_very_satisfied" /* VeryVerySatisfied */) && wealthRank <= WEALTHY_RANK) {
      return INCREASED_GROWTH;
    }
    return NORMAL_GROWTH;
  }
  static evaluate(world) {
    const cities = world.query(City, Market2);
    const wealthRanks = SatisfactionAlgorithm.rankCitiesByWealth(cities);
    const results = new Map;
    for (const city of cities) {
      const market = city.getComponent(Market2);
      const satisfaction = SatisfactionAlgorithm.calculateSatisfaction(market);
      const level = SatisfactionAlgorithm.getSatisfactionLevel(satisfaction);
      const wealthRank = wealthRanks.get(city.id) ?? cities.length;
      const growthMultiplier = SatisfactionAlgorithm.calculateGrowthMultiplier(level, wealthRank);
      const growthPerWeek = growthMultiplier * BASE_GROWTH_PER_WEEK;
      const entry = { satisfaction, level, growthMultiplier, growthPerWeek, wealthRank };
      results.set(city, entry);
      SatisfactionAlgorithm._cache.set(city.id, entry);
    }
    return results;
  }
}

// src/ts/render/HUDcontroller.ts
function sliderQty(v, maxQty) {
  if (v === 0 || maxQty <= 0)
    return 0;
  const abs = Math.abs(v);
  return Math.min(maxQty, Math.max(1, Math.round(Math.expm1(Math.log1p(maxQty) * abs / 100))));
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

class HUDcontroller {
  _hudElement;
  _cityNameElement;
  _citizensElement;
  _playtimeElement;
  _wealthElement;
  _isShowingModal = false;
  _isOnSea = false;
  _tradeSystem = null;
  _playerShip = null;
  _playerCompany = null;
  _activeModalRefresh = null;
  static _instance;
  constructor() {
    this._hudElement = document.getElementById("hud");
    this._cityNameElement = document.querySelector(".hub-info-city");
    this._citizensElement = document.querySelector(".hub-info-city-citizens");
    this._playtimeElement = document.querySelector(".hub-info-playtime");
    this._wealthElement = document.querySelector(".hub-info-wealth-value");
  }
  static getInstance() {
    if (!HUDcontroller._instance) {
      HUDcontroller._instance = new HUDcontroller;
    }
    return HUDcontroller._instance;
  }
  setTradeSystem(ts) {
    this._tradeSystem = ts;
  }
  setPlayerShip(ship) {
    this._playerShip = ship;
  }
  setPlayerCompany(company) {
    this._playerCompany = company;
    this._refreshHudWealth();
  }
  updateGameTime(label) {
    if (this._playtimeElement) {
      this._playtimeElement.textContent = label;
    }
  }
  _getPlayerCompanyGold() {
    return this._playerCompany?.getComponent(Gold) ?? null;
  }
  _resolveEndpointGold(endpoint) {
    if (endpoint?.hasComponent(PlayerControlled) || endpoint?.hasComponent(IsPlayerOwned)) {
      return this._getPlayerCompanyGold() ?? endpoint.getComponent(Gold) ?? null;
    }
    return endpoint?.getComponent(Gold) ?? null;
  }
  _refreshHudWealth() {
    const gold = this._getPlayerCompanyGold() ?? this._playerShip?.getComponent(Gold) ?? null;
    if (gold && this._wealthElement) {
      this._wealthElement.textContent = `${gold.amount}£`;
    }
  }
  notifyDataChange() {
    this._refreshHudWealth();
    this._activeModalRefresh?.();
  }
  updateCityInfo(cityName, citizens) {
    if (this._isOnSea)
      return;
    this._cityNameElement?.classList.remove("on-sea");
    this._citizensElement?.classList.remove("on-sea");
    if (this._cityNameElement)
      this._cityNameElement.textContent = cityName;
    if (this._citizensElement)
      this._citizensElement.textContent = `${citizens} citizens`;
    this._refreshHudWealth();
  }
  updateOnSeaInfo(ship) {
    this._isOnSea = true;
    const shipComp = ship.getComponent(Ship);
    const invComp = ship.getComponent(Inventory);
    if (this._cityNameElement) {
      this._cityNameElement.textContent = "On sea";
      this._cityNameElement.classList.add("on-sea");
    }
    if (this._citizensElement) {
      if (invComp && shipComp) {
        this._citizensElement.textContent = `${invComp.totalUnits()}/${shipComp.cargoCapacity} cargo`;
      } else {
        this._citizensElement.textContent = "0 cargo";
      }
      this._citizensElement.classList.add("on-sea");
    }
  }
  setOnSeaState(isOnSea) {
    this._isOnSea = isOnSea;
  }
  createCityOverviewModal(city, playerShip, kontorEntity) {
    document.querySelector(".modal:not(.hidden)")?.remove();
    this._activeModalRefresh = null;
    const cityComp = city.getComponent(City);
    const nameComp = city.getComponent(Name);
    const market = city.getComponent(Market2);
    const cityGold = city.getComponent(Gold);
    const production = city.getComponent(CityProduction);
    if (!cityComp || !nameComp)
      return;
    const registry = GoodsRegistry.getInstance();
    const allGoods = registry.getAllGoods();
    const endpointOptions = [
      { id: "harbor", label: "Harbor", entity: city },
      ...playerShip ? [{ id: "ship", label: "Ship", entity: playerShip }] : [],
      ...kontorEntity ? [{ id: "kontor", label: "Kontor", entity: kontorEntity }] : []
    ];
    let leftEndpointId = "harbor";
    let rightEndpointId = playerShip ? "ship" : "kontor";
    const cleanupCallbacks = [];
    const getEndpoint = (id) => endpointOptions.find((option) => option.id === id) ?? endpointOptions[0];
    const getEndpointInventory = (id) => getEndpoint(id).entity?.getComponent(Inventory) ?? null;
    const getEndpointGold = (id) => this._resolveEndpointGold(getEndpoint(id).entity);
    const getEndpointCapacity = (id) => {
      if (id === "ship") {
        const shipComp = playerShip?.getComponent(Ship);
        return shipComp ? shipComp.cargoCapacity : Infinity;
      }
      if (id === "kontor") {
        const kontorComp = kontorEntity?.getComponent(Kontor);
        return kontorComp ? kontorComp.capacity : Infinity;
      }
      return Infinity;
    };
    const getEndpointFreeCapacity = (id) => {
      if (id === "harbor")
        return Infinity;
      const inventory = getEndpointInventory(id);
      return Math.max(0, getEndpointCapacity(id) - (inventory?.totalUnits() ?? 0));
    };
    const getHeldQuantity = (id, good) => {
      if (id === "harbor") {
        return Math.max(0, Math.floor(market?.getEntry(good)?.supply ?? 0));
      }
      return getEndpointInventory(id)?.get(good) ?? 0;
    };
    const quoteHarborTransfer = (good, quantity, _mode) => {
      if (!market || quantity <= 0)
        return 0;
      return market.currentPrice(good) * quantity;
    };
    const getMaxAffordableQty = (good, buyerId, availableQty) => {
      if (buyerId === "harbor")
        return availableQty;
      const buyerGold = getEndpointGold(buyerId)?.amount ?? 0;
      if (buyerGold <= 0)
        return 0;
      let low = 0;
      let high = availableQty;
      while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        const quote = quoteHarborTransfer(good, mid, "buy");
        if (quote <= buyerGold) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      return low;
    };
    const getSummaryText = (id) => {
      const option = getEndpoint(id);
      if (id === "harbor") {
        let totalStock = 0;
        if (market) {
          for (const [, entry] of market.goods())
            totalStock += Math.floor(entry.supply);
        }
        return `${option.label}: ${cityGold?.amount ?? 0}£ · ${totalStock} stock`;
      }
      const inventory = getEndpointInventory(id);
      const gold = getEndpointGold(id)?.amount ?? 0;
      const capacity = getEndpointCapacity(id);
      const units = inventory?.totalUnits() ?? 0;
      return `${option.label}: ${gold}£ · ${units}/${capacity === Infinity ? "∞" : capacity} cargo`;
    };
    const getDirectionalMode = (sourceId, targetId) => {
      if (sourceId === targetId)
        return "none";
      if (sourceId === "harbor" && targetId !== "harbor")
        return "trade-buy";
      if (sourceId !== "harbor" && targetId === "harbor")
        return "trade-sell";
      if (sourceId !== "harbor" && targetId !== "harbor")
        return "transfer";
      return "none";
    };
    const getMaxDirectionalQty = (good, sourceId, targetId) => {
      if (sourceId === targetId)
        return 0;
      const sourceQty = getHeldQuantity(sourceId, good);
      if (sourceQty <= 0)
        return 0;
      const targetCapacity = getEndpointFreeCapacity(targetId);
      let maxQty = Math.min(sourceQty, targetCapacity);
      if (sourceId === "harbor" && targetId !== "harbor") {
        maxQty = Math.min(maxQty, getMaxAffordableQty(good, targetId, sourceQty));
      }
      return Math.max(0, maxQty);
    };
    const getDirectionalQuote = (good, quantity, sourceId, targetId) => {
      const mode = getDirectionalMode(sourceId, targetId);
      if (mode === "trade-buy")
        return quoteHarborTransfer(good, quantity, "buy");
      if (mode === "trade-sell")
        return quoteHarborTransfer(good, quantity, "sell");
      return 0;
    };
    const executeDirectionalTransfer = (good, quantity, sourceId, targetId) => {
      if (quantity <= 0 || sourceId === targetId)
        return false;
      const mode = getDirectionalMode(sourceId, targetId);
      const entry = market?.getEntry(good);
      const sourceInv = getEndpointInventory(sourceId);
      const targetInv = getEndpointInventory(targetId);
      const sourceGold = getEndpointGold(sourceId);
      const targetGold = getEndpointGold(targetId);
      if (mode === "trade-buy") {
        if (!entry || !targetInv || !targetGold)
          return false;
        if (entry.supply < quantity)
          return false;
        if (targetInv.totalUnits() + quantity > getEndpointCapacity(targetId))
          return false;
        const totalCost = getDirectionalQuote(good, quantity, sourceId, targetId);
        if (targetGold.amount < totalCost)
          return false;
        targetInv.add(good, quantity);
        targetGold.amount -= totalCost;
        if (cityGold)
          cityGold.amount += totalCost;
        market.update(good, { supply: Math.max(0, entry.supply - quantity) });
        return true;
      }
      if (mode === "trade-sell") {
        if (!entry || !sourceInv || !sourceGold)
          return false;
        if (!sourceInv.remove(good, quantity))
          return false;
        const totalRevenue = getDirectionalQuote(good, quantity, sourceId, targetId);
        sourceGold.amount += totalRevenue;
        if (cityGold)
          cityGold.amount = Math.max(0, cityGold.amount - totalRevenue);
        market.update(good, { supply: entry.supply + quantity });
        return true;
      }
      if (mode === "transfer") {
        if (!sourceInv || !targetInv)
          return false;
        if (targetInv.totalUnits() + quantity > getEndpointCapacity(targetId))
          return false;
        if (!sourceInv.remove(good, quantity))
          return false;
        targetInv.add(good, quantity);
        return true;
      }
      return false;
    };
    const modal = document.createElement("div");
    modal.classList.add("modal");
    const win = document.createElement("div");
    win.classList.add("modal-window");
    const stickyHeader = document.createElement("div");
    stickyHeader.classList.add("modal-sticky-header");
    const title = document.createElement("h2");
    title.classList.add("modal-title");
    title.textContent = nameComp.value;
    stickyHeader.appendChild(title);
    const modalSummary = document.createElement("div");
    modalSummary.classList.add("modal-summary");
    const modalSummaryCard = document.createElement("div");
    modalSummaryCard.classList.add("modal-summary-card");
    modalSummary.appendChild(modalSummaryCard);
    stickyHeader.appendChild(modalSummary);
    const closeX = document.createElement("button");
    closeX.classList.add("modal-close-x");
    closeX.textContent = "×";
    stickyHeader.appendChild(closeX);
    const tabBar = document.createElement("div");
    tabBar.classList.add("modal-tabs");
    const tabs = ["City", "Production", "Trade"];
    const panels = [];
    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.classList.add("modal-tab");
      btn.dataset.tab = t.toLowerCase();
      btn.textContent = t;
      if (t === "City")
        btn.classList.add("active");
      tabBar.appendChild(btn);
    }
    stickyHeader.appendChild(tabBar);
    win.appendChild(stickyHeader);
    const modalBody = document.createElement("div");
    modalBody.classList.add("modal-body");
    const cityPanel = document.createElement("div");
    cityPanel.classList.add("modal-panel");
    cityPanel.id = "panel-city";
    const cityPopulationCard = document.createElement("div");
    cityPopulationCard.classList.add("city-population-card");
    const cityPopulationLabel = document.createElement("span");
    cityPopulationLabel.classList.add("city-population-label");
    cityPopulationLabel.textContent = "Population";
    const cityPopulationValue = document.createElement("strong");
    cityPopulationValue.classList.add("city-population-value");
    cityPopulationCard.appendChild(cityPopulationLabel);
    cityPopulationCard.appendChild(cityPopulationValue);
    cityPanel.appendChild(cityPopulationCard);
    const citySatisfactionCard = document.createElement("div");
    citySatisfactionCard.classList.add("city-population-card");
    const citySatisfactionLabel = document.createElement("span");
    citySatisfactionLabel.classList.add("city-population-label");
    citySatisfactionLabel.textContent = "Satisfaction";
    const citySatisfactionValue = document.createElement("strong");
    citySatisfactionValue.classList.add("city-population-value");
    const citySatisfactionGrowth = document.createElement("span");
    citySatisfactionGrowth.classList.add("city-population-label");
    citySatisfactionCard.appendChild(citySatisfactionLabel);
    citySatisfactionCard.appendChild(citySatisfactionValue);
    citySatisfactionCard.appendChild(citySatisfactionGrowth);
    cityPanel.appendChild(citySatisfactionCard);
    const cityMarketSection = document.createElement("section");
    cityMarketSection.classList.add("city-market-section");
    const cityMarketTitle = document.createElement("h3");
    cityMarketTitle.classList.add("city-market-title");
    cityMarketTitle.textContent = "City Market";
    const cityMarketTable = document.createElement("table");
    cityMarketTable.classList.add("city-market-table");
    cityMarketTable.innerHTML = `
            <thead>
                <tr>
                    <th>Good</th>
                    <th>Stock</th>
                    <th>Demand</th>
                    <th>Price</th>
                </tr>
            </thead>
        `;
    const cityMarketBody = document.createElement("tbody");
    cityMarketTable.appendChild(cityMarketBody);
    cityMarketSection.appendChild(cityMarketTitle);
    cityMarketSection.appendChild(cityMarketTable);
    cityPanel.appendChild(cityMarketSection);
    const cityMarketStates = new Map;
    const demandGoods = allGoods.filter((good) => good.base_demand > 0).sort((a, b) => b.base_demand - a.base_demand || a.name.localeCompare(b.name));
    for (const good of demandGoods) {
      const row = document.createElement("tr");
      row.classList.add("city-market-row");
      const icon = document.createElement("img");
      icon.classList.add("city-market-icon");
      icon.src = `/assets/images/icons/${good.img}`;
      icon.alt = good.name;
      const goodCell = document.createElement("td");
      goodCell.classList.add("city-market-good-cell");
      const body = document.createElement("div");
      body.classList.add("city-market-good-body");
      const name = document.createElement("span");
      name.classList.add("city-market-good-name");
      name.textContent = good.name;
      goodCell.appendChild(icon);
      body.appendChild(name);
      goodCell.appendChild(body);
      const stockCell = document.createElement("td");
      const stockValue = document.createElement("span");
      stockValue.classList.add("city-market-value");
      stockCell.appendChild(stockValue);
      const demandCell = document.createElement("td");
      const demandValue = document.createElement("span");
      demandValue.classList.add("city-market-value", "city-market-value-demand");
      demandCell.appendChild(demandValue);
      const priceCell = document.createElement("td");
      const priceValue = document.createElement("span");
      priceValue.classList.add("city-market-value", "city-market-value-price");
      priceCell.appendChild(priceValue);
      row.appendChild(goodCell);
      row.appendChild(stockCell);
      row.appendChild(demandCell);
      row.appendChild(priceCell);
      cityMarketBody.appendChild(row);
      cityMarketStates.set(good, { stockValue, demandValue, priceValue });
    }
    const supplyGoods = production ? [...production.multipliers.entries()].filter(([, multiplier]) => multiplier > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
    const satisfactionLevelLabels = {
      ["not_satisfied" /* NotSatisfied */]: "Not Satisfied",
      ["satisfied" /* Satisfied */]: "Satisfied",
      ["very_satisfied" /* VerySatisfied */]: "Very Satisfied",
      ["very_very_satisfied" /* VeryVerySatisfied */]: "Very Satisfied!"
    };
    const refreshCityPanel = () => {
      cityPopulationValue.textContent = `${cityComp.population.toLocaleString()} citizens`;
      if (market) {
        const cached = SatisfactionAlgorithm.getCached(city.id);
        const satisfaction = cached?.satisfaction ?? SatisfactionAlgorithm.calculateSatisfaction(market);
        const level = cached?.level ?? SatisfactionAlgorithm.getSatisfactionLevel(satisfaction);
        citySatisfactionValue.textContent = `${satisfactionLevelLabels[level]} (${Math.round(satisfaction * 100)}%)`;
        const growthPerWeek = cached?.growthPerWeek ?? 0;
        citySatisfactionGrowth.textContent = growthPerWeek > 0 ? `+${growthPerWeek} citizens/week` : "No growth";
      }
      for (const [good, state] of cityMarketStates) {
        const stock = Math.round(market?.getEntry(good)?.supply ?? 0);
        const demandedAmount = good.base_demand * cityComp.population / 1000;
        const currentPrice = market?.currentPrice(good) ?? 0;
        state.stockValue.textContent = `${stock}`;
        state.demandValue.textContent = demandedAmount >= 10 ? `${Math.round(demandedAmount)}` : demandedAmount.toFixed(1);
        state.priceValue.textContent = `${currentPrice} marks`;
      }
    };
    refreshCityPanel();
    panels.push(cityPanel);
    modalBody.appendChild(cityPanel);
    const prodPanel = document.createElement("div");
    prodPanel.classList.add("modal-panel", "hidden");
    prodPanel.id = "panel-production";
    const productionGrid = document.createElement("div");
    productionGrid.classList.add("production-grid");
    prodPanel.appendChild(productionGrid);
    const productionStates = new Map;
    for (const [goodName] of supplyGoods) {
      const good = registry.getGood(goodName);
      if (!good)
        continue;
      const card = document.createElement("article");
      card.classList.add("production-card");
      const icon = document.createElement("img");
      icon.classList.add("production-card-icon");
      icon.src = `/assets/images/icons/${good.img}`;
      icon.alt = good.name;
      const content = document.createElement("div");
      content.classList.add("production-card-content");
      const name = document.createElement("h3");
      name.classList.add("production-card-name");
      name.textContent = good.name;
      const meta = document.createElement("div");
      meta.classList.add("production-card-meta");
      const rateValue = document.createElement("span");
      rateValue.classList.add("production-card-chip");
      const stockValue = document.createElement("span");
      stockValue.classList.add("production-card-chip");
      meta.appendChild(rateValue);
      meta.appendChild(stockValue);
      content.appendChild(name);
      content.appendChild(meta);
      card.appendChild(icon);
      card.appendChild(content);
      productionGrid.appendChild(card);
      productionStates.set(goodName, { rateValue, stockValue });
    }
    const productionEmptyState = document.createElement("p");
    productionEmptyState.classList.add("production-empty-state");
    productionEmptyState.textContent = "No production data.";
    prodPanel.appendChild(productionEmptyState);
    const refreshProductionPanel = () => {
      const hasProductionData = !!production && !!market && productionStates.size > 0;
      productionGrid.classList.toggle("hidden", !hasProductionData);
      productionEmptyState.classList.toggle("hidden", hasProductionData);
      if (!hasProductionData || !production || !market) {
        return;
      }
      for (const [goodName, state] of productionStates) {
        const good = registry.getGood(goodName);
        if (!good)
          continue;
        const multiplier = production.multipliers.get(goodName) ?? 0;
        const baseProd = registry.getBaseProduction(goodName);
        const dailyRate = baseProd * (production.citizens / 10) * multiplier;
        const weeklyRate = dailyRate * DAYS_PER_WEEK;
        const weeklyDemand = demandAlgorithm(good, production.citizens);
        const supply = Math.round(market.getEntry(good)?.supply ?? 0);
        state.rateValue.textContent = `${weeklyRate.toFixed(1)}/week`;
        state.stockValue.textContent = `${supply} stock  (demand ${weeklyDemand}/week)`;
      }
    };
    refreshProductionPanel();
    panels.push(prodPanel);
    modalBody.appendChild(prodPanel);
    const tradePanel = document.createElement("div");
    tradePanel.classList.add("modal-panel", "hidden");
    tradePanel.id = "panel-trade";
    const tradeSelectorRow = document.createElement("div");
    tradeSelectorRow.classList.add("trade-selector-row");
    tradePanel.appendChild(tradeSelectorRow);
    const leftSelectMount = document.createElement("div");
    leftSelectMount.classList.add("trade-endpoint-control");
    const tradeDirection = document.createElement("div");
    tradeDirection.classList.add("trade-route-summary");
    const tradeDirectionLeft = document.createElement("span");
    const tradeDirectionDivider = document.createElement("span");
    tradeDirectionDivider.classList.add("trade-route-divider");
    tradeDirectionDivider.textContent = "•";
    const tradeDirectionRight = document.createElement("span");
    tradeDirection.appendChild(tradeDirectionLeft);
    tradeDirection.appendChild(tradeDirectionDivider);
    tradeDirection.appendChild(tradeDirectionRight);
    const rightSelectMount = document.createElement("div");
    rightSelectMount.classList.add("trade-endpoint-control");
    tradeSelectorRow.appendChild(leftSelectMount);
    tradeSelectorRow.appendChild(tradeDirection);
    tradeSelectorRow.appendChild(rightSelectMount);
    const createCustomSelect = (mount, side) => {
      const root = document.createElement("div");
      root.classList.add("custom-select");
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("custom-select-trigger");
      const label = document.createElement("span");
      label.classList.add("custom-select-label");
      const caret = document.createElement("span");
      caret.classList.add("custom-select-caret");
      caret.textContent = "▾";
      button.appendChild(label);
      button.appendChild(caret);
      const menu = document.createElement("div");
      menu.classList.add("custom-select-menu", "hidden");
      const setOpen = (open) => {
        root.classList.toggle("is-open", open);
        menu.classList.toggle("hidden", !open);
      };
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const shouldOpen = menu.classList.contains("hidden");
        document.querySelectorAll(".custom-select.is-open").forEach((node) => {
          node.classList.remove("is-open");
          node.querySelector(".custom-select-menu")?.classList.add("hidden");
        });
        setOpen(shouldOpen);
      });
      for (const option of endpointOptions) {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.classList.add("custom-select-option");
        opt.dataset.value = option.id;
        opt.textContent = option.label;
        opt.addEventListener("click", (event) => {
          event.stopPropagation();
          if (side === "left") {
            leftEndpointId = option.id;
          } else {
            rightEndpointId = option.id;
          }
          setOpen(false);
          refreshTradeSelectors();
          refreshTradeTable();
        });
        menu.appendChild(opt);
      }
      root.appendChild(button);
      root.appendChild(menu);
      mount.appendChild(root);
      return {
        button,
        label,
        menu,
        setOpen
      };
    };
    const leftSelect = createCustomSelect(leftSelectMount, "left");
    const rightSelect = createCustomSelect(rightSelectMount, "right");
    const closeAllSelects = () => {
      document.querySelectorAll(".custom-select.is-open").forEach((node) => {
        node.classList.remove("is-open");
        node.querySelector(".custom-select-menu")?.classList.add("hidden");
      });
    };
    const onDocumentClick = () => closeAllSelects();
    document.addEventListener("click", onDocumentClick);
    cleanupCallbacks.push(() => document.removeEventListener("click", onDocumentClick));
    const getShipSummaryText = () => {
      if (playerShip)
        return getSummaryText("ship");
      if (kontorEntity)
        return getSummaryText("kontor");
      return getSummaryText(rightEndpointId);
    };
    const getLeftMenuOptions = () => endpointOptions.map((option) => option.id).filter((id) => id !== rightEndpointId);
    const getRightMenuOptions = () => endpointOptions.map((option) => option.id).filter((id) => id !== "harbor" && id !== leftEndpointId);
    const ensureValidEndpoints = () => {
      if (rightEndpointId === "harbor") {
        const previousLeft = leftEndpointId;
        leftEndpointId = "harbor";
        rightEndpointId = previousLeft === "harbor" ? endpointOptions.find((option) => option.id !== "harbor")?.id ?? "harbor" : previousLeft;
      }
      if (leftEndpointId === rightEndpointId) {
        rightEndpointId = endpointOptions.find((option) => option.id !== "harbor" && option.id !== leftEndpointId)?.id ?? rightEndpointId;
      }
      if (leftEndpointId === "harbor" && rightEndpointId === "harbor") {
        rightEndpointId = endpointOptions.find((option) => option.id !== "harbor")?.id ?? "harbor";
      }
      if (leftEndpointId !== "harbor" && rightEndpointId === leftEndpointId) {
        rightEndpointId = endpointOptions.find((option) => option.id !== "harbor" && option.id !== leftEndpointId)?.id ?? rightEndpointId;
      }
    };
    const refreshTradeSelectors = () => {
      ensureValidEndpoints();
      leftSelect.label.textContent = getEndpoint(leftEndpointId).label;
      rightSelect.label.textContent = getEndpoint(rightEndpointId).label;
      leftSelect.menu.querySelectorAll(".custom-select-option").forEach((option) => {
        const optionId = option.dataset.value;
        const allowed = getLeftMenuOptions().includes(optionId);
        option.classList.toggle("hidden", !allowed);
        option.classList.toggle("is-active", optionId === leftEndpointId);
      });
      rightSelect.menu.querySelectorAll(".custom-select-option").forEach((option) => {
        const optionId = option.dataset.value;
        const allowed = getRightMenuOptions().includes(optionId);
        option.classList.toggle("hidden", !allowed);
        option.classList.toggle("is-active", optionId === rightEndpointId);
      });
      const leftMode = getDirectionalMode(leftEndpointId, rightEndpointId);
      const rightMode = getDirectionalMode(rightEndpointId, leftEndpointId);
      const leftLabel = leftMode === "trade-buy" ? "Buy →" : leftMode === "trade-sell" ? "Sell →" : leftMode === "transfer" ? "Transfer →" : "—";
      const rightLabel = rightMode === "trade-buy" ? "← Buy" : rightMode === "trade-sell" ? "← Sell" : rightMode === "transfer" ? "← Transfer" : "—";
      tradeDirectionLeft.textContent = leftLabel;
      tradeDirectionRight.textContent = rightLabel;
      modalSummaryCard.textContent = getShipSummaryText();
    };
    const tradeTableWrap = document.createElement("div");
    tradeTableWrap.classList.add("trade-table-wrap");
    tradePanel.appendChild(tradeTableWrap);
    const infoRow = document.createElement("div");
    infoRow.classList.add("trade-info-row");
    const infoLeftText = document.createElement("span");
    const infoDivider = document.createElement("span");
    infoDivider.classList.add("trade-info-divider");
    infoDivider.textContent = "→";
    const infoRightText = document.createElement("span");
    infoRow.appendChild(infoLeftText);
    infoRow.appendChild(infoDivider);
    infoRow.appendChild(infoRightText);
    tradeTableWrap.appendChild(infoRow);
    const headerRow = document.createElement("div");
    headerRow.classList.add("trade-row", "trade-row-header");
    const headerIcon = document.createElement("span");
    headerIcon.classList.add("trade-row-icon");
    const headerName = document.createElement("span");
    headerName.classList.add("trade-row-name");
    headerName.textContent = "Good";
    const headerLeftValue = document.createElement("span");
    headerLeftValue.classList.add("trade-row-supply");
    const headerSliderWrap = document.createElement("span");
    headerSliderWrap.classList.add("trade-slider-wrap");
    const headerLabels = document.createElement("span");
    headerLabels.classList.add("trade-header-labels");
    const headerSellLabel = document.createElement("span");
    headerSellLabel.classList.add("sell-label");
    const headerBuyLabel = document.createElement("span");
    headerBuyLabel.classList.add("buy-label");
    headerLabels.appendChild(headerSellLabel);
    headerLabels.appendChild(headerBuyLabel);
    headerSliderWrap.appendChild(headerLabels);
    const headerRightValue = document.createElement("span");
    headerRightValue.classList.add("trade-row-held");
    headerRow.appendChild(headerIcon);
    headerRow.appendChild(headerName);
    headerRow.appendChild(headerLeftValue);
    headerRow.appendChild(headerSliderWrap);
    headerRow.appendChild(headerRightValue);
    tradeTableWrap.appendChild(headerRow);
    const rowStates = [];
    for (const good of allGoods) {
      const entry = market.getEntry(good);
      if (!entry)
        continue;
      const row = document.createElement("div");
      row.classList.add("trade-row");
      const icon = document.createElement("img");
      icon.classList.add("trade-row-icon");
      icon.src = `/assets/images/icons/${good.img}`;
      icon.alt = good.name;
      row.appendChild(icon);
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("trade-row-name");
      nameSpan.textContent = good.name;
      row.appendChild(nameSpan);
      const supplySpan = document.createElement("span");
      supplySpan.classList.add("trade-row-supply");
      row.appendChild(supplySpan);
      const sliderWrap = document.createElement("div");
      sliderWrap.classList.add("trade-slider-wrap");
      const slider = document.createElement("div");
      slider.classList.add("trade-slider");
      const sliderLane = document.createElement("div");
      sliderLane.classList.add("trade-slider-lane");
      const sellRail = document.createElement("div");
      sellRail.classList.add("trade-slider-rail", "trade-slider-rail-sell");
      const buyRail = document.createElement("div");
      buyRail.classList.add("trade-slider-rail", "trade-slider-rail-buy");
      const centerMark = document.createElement("div");
      centerMark.classList.add("trade-slider-center");
      const fill = document.createElement("div");
      fill.classList.add("trade-slider-fill");
      const handle = document.createElement("button");
      handle.type = "button";
      handle.classList.add("trade-slider-handle");
      const handleAmount = document.createElement("span");
      handleAmount.classList.add("trade-slider-handle-amount");
      const handlePrice = document.createElement("span");
      handlePrice.classList.add("trade-slider-handle-price");
      handle.appendChild(handleAmount);
      handle.appendChild(handlePrice);
      sliderLane.appendChild(sellRail);
      sliderLane.appendChild(buyRail);
      sliderLane.appendChild(fill);
      sliderLane.appendChild(centerMark);
      sliderLane.appendChild(handle);
      slider.appendChild(sliderLane);
      sliderWrap.appendChild(slider);
      row.appendChild(sliderWrap);
      const heldSpan = document.createElement("span");
      heldSpan.classList.add("trade-row-held");
      row.appendChild(heldSpan);
      tradeTableWrap.appendChild(row);
      let sliderValue = 0;
      let isDragging = false;
      let currentPrice = market.currentPrice(good);
      let maxLeftToRight = 0;
      let maxRightToLeft = 0;
      const applySliderState = (v) => {
        sliderValue = clamp(v, -100, 100);
        if (sliderValue === 0) {
          slider.className = "trade-slider is-idle";
          fill.style.left = "50%";
          fill.style.width = "0%";
          handle.style.left = "50%";
          handleAmount.textContent = good.name;
          handlePrice.textContent = `${currentPrice}£`;
          return;
        }
        const normalized = sliderValue / 100;
        const handleLeft = 50 + normalized * 50;
        handle.style.left = `${handleLeft}%`;
        if (sliderValue > 0) {
          const qty = sliderQty(sliderValue, maxLeftToRight);
          const total = getDirectionalQuote(good, qty, leftEndpointId, rightEndpointId);
          const mode = getDirectionalMode(leftEndpointId, rightEndpointId);
          slider.className = "trade-slider is-buy";
          fill.style.left = "50%";
          fill.style.width = `${normalized * 50}%`;
          handleAmount.textContent = `+${qty}`;
          handlePrice.textContent = mode === "transfer" ? "transfer" : `${total}£`;
        } else {
          const qty = sliderQty(sliderValue, maxRightToLeft);
          const total = getDirectionalQuote(good, qty, rightEndpointId, leftEndpointId);
          const mode = getDirectionalMode(rightEndpointId, leftEndpointId);
          slider.className = "trade-slider is-sell";
          fill.style.left = `${50 + normalized * 50}%`;
          fill.style.width = `${Math.abs(normalized) * 50}%`;
          handleAmount.textContent = `-${qty}`;
          handlePrice.textContent = mode === "transfer" ? "transfer" : `${total}£`;
        }
      };
      const getValueFromPointer = (clientX) => {
        const rect = sliderLane.getBoundingClientRect();
        if (rect.width <= 0)
          return 0;
        const centerX = rect.left + rect.width / 2;
        const halfWidth = rect.width / 2;
        const delta = clientX - centerX;
        const raw = clamp(delta / halfWidth, -1, 1);
        if (raw > 0 && maxLeftToRight <= 0)
          return 0;
        if (raw < 0 && maxRightToLeft <= 0)
          return 0;
        return Math.round(raw * 100);
      };
      const executeTrade = () => {
        if (sliderValue === 0) {
          applySliderState(0);
          return;
        }
        if (sliderValue > 0) {
          const qty = sliderQty(sliderValue, maxLeftToRight);
          if (qty <= 0 || !executeDirectionalTransfer(good, qty, leftEndpointId, rightEndpointId)) {
            applySliderState(0);
            return;
          }
        } else {
          const qty = sliderQty(sliderValue, maxRightToLeft);
          if (qty <= 0 || !executeDirectionalTransfer(good, qty, rightEndpointId, leftEndpointId)) {
            applySliderState(0);
            return;
          }
        }
        applySliderState(0);
        this.notifyDataChange();
      };
      const stopDrag = () => {
        if (!isDragging)
          return;
        isDragging = false;
        slider.classList.remove("is-dragging");
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        executeTrade();
      };
      const onPointerMove = (event) => {
        if (!isDragging)
          return;
        applySliderState(getValueFromPointer(event.clientX));
      };
      const onPointerUp = () => {
        stopDrag();
      };
      const startDrag = (event) => {
        if (maxLeftToRight <= 0 && maxRightToLeft <= 0)
          return;
        isDragging = true;
        slider.classList.add("is-dragging");
        applySliderState(getValueFromPointer(event.clientX));
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
      };
      sliderLane.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        startDrag(event);
      });
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDrag(event);
      });
      rowStates.push({
        good,
        supplySpan,
        heldSpan,
        slider,
        sellRail,
        buyRail,
        fill,
        handle,
        handleAmount,
        handlePrice,
        update: () => {
          currentPrice = market.currentPrice(good);
          const leftQty = getHeldQuantity(leftEndpointId, good);
          const rightQty = getHeldQuantity(rightEndpointId, good);
          maxLeftToRight = getMaxDirectionalQty(good, leftEndpointId, rightEndpointId);
          maxRightToLeft = getMaxDirectionalQty(good, rightEndpointId, leftEndpointId);
          supplySpan.textContent = String(leftQty);
          heldSpan.textContent = String(rightQty);
          sellRail.classList.toggle("is-disabled", maxRightToLeft === 0);
          buyRail.classList.toggle("is-disabled", maxLeftToRight === 0);
          applySliderState(0);
        }
      });
    }
    const refreshTradeTable = () => {
      if (!market)
        return;
      refreshTradeSelectors();
      infoLeftText.textContent = getSummaryText(leftEndpointId);
      infoRightText.textContent = getSummaryText(rightEndpointId);
      infoRow.classList.toggle("hidden", !(leftEndpointId === "ship" && rightEndpointId === "kontor" || leftEndpointId === "kontor" && rightEndpointId === "ship"));
      headerLeftValue.textContent = getEndpoint(leftEndpointId).label;
      headerSellLabel.textContent = `${getEndpoint(rightEndpointId).label} → ${getEndpoint(leftEndpointId).label}`;
      headerBuyLabel.textContent = `${getEndpoint(leftEndpointId).label} → ${getEndpoint(rightEndpointId).label}`;
      headerRightValue.textContent = getEndpoint(rightEndpointId).label;
      for (const rowState of rowStates) {
        rowState.update();
      }
    };
    refreshTradeSelectors();
    refreshTradeTable();
    panels.push(tradePanel);
    modalBody.appendChild(tradePanel);
    win.appendChild(modalBody);
    tabBar.querySelectorAll(".modal-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        tabBar.querySelectorAll(".modal-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.tab;
        for (const p of panels) {
          p.classList.toggle("hidden", p.id !== `panel-${target}`);
        }
        if (target === "trade") {
          refreshTradeTable();
        }
        if (target === "production") {
          refreshProductionPanel();
        }
      });
    });
    const closeModal = () => {
      this._hudElement?.classList.remove("is-modal-hidden");
      modal.remove();
      this._isShowingModal = false;
      this._activeModalRefresh = null;
      document.removeEventListener("keydown", escHandler);
      for (const cleanup of cleanupCallbacks)
        cleanup();
    };
    const escHandler = (e) => {
      if (e.key === "Escape")
        closeModal();
    };
    closeX.addEventListener("click", closeModal);
    document.addEventListener("keydown", escHandler);
    let mousedownOnBackdrop = false;
    modal.addEventListener("mousedown", (e) => {
      mousedownOnBackdrop = e.target === modal;
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal && mousedownOnBackdrop)
        closeModal();
    });
    modal.appendChild(win);
    document.body.appendChild(modal);
    this._hudElement?.classList.add("is-modal-hidden");
    this._isShowingModal = true;
    this._activeModalRefresh = () => {
      refreshCityPanel();
      refreshTradeTable();
      refreshProductionPanel();
    };
  }
}

// src/ts/ecs/System.ts
class System {
  world;
}

class TickSystem extends System {
}
class EventSystem extends System {
}

// src/ts/gameplay/systems/MovementSystem.ts
class MovementSystem extends TickSystem {
  update(dt) {
    for (const entity of this.world.query(Position, Ship, TravelRoute)) {
      const ship = entity.getComponent(Ship);
      const route = entity.getComponent(TravelRoute);
      const pos = entity.getComponent(Position);
      const advance = ship.speedUnitsPerSecond * dt / Math.max(0.001, route.totalDistance);
      route.progress = Math.min(1, route.progress + advance);
      pos.x = route.origin.x + (route.destination.x - route.origin.x) * route.progress;
      pos.y = route.origin.y + (route.destination.y - route.origin.y) * route.progress;
      if (route.progress >= 1) {
        const destinationCity = this.findCityAtPosition(route.destination);
        if (destinationCity) {
          const hud = HUDcontroller.getInstance();
          hud.setOnSeaState(false);
          this.triggerHUDController(destinationCity);
        }
        entity.removeComponent(TravelRoute);
        const navPath = entity.getComponent(NavigationPath);
        if (navPath && !navPath.finished) {
          navPath.currentIndex++;
          const next = navPath.nextWaypoint;
          if (next) {
            const cur = navPath.currentWaypoint;
            entity.addComponent(new TravelRoute(cur, next));
          } else {
            entity.removeComponent(NavigationPath);
          }
        } else if (navPath) {
          entity.removeComponent(NavigationPath);
        }
      }
    }
  }
  findCityAtPosition(pos) {
    const epsilon = 0.001;
    for (const entity of this.world.query(Position, City)) {
      const entityPos = entity.getComponent(Position);
      if (Math.abs(entityPos.x - pos.x) < epsilon && Math.abs(entityPos.y - pos.y) < epsilon) {
        return entity;
      }
    }
    return null;
  }
  triggerHUDController(city) {
    const hud = HUDcontroller.getInstance();
    const nameComp = city.getComponent(Name);
    const cityComp = city.getComponent(City);
    if (nameComp && cityComp) {
      const cityName = nameComp.value;
      const population = cityComp.population;
      hud.updateCityInfo(cityName, population);
    }
  }
}
// src/ts/gameplay/systems/GameTimeSystem.ts
class GameTimeSystem extends TickSystem {
  _gameTime = GameTime.getInstance();
  update(dt) {
    this._gameTime.advance(dt);
    HUDcontroller.getInstance().updateGameTime(this._gameTime.formatHudLabel());
  }
}
// src/ts/gameplay/algorithms/ShadowProductionAlgorithm.ts
var SHORTAGE_THRESHOLD = 0.95;
var OVERFLOW_THRESHOLD = 1.8;
var IMPORT_THRESHOLD = 1;
var IMPORT_TARGET = 1.2;
var PRODUCTION_RATE = 0.8;
var MAX_PER_TRADE = 120;
var INTERCITY_OVERFLOW_THRESHOLD = 1.5;
var MAX_INTERCITY_TRADE = 80;

class ShadowProductionAlgorithm {
  static run(world, elapsed) {
    const shadow = world.query(ShadowProducer, Inventory, Gold)[0];
    if (!shadow)
      return;
    const shadowInv = shadow.getComponent(Inventory);
    const shadowGold = shadow.getComponent(Gold);
    const cities = world.query(City, Market2);
    if (cities.length === 0)
      return;
    const metrics = new Map;
    for (const city of cities) {
      const market = city.getComponent(Market2);
      for (const [good, entry] of market.goods()) {
        if (!(entry.demand > 0))
          continue;
        let m = metrics.get(good);
        if (!m) {
          m = { totalSupply: 0, totalDemand: 0 };
          metrics.set(good, m);
        }
        m.totalSupply += entry.supply;
        m.totalDemand += entry.demand;
      }
    }
    const dayFraction = elapsed / REAL_SECONDS_PER_DAY;
    console.groupCollapsed(`[ShadowProducer] tick  gold=${shadowGold.amount.toFixed(0)}  inv=${[...metrics.keys()].reduce((s, g) => s + shadowInv.get(g), 0).toFixed(1)} units`);
    const shortageGoods = new Set;
    for (const [good, m] of metrics) {
      if (m.totalDemand <= 0)
        continue;
      if (m.totalSupply < m.totalDemand * SHORTAGE_THRESHOLD) {
        shortageGoods.add(good);
        const deficit = m.totalDemand - m.totalSupply;
        const toGenerate = deficit * PRODUCTION_RATE * dayFraction;
        if (toGenerate > 0) {
          shadowInv.add(good, toGenerate);
          console.log(`  [produce] ${good.name}  deficit=${deficit.toFixed(1)}  generated=${toGenerate.toFixed(2)}  inv→${shadowInv.get(good).toFixed(1)}`);
        }
      }
    }
    for (const city of cities) {
      const market = city.getComponent(Market2);
      const cityGold = city.getComponent(Gold);
      const cityName = city.getComponent(Name)?.value ?? city.id;
      for (const [good, entry] of market.goods()) {
        if (!(entry.demand > 0))
          continue;
        if (entry.supply > entry.demand * OVERFLOW_THRESHOLD) {
          const excess = entry.supply - entry.demand * OVERFLOW_THRESHOLD;
          const toBuy = Math.min(excess * PRODUCTION_RATE * dayFraction, MAX_PER_TRADE);
          if (toBuy <= 0)
            continue;
          const unitCost = good.buyPrice;
          const totalCost = toBuy * unitCost;
          if (shadowGold.amount < totalCost)
            continue;
          shadowGold.amount -= totalCost;
          if (cityGold)
            cityGold.amount += totalCost;
          market.update(good, { supply: entry.supply - toBuy });
          shadowInv.add(good, toBuy);
          console.log(`  [absorb]  ${cityName} / ${good.name}  absorbed=${toBuy.toFixed(2)}  citySupply→${(entry.supply - toBuy).toFixed(1)}`);
        }
      }
    }
    for (const [good] of metrics) {
      let bestSeller = null;
      let bestSellerRatio = INTERCITY_OVERFLOW_THRESHOLD;
      let bestBuyer = null;
      let bestBuyerRatio = Infinity;
      for (const city of cities) {
        const market = city.getComponent(Market2);
        const entry = market.getEntry(good);
        if (!entry || !(entry.demand > 0))
          continue;
        const ratio = entry.supply / entry.demand;
        const cityName = city.getComponent(Name)?.value ?? city.id;
        if (ratio > bestSellerRatio) {
          bestSellerRatio = ratio;
          bestSeller = { market, entry, name: cityName };
        }
        if (ratio < bestBuyerRatio) {
          bestBuyerRatio = ratio;
          bestBuyer = { market, entry, name: cityName };
        }
      }
      if (!bestSeller || !bestBuyer || bestSeller.market === bestBuyer.market)
        continue;
      if (bestBuyerRatio >= IMPORT_THRESHOLD)
        continue;
      const available = bestSeller.entry.supply - bestSeller.entry.demand * INTERCITY_OVERFLOW_THRESHOLD;
      if (available <= 0)
        continue;
      const want = bestBuyer.entry.demand * IMPORT_TARGET - bestBuyer.entry.supply;
      if (want <= 0)
        continue;
      const qty = Math.min(available, want, MAX_INTERCITY_TRADE);
      if (qty <= 0)
        continue;
      bestSeller.market.update(good, { supply: bestSeller.entry.supply - qty });
      bestBuyer.market.update(good, { supply: bestBuyer.entry.supply + qty });
      console.log(`  [intercity] ${bestSeller.name} → ${bestBuyer.name} / ${good.name}  qty=${qty.toFixed(1)}`);
    }
    for (const good of shortageGoods) {
      if (shadowInv.get(good) <= 0)
        continue;
      const eligible = [];
      for (const city of cities) {
        const market = city.getComponent(Market2);
        const entry = market.getEntry(good);
        if (!entry || !(entry.demand > 0))
          continue;
        if (entry.supply >= entry.demand * IMPORT_THRESHOLD)
          continue;
        eligible.push({
          market,
          entry,
          cityGold: city.getComponent(Gold),
          cityName: city.getComponent(Name)?.value ?? city.id
        });
      }
      eligible.sort((a, b) => b.market.currentPrice(good) - a.market.currentPrice(good));
      for (const { market, entry, cityGold, cityName } of eligible) {
        const available = shadowInv.get(good);
        if (available <= 0)
          break;
        const target = entry.demand * IMPORT_TARGET - entry.supply;
        if (target <= 0)
          continue;
        const exactAffordable = cityGold ? Math.floor(Math.max(0, cityGold.amount) / good.buyPrice) : MAX_PER_TRADE;
        const affordable = Math.max(exactAffordable, 20);
        const qty = Math.min(target, available, affordable, MAX_PER_TRADE);
        if (qty <= 0)
          continue;
        const cost = qty * good.buyPrice;
        shadowInv.remove(good, qty);
        if (cityGold) {
          cityGold.amount = Math.max(0, cityGold.amount - cost);
        }
        shadowGold.amount += cost;
        market.update(good, { supply: entry.supply + qty });
        console.log(`  [distrib] ${cityName} / ${good.name}  qty=${qty.toFixed(2)}  cost=${cost.toFixed(0)}  citySupply→${(entry.supply + qty).toFixed(1)}`);
      }
    }
    console.groupEnd();
  }
}

// src/ts/gameplay/systems/MarketSystem.ts
class MarketSystem extends TickSystem {
  _elapsed = 0;
  update(dt) {
    const registry = GoodsRegistry.getInstance();
    this._elapsed += dt;
    if (this._elapsed < registry.tickInterval)
      return;
    const elapsed = this._elapsed;
    this._elapsed = 0;
    for (const entity of this.world.query(City, Market2, CityProduction)) {
      const market = entity.getComponent(Market2);
      const production = entity.getComponent(CityProduction);
      const { citizens, multipliers } = production;
      for (const [goodName, cityMultiplier] of multipliers) {
        const good = registry.getGood(goodName);
        if (!good)
          continue;
        const baseProduction = registry.getBaseProduction(goodName);
        const amount = baseProduction * (citizens / 10) * cityMultiplier * (elapsed / REAL_SECONDS_PER_DAY);
        if (amount <= 0)
          continue;
        const recipe = registry.getRecipe(goodName);
        if (recipe) {
          let canProduce = true;
          for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
            const ingredientGood = registry.getGood(ingredientName);
            if (!ingredientGood) {
              canProduce = false;
              break;
            }
            const entry2 = market.getEntry(ingredientGood);
            if (!entry2 || entry2.supply < amount * ratio) {
              canProduce = false;
              break;
            }
          }
          if (!canProduce)
            continue;
          for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
            const ingredientGood = registry.getGood(ingredientName);
            const entry2 = market.getEntry(ingredientGood);
            market.update(ingredientGood, { supply: entry2.supply - amount * ratio });
          }
        }
        const entry = market.getEntry(good);
        if (entry) {
          market.update(good, { supply: entry.supply + amount });
        }
      }
      const productionDemand = new Map;
      for (const [goodName, cityMultiplier] of multipliers) {
        const recipe = registry.getRecipe(goodName);
        if (!recipe)
          continue;
        const baseProduction = registry.getBaseProduction(goodName);
        const weeklyProduction = baseProduction * (citizens / 10) * cityMultiplier * DEMAND_DAYS_PER_WEEK;
        for (const [ingredientName, ratio] of Object.entries(recipe.ingredients)) {
          const ingredientGood = registry.getGood(ingredientName);
          if (!ingredientGood)
            continue;
          productionDemand.set(ingredientGood, (productionDemand.get(ingredientGood) ?? 0) + weeklyProduction * ratio);
        }
      }
      for (const [good, entry] of market.goods()) {
        if (good.base_demand <= 0 && !productionDemand.has(good))
          continue;
        const weeklyConsumerDemand = good.base_demand > 0 ? demandAlgorithm(good, entity) : 0;
        const weeklyProdDemand = productionDemand.get(good) ?? 0;
        const weeklyDemand = weeklyConsumerDemand + weeklyProdDemand;
        const dailyConsumerDemand = weeklyConsumerDemand / DEMAND_DAYS_PER_WEEK;
        const consumed = dailyConsumerDemand * (elapsed / REAL_SECONDS_PER_DAY);
        const newSupply = Math.max(0, entry.supply - consumed);
        market.update(good, {
          supply: newSupply,
          demand: weeklyDemand
        });
      }
    }
    const satisfactionResults = SatisfactionAlgorithm.evaluate(this.world);
    for (const [cityEntity, result] of satisfactionResults) {
      if (result.growthPerWeek <= 0)
        continue;
      const cityComp = cityEntity.getComponent(City);
      const growth = result.growthPerWeek * (elapsed / REAL_SECONDS_PER_WEEK);
      cityComp.population = Math.floor(cityComp.population + growth);
    }
    ShadowProductionAlgorithm.run(this.world, elapsed);
    HUDcontroller.getInstance().notifyDataChange();
  }
}
// src/ts/gameplay/systems/TradeSystem.ts
class TradeSystem extends EventSystem {
  handle(order) {
    const ship = this.world.getEntityById(order.shipId);
    const city = this.world.getEntityById(order.cityId);
    if (!ship || !city)
      return;
    const playerCompany = ship.hasComponent(PlayerControlled) ? this.world.query(Merchant, Gold, IsPlayerOwned)[0] ?? null : null;
    const shipGold = playerCompany?.getComponent(Gold) ?? ship.getComponent(Gold);
    const shipInv = ship.getComponent(Inventory);
    const shipComp = ship.getComponent(Ship);
    const cityMkt = city.getComponent(Market2);
    const cityGold = city.getComponent(Gold);
    if (!shipGold || !shipInv || !cityMkt)
      return;
    if (order.direction === "buy") {
      const unitPrice = cityMkt.currentPrice(order.good);
      const totalCost = unitPrice * order.quantity;
      const entry = cityMkt.getEntry(order.good);
      if (!entry || entry.supply < order.quantity)
        return;
      if (shipGold.amount < totalCost)
        return;
      if (shipComp && shipInv.totalUnits() + order.quantity > shipComp.cargoCapacity)
        return;
      shipInv.add(order.good, order.quantity);
      shipGold.amount -= totalCost;
      if (cityGold)
        cityGold.amount += totalCost;
      cityMkt.update(order.good, { supply: Math.max(0, entry.supply - order.quantity) });
      HUDcontroller.getInstance().notifyDataChange();
    } else {
      const entry = cityMkt.getEntry(order.good);
      if (!entry)
        return;
      const unitPrice = cityMkt.currentPrice(order.good);
      const totalRevenue = unitPrice * order.quantity;
      if (!shipInv.remove(order.good, order.quantity))
        return;
      shipGold.amount += totalRevenue;
      if (cityGold)
        cityGold.amount = Math.max(0, cityGold.amount - totalRevenue);
      cityMkt.update(order.good, { supply: entry.supply + order.quantity });
      HUDcontroller.getInstance().notifyDataChange();
    }
  }
}
// src/ts/render/SpriteManager.ts
class SpriteManager {
  static _instance = null;
  _sprites = new Map;
  _loadingPromises = new Map;
  constructor() {}
  static getInstance() {
    if (!SpriteManager._instance) {
      SpriteManager._instance = new SpriteManager;
    }
    return SpriteManager._instance;
  }
  loadGoodIcons(goods) {
    this.preloadGoodIcons(goods);
    console.log(`SpriteManager: loading ${this._sprites.size} good icons`);
  }
  async preloadGoodIcons(goods, onLoaded) {
    let loadedCount = 0;
    for (const good of goods) {
      await this._queueSprite(good).then(() => {
        loadedCount += 1;
        onLoaded?.(good.name, loadedCount);
      });
    }
  }
  _queueSprite(good) {
    const existingPromise = this._loadingPromises.get(good.name);
    if (existingPromise)
      return existingPromise;
    let img = this._sprites.get(good.name);
    if (!img) {
      img = new Image;
      this._sprites.set(good.name, img);
    }
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }
    const promise = new Promise((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load sprite for ${good.name}`));
      };
      const cleanup = () => {
        img?.removeEventListener("load", onLoad);
        img?.removeEventListener("error", onError);
      };
      img.addEventListener("load", onLoad, { once: true });
      img.addEventListener("error", onError, { once: true });
      img.src = `/assets/images/icons/${good.img}`;
    });
    this._loadingPromises.set(good.name, promise);
    return promise;
  }
  getIcon(goodName) {
    return this._sprites.get(goodName);
  }
  isReady() {
    for (const img of this._sprites.values()) {
      if (!img.complete || img.naturalWidth === 0)
        return false;
    }
    return true;
  }
}

// src/ts/boot/AssetPreloader.ts
var STATIC_IMAGE_URLS = [
  "/src/assets/images/_background.webp",
  "/src/assets/images/intro_background.webp",
  "/assets/images/texture_background.webp",
  "/assets/images/world_map.svg",
  "/assets/images/world_map_2.svg",
  "/assets/images/world_map_3.svg",
  "/assets/images/new_world_map.png",
  "/assets/images/ship.svg"
];
var preloadedImages = new Map;
var imagePromises = new Map;
function loadImageAsset(url) {
  const existingImage = preloadedImages.get(url);
  if (existingImage) {
    return Promise.resolve(existingImage);
  }
  const existingPromise = imagePromises.get(url);
  if (existingPromise) {
    return existingPromise;
  }
  const promise = new Promise((resolve, reject) => {
    const img = new Image;
    img.onload = () => {
      preloadedImages.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
    img.src = url;
  });
  imagePromises.set(url, promise);
  return promise;
}
function getPreloadedImage(url) {
  return preloadedImages.get(url) ?? null;
}
async function preloadStartupAssets(onProgress) {
  const registry = await GoodsRegistry.load();
  const goods = registry.getAllGoods();
  const total = STATIC_IMAGE_URLS.length + goods.length;
  let loaded = 0;
  const report = (label) => {
    onProgress?.({ loaded, total, label });
  };
  report("Preparing the docks...");
  for (const url of STATIC_IMAGE_URLS) {
    report(`Loading ${url.split("/").at(-1) ?? url}`);
    await loadImageAsset(url);
    loaded += 1;
    report(`Loaded ${url.split("/").at(-1) ?? url}`);
  }
  await SpriteManager.getInstance().preloadGoodIcons(goods, (goodName, finishedCount) => {
    loaded = STATIC_IMAGE_URLS.length + finishedCount;
    report(`Loading ${goodName}`);
  });
  loaded = total;
  report("All resources ready");
}

// src/ts/render/RenderSystem.ts
var MIN_ZOOM = 1;
var MAX_ZOOM = 3;
var SMOOTH_SAMPLES = 6;
var WORLD_MAP_URL = "/assets/images/world_map.svg";
var BACKGROUND_TEXTURE_URL = "/assets/images/texture_background.webp";
var SHIP_SPRITE_URL = "/assets/images/ship.svg";
var DEFAULT_MAP_ASPECT_RATIO = 196.45584 / 111.70967;
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}
function smoothPath(pts, samples = SMOOTH_SAMPLES) {
  if (pts.length < 3)
    return [...pts];
  const out = [pts[0]];
  for (let i = 0;i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 1;s <= samples; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / samples));
    }
  }
  return out;
}

class MapRenderSystem extends TickSystem {
  _ctx;
  _canvas;
  _worldMapImage = null;
  _backgroundImage = null;
  _shipImage = null;
  graph = null;
  harbourNames = [];
  _zoom = MIN_ZOOM;
  _offsetX = 0;
  _offsetY = 0;
  _isDragging = false;
  _dragLastX = 0;
  _dragLastY = 0;
  _hasInitialized = false;
  constructor(canvas) {
    super();
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2D rendering context from canvas.");
    this._ctx = ctx;
    this._canvas = canvas;
    this._worldMapImage = getPreloadedImage(WORLD_MAP_URL);
    this._backgroundImage = getPreloadedImage(BACKGROUND_TEXTURE_URL);
    this._shipImage = getPreloadedImage(SHIP_SPRITE_URL);
    loadImageAsset(WORLD_MAP_URL).then((img) => {
      this._worldMapImage = img;
    });
    loadImageAsset(BACKGROUND_TEXTURE_URL).then((img) => {
      this._backgroundImage = img;
    });
    loadImageAsset(SHIP_SPRITE_URL).then((img) => {
      this._shipImage = img;
    });
    this._bindInputEvents();
  }
  renderOnce() {
    this.update(0);
  }
  _getMapAspectRatio() {
    if (this._worldMapImage?.naturalWidth && this._worldMapImage.naturalHeight) {
      return this._worldMapImage.naturalWidth / this._worldMapImage.naturalHeight;
    }
    return DEFAULT_MAP_ASPECT_RATIO;
  }
  _getBaseScale() {
    const ar = this._getMapAspectRatio();
    const w = this._canvas.width;
    const h = this._canvas.height;
    const scaleX = Math.max(w, h * ar);
    const scaleY = scaleX / ar;
    return { scaleX, scaleY };
  }
  _screenToWorld(sx, sy) {
    const { scaleX, scaleY } = this._getBaseScale();
    return {
      wx: sx / (this._zoom * scaleX) + this._offsetX,
      wy: sy / (this._zoom * scaleY) + this._offsetY
    };
  }
  _worldToScreen(wx, wy) {
    const { scaleX, scaleY } = this._getBaseScale();
    return {
      sx: (wx - this._offsetX) * this._zoom * scaleX,
      sy: (wy - this._offsetY) * this._zoom * scaleY
    };
  }
  _scale() {
    const { scaleX, scaleY } = this._getBaseScale();
    return this._zoom * Math.min(scaleX, scaleY);
  }
  _clampOffset() {
    const { scaleX, scaleY } = this._getBaseScale();
    const maxX = Math.max(0, 1 - this._canvas.width / (this._zoom * scaleX));
    const maxY = Math.max(0, 1 - this._canvas.height / (this._zoom * scaleY));
    this._offsetX = Math.max(0, Math.min(this._offsetX, maxX));
    this._offsetY = Math.max(0, Math.min(this._offsetY, maxY));
  }
  _centerOffset() {
    const { scaleX, scaleY } = this._getBaseScale();
    this._offsetX = Math.max(0, 1 - this._canvas.width / (this._zoom * scaleX)) / 2;
    this._offsetY = Math.max(0, 1 - this._canvas.height / (this._zoom * scaleY)) / 2;
  }
  _bindInputEvents() {
    const canvas = this._canvas;
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoom * factor));
      if (newZoom === this._zoom)
        return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wy } = this._screenToWorld(sx, sy);
      this._zoom = newZoom;
      const { scaleX, scaleY } = this._getBaseScale();
      this._offsetX = wx - sx / (this._zoom * scaleX);
      this._offsetY = wy - sy / (this._zoom * scaleY);
      this._clampOffset();
    }, { passive: false });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 2)
        return;
      this._isDragging = true;
      this._dragLastX = e.clientX;
      this._dragLastY = e.clientY;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("mousemove", (e) => {
      if (!this._isDragging)
        return;
      const { scaleX, scaleY } = this._getBaseScale();
      this._offsetX -= (e.clientX - this._dragLastX) / (this._zoom * scaleX);
      this._offsetY -= (e.clientY - this._dragLastY) / (this._zoom * scaleY);
      this._clampOffset();
      this._dragLastX = e.clientX;
      this._dragLastY = e.clientY;
    });
    const stopDrag = () => {
      if (!this._isDragging)
        return;
      this._isDragging = false;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("mouseup", (e) => {
      if (e.button === 2)
        stopDrag();
    });
    canvas.addEventListener("mouseleave", stopDrag);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("click", (e) => {
      if (e.button !== 0)
        return;
      const rect = canvas.getBoundingClientRect();
      const { wx, wy } = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (e.shiftKey) {
        this._handleShipMovement(wx, wy);
      } else {
        this._handleCityModalClick(wx, wy);
      }
    });
    canvas.style.cursor = "grab";
  }
  _handleCityModalClick(wx, wy) {
    const CLICK_RADIUS = 0.025;
    let clickedCity = null;
    let bestDist = Infinity;
    for (const entity of this.world.query(Position, City)) {
      const pos = entity.getComponent(Position);
      const d = Math.hypot(pos.x - wx, pos.y - wy);
      if (d < bestDist && d < CLICK_RADIUS) {
        bestDist = d;
        clickedCity = entity;
      }
    }
    if (!clickedCity)
      return;
    const cityPos = clickedCity.getComponent(Position);
    let playerShip = null;
    for (const ship of this.world.query(Position, Ship, PlayerControlled)) {
      if (ship.hasComponent(TravelRoute) || ship.hasComponent(NavigationPath))
        continue;
      const sp = ship.getComponent(Position);
      if (Math.hypot(sp.x - cityPos.x, sp.y - cityPos.y) < 0.01) {
        playerShip = ship;
        break;
      }
    }
    let kontorEntity = null;
    for (const k of this.world.query(Position, Kontor, IsPlayerOwned)) {
      const kp = k.getComponent(Position);
      if (Math.hypot(kp.x - cityPos.x, kp.y - cityPos.y) < 0.01) {
        kontorEntity = k;
        break;
      }
    }
    if (!playerShip && !kontorEntity)
      return;
    HUDcontroller.getInstance().createCityOverviewModal(clickedCity, playerShip, kontorEntity);
  }
  _handleShipMovement(wx, wy) {
    const graph = this.graph;
    if (!graph)
      return;
    const CLICK_RADIUS = 0.025;
    let clickedCity = null;
    let bestDist = Infinity;
    for (const entity of this.world.query(Position, City)) {
      const pos = entity.getComponent(Position);
      const d = Math.hypot(pos.x - wx, pos.y - wy);
      if (d < bestDist && d < CLICK_RADIUS) {
        bestDist = d;
        clickedCity = entity;
      }
    }
    if (!clickedCity)
      return;
    const destName = clickedCity.getComponent(Name)?.value;
    if (!destName)
      return;
    const playerShips = this.world.query(Position, Ship, PlayerControlled);
    if (playerShips.length === 0)
      return;
    const ship = playerShips[0];
    const shipPos = ship.getComponent(Position);
    const startNode = graph.nearestNode(shipPos.x, shipPos.y);
    if (startNode === destName)
      return;
    const hud = HUDcontroller.getInstance();
    hud.updateOnSeaInfo(ship);
    const result = graph.findShortestPath(startNode, destName);
    if (!result)
      return;
    const raw = result.path.map((id) => graph.getNodePosition(id));
    const waypoints = smoothPath(raw);
    if (ship.hasComponent(TravelRoute))
      ship.removeComponent(TravelRoute);
    if (ship.hasComponent(NavigationPath))
      ship.removeComponent(NavigationPath);
    ship.addComponent(new NavigationPath(waypoints));
    if (waypoints.length >= 2) {
      ship.addComponent(new TravelRoute(waypoints[0], waypoints[1]));
      ship.getComponent(NavigationPath).currentIndex = 0;
    }
  }
  update(_dt) {
    this._canvas.width = this._canvas.clientWidth;
    this._canvas.height = this._canvas.clientHeight;
    if (!this._hasInitialized && this._canvas.width > 0 && this._canvas.height > 0) {
      this._centerOffset();
      this._hasInitialized = true;
    }
    this._clampOffset();
    const { scaleX, scaleY } = this._getBaseScale();
    this._ctx.setTransform(this._zoom * scaleX, 0, 0, this._zoom * scaleY, -this._offsetX * this._zoom * scaleX, -this._offsetY * this._zoom * scaleY);
    this._drawBackground();
    this._drawNavigationPaths();
    this._drawTravelRoutes();
    this._drawCities();
    this._drawShips();
    this._ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  _drawBackground() {
    const ctx = this._ctx;
    if (this._backgroundImage?.complete) {
      ctx.drawImage(this._backgroundImage, 0, 0, 1, 1);
    } else {
      ctx.fillStyle = "#1d0c00";
      ctx.fillRect(0, 0, 1, 1);
    }
    if (this._worldMapImage?.complete) {
      ctx.drawImage(this._worldMapImage, 0, 0, 1, 1);
    }
  }
  _drawNavigationPaths() {
    const ctx = this._ctx;
    const s = this._scale();
    for (const entity of this.world.query(Position, Ship, NavigationPath)) {
      const nav = entity.getComponent(NavigationPath);
      const wps = nav.waypoints;
      if (wps.length < 2)
        continue;
      ctx.beginPath();
      ctx.moveTo(wps[0].x, wps[0].y);
      for (let i = 1;i < wps.length; i++) {
        ctx.lineTo(wps[i].x, wps[i].y);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
      ctx.setLineDash([4 / s, 6 / s]);
      ctx.lineWidth = 2 / s;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  _drawTravelRoutes() {
    const ctx = this._ctx;
    const s = this._scale();
    for (const entity of this.world.query(Position, Ship, TravelRoute)) {
      const route = entity.getComponent(TravelRoute);
      ctx.beginPath();
      ctx.moveTo(route.origin.x, route.origin.y);
      ctx.lineTo(route.destination.x, route.destination.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
      ctx.setLineDash([4 / s, 6 / s]);
      ctx.lineWidth = 1 / s;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  _drawCities() {
    const ctx = this._ctx;
    const playerDockedPositions = [];
    for (const ship of this.world.query(Position, Ship, PlayerControlled)) {
      if (!ship.hasComponent(TravelRoute) && !ship.hasComponent(NavigationPath)) {
        const p = ship.getComponent(Position);
        playerDockedPositions.push({ x: p.x, y: p.y });
      }
    }
    const kontorPositions = [];
    for (const k of this.world.query(Position, Kontor, IsPlayerOwned)) {
      const p = k.getComponent(Position);
      kontorPositions.push({ x: p.x, y: p.y });
    }
    for (const entity of this.world.query(Position, City)) {
      const pos = entity.getComponent(Position);
      const name = entity.getComponent(Name);
      const hasPlayerDocked = playerDockedPositions.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 0.01);
      const hasKontor = kontorPositions.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 0.01);
      const { sx, sy } = this._worldToScreen(pos.x, pos.y);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const scale = hasPlayerDocked ? 1.2 : 1;
      const outerRadius = (this._zoom > 1.5 ? 11 : 8.5) * scale;
      const innerRadius = (this._zoom > 1.5 ? 6.5 : 5) * scale;
      const coreRadius = (this._zoom > 1.5 ? 3.1 : 2.4) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, outerRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = hasKontor ? "rgba(220, 60, 60, 0.20)" : hasPlayerDocked ? "rgba(98, 139, 233, 0.18)" : "rgba(240, 200, 120, 0.14)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, outerRadius, 0, Math.PI * 2);
      const outerGradient = ctx.createRadialGradient(sx - 2, sy - 3, 1, sx, sy, outerRadius);
      outerGradient.addColorStop(0, hasKontor ? "#e4acac" : hasPlayerDocked ? "#acb6e4" : "#dcb98a");
      outerGradient.addColorStop(0.55, hasKontor ? "#b84f4f" : hasPlayerDocked ? "#4f76b8" : "#a8784b");
      outerGradient.addColorStop(1, "#8f6741");
      ctx.fillStyle = outerGradient;
      ctx.fill();
      ctx.strokeStyle = "#e0b87f";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2);
      const innerGradient = ctx.createRadialGradient(sx - 1, sy - 2, 1, sx, sy, innerRadius);
      innerGradient.addColorStop(0, hasKontor ? "#f89898" : hasPlayerDocked ? "#8890f8" : "#f3d7ab");
      innerGradient.addColorStop(1, hasKontor ? "#7a2d2d" : hasPlayerDocked ? "#4660ac" : "#7a4d2d");
      ctx.fillStyle = innerGradient;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = hasKontor ? "#7c2424" : hasPlayerDocked ? "#244c7c" : "#7a4d2d";
      ctx.fill();
      if (name && this._zoom > 2) {
        ctx.font = '600 15px "Baskervville", serif';
        ctx.fillStyle = "#f3d7ab";
        ctx.shadowColor = "rgba(28, 13, 0, 0.85)";
        ctx.shadowBlur = 6;
        const textWidth = ctx.measureText(name.value).width;
        ctx.fillText(name.value, sx - textWidth / 2, sy + 28);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }
  _drawShips() {
    const ctx = this._ctx;
    const SHIP_W = 40 / 3 * 2;
    const SHIP_H = 36 / 3 * 2;
    for (const entity of this.world.query(Position, Ship)) {
      const pos = entity.getComponent(Position);
      const isPlayer = entity.hasComponent(PlayerControlled);
      const route = entity.getComponent(TravelRoute);
      const navPath = entity.getComponent(NavigationPath);
      if (!route && !navPath)
        continue;
      const dx = route ? route.destination.x - route.origin.x : 0;
      const flipX = dx > 0 ? 1 : -1;
      const { sx, sy } = this._worldToScreen(pos.x, pos.y);
      ctx.save();
      ctx.setTransform(flipX, 0, 0, 1, sx, sy);
      if (this._shipImage?.complete && this._shipImage.naturalWidth > 0) {
        let zoomMultiplier = this._zoom > 2 ? 1.5 : 1;
        let width = SHIP_W * zoomMultiplier;
        let height = SHIP_H * zoomMultiplier;
        ctx.drawImage(this._shipImage, -width / 2, -height / 2, width, height);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 7);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fillStyle = isPlayer ? "#5aafff" : "#ffaa44";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      const name = entity.getComponent(Name);
      if (name && this._zoom > 2.5) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = "14px sans-serif";
        ctx.fillStyle = isPlayer ? "#8dcfff" : "#ffcc88";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 3;
        ctx.fillText(name.value, sx + 30, sy + 10);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
  }
}

// src/ts/navigation/MapData.ts
async function loadMapData() {
  const resp = await fetch("/assets/data/map_data.json");
  if (!resp.ok)
    throw new Error(`Failed to load map data: ${resp.status}`);
  return resp.json();
}

// src/ts/navigation/Graph.ts
class NavigationGraph {
  _nodes = new Map;
  _adj = new Map;
  constructor(data) {
    for (const [name, pos] of Object.entries(data.harbour)) {
      this._nodes.set(name, pos);
      this._adj.set(name, []);
    }
    for (const [id, pos] of Object.entries(data.travel_nodes)) {
      this._nodes.set(id, pos);
      this._adj.set(id, []);
    }
    for (const edge of data.edge) {
      this._addEdge(edge.start, edge.end, edge.distance);
    }
  }
  _addEdge(a, b, distance) {
    this._adj.get(a)?.push({ id: b, distance });
    this._adj.get(b)?.push({ id: a, distance });
  }
  getNodePosition(id) {
    return this._nodes.get(id);
  }
  nodeIds() {
    return this._nodes.keys();
  }
  nearestNode(x, y) {
    let bestId = "";
    let bestDist = Infinity;
    for (const [id, pos] of this._nodes) {
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }
  nearestHarbour(x, y, harbourNames) {
    let bestId = "";
    let bestDist = Infinity;
    for (const name of harbourNames) {
      const pos = this._nodes.get(name);
      if (!pos)
        continue;
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < bestDist) {
        bestDist = d;
        bestId = name;
      }
    }
    return bestId;
  }
  findShortestPath(from, to) {
    if (!this._nodes.has(from) || !this._nodes.has(to))
      return null;
    if (from === to)
      return { path: [from], totalDistance: 0 };
    const dist = new Map;
    const prev = new Map;
    const queue = [];
    for (const id of this._nodes.keys()) {
      dist.set(id, Infinity);
    }
    dist.set(from, 0);
    queue.push(from);
    while (queue.length > 0) {
      queue.sort((a, b) => dist.get(a) - dist.get(b));
      const current = queue.shift();
      if (current === to)
        break;
      const neighbors = this._adj.get(current);
      if (!neighbors)
        continue;
      const currentDist = dist.get(current);
      for (const { id: neighbor, distance } of neighbors) {
        const alt = currentDist + distance;
        if (alt < dist.get(neighbor)) {
          dist.set(neighbor, alt);
          prev.set(neighbor, current);
          if (!queue.includes(neighbor))
            queue.push(neighbor);
        }
      }
    }
    if (!prev.has(to) && from !== to)
      return null;
    const path = [];
    let node = to;
    while (node !== undefined) {
      path.push(node);
      node = prev.get(node);
    }
    path.reverse();
    return { path, totalDistance: dist.get(to) };
  }
}

// src/ts/persistence/SaveGameManager.ts
var SAVEGAME_KEY = "hanse2.savegame";
var INTRO_SEEN_KEY = "hanse2.intro-seen";
var SAVEGAME_VERSION = 1;
var AUTOSAVE_INTERVAL_MS = 15000;

class SaveGameManager {
  static _autosaveTimer = null;
  static _detachLifecycle = null;
  static hasSave() {
    return !!localStorage.getItem(SAVEGAME_KEY);
  }
  static load() {
    const raw = localStorage.getItem(SAVEGAME_KEY);
    if (!raw)
      return null;
    try {
      const parsed = JSON.parse(raw);
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
  static clearSave() {
    localStorage.removeItem(SAVEGAME_KEY);
  }
  static hasSeenIntro() {
    return localStorage.getItem(INTRO_SEEN_KEY) === "true";
  }
  static markIntroSeen() {
    localStorage.setItem(INTRO_SEEN_KEY, "true");
  }
  static saveWorld(world) {
    const saveData = this.serializeWorld(world);
    if (!saveData)
      return false;
    localStorage.setItem(SAVEGAME_KEY, JSON.stringify(saveData));
    return true;
  }
  static restoreWorld(world, saveData) {
    const registry = GoodsRegistry.getInstance();
    GameTime.getInstance().setElapsedRealSeconds(saveData.elapsedRealSeconds);
    const playerCompany = world.query(Merchant, Gold, IsPlayerOwned)[0];
    const playerShip = world.query(Ship, PlayerControlled, Position, Inventory)[0];
    if (playerCompany) {
      const gold = playerCompany.getComponent(Gold);
      if (gold)
        gold.amount = saveData.playerCompany.gold;
    }
    if (playerShip) {
      const position = playerShip.getComponent(Position);
      const gold = playerShip.getComponent(Gold);
      const inventory = playerShip.getComponent(Inventory);
      if (position) {
        position.x = saveData.playerShip.position.x;
        position.y = saveData.playerShip.position.y;
      }
      if (gold)
        gold.amount = saveData.playerShip.gold;
      if (inventory)
        this.restoreInventory(inventory, saveData.playerShip.inventory, registry);
      playerShip.removeComponent(TravelRoute);
      playerShip.removeComponent(NavigationPath);
      if (saveData.playerShip.navigationPath) {
        const navigationPath = new NavigationPath(saveData.playerShip.navigationPath.waypoints);
        navigationPath.currentIndex = saveData.playerShip.navigationPath.currentIndex;
        playerShip.addComponent(navigationPath);
      }
      if (saveData.playerShip.travelRoute) {
        const travelRoute = new TravelRoute(saveData.playerShip.travelRoute.origin, saveData.playerShip.travelRoute.destination);
        travelRoute.progress = saveData.playerShip.travelRoute.progress;
        playerShip.addComponent(travelRoute);
      }
    }
    const kontorsByName = new Map(world.query(Kontor, Name, Inventory).map((entity) => [entity.getComponent(Name)?.value, entity]));
    for (const savedKontor of saveData.kontors) {
      const entity = kontorsByName.get(savedKontor.name);
      if (!entity)
        continue;
      const inventory = entity.getComponent(Inventory);
      const gold = entity.getComponent(Gold);
      if (inventory)
        this.restoreInventory(inventory, savedKontor.inventory, registry);
      if (gold)
        gold.amount = savedKontor.gold;
    }
    const citiesByName = new Map(world.query(City, Name, Market2).map((entity) => [entity.getComponent(Name)?.value, entity]));
    for (const savedCity of saveData.cities) {
      const entity = citiesByName.get(savedCity.name);
      if (!entity)
        continue;
      const gold = entity.getComponent(Gold);
      const market = entity.getComponent(Market2);
      if (gold)
        gold.amount = savedCity.gold;
      if (!market)
        continue;
      for (const [goodName, marketEntry] of Object.entries(savedCity.market)) {
        const good = registry.getGood(goodName);
        if (!good)
          continue;
        market.update(good, {
          supply: marketEntry.supply,
          demandFactor: marketEntry.demandFactor
        });
      }
    }
  }
  static startAutosave(world) {
    this.stopAutosave();
    this._autosaveTimer = window.setInterval(() => {
      this.saveWorld(world);
    }, AUTOSAVE_INTERVAL_MS);
    const onPageHide = () => {
      this.saveWorld(world);
    };
    const onVisibilityChange = () => {
      if (document.hidden)
        this.saveWorld(world);
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    this._detachLifecycle = () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }
  static stopAutosave() {
    if (this._autosaveTimer !== null) {
      window.clearInterval(this._autosaveTimer);
      this._autosaveTimer = null;
    }
    this._detachLifecycle?.();
    this._detachLifecycle = null;
  }
  static serializeWorld(world) {
    const playerCompany = world.query(Merchant, Gold, IsPlayerOwned)[0];
    const playerShip = world.query(Ship, PlayerControlled, Position, Inventory)[0];
    if (!playerCompany || !playerShip)
      return null;
    const playerCompanyGold = playerCompany.getComponent(Gold);
    const shipPosition = playerShip.getComponent(Position);
    const shipGold = playerShip.getComponent(Gold);
    const shipInventory = playerShip.getComponent(Inventory);
    const travelRoute = playerShip.getComponent(TravelRoute);
    const navigationPath = playerShip.getComponent(NavigationPath);
    if (!playerCompanyGold || !shipPosition || !shipGold || !shipInventory)
      return null;
    return {
      version: SAVEGAME_VERSION,
      savedAt: new Date().toISOString(),
      elapsedRealSeconds: GameTime.getInstance().elapsedRealSeconds,
      playerCompany: {
        gold: playerCompanyGold.amount
      },
      playerShip: {
        position: { x: shipPosition.x, y: shipPosition.y },
        gold: shipGold.amount,
        inventory: this.serializeInventory(shipInventory),
        travelRoute: travelRoute ? {
          origin: { ...travelRoute.origin },
          destination: { ...travelRoute.destination },
          progress: travelRoute.progress
        } : null,
        navigationPath: navigationPath ? {
          waypoints: navigationPath.waypoints.map((waypoint) => ({ ...waypoint })),
          currentIndex: navigationPath.currentIndex
        } : null
      },
      kontors: world.query(Kontor, Name, Inventory).map((entity) => ({
        name: entity.getComponent(Name)?.value ?? "Kontor",
        gold: entity.getComponent(Gold)?.amount ?? 0,
        inventory: this.serializeInventory(entity.getComponent(Inventory))
      })),
      cities: world.query(City, Name, Market2).map((entity) => ({
        name: entity.getComponent(Name)?.value ?? "City",
        gold: entity.getComponent(Gold)?.amount ?? 0,
        market: this.serializeMarket(entity.getComponent(Market2))
      }))
    };
  }
  static serializeInventory(inventory) {
    const data = {};
    for (const [good, quantity] of inventory.entries()) {
      if (quantity > 0)
        data[good.name] = quantity;
    }
    return data;
  }
  static restoreInventory(inventory, serialized, registry) {
    for (const [goodName, quantity] of Object.entries(serialized)) {
      const good = registry.getGood(goodName);
      if (!good || quantity <= 0)
        continue;
      inventory.add(good, quantity);
    }
  }
  static serializeMarket(market) {
    const data = {};
    for (const [good, entry] of market.goods()) {
      data[good.name] = {
        supply: entry.supply,
        demandFactor: entry.demandFactor
      };
    }
    return data;
  }
}

// src/ts/setup.ts
var canvas = document.getElementById("world-map");
var engine = Engine.getInstance();
var world = engine.world;
var renderSystem = new MapRenderSystem(canvas);
world.addTickSystem(new GameTimeSystem).addTickSystem(new MovementSystem).addTickSystem(new MarketSystem).addTickSystem(renderSystem);
var tradeSystem = new TradeSystem;
tradeSystem.world = world;
async function initWorld(saveGame = null) {
  const [mapData, registry, citiesRes] = await Promise.all([
    loadMapData(),
    GoodsRegistry.load(),
    fetch("/assets/data/cities.json").then((r) => r.json())
  ]);
  const graph = new NavigationGraph(mapData);
  renderSystem.graph = graph;
  renderSystem.harbourNames = Object.keys(mapData.harbour);
  SpriteManager.getInstance().loadGoodIcons(registry.getAllGoods());
  const allGoods = registry.getAllGoods();
  for (const [name, pos] of Object.entries(mapData.harbour)) {
    const citizens = citiesRes.citizens[name] ?? 500;
    const prodData = citiesRes.production[name] ?? {};
    const multipliers = new Map(Object.entries(prodData));
    const marketEntries = allGoods.map((good) => [
      good,
      { basePrice: good.buyPrice, supply: demandAlgorithm(good, citizens) * (6 * Math.random()), demand: NaN }
    ]);
    const city = new Entity().addComponent(new Position(pos.x, pos.y)).addComponent(new Name(name)).addComponent(new City(citizens)).addComponent(new Gold(1e4)).addComponent(new CityProduction(citizens, multipliers)).addComponent(new Market2(marketEntries));
    world.addEntity(city);
  }
  const startPos = mapData.harbour["Lübeck"];
  const playerCompany = new Entity().addComponent(new Name("Hanse Trading Company")).addComponent(new Merchant("Hanse Trading Company")).addComponent(new IsPlayerOwned(true)).addComponent(new Gold(1500));
  world.addEntity(playerCompany);
  const playerShip = new Entity().addComponent(new Position(startPos.x, startPos.y)).addComponent(new Name("Adler von Lübeck")).addComponent(new Ship(250, 0.025)).addComponent(new Gold(0)).addComponent(new Inventory).addComponent(new PlayerControlled);
  world.addEntity(playerShip);
  const kontorLuebeck = new Entity().addComponent(new Position(startPos.x, startPos.y)).addComponent(new Name("Kontor Lübeck")).addComponent(new Kontor(250)).addComponent(new IsPlayerOwned(true)).addComponent(new Inventory).addComponent(new Gold(0));
  world.addEntity(kontorLuebeck);
  const shadowProducer = new Entity().addComponent(new ShadowProducer).addComponent(new Gold(1e6)).addComponent(new Inventory);
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
    const shipPos = playerShip.getComponent(Position);
    const currentCity = world.query(City, Position, Name).find((entity) => {
      const cityPos = entity.getComponent(Position);
      return Math.abs(cityPos.x - shipPos.x) < 0.001 && Math.abs(cityPos.y - shipPos.y) < 0.001;
    });
    hud.setOnSeaState(false);
    hud.updateCityInfo(currentCity?.getComponent(Name)?.value ?? "Lübeck", currentCity?.getComponent(City)?.population ?? citiesRes.citizens["Lübeck"] ?? 500);
  }
}
var setup_default = engine;

// src/ts/Inspector.ts
function getOverview() {
  const world2 = Engine.getInstance().world;
  const cities = world2.query(City, Market2, Name);
  const cityMoney = cities.map((city) => ({
    city: city.getComponent(Name).value,
    gold: Math.round(city.getComponent(Gold)?.amount ?? 0)
  })).sort((a2, b) => b.gold - a2.gold);
  const goodsMap = new Map;
  for (const city of cities) {
    const market = city.getComponent(Market2);
    const cityName = city.getComponent(Name).value;
    const registry = GoodsRegistry.getInstance();
    for (const [good, entry] of market.goods()) {
      if (!(entry.demand > 0))
        continue;
      let row = goodsMap.get(good.name);
      if (!row) {
        row = { good: good.name, totalSupply: 0, totalDemand: 0, globalProduction: 0, topSurplus: [], bottomStock: [] };
        goodsMap.set(good.name, row);
      }
      row.totalSupply += entry.supply;
      row.totalDemand += entry.demand;
      const production = city.getComponent(CityProduction);
      const multiplier = production?.multipliers.get(good.name) ?? 0;
      const baseProd = registry.getBaseProduction(good.name);
      const citizens = production?.citizens ?? 0;
      row.globalProduction += baseProd * (citizens / 10) * multiplier * DAYS_PER_WEEK;
      row.topSurplus.push({
        city: cityName,
        supply: Math.round(entry.supply * 10) / 10,
        demand: Math.round(entry.demand * 10) / 10,
        surplus: Math.round((entry.supply - entry.demand) * 10) / 10
      });
    }
  }
  const goods = [...goodsMap.values()].map((row) => {
    const sorted = [...row.topSurplus].sort((a2, b) => b.surplus - a2.surplus);
    return {
      good: row.good,
      totalSupply: Math.round(row.totalSupply * 10) / 10,
      totalDemand: Math.round(row.totalDemand * 10) / 10,
      globalProduction: Math.round(row.globalProduction * 10) / 10,
      topSurplus: sorted.slice(0, 2),
      bottomStock: sorted.slice(-2).reverse()
    };
  }).sort((a2, b) => a2.good.localeCompare(b.good));
  const overview = {
    timestamp: new Date().toISOString(),
    cityMoney,
    goods
  };
  const json = JSON.stringify(overview, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hanse-overview-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log("[Inspector] Overview downloaded.", overview);
}
var Inspector = { getOverview };
window["Inspector"] = Inspector;

// src/ts/audio/AudioManager.ts
var SOUND_MANIFEST = {
  Deus_Maris: "/assets/sounds/Deus_Maris_Variation.mp3"
};

class AudioManager {
  static _instance = null;
  _elements = new Map;
  _masterVolume = 1;
  constructor() {}
  static getInstance() {
    return AudioManager._instance ??= new AudioManager;
  }
  async preloadAll() {
    const entries = Object.entries(SOUND_MANIFEST);
    await Promise.all(entries.map(([id, url]) => this._preloadOne(id, url)));
  }
  _preloadOne(id, url) {
    return new Promise((resolve) => {
      const el = new Audio(url);
      el.preload = "auto";
      el.volume = this._masterVolume;
      this._elements.set(id, el);
      const cleanup = () => {
        el.removeEventListener("canplaythrough", onReady);
        el.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        console.warn(`[AudioManager] Preload error for "${id}" (${url}):`, el.error?.message ?? "unknown");
        resolve();
      };
      el.addEventListener("canplaythrough", onReady, { once: true });
      el.addEventListener("error", onError, { once: true });
      el.load();
    });
  }
  play(id, volume = 1) {
    const el = this._elements.get(id);
    if (!el)
      return;
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, this._masterVolume * volume));
    el.play().catch((err) => {
      console.warn(`[AudioManager] play("${id}") failed:`, err);
    });
  }
  stop(id) {
    const el = this._elements.get(id);
    if (!el)
      return;
    el.pause();
    el.currentTime = 0;
  }
  setMasterVolume(value) {
    this._masterVolume = Math.max(0, Math.min(1, value));
    for (const el of this._elements.values()) {
      el.volume = this._masterVolume;
    }
  }
  get masterVolume() {
    return this._masterVolume;
  }
  isLoaded(id) {
    return this._elements.has(id);
  }
}

// src/ts/intro.ts
var SLIDES = [
  { text: `Northern Europe
1241 AD`, hold: 2600 },
  { text: "", hold: 150 },
  { text: "The Hanseatic League binds the merchant cities of the Baltic coast.", hold: 3700, triggerSound: "Deus_Maris" },
  { text: `From Lübeck they sail north and east,
carrying grain, timber, cloth, and fur.`, hold: 3500 },
  { text: `But the League is a closed club, 
a secret society of powerful merchants.`, hold: 3500 },
  { text: "A network of alliances, favors, and debts keeps the outsiders out.", hold: 3500 },
  { text: "Yet still...", hold: 1500 },
  { text: `... are you a young merchant with one ship,
a little gold, and great ambition.`, hold: 3700 },
  { text: "Set sail, young merchant!", hold: 2000 },
  { text: "The Baltic awaits.", hold: 2000 }
];
var FADE_MS = 500;
function runIntroSequence() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("intro-seq");
    overlay.innerHTML = "";
    overlay.classList.remove("hidden");
    const skipBtn = document.createElement("button");
    skipBtn.textContent = "Skip Intro";
    skipBtn.className = "intro-skip";
    overlay.appendChild(skipBtn);
    const captionContainer = document.createElement("div");
    captionContainer.className = "intro-captions-container";
    overlay.appendChild(captionContainer);
    let done = false;
    function finish() {
      if (done)
        return;
      done = true;
      overlay.classList.add("hidden");
      resolve();
    }
    skipBtn.addEventListener("click", () => {
      AudioManager.getInstance().stop("Deus_Maris");
      overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = finish;
    });
    let index = 0;
    let previousKeep = false;
    function runSlide() {
      if (done)
        return;
      if (index >= SLIDES.length) {
        overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS * 1.5, fill: "forwards", easing: "ease-in" }).onfinish = finish;
        return;
      }
      const { text, hold = 2500, triggerSound, keep = false } = SLIDES[index];
      if (!previousKeep) {
        captionContainer.innerHTML = "";
      }
      const caption = document.createElement("p");
      caption.className = "intro-caption";
      caption.textContent = text;
      captionContainer.appendChild(caption);
      if (triggerSound) {
        AudioManager.getInstance().play(triggerSound);
      }
      caption.animate([
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" }
      ], { duration: FADE_MS, fill: "forwards", easing: "ease-out" }).onfinish = () => {
        if (done)
          return;
        setTimeout(() => {
          if (done)
            return;
          if (!keep) {
            caption.animate([
              { opacity: 1, transform: "translateY(0)" },
              { opacity: 0, transform: "translateY(-10px)" }
            ], { duration: FADE_MS, fill: "forwards", easing: "ease-in" }).onfinish = () => {
              previousKeep = keep;
              index++;
              runSlide();
            };
          } else {
            previousKeep = keep;
            index++;
            runSlide();
          }
        }, hold);
      };
    }
    overlay.style.opacity = "0";
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: "forwards", easing: "ease-out" }).onfinish = runSlide;
  });
}

// src/ts/entry.ts
var introScreen = document.getElementById("intro");
var loadingScreen = document.getElementById("loading-screen");
var gameScreen = document.getElementById("game");
var launchButton = document.getElementById("launch-game");
var newVoyageButton = document.getElementById("new-voyage");
var loadingStatus = document.getElementById("loading-status");
var loadingProgress = document.getElementById("loading-progress");
var isBooting = false;
function setIntroActive(isActive) {
  document.body.classList.toggle("intro-active", isActive);
}
function updateLoadingText(progress, fallbackLabel) {
  if (loadingStatus) {
    loadingStatus.textContent = progress?.label ?? fallbackLabel;
  }
  if (loadingProgress) {
    loadingProgress.textContent = progress ? `${progress.loaded}/${progress.total} resources ready` : "Preparing resources...";
  }
}
function refreshStartMenu() {
  const hasSave = SaveGameManager.hasSave();
  if (launchButton) {
    launchButton.textContent = hasSave ? "Resume Voyage" : "Set Sail";
  }
  newVoyageButton?.classList.toggle("hidden", !hasSave);
}
async function bootGame(options) {
  if (isBooting)
    return;
  isBooting = true;
  launchButton?.setAttribute("disabled", "true");
  newVoyageButton?.setAttribute("disabled", "true");
  try {
    document.body.requestFullscreen?.();
    const saveData = options.resume ? SaveGameManager.load() : null;
    if (!options.resume) {
      SaveGameManager.clearSave();
    }
    introScreen.classList.add("hidden");
    loadingScreen.classList.remove("hidden");
    updateLoadingText(null, options.resume ? "Restoring your last voyage..." : "Preparing a new voyage...");
    let latestProgress = null;
    const preloadPromise = Promise.all([
      AudioManager.getInstance().preloadAll(),
      preloadStartupAssets((progress) => {
        latestProgress = progress;
        updateLoadingText(progress, options.resume ? "Restoring your last voyage..." : "Preparing a new voyage...");
      })
    ]);
    const initWorldPromise = initWorld(saveData);
    await Promise.all([preloadPromise, initWorldPromise]);
    loadingScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    renderSystem.renderOnce();
    if (!options.resume || !SaveGameManager.hasSeenIntro()) {
      SaveGameManager.markIntroSeen();
      setIntroActive(true);
      try {
        await runIntroSequence();
      } finally {
        setIntroActive(false);
      }
    }
    setup_default.start();
    SaveGameManager.startAutosave(setup_default.world);
    SaveGameManager.saveWorld(setup_default.world);
    isBooting = false;
  } catch (error) {
    console.error(error);
    loadingScreen.classList.add("hidden");
    gameScreen.classList.add("hidden");
    introScreen.classList.remove("hidden");
    if (loadingStatus) {
      loadingStatus.textContent = "Failed to start the voyage.";
    }
    if (loadingProgress) {
      loadingProgress.textContent = error instanceof Error ? error.message : "Unknown startup error";
    }
    launchButton?.removeAttribute("disabled");
    newVoyageButton?.removeAttribute("disabled");
    isBooting = false;
    refreshStartMenu();
    return;
  }
}
launchButton?.addEventListener("click", async () => {
  await bootGame({ resume: SaveGameManager.hasSave() });
});
newVoyageButton?.addEventListener("click", async () => {
  await bootGame({ resume: false });
});
refreshStartMenu();
