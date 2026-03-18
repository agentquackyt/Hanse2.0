import type { Entity } from "../ecs/Entity";
import type { World } from "../ecs/Engine";
import { City, CityFacilities, CityGovernance, CityTreasury, Market, Name, Inventory, Ship, ShipType, Gold, CityProduction, Kontor, PlayerControlled, IsPlayerOwned, PlayerIsMayor, type TradeGood, Position, TravelRoute, ShipBuildOrder } from "../gameplay/components";
import type { MayorSystem, TradeSystem } from "../gameplay/systems";
import { GoodsRegistry, type ShipTypeConfig } from "../gameplay/GoodsRegistry";
import type { ShipClassName } from "../gameplay/components/identity";
import { demandAlgorithm } from "../gameplay/algorithms/EconomyAlgorithms";
import { SatisfactionAlgorithm, SatisfactionLevel, GROWTH_BASE_PER_WEEK } from "../gameplay/algorithms/SatisfactionAlgorithm";
import { GameTime, REAL_SECONDS_PER_DAY } from "../gameplay/GameTime";
import { Entity as EntityClass } from "../ecs/Entity";
import { MAYOR_POPULATION_GOLD_COST, MAYOR_POPULATION_GAIN } from "../gameplay/systems";
import { ELECTION_FEE_GOLD } from "../gameplay/systems";

/** Map a slider value (0–100) to a quantity via log scale. */
function sliderQty(v: number, maxQty: number): number {
    if (v === 0 || maxQty <= 0) return 0;
    const abs = Math.abs(v);
    return Math.min(maxQty, Math.max(1, Math.round(Math.expm1(Math.log1p(maxQty) * abs / 100))));
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export class HUDcontroller {
    private _hudElement: HTMLElement | null;
    private _cityNameElement: HTMLElement;
    private _citizensElement: HTMLElement;
    private _playtimeElement: HTMLElement;
    private _wealthElement: HTMLElement;
    private _isShowingModal: boolean = false;
    private _isOnSea: boolean = false;
    private _tradeSystem: TradeSystem | null = null;
    private _mayorSystem: MayorSystem | null = null;
    private _playerShip: Entity | null = null;
    private _playerCompany: Entity | null = null;
    private _world: World | null = null;
    private _activeModalRefresh: (() => void) | null = null;
    private _activeModalRealtimeRefresh: (() => void) | null = null;
    private _shipPanelName: HTMLElement;
    private _shipPanelType: HTMLElement;
    private _shipPanelPort: HTMLElement;
    private _shipPanelCargo: HTMLElement;
    private _shipPanelCargoFill: HTMLElement;
    private _shipPanelInventoryCount: HTMLElement;
    private _shipPanelInventory: HTMLElement;
    private _shipPanelEmpty: HTMLElement;
    static _instance: any;

    private constructor() {
        this._hudElement = document.getElementById("hud");
        this._cityNameElement = document.querySelector(".hub-info-city") as HTMLElement;
        this._citizensElement = document.querySelector(".hub-info-city-citizens") as HTMLElement;
        this._playtimeElement = document.querySelector(".hub-info-playtime") as HTMLElement;
        this._wealthElement = document.querySelector(".hub-info-wealth-value") as HTMLElement;
        this._shipPanelName = document.querySelector(".ship-panel-name") as HTMLElement;
        this._shipPanelType = document.querySelector(".ship-panel-type") as HTMLElement;
        this._shipPanelPort = document.querySelector(".ship-panel-port") as HTMLElement;
        this._shipPanelCargo = document.querySelector(".ship-panel-cargo") as HTMLElement;
        this._shipPanelCargoFill = document.querySelector(".ship-panel-cargo-fill") as HTMLElement;
        this._shipPanelInventoryCount = document.querySelector(".ship-panel-inventory-count") as HTMLElement;
        this._shipPanelInventory = document.querySelector(".ship-panel-inventory") as HTMLElement;
        this._shipPanelEmpty = document.querySelector(".ship-panel-empty") as HTMLElement;
    }

    public static getInstance(): HUDcontroller {
        if (!HUDcontroller._instance) {
            HUDcontroller._instance = new HUDcontroller();
        }
        return HUDcontroller._instance;
    }

    public setTradeSystem(ts: TradeSystem): void {
        this._tradeSystem = ts;
    }

    public setMayorSystem(ms: MayorSystem): void {
        this._mayorSystem = ms;
    }

    public setPlayerShip(ship: Entity): void {
        this._playerShip = ship;
    }

    public setPlayerCompany(company: Entity): void {
        this._playerCompany = company;
        this._refreshHudWealth();
    }

    public setWorld(world: World): void {
        this._world = world;
    }

    public updateGameTime(label: string): void {
        if (this._playtimeElement) {
            this._playtimeElement.textContent = label;
        }
        this._activeModalRealtimeRefresh?.();
    }

    private _refreshActiveShipPanel(): void {
        if (this._playerShip && this._world) {
            this.updateShipPanel(this._playerShip, this._world);
        }
    }

    private _getPlayerCompanyGold(): Gold | null {
        return this._playerCompany?.getComponent(Gold) ?? null;
    }

    private _resolveEndpointGold(endpoint: Entity | null): Gold | null {
        if (endpoint?.hasComponent(PlayerControlled) || endpoint?.hasComponent(IsPlayerOwned)) {
            return this._getPlayerCompanyGold() ?? endpoint.getComponent(Gold) ?? null;
        }
        return endpoint?.getComponent(Gold) ?? null;
    }

    private _refreshHudWealth(): void {
        const gold = this._getPlayerCompanyGold() ?? this._playerShip?.getComponent(Gold) ?? null;
        if (gold && this._wealthElement) {
            this._wealthElement.textContent = `${gold.amount}£`;
        }
    }

    /** Called after any data mutation (trade, production tick) to refresh HUD + open modal. */
    public notifyDataChange(): void {
        this._refreshHudWealth();
        this._refreshActiveShipPanel();
        // Refresh the open modal if any.
        this._activeModalRefresh?.();
    }

    public updateCityInfo(cityName: string, citizens: number) {
        if (this._isOnSea) return;
        this._cityNameElement?.classList.remove("on-sea");
        this._citizensElement?.classList.remove("on-sea");
        if (this._cityNameElement) this._cityNameElement.textContent = cityName;
        if (this._citizensElement) this._citizensElement.textContent = `${citizens} citizens`;
        this._refreshHudWealth();
        this._refreshActiveShipPanel();
    }

    public updateOnSeaInfo(ship: Entity): void {
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
        if (ship === this._playerShip) {
            this._refreshActiveShipPanel();
        }
    }

    public setOnSeaState(isOnSea: boolean): void {
        this._isOnSea = isOnSea;
    }

    // ------------------------------------------------------------------ Modal

    public createCityOverviewModal(city: Entity, dockedShips: Entity[], selectedShip: Entity | null, kontorEntity: Entity | null): void {
        // Remove any existing modal.
        document.querySelector(".modal:not(.hidden)")?.remove();
        this._activeModalRefresh = null;
        this._activeModalRealtimeRefresh = null;

        const cityComp = city.getComponent(City);
        const nameComp = city.getComponent(Name);
        const market = city.getComponent(Market);
        const cityTreasury = city.getComponent(CityTreasury);
        const production = city.getComponent(CityProduction);
        const governance = city.getComponent(CityGovernance);
        if (!cityComp || !nameComp) return;

        const registry = GoodsRegistry.getInstance();
        const allGoods = registry.getAllGoods();

        type EndpointKind = "harbor" | "ship" | "kontor";
        type EndpointId = "harbor" | "kontor" | `ship:${string}`;
        interface EndpointOption {
            id: EndpointId;
            kind: EndpointKind;
            label: string;
            entity: Entity | null;
        }

        const endpointOptions: EndpointOption[] = [
            { id: "harbor", kind: "harbor", label: "Harbor", entity: city },
            ...dockedShips.map(ship => ({
                id: `ship:${ship.id}` as const,
                kind: "ship" as const,
                label: ship.getComponent(Name)?.value ?? `Ship ${ship.id}`,
                entity: ship,
            })),
            ...(kontorEntity ? [{ id: "kontor" as const, kind: "kontor" as const, label: "Kontor", entity: kontorEntity }] : []),
        ];

        const defaultShipEndpointId = selectedShip ? (`ship:${selectedShip.id}` as const) : null;
        const firstNonHarborEndpointId = endpointOptions.find(option => option.kind !== "harbor")?.id ?? "harbor";

        let leftEndpointId: EndpointId = "harbor";
        let rightEndpointId: EndpointId = defaultShipEndpointId ?? (kontorEntity ? "kontor" : firstNonHarborEndpointId);

        const cleanupCallbacks: Array<() => void> = [];

        const getEndpoint = (id: EndpointId): EndpointOption =>
            endpointOptions.find(option => option.id === id) ?? endpointOptions[0]!;

        const isHarborEndpoint = (id: EndpointId): boolean => getEndpoint(id).kind === "harbor";
        const isShipEndpoint = (id: EndpointId): boolean => getEndpoint(id).kind === "ship";
        const isKontorEndpoint = (id: EndpointId): boolean => getEndpoint(id).kind === "kontor";

        const getEndpointInventory = (id: EndpointId): Inventory | null =>
            getEndpoint(id).entity?.getComponent(Inventory) ?? null;

        const getEndpointGold = (id: EndpointId): Gold | null =>
            this._resolveEndpointGold(getEndpoint(id).entity);

        const getEndpointCapacity = (id: EndpointId): number => {
            if (isShipEndpoint(id)) {
                const shipComp = getEndpoint(id).entity?.getComponent(Ship);
                return shipComp ? shipComp.cargoCapacity : Infinity;
            }
            if (isKontorEndpoint(id)) {
                const kontorComp = kontorEntity?.getComponent(Kontor);
                return kontorComp ? kontorComp.capacity : Infinity;
            }
            return Infinity;
        };

        const getEndpointFreeCapacity = (id: EndpointId): number => {
            if (isHarborEndpoint(id)) return Infinity;
            const inventory = getEndpointInventory(id);
            return Math.max(0, getEndpointCapacity(id) - (inventory?.totalUnits() ?? 0));
        };

        const getHeldQuantity = (id: EndpointId, good: TradeGood): number => {
            if (isHarborEndpoint(id)) {
                return Math.max(0, Math.floor(market?.getEntry(good)?.supply ?? 0));
            }
            return getEndpointInventory(id)?.get(good) ?? 0;
        };

        const quoteHarborTransfer = (good: TradeGood, quantity: number, _mode: "buy" | "sell"): number => {
            if (!market || quantity <= 0) return 0;
            return market.currentPrice(good) * quantity;
        };

        const getMaxAffordableQty = (good: TradeGood, buyerId: EndpointId, availableQty: number): number => {
            if (isHarborEndpoint(buyerId)) return availableQty;
            const buyerGold = getEndpointGold(buyerId)?.amount ?? 0;
            if (buyerGold <= 0) return 0;

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

        const getSummaryText = (id: EndpointId): string => {
            const option = getEndpoint(id);
            if (option.kind === "harbor") {
                let totalStock = 0;
                if (market) {
                    for (const [, entry] of market.goods()) totalStock += Math.floor(entry.supply);
                }
                return `${option.label}: ${cityTreasury?.amount ?? 0}£ · ${totalStock} stock`;
            }

            const inventory = getEndpointInventory(id);
            const gold = getEndpointGold(id)?.amount ?? 0;
            const capacity = getEndpointCapacity(id);
            const units = inventory?.totalUnits() ?? 0;
            return `${option.label}: ${gold}£ · ${units}/${capacity === Infinity ? "∞" : capacity} cargo`;
        };

        const getDirectionalMode = (sourceId: EndpointId, targetId: EndpointId): "trade-buy" | "trade-sell" | "transfer" | "none" => {
            if (sourceId === targetId) return "none";
            if (isHarborEndpoint(sourceId) && !isHarborEndpoint(targetId)) return "trade-buy";
            if (!isHarborEndpoint(sourceId) && isHarborEndpoint(targetId)) return "trade-sell";
            if (!isHarborEndpoint(sourceId) && !isHarborEndpoint(targetId)) return "transfer";
            return "none";
        };

        const getMaxDirectionalQty = (good: TradeGood, sourceId: EndpointId, targetId: EndpointId): number => {
            if (sourceId === targetId) return 0;

            const sourceQty = getHeldQuantity(sourceId, good);
            if (sourceQty <= 0) return 0;

            const targetCapacity = getEndpointFreeCapacity(targetId);
            let maxQty = Math.min(sourceQty, targetCapacity);

            if (isHarborEndpoint(sourceId) && !isHarborEndpoint(targetId)) {
                maxQty = Math.min(maxQty, getMaxAffordableQty(good, targetId, sourceQty));
            }

            return Math.max(0, maxQty);
        };

        const getDirectionalQuote = (good: TradeGood, quantity: number, sourceId: EndpointId, targetId: EndpointId): number => {
            const mode = getDirectionalMode(sourceId, targetId);
            if (mode === "trade-buy") return quoteHarborTransfer(good, quantity, "buy");
            if (mode === "trade-sell") return quoteHarborTransfer(good, quantity, "sell");
            return 0;
        };

        const executeDirectionalTransfer = (good: TradeGood, quantity: number, sourceId: EndpointId, targetId: EndpointId): boolean => {
            if (quantity <= 0 || sourceId === targetId) return false;

            const mode = getDirectionalMode(sourceId, targetId);
            const entry = market?.getEntry(good);
            const sourceEntity = getEndpoint(sourceId).entity;
            const targetEntity = getEndpoint(targetId).entity;
            const sourceInv = getEndpointInventory(sourceId);
            const targetInv = getEndpointInventory(targetId);
            const sourceGold = getEndpointGold(sourceId);
            const targetGold = getEndpointGold(targetId);

            if (mode === "trade-buy") {
                if (!entry || !targetInv || !targetGold || !targetEntity || !this._tradeSystem) return false;
                if (entry.supply < quantity) return false;
                if (targetInv.totalUnits() + quantity > getEndpointCapacity(targetId)) return false;

                const before = targetInv.get(good);
                this._tradeSystem.handle({
                    direction: "buy",
                    shipId: targetEntity.id,
                    cityId: city.id,
                    good,
                    quantity,
                });
                return targetInv.get(good) > before;
            }

            if (mode === "trade-sell") {
                if (!entry || !sourceInv || !sourceGold || !sourceEntity || !this._tradeSystem) return false;

                const before = sourceInv.get(good);
                this._tradeSystem.handle({
                    direction: "sell",
                    shipId: sourceEntity.id,
                    cityId: city.id,
                    good,
                    quantity,
                });
                return sourceInv.get(good) < before;
            }

            if (mode === "transfer") {
                if (!sourceInv || !targetInv) return false;
                if (targetInv.totalUnits() + quantity > getEndpointCapacity(targetId)) return false;
                if (!sourceInv.remove(good, quantity)) return false;
                targetInv.add(good, quantity);
                return true;
            }

            return false;
        };

        // ---- Build DOM ----
        const modal = document.createElement("div");
        modal.classList.add("modal");

        const win = document.createElement("div");
        win.classList.add("modal-window");

        // ---- Sticky Header (title + X button + tabs) ----
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

        // Close X button
        const closeX = document.createElement("button");
        closeX.classList.add("modal-close-x");
        closeX.textContent = "\u00d7";
        stickyHeader.appendChild(closeX);

        // Tabs
        const tabBar = document.createElement("div");
        tabBar.classList.add("modal-tabs");
        const tabs = ["City", "Production", "Shipyard", "Mayor", "Trade"] as const;
        let activeTab: Lowercase<typeof tabs[number]> = "city";
        const panels: HTMLElement[] = [];

        for (const t of tabs) {
            const btn = document.createElement("button");
            btn.classList.add("modal-tab");
            btn.dataset.tab = t.toLowerCase();
            btn.textContent = t;
            if (t === "City") btn.classList.add("active");
            tabBar.appendChild(btn);
        }
        stickyHeader.appendChild(tabBar);
        win.appendChild(stickyHeader);

        // ---- Scrollable body ----
        const modalBody = document.createElement("div");
        modalBody.classList.add("modal-body");

        // ---- City Panel ----
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
                    <th>Demand / week</th>
                    <th>Price</th>
                </tr>
            </thead>
        `;
        const cityMarketBody = document.createElement("tbody");
        cityMarketTable.appendChild(cityMarketBody);
        cityMarketSection.appendChild(cityMarketTitle);
        cityMarketSection.appendChild(cityMarketTable);
        cityPanel.appendChild(cityMarketSection);

        interface CityMarketRowState {
            stockValue: HTMLSpanElement;
            demandValue: HTMLSpanElement;
            priceValue: HTMLSpanElement;
        }

        const cityMarketStates = new Map<TradeGood, CityMarketRowState>();
        const demandGoods = allGoods
            .filter(good => good.base_demand > 0)
            .sort((a, b) => b.base_demand - a.base_demand || a.name.localeCompare(b.name));

        for (const good of demandGoods) {
            const row = document.createElement("tr");
            row.classList.add("city-market-row");

            const icon = document.createElement("img");
            icon.classList.add("city-market-icon");
            icon.src = `./assets/images/icons/${good.img}`;
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

        const supplyGoods = production
            ? [...production.multipliers.entries()]
                .filter(([, multiplier]) => multiplier > 0)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            : [];

        const satisfactionLevelLabels: Record<SatisfactionLevel, string> = {
            [SatisfactionLevel.NotSatisfied]: "Not Satisfied",
            [SatisfactionLevel.Satisfied]: "Satisfied",
            [SatisfactionLevel.VerySatisfied]: "Very Satisfied",
            [SatisfactionLevel.VeryVerySatisfied]: "Very Satisfied!",
        };

        const refreshCityPanel = () => {
            cityPopulationValue.textContent = `${cityComp.population.toLocaleString()} citizens`;

            if (market) {
                const cached = SatisfactionAlgorithm.getCached(city.id);
                const satisfaction = cached?.satisfaction ?? SatisfactionAlgorithm.calculateSatisfaction(market);
                const level = cached?.level ?? SatisfactionAlgorithm.getSatisfactionLevel(satisfaction);
                citySatisfactionValue.textContent = `${satisfactionLevelLabels[level]} (${Math.round(satisfaction * 100)}%)`;

                const growthPerWeek = cached?.growthPerWeek ?? 0;
                citySatisfactionGrowth.textContent = growthPerWeek > 0
                    ? `+${growthPerWeek} citizens/week`
                    : "No growth";
            }

            for (const [good, state] of cityMarketStates) {
                const marketEntry = market?.getEntry(good);
                const stock = Math.round(marketEntry?.supply ?? 0);
                const weeklyDemand = marketEntry?.demand && marketEntry.demand > 0
                    ? marketEntry.demand
                    : demandAlgorithm(good, cityComp.population);
                const currentPrice = market?.currentPrice(good) ?? 0;
                state.stockValue.textContent = `${stock}`;
                state.demandValue.textContent = weeklyDemand >= 10
                    ? `${Math.round(weeklyDemand)}`
                    : weeklyDemand.toFixed(1);
                state.priceValue.textContent = `${currentPrice} marks`;
            }
        };

        refreshCityPanel();
        panels.push(cityPanel);
        modalBody.appendChild(cityPanel);

        // ---- Production Panel ----
        const prodPanel = document.createElement("div");
        prodPanel.classList.add("modal-panel", "hidden");
        prodPanel.id = "panel-production";

        const productionGrid = document.createElement("div");
        productionGrid.classList.add("production-grid");
        prodPanel.appendChild(productionGrid);

        interface ProductionCardState {
            rateValue: HTMLSpanElement;
            stockValue: HTMLSpanElement;
        }

        const productionStates = new Map<string, ProductionCardState>();

        for (const [goodName] of supplyGoods) {
            const good = registry.getGood(goodName);
            if (!good) continue;

            const card = document.createElement("article");
            card.classList.add("production-card");

            const icon = document.createElement("img");
            icon.classList.add("production-card-icon");
            icon.src = `./assets/images/icons/${good.img}`;
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

        interface FacilitySummary {
            goodName: string;
            weeklyOutput: number;
            treasuryCost: number;
            count: number;
        }

        const getFacilitySummaries = (): FacilitySummary[] => {
            const facilities = city.getComponent(CityFacilities)?.serialize() ?? [];
            const summaries = new Map<string, FacilitySummary>();

            for (const facility of facilities) {
                const current = summaries.get(facility.goodName);
                if (current) {
                    current.weeklyOutput += facility.weeklyOutput;
                    current.treasuryCost += facility.treasuryCost;
                    current.count += 1;
                } else {
                    summaries.set(facility.goodName, {
                        goodName: facility.goodName,
                        weeklyOutput: facility.weeklyOutput,
                        treasuryCost: facility.treasuryCost,
                        count: 1,
                    });
                }
            }

            return [...summaries.values()].sort((a, b) => b.weeklyOutput - a.weeklyOutput || a.goodName.localeCompare(b.goodName));
        };

        const productionFacilitySection = document.createElement("section");
        productionFacilitySection.classList.add("production-facility-section");

        const productionFacilityTitle = document.createElement("h3");
        productionFacilityTitle.classList.add("production-facility-title");
        productionFacilityTitle.textContent = "Production Facilities";

        const productionFacilityGrid = document.createElement("div");
        productionFacilityGrid.classList.add("production-facility-grid");

        const productionFacilityEmptyState = document.createElement("p");
        productionFacilityEmptyState.classList.add("production-empty-state");
        productionFacilityEmptyState.textContent = "No production facilities built yet.";

        productionFacilitySection.appendChild(productionFacilityTitle);
        productionFacilitySection.appendChild(productionFacilityGrid);
        productionFacilitySection.appendChild(productionFacilityEmptyState);
        prodPanel.appendChild(productionFacilitySection);

        interface FacilityCardState {
            outputValue: HTMLSpanElement;
            countValue: HTMLSpanElement;
            costValue: HTMLSpanElement;
        }

        const productionFacilityStates = new Map<string, FacilityCardState>();

        const refreshProductionFacilities = () => {
            const summaries = getFacilitySummaries();
            productionFacilityGrid.innerHTML = "";
            productionFacilityStates.clear();

            const hasFacilities = summaries.length > 0;
            productionFacilitySection.classList.toggle("hidden", !hasFacilities);
            productionFacilityGrid.classList.toggle("hidden", !hasFacilities);
            productionFacilityEmptyState.classList.toggle("hidden", hasFacilities);

            if (!hasFacilities) return;

            for (const summary of summaries) {
                const good = registry.getGood(summary.goodName);
                if (!good) continue;

                const card = document.createElement("article");
                card.classList.add("production-facility-card");

                const icon = document.createElement("img");
                icon.classList.add("production-facility-icon");
                icon.src = `./assets/images/icons/${good.img}`;
                icon.alt = good.name;

                const content = document.createElement("div");
                content.classList.add("production-facility-content");

                const name = document.createElement("h4");
                name.classList.add("production-facility-name");
                name.textContent = good.name;

                const meta = document.createElement("div");
                meta.classList.add("production-facility-meta");

                const outputValue = document.createElement("span");
                outputValue.classList.add("production-facility-chip");
                outputValue.textContent = `+${summary.weeklyOutput.toLocaleString()}/week`;

                const countValue = document.createElement("span");
                countValue.classList.add("production-facility-chip", "production-facility-chip-muted");
                countValue.textContent = summary.count > 1 ? `${summary.count} sites` : "1 site";

                const costValue = document.createElement("span");
                costValue.classList.add("production-facility-chip", "production-facility-chip-muted");
                costValue.textContent = `${summary.treasuryCost.toLocaleString()} gold invested`;

                meta.appendChild(outputValue);
                meta.appendChild(countValue);
                meta.appendChild(costValue);

                content.appendChild(name);
                content.appendChild(meta);
                card.appendChild(icon);
                card.appendChild(content);
                productionFacilityGrid.appendChild(card);

                productionFacilityStates.set(summary.goodName, { outputValue, countValue, costValue });
            }
        };

        // ---- Shipyard containers (placed in own tab panel below) ----
        const shipyardGrid = document.createElement("div");
        shipyardGrid.classList.add("shipyard-grid");

        const shipyardActiveOrder = document.createElement("div");
        shipyardActiveOrder.classList.add("shipyard-active-order");

        const findActiveBuildOrder = (): Entity | null => {
            if (!this._world) return null;
            const orders = this._world.query(ShipBuildOrder);
            return orders.find(e => {
                const order = e.getComponent(ShipBuildOrder)!;
                return order.cityEntityId === city.id && !order.complete;
            }) ?? null;
        };

        let refreshShipyardLive: (() => void) | null = null;

        const buildShipyardCards = () => {
            refreshShipyardLive = null;
            shipyardGrid.innerHTML = "";
            shipyardActiveOrder.innerHTML = "";

            const activeOrderEntity = findActiveBuildOrder();

            if (activeOrderEntity) {
                shipyardGrid.classList.add("hidden");
                const order = activeOrderEntity.getComponent(ShipBuildOrder)!;
                const isBuilding = order.buildStartRealSeconds !== null;

                const progCard = document.createElement("div");
                progCard.classList.add("shipyard-active-card");

                const progHeader = document.createElement("div");
                progHeader.classList.add("shipyard-active-header");
                const shipLabel = document.createElement("h4");
                shipLabel.classList.add("shipyard-active-title");
                shipLabel.textContent = `Building: ${order.shipType}`;
                progHeader.appendChild(shipLabel);
                const badge = document.createElement("span");
                badge.classList.add("shipyard-active-badge");
                badge.textContent = isBuilding ? "Under Construction" : "Gathering Materials";
                progHeader.appendChild(badge);
                progCard.appendChild(progHeader);

                const matsLabel = document.createElement("p");
                matsLabel.classList.add("shipyard-active-section-label");
                matsLabel.textContent = "Materials";
                progCard.appendChild(matsLabel);

                const matGrid = document.createElement("div");
                matGrid.classList.add("shipyard-mat-grid");

                interface MatRef { item: HTMLElement; qtyLabel: HTMLElement; matName: string; }
                const matRefs: MatRef[] = [];

                for (const [matName, required] of order.materialsRequired) {
                    const collected = order.materialsCollected.get(matName) ?? 0;
                    const ok = collected >= required;
                    const good = registry.getGood(matName);
                    const item = document.createElement("div");
                    item.classList.add("shipyard-mat-item", ok ? "shipyard-mat-ok" : "shipyard-mat-short");
                    item.title = `${matName}: ${collected}/${required}`;
                    if (good) {
                        const img = document.createElement("img");
                        img.classList.add("shipyard-mat-icon");
                        img.src = `./assets/images/icons/${good.img}`;
                        img.alt = matName;
                        item.appendChild(img);
                    }
                    const qtyLabel = document.createElement("span");
                    qtyLabel.classList.add("shipyard-mat-qty");
                    qtyLabel.textContent = `${matName} ${collected}/${required}`;
                    item.appendChild(qtyLabel);
                    matGrid.appendChild(item);
                    matRefs.push({ item, qtyLabel, matName });
                }
                progCard.appendChild(matGrid);

                let timeRightEl: HTMLElement | null = null;
                let progressFillEl: HTMLElement | null = null;

                if (isBuilding) {
                    const elapsed = GameTime.getInstance().elapsedRealSeconds - order.buildStartRealSeconds!;
                    const remaining = Math.max(0, order.buildDurationRealSeconds - elapsed);
                    const pct = Math.min(100, (elapsed / order.buildDurationRealSeconds) * 100);

                    const buildSection = document.createElement("div");
                    buildSection.classList.add("shipyard-active-build");
                    const timeRow = document.createElement("div");
                    timeRow.classList.add("shipyard-active-time");
                    const timeLeft = document.createElement("span");
                    timeLeft.textContent = "Construction Progress";
                    timeRightEl = document.createElement("span");
                    timeRightEl.textContent = `${(remaining / REAL_SECONDS_PER_DAY).toFixed(1)} days remaining`;
                    timeRow.appendChild(timeLeft);
                    timeRow.appendChild(timeRightEl);
                    buildSection.appendChild(timeRow);
                    const bar = document.createElement("div");
                    bar.classList.add("shipyard-progress-bar");
                    progressFillEl = document.createElement("div");
                    progressFillEl.classList.add("shipyard-progress-fill");
                    progressFillEl.style.width = `${pct}%`;
                    bar.appendChild(progressFillEl);
                    buildSection.appendChild(bar);
                    progCard.appendChild(buildSection);
                }

                shipyardActiveOrder.appendChild(progCard);

                refreshShipyardLive = () => {
                    const liveOrder = activeOrderEntity.getComponent(ShipBuildOrder);
                    if (!liveOrder || liveOrder.complete) { buildShipyardCards(); return; }
                    const nowBuilding = liveOrder.buildStartRealSeconds !== null;
                    if (nowBuilding !== isBuilding) { buildShipyardCards(); return; }
                    badge.textContent = nowBuilding ? "Under Construction" : "Gathering Materials";
                    for (const { item, qtyLabel, matName } of matRefs) {
                        const required = liveOrder.materialsRequired.get(matName) ?? 0;
                        const collected = liveOrder.materialsCollected.get(matName) ?? 0;
                        const ok = collected >= required;
                        item.classList.toggle("shipyard-mat-ok", ok);
                        item.classList.toggle("shipyard-mat-short", !ok);
                        item.title = `${matName}: ${collected}/${required}`;
                        qtyLabel.textContent = `${matName} ${collected}/${required}`;
                    }
                    if (nowBuilding && liveOrder.buildStartRealSeconds !== null && timeRightEl && progressFillEl) {
                        const elapsed = GameTime.getInstance().elapsedRealSeconds - liveOrder.buildStartRealSeconds;
                        const remaining = Math.max(0, liveOrder.buildDurationRealSeconds - elapsed);
                        timeRightEl.textContent = `${(remaining / REAL_SECONDS_PER_DAY).toFixed(1)} days remaining`;
                        progressFillEl.style.width = `${Math.min(100, (elapsed / liveOrder.buildDurationRealSeconds) * 100)}%`;
                    }
                };
                return;
            }

            shipyardGrid.classList.remove("hidden");
            const allShipTypes = registry.getAllShipTypes();
            const companyGold = this._getPlayerCompanyGold()?.amount ?? 0;

            interface BtnRef { btn: HTMLButtonElement; goldCost: number; }
            const btnRefs: BtnRef[] = [];

            for (const [typeName, cfg] of allShipTypes) {
                const expectedMaterialCost = Object.entries(cfg.materials).reduce((sum, [matName, qty]) => {
                    const good = registry.getGood(matName);
                    if (!good) return sum;
                    const unitPrice = market?.currentPrice(good) ?? good.buyPrice;
                    return sum + unitPrice * qty;
                }, 0);

                const card = document.createElement("article");
                card.classList.add("shipyard-card");

                const name = document.createElement("h4");
                name.classList.add("shipyard-card-name");
                name.textContent = typeName;
                card.appendChild(name);

                const stats = document.createElement("p");
                stats.classList.add("shipyard-card-stats");
                const speedLabel = cfg.speed >= 0.04 ? "Fast" : cfg.speed >= 0.03 ? "Medium" : "Slow";
                stats.innerHTML = `Cargo: ${cfg.capacity} · Speed: ${speedLabel}<br>Cost: ${cfg.goldCost.toLocaleString()}£`;
                card.appendChild(stats);

                const matGrid = document.createElement("div");
                matGrid.classList.add("shipyard-mat-grid");
                for (const [matName, qty] of Object.entries(cfg.materials)) {
                    const good = registry.getGood(matName);
                    const item = document.createElement("div");
                    item.classList.add("shipyard-mat-item");
                    item.title = `${matName}: ${qty}`;
                    if (good) {
                        const img = document.createElement("img");
                        img.classList.add("shipyard-mat-icon");
                        img.src = `./assets/images/icons/${good.img}`;
                        img.alt = matName;
                        item.appendChild(img);
                    }
                    const qtyLabel = document.createElement("span");
                    qtyLabel.classList.add("shipyard-mat-qty");
                    qtyLabel.textContent = `${matName}: ${qty}`;
                    item.appendChild(qtyLabel);
                    matGrid.appendChild(item);
                }
                card.appendChild(matGrid);

                const materialCost = document.createElement("p");
                materialCost.classList.add("shipyard-card-material-cost");
                materialCost.textContent = `Expected material cost: ${Math.round(expectedMaterialCost).toLocaleString()}£`;
                card.appendChild(materialCost);

                const btn = document.createElement("button");
                btn.classList.add("shipyard-order-btn");
                btn.textContent = `Order ${typeName}`;
                btn.disabled = companyGold < cfg.goldCost;
                btn.addEventListener("click", () => {
                    this._placeShipBuildOrder(city, typeName, cfg);
                    buildShipyardCards();
                    this._refreshHudWealth();
                });
                card.appendChild(btn);
                shipyardGrid.appendChild(card);
                btnRefs.push({ btn, goldCost: cfg.goldCost });
            }

            refreshShipyardLive = () => {
                if (findActiveBuildOrder()) { buildShipyardCards(); return; }
                const currentGold = this._getPlayerCompanyGold()?.amount ?? 0;
                for (const { btn, goldCost } of btnRefs) {
                    btn.disabled = currentGold < goldCost;
                }
            };
        };


        const refreshProductionPanel = () => {
            const hasProductionData = !!production && !!market && productionStates.size > 0;
            productionGrid.classList.toggle("hidden", !hasProductionData);
            productionEmptyState.classList.toggle("hidden", hasProductionData);

            if (hasProductionData && production && market) {
                for (const [goodName, state] of productionStates) {
                    const good = registry.getGood(goodName);
                    if (!good) continue;
                    const multiplier = production.multipliers.get(goodName) ?? 0;
                    const baseProd = registry.getBaseProduction(goodName);
                    const weeklyRate = baseProd * (production.citizens / 10) * multiplier;
                    const marketEntry = market.getEntry(good);
                    const weeklyDemand = marketEntry?.demand && marketEntry.demand > 0
                        ? marketEntry.demand
                        : demandAlgorithm(good, production.citizens);
                    const supply = Math.round(marketEntry?.supply ?? 0);
                    state.rateValue.textContent = `${weeklyRate.toFixed(1)}/week`;
                    state.stockValue.textContent = `${supply} stock  (demand ${weeklyDemand}/week)`;
                }
            }

            refreshProductionFacilities();

            const hasAnySection = hasProductionData || productionFacilityStates.size > 0;
            productionEmptyState.classList.toggle("hidden", hasAnySection && !hasProductionData);
        };
        refreshProductionPanel();
        panels.push(prodPanel);
        modalBody.appendChild(prodPanel);

        // ---- Shipyard Panel ----
        const shipyardPanel = document.createElement("div");
        shipyardPanel.classList.add("modal-panel", "hidden");
        shipyardPanel.id = "panel-shipyard";
        shipyardPanel.appendChild(shipyardGrid);
        shipyardPanel.appendChild(shipyardActiveOrder);
        buildShipyardCards();
        panels.push(shipyardPanel);
        modalBody.appendChild(shipyardPanel);

        // ---- Mayor Panel ----
        const mayorPanel = document.createElement("div");
        mayorPanel.classList.add("modal-panel", "hidden");
        mayorPanel.id = "panel-mayor";

        const mayorStatusCard = document.createElement("section");
        mayorStatusCard.classList.add("mayor-card", "mayor-status-card");
        const mayorStatusTitle = document.createElement("h3");
        mayorStatusTitle.classList.add("mayor-card-title");
        mayorStatusTitle.textContent = "Mayor Dashboard";
        const mayorStatusMeta = document.createElement("div");
        mayorStatusMeta.classList.add("mayor-status-meta");

        const mayorTreasuryChip = document.createElement("div");
        mayorTreasuryChip.classList.add("mayor-status-chip");
        const mayorTreasuryLabel = document.createElement("span");
        mayorTreasuryLabel.classList.add("mayor-status-chip-label");
        mayorTreasuryLabel.textContent = "Treasury";
        const mayorTreasuryValue = document.createElement("strong");
        mayorTreasuryValue.classList.add("mayor-status-chip-value");
        mayorTreasuryChip.appendChild(mayorTreasuryLabel);
        mayorTreasuryChip.appendChild(mayorTreasuryValue);

        const mayorOfficeChip = document.createElement("div");
        mayorOfficeChip.classList.add("mayor-status-chip");
        const mayorOfficeLabel = document.createElement("span");
        mayorOfficeLabel.classList.add("mayor-status-chip-label");
        mayorOfficeLabel.textContent = "Office";
        const mayorOfficeValue = document.createElement("strong");
        mayorOfficeValue.classList.add("mayor-status-chip-value");
        mayorOfficeChip.appendChild(mayorOfficeLabel);
        mayorOfficeChip.appendChild(mayorOfficeValue);

        const mayorProjectChip = document.createElement("div");
        mayorProjectChip.classList.add("mayor-status-chip");
        const mayorProjectLabel = document.createElement("span");
        mayorProjectLabel.classList.add("mayor-status-chip-label");
        mayorProjectLabel.textContent = "Facilities";
        const mayorProjectValue = document.createElement("strong");
        mayorProjectValue.classList.add("mayor-status-chip-value");
        mayorProjectChip.appendChild(mayorProjectLabel);
        mayorProjectChip.appendChild(mayorProjectValue);

        mayorStatusMeta.appendChild(mayorTreasuryChip);
        mayorStatusMeta.appendChild(mayorOfficeChip);
        mayorStatusMeta.appendChild(mayorProjectChip);

        const mayorStatusText = document.createElement("p");
        mayorStatusText.classList.add("mayor-status-text");
        const mayorReputationText = document.createElement("p");
        mayorReputationText.classList.add("mayor-reputation-text");
        const mayorElectionText = document.createElement("p");
        mayorElectionText.classList.add("mayor-election-text");
        mayorStatusCard.appendChild(mayorStatusTitle);
        mayorStatusCard.appendChild(mayorStatusMeta);
        mayorStatusCard.appendChild(mayorStatusText);
        mayorStatusCard.appendChild(mayorReputationText);
        mayorStatusCard.appendChild(mayorElectionText);

        const candidacyBtn = document.createElement("button");
        candidacyBtn.classList.add("mayor-action-btn", "mayor-action-btn-wide");
        candidacyBtn.textContent = `Run for mayor (${ELECTION_FEE_GOLD.toLocaleString()} gold)`;
        candidacyBtn.addEventListener("click", () => {
            this._mayorSystem?.handle({
                type: "declare_candidacy",
                cityId: city.id,
            });
        });
        mayorStatusCard.appendChild(candidacyBtn);
        mayorPanel.appendChild(mayorStatusCard);

        const mayorActionsCard = document.createElement("section");
        mayorActionsCard.classList.add("mayor-card", "mayor-actions-card");
        const mayorActionsTitle = document.createElement("h3");
        mayorActionsTitle.classList.add("mayor-card-title");
        mayorActionsTitle.textContent = "Treasury Actions";
        const mayorActionsHint = document.createElement("p");
        mayorActionsHint.classList.add("mayor-actions-hint");
        mayorActionsHint.textContent = "Move funds, invest in population growth, or commission new production facilities.";
        mayorActionsCard.appendChild(mayorActionsTitle);
        mayorActionsCard.appendChild(mayorActionsHint);

        const treasurySummaryGrid = document.createElement("div");
        treasurySummaryGrid.classList.add("treasury-summary-grid");

        const createTreasuryStat = (labelText: string, valueClass: string) => {
            const stat = document.createElement("div");
            stat.classList.add("treasury-stat");
            const label = document.createElement("span");
            label.classList.add("treasury-stat-label");
            label.textContent = labelText;
            const value = document.createElement("strong");
            value.classList.add("treasury-stat-value", valueClass);
            stat.appendChild(label);
            stat.appendChild(value);
            return { stat, value };
        };

        const cityTreasuryStat = createTreasuryStat("City treasury", "is-city");
        const companyTreasuryStat = createTreasuryStat("Your company", "is-company");
        const treasuryAuthorityStat = createTreasuryStat("Authority", "is-authority");

        treasurySummaryGrid.appendChild(cityTreasuryStat.stat);
        treasurySummaryGrid.appendChild(companyTreasuryStat.stat);
        treasurySummaryGrid.appendChild(treasuryAuthorityStat.stat);
        mayorActionsCard.appendChild(treasurySummaryGrid);

        // Treasury Transfer Slider
        const transferSection = document.createElement("section");
        transferSection.classList.add("treasury-transfer-card");

        const transferSectionHeader = document.createElement("div");
        transferSectionHeader.classList.add("treasury-transfer-header");

        const transferSectionTitle = document.createElement("h4");
        transferSectionTitle.classList.add("treasury-transfer-title");
        transferSectionTitle.textContent = "Treasury Transfer";

        const transferSectionMeta = document.createElement("p");
        transferSectionMeta.classList.add("treasury-transfer-meta");
        transferSectionMeta.textContent = "Drag left to pay out to your company, right to deposit funds into the city.";

        transferSectionHeader.appendChild(transferSectionTitle);
        transferSectionHeader.appendChild(transferSectionMeta);
        transferSection.appendChild(transferSectionHeader);

        const transferWrap = document.createElement("div");
        transferWrap.classList.add("treasury-transfer-wrap");

        const transferSliderRow = document.createElement("div");
        transferSliderRow.classList.add("mayor-action-row");

        const transferSlider = document.createElement("div");
        transferSlider.classList.add("trade-slider");

        const sliderLane = document.createElement("div");
        sliderLane.classList.add("trade-slider-lane");

        const fromCityRail = document.createElement("div");
        fromCityRail.classList.add("trade-slider-rail", "trade-slider-rail-sell");
        const toCityRail = document.createElement("div");
        toCityRail.classList.add("trade-slider-rail", "trade-slider-rail-buy");
        const centerMark = document.createElement("div");
        centerMark.classList.add("trade-slider-center");
        const fill = document.createElement("div");
        fill.classList.add("trade-slider-fill");

        const handle = document.createElement("button");
        handle.type = "button";
        handle.classList.add("trade-slider-handle");

        const handleAmount = document.createElement("span");
        handleAmount.classList.add("trade-slider-handle-amount");
        const handleDirection = document.createElement("span");
        handleDirection.classList.add("trade-slider-handle-price");

        handle.appendChild(handleAmount);
        handle.appendChild(handleDirection);
        sliderLane.appendChild(fromCityRail);
        sliderLane.appendChild(toCityRail);
        sliderLane.appendChild(fill);
        sliderLane.appendChild(centerMark);
        sliderLane.appendChild(handle);
        transferSlider.appendChild(sliderLane);
        transferSliderRow.appendChild(transferSlider);
        transferWrap.appendChild(transferSliderRow);

        const transferLegend = document.createElement("div");
        transferLegend.classList.add("treasury-transfer-legend");
        const legendOut = document.createElement("span");
        legendOut.classList.add("treasury-transfer-legend-item", "is-out");
        legendOut.textContent = "City → Company";
        const legendIn = document.createElement("span");
        legendIn.classList.add("treasury-transfer-legend-item", "is-in");
        legendIn.textContent = "Company → City";
        transferLegend.appendChild(legendOut);
        transferLegend.appendChild(legendIn);
        transferWrap.appendChild(transferLegend);

        let transferSliderValue = 0;
        let transferIsDragging = false;
        let lastExecutedValue = 0;
        const maxTransferAmount = 1000000;

        const applyTransferSliderState = (v: number) => {
            transferSliderValue = clamp(v, -100, 100);

            if (transferSliderValue === 0) {
                transferSlider.className = "trade-slider is-idle";
                fill.style.left = "50%";
                fill.style.width = "0%";
                handle.style.left = "50%";
                handleAmount.textContent = "No transfer";
                handleDirection.textContent = "";
                return;
            }

            const normalized = transferSliderValue / 100;
            const handleLeft = 50 + normalized * 50;
            handle.style.left = `${handleLeft}%`;

            if (transferSliderValue > 0) {
                const qty = sliderQty(transferSliderValue, maxTransferAmount);
                transferSlider.className = "trade-slider is-buy";
                fill.style.left = "50%";
                fill.style.width = `${normalized * 50}%`;
                handleAmount.textContent = `+${qty}`;
                handleDirection.textContent = "to City";
            } else {
                const qty = sliderQty(transferSliderValue, maxTransferAmount);
                transferSlider.className = "trade-slider is-sell";
                fill.style.left = `${50 + normalized * 50}%`;
                fill.style.width = `${Math.abs(normalized) * 50}%`;
                handleAmount.textContent = `-${qty}`;
                handleDirection.textContent = "from City";
            }
        };

        const getTransferValueFromPointer = (clientX: number): number => {
            const rect = sliderLane.getBoundingClientRect();
            if (rect.width <= 0) return 0;
            const centerX = rect.left + rect.width / 2;
            const halfWidth = rect.width / 2;
            const delta = clientX - centerX;
            const raw = clamp(delta / halfWidth, -1, 1);
            return Math.round(raw * 100);
        };

        const executeTransfer = () => {
            if (transferSliderValue > 0 && transferSliderValue !== lastExecutedValue) {
                const qty = sliderQty(transferSliderValue, maxTransferAmount);
                this._mayorSystem?.handle({
                    type: "player_to_city",
                    cityId: city.id,
                    amount: qty,
                });
                lastExecutedValue = transferSliderValue;
            } else if (transferSliderValue < 0 && transferSliderValue !== lastExecutedValue) {
                const qty = sliderQty(transferSliderValue, maxTransferAmount);
                this._mayorSystem?.handle({
                    type: "city_to_player",
                    cityId: city.id,
                    amount: qty,
                });
                lastExecutedValue = transferSliderValue;
            }
        };

        const startTransferDrag = (e: MouseEvent) => {
            transferIsDragging = true;
            applyTransferSliderState(getTransferValueFromPointer(e.clientX));
        };

        const moveTransferDrag = (e: MouseEvent) => {
            if (transferIsDragging) {
                applyTransferSliderState(getTransferValueFromPointer(e.clientX));
            }
        };

        const endTransferDrag = () => {
            if (transferIsDragging) {
                executeTransfer();
                transferIsDragging = false;
                applyTransferSliderState(0);
            }
        };

        handle.addEventListener("mousedown", startTransferDrag);
        document.addEventListener("mousemove", moveTransferDrag);
        document.addEventListener("mouseup", endTransferDrag);

        transferSection.appendChild(transferWrap);
        mayorActionsCard.appendChild(transferSection);

        const treasuryControls = document.createElement("div");
        treasuryControls.classList.add("treasury-controls-grid");

        const populationCard = document.createElement("div");
        populationCard.classList.add("treasury-control-card");
        const populationTitle = document.createElement("h4");
        populationTitle.classList.add("treasury-control-title");
        populationTitle.textContent = "Population growth";
        const populationText = document.createElement("p");
        populationText.classList.add("treasury-control-text");
        populationText.textContent = `Spend ${MAYOR_POPULATION_GOLD_COST.toLocaleString()} gold for +${MAYOR_POPULATION_GAIN.toLocaleString()} citizens.`;
        const populationBtn = document.createElement("button");
        populationBtn.classList.add("mayor-action-btn", "mayor-action-btn-wide");
        populationBtn.textContent = "Invest in population";
        populationBtn.addEventListener("click", () => {
            console.log("[HUD] Population button clicked", { cityId: city.id });
            this._mayorSystem?.handle({
                type: "invest_population",
                cityId: city.id,
                amount: 1,
            });
        });
        populationCard.appendChild(populationTitle);
        populationCard.appendChild(populationText);
        populationCard.appendChild(populationBtn);

        const facilityCard = document.createElement("div");
        facilityCard.classList.add("treasury-control-card");
        const facilityTitle = document.createElement("h4");
        facilityTitle.classList.add("treasury-control-title");
        facilityTitle.textContent = "Production facility";
        const facilityText = document.createElement("p");
        facilityText.classList.add("treasury-control-text");
        facilityText.textContent = "Choose a good and build a facility with treasury funds.";
        const facilityRow = document.createElement("div");
        facilityRow.classList.add("treasury-control-row");
        const facilitySelect = document.createElement("select");
        facilitySelect.classList.add("mayor-select");
        for (const good of allGoods) {
            const option = document.createElement("option");
            option.value = good.name;
            option.textContent = good.name;
            facilitySelect.appendChild(option);
        }
        
        const facilityBtn = document.createElement("button");
        facilityBtn.classList.add("mayor-action-btn");
        facilityBtn.textContent = "Build";
        facilityBtn.addEventListener("click", () => {
            this._mayorSystem?.handle({
                type: "build_facility",
                cityId: city.id,
                goodName: facilitySelect.value,
            });
        });

        facilityRow.appendChild(facilitySelect);
        facilityRow.appendChild(facilityBtn);
        facilityCard.appendChild(facilityTitle);
        facilityCard.appendChild(facilityText);
        facilityCard.appendChild(facilityRow);

        treasuryControls.appendChild(populationCard);
        treasuryControls.appendChild(facilityCard);
        mayorActionsCard.appendChild(treasuryControls);
        mayorPanel.appendChild(mayorActionsCard);

        // ---- Facilities Display Card ----
        const facilitiesCard = document.createElement("section");
        facilitiesCard.classList.add("mayor-card", "mayor-facilities-card");
        const facilitiesTitle = document.createElement("h3");
        facilitiesTitle.classList.add("mayor-card-title");
        facilitiesTitle.textContent = "Production Facilities";
        const facilitiesSubtitle = document.createElement("p");
        facilitiesSubtitle.classList.add("mayor-facilities-subtitle");
        facilitiesSubtitle.textContent = "Facility output is mirrored in the Production tab for quick oversight.";
        const facilitiesList = document.createElement("div");
        facilitiesList.classList.add("mayor-facility-grid");
        facilitiesCard.appendChild(facilitiesTitle);
        facilitiesCard.appendChild(facilitiesSubtitle);
        facilitiesCard.appendChild(facilitiesList);
        mayorPanel.appendChild(facilitiesCard);

        const mayorLogCard = document.createElement("section");
        mayorLogCard.classList.add("mayor-card");
        const mayorLogTitle = document.createElement("h3");
        mayorLogTitle.classList.add("mayor-card-title");
        mayorLogTitle.textContent = "City Financial Log";
        const mayorLogList = document.createElement("div");
        mayorLogList.classList.add("mayor-log-list");
        mayorLogCard.appendChild(mayorLogTitle);
        mayorLogCard.appendChild(mayorLogList);
        mayorPanel.appendChild(mayorLogCard);

        const refreshMayorPanel = () => {
            const isMayor = city.hasComponent(PlayerIsMayor);
            const companyGold = this._getPlayerCompanyGold()?.amount ?? 0;
            const treasuryGold = cityTreasury?.amount ?? 0;
            cityTreasuryStat.value.textContent = `${treasuryGold.toLocaleString()}£`;
            companyTreasuryStat.value.textContent = `${companyGold.toLocaleString()}£`;
            mayorStatusText.textContent = isMayor
                ? "Incumbent mayor. You permanently control city administration."
                : "You are not mayor in this city.";

            const reputation = Math.max(0, Math.min(100, governance?.reputationPercent ?? 0));
            mayorReputationText.textContent = `Reputation: ${Math.round(reputation)}% (50% required)`;

            const snapshotWeek = GameTime.getInstance().snapshot().week;
            const nextElectionWeek = Math.ceil(snapshotWeek / 2) * 2;
            mayorElectionText.textContent = isMayor
                ? "Elections disabled due to permanent incumbency."
                : `Next election cycle: week ${nextElectionWeek}`;

            const candidacyActive = governance?.candidateForElection ?? false;
            treasuryAuthorityStat.value.textContent = isMayor ? "Mayor" : candidacyActive ? "Candidate" : "Locked";
            if (!isMayor && candidacyActive) {
                mayorElectionText.textContent += " · Candidacy registered";
            }

            const canAffordCandidacy = companyGold >= ELECTION_FEE_GOLD;
            candidacyBtn.disabled = isMayor || candidacyActive || !canAffordCandidacy;
            candidacyBtn.classList.toggle("hidden", isMayor);
            candidacyBtn.title = !canAffordCandidacy
                ? `Need ${ELECTION_FEE_GOLD.toLocaleString()} gold`
                : candidacyActive
                    ? "Already registered for next election"
                    : "";

            mayorTreasuryValue.textContent = `${treasuryGold.toLocaleString()}£`;
            mayorOfficeValue.textContent = isMayor ? "Incumbent" : candidacyActive ? "Candidate" : "Challenger";
            mayorProjectValue.textContent = `${city.getComponent(CityFacilities)?.serialize().length ?? 0} built`;

            // Hide/show treasury section based on mayor status
            mayorActionsCard.classList.toggle("hidden", !isMayor);

            // Reset transfer slider when not mayor
            if (!isMayor) {
                applyTransferSliderState(0);
                lastExecutedValue = 0;
            }

            handle.style.pointerEvents = isMayor ? "auto" : "none";

            populationBtn.disabled = !isMayor;
            facilitySelect.disabled = !isMayor;
            facilityBtn.disabled = !isMayor;

            mayorLogList.innerHTML = "";
            const logs = governance?.treasuryLog ?? [];
            if (logs.length === 0) {
                const empty = document.createElement("p");
                empty.classList.add("mayor-log-empty");
                empty.textContent = "No financial actions logged yet.";
                mayorLogList.appendChild(empty);
            } else {
                for (const entry of logs.slice(0, 12)) {
                    const item = document.createElement("article");
                    item.classList.add("mayor-log-item");
                    const amountPrefix = entry.type === "city_to_player" || entry.type === "population_investment" || entry.type === "facility_construction" || entry.type === "election_fee"
                        ? "-"
                        : "+";
                    item.textContent = `${entry.note} | ${amountPrefix}${entry.amount.toLocaleString()} gold | treasury ${entry.cityBalanceAfter.toLocaleString()} | company ${entry.playerBalanceAfter.toLocaleString()}`;
                    mayorLogList.appendChild(item);
                }
            }

            const facilitiesCount = city.getComponent(CityFacilities)?.serialize().length ?? 0;
            if (isMayor) {
                mayorStatusText.textContent += ` Active facilities: ${facilitiesCount}.`;
            }

            // Update facilities display
            facilitiesList.innerHTML = "";
            const facilitiesArray = getFacilitySummaries();
            if (facilitiesArray.length === 0) {
                const empty = document.createElement("p");
                empty.classList.add("mayor-log-empty");
                empty.textContent = "No production facilities built.";
                facilitiesList.appendChild(empty);
            } else {
                for (const facility of facilitiesArray) {
                    const good = registry.getGood(facility.goodName);
                    const item = document.createElement("article");
                    item.classList.add("mayor-facility-card");

                    const icon = document.createElement("img");
                    icon.classList.add("mayor-facility-icon");
                    icon.src = good ? `./assets/images/icons/${good.img}` : "";
                    icon.alt = facility.goodName;

                    const body = document.createElement("div");
                    body.classList.add("mayor-facility-body");

                    const header = document.createElement("div");
                    header.classList.add("mayor-facility-header");

                    const name = document.createElement("h4");
                    name.classList.add("mayor-facility-name");
                    name.textContent = facility.goodName;

                    const countBadge = document.createElement("span");
                    countBadge.classList.add("mayor-facility-count");
                    countBadge.textContent = facility.count > 1 ? `${facility.count} sites` : "1 site";

                    header.appendChild(name);
                    header.appendChild(countBadge);

                    const output = document.createElement("p");
                    output.classList.add("mayor-facility-output");
                    output.textContent = `+${facility.weeklyOutput.toLocaleString()} per week`;

                    const cost = document.createElement("p");
                    cost.classList.add("mayor-facility-cost");
                    cost.textContent = `${facility.treasuryCost.toLocaleString()} gold invested`;

                    body.appendChild(header);
                    body.appendChild(output);
                    body.appendChild(cost);

                    item.appendChild(icon);
                    item.appendChild(body);
                    facilitiesList.appendChild(item);
                }
            }
        };

        refreshMayorPanel();
        panels.push(mayorPanel);
        modalBody.appendChild(mayorPanel);

        // ---- Trade Panel ----
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

        const createCustomSelect = (mount: HTMLElement, side: "left" | "right") => {
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

            const setOpen = (open: boolean) => {
                root.classList.toggle("is-open", open);
                menu.classList.toggle("hidden", !open);
            };

            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const shouldOpen = menu.classList.contains("hidden");
                document.querySelectorAll<HTMLElement>(".custom-select.is-open").forEach(node => {
                    node.classList.remove("is-open");
                    node.querySelector<HTMLElement>(".custom-select-menu")?.classList.add("hidden");
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
                setOpen,
            };
        };

        const leftSelect = createCustomSelect(leftSelectMount, "left");
        const rightSelect = createCustomSelect(rightSelectMount, "right");

        const closeAllSelects = () => {
            document.querySelectorAll<HTMLElement>(".custom-select.is-open").forEach(node => {
                node.classList.remove("is-open");
                node.querySelector<HTMLElement>(".custom-select-menu")?.classList.add("hidden");
            });
        };

        const onDocumentClick = () => closeAllSelects();
        document.addEventListener("click", onDocumentClick);
        cleanupCallbacks.push(() => document.removeEventListener("click", onDocumentClick));

        const getShipSummaryText = (): string => {
            if (defaultShipEndpointId) return getSummaryText(defaultShipEndpointId);
            if (kontorEntity) return getSummaryText("kontor");
            return getSummaryText(rightEndpointId);
        };

        const getLeftMenuOptions = (): EndpointId[] =>
            endpointOptions
                .map(option => option.id)
                .filter(id => id !== rightEndpointId);

        const getRightMenuOptions = (): EndpointId[] =>
            endpointOptions
                .map(option => option.id)
                .filter(id => !isHarborEndpoint(id) && id !== leftEndpointId);

        const ensureValidEndpoints = (): void => {
            if (isHarborEndpoint(rightEndpointId)) {
                const previousLeft = leftEndpointId;
                leftEndpointId = "harbor";
                rightEndpointId = isHarborEndpoint(previousLeft)
                    ? (endpointOptions.find(option => option.kind !== "harbor")?.id ?? "harbor")
                    : previousLeft;
            }

            if (leftEndpointId === rightEndpointId) {
                rightEndpointId = endpointOptions.find(option => option.kind !== "harbor" && option.id !== leftEndpointId)?.id
                    ?? rightEndpointId;
            }

            if (isHarborEndpoint(leftEndpointId) && isHarborEndpoint(rightEndpointId)) {
                rightEndpointId = endpointOptions.find(option => option.kind !== "harbor")?.id ?? "harbor";
            }

            if (!isHarborEndpoint(leftEndpointId) && rightEndpointId === leftEndpointId) {
                rightEndpointId = endpointOptions.find(option => option.kind !== "harbor" && option.id !== leftEndpointId)?.id
                    ?? rightEndpointId;
            }
        };

        const refreshTradeSelectors = () => {
            ensureValidEndpoints();

            leftSelect.label.textContent = getEndpoint(leftEndpointId).label;
            rightSelect.label.textContent = getEndpoint(rightEndpointId).label;

            leftSelect.menu.querySelectorAll<HTMLElement>(".custom-select-option").forEach(option => {
                const optionId = option.dataset.value as EndpointId;
                const allowed = getLeftMenuOptions().includes(optionId);
                option.classList.toggle("hidden", !allowed);
                option.classList.toggle("is-active", optionId === leftEndpointId);
            });
            rightSelect.menu.querySelectorAll<HTMLElement>(".custom-select-option").forEach(option => {
                const optionId = option.dataset.value as EndpointId;
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

        // Trade rows container
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

        interface TradeRowState {
            good: TradeGood;
            supplySpan: HTMLSpanElement;
            heldSpan: HTMLSpanElement;
            slider: HTMLDivElement;
            sellRail: HTMLDivElement;
            buyRail: HTMLDivElement;
            fill: HTMLDivElement;
            handle: HTMLButtonElement;
            handleAmount: HTMLSpanElement;
            handlePrice: HTMLSpanElement;
            update: () => void;
        }

        const rowStates: TradeRowState[] = [];

        for (const good of allGoods) {
            const entry = market!.getEntry(good);
            if (!entry) continue;

            const row = document.createElement("div");
            row.classList.add("trade-row");

            const icon = document.createElement("img");
            icon.classList.add("trade-row-icon");
            icon.src = `./assets/images/icons/${good.img}`;
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
            let currentPrice = market!.currentPrice(good);
            let maxLeftToRight = 0;
            let maxRightToLeft = 0;

            const applySliderState = (v: number) => {
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

            const getValueFromPointer = (clientX: number): number => {
                const rect = sliderLane.getBoundingClientRect();
                if (rect.width <= 0) return 0;
                const centerX = rect.left + rect.width / 2;
                const halfWidth = rect.width / 2;
                const delta = clientX - centerX;
                const raw = clamp(delta / halfWidth, -1, 1);

                if (raw > 0 && maxLeftToRight <= 0) return 0;
                if (raw < 0 && maxRightToLeft <= 0) return 0;

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
                if (!isDragging) return;
                isDragging = false;
                slider.classList.remove("is-dragging");
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", onPointerUp);
                document.removeEventListener("pointercancel", onPointerUp);
                executeTrade();
            };

            const onPointerMove = (event: PointerEvent) => {
                if (!isDragging) return;
                applySliderState(getValueFromPointer(event.clientX));
            };

            const onPointerUp = () => {
                stopDrag();
            };

            const startDrag = (event: PointerEvent) => {
                if (maxLeftToRight <= 0 && maxRightToLeft <= 0) return;
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
                    currentPrice = market!.currentPrice(good);
                    const leftQty = getHeldQuantity(leftEndpointId, good);
                    const rightQty = getHeldQuantity(rightEndpointId, good);
                    maxLeftToRight = getMaxDirectionalQty(good, leftEndpointId, rightEndpointId);
                    maxRightToLeft = getMaxDirectionalQty(good, rightEndpointId, leftEndpointId);

                    supplySpan.textContent = String(leftQty);
                    heldSpan.textContent = String(rightQty);
                    sellRail.classList.toggle("is-disabled", maxRightToLeft === 0);
                    buyRail.classList.toggle("is-disabled", maxLeftToRight === 0);
                    applySliderState(0);
                },
            });
        }

        const refreshTradeTable = () => {
            if (!market) return;

            refreshTradeSelectors();

            infoLeftText.textContent = getSummaryText(leftEndpointId);
            infoRightText.textContent = getSummaryText(rightEndpointId);
            infoRow.classList.toggle("hidden", !((isShipEndpoint(leftEndpointId) && isKontorEndpoint(rightEndpointId)) || (isKontorEndpoint(leftEndpointId) && isShipEndpoint(rightEndpointId))));

            headerLeftValue.textContent = getEndpoint(leftEndpointId).label;
            headerSellLabel.textContent = `${getEndpoint(rightEndpointId).label} → ${getEndpoint(leftEndpointId).label}`;
            headerBuyLabel.textContent = `${getEndpoint(leftEndpointId).label} → ${getEndpoint(rightEndpointId).label}`;
            headerRightValue.textContent = getEndpoint(rightEndpointId).label;

            for (const rowState of rowStates) {
                rowState.update();
            }
        };

        // Initial render of trade content.
        refreshTradeSelectors();
        refreshTradeTable();

        panels.push(tradePanel);
        modalBody.appendChild(tradePanel);

        win.appendChild(modalBody);

        // Tab switching logic.
        tabBar.querySelectorAll<HTMLButtonElement>(".modal-tab").forEach(btn => {
            btn.addEventListener("click", () => {
                tabBar.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const target = btn.dataset.tab!;
                activeTab = target as Lowercase<typeof tabs[number]>;
                for (const p of panels) {
                    p.classList.toggle("hidden", p.id !== `panel-${target}`);
                }
                if (target === "trade") {
                    refreshTradeTable();
                }
                if (target === "production") {
                    refreshProductionPanel();
                }
                if (target === "shipyard") {
                    buildShipyardCards();
                }
                if (target === "mayor") {
                    refreshMayorPanel();
                }
            });
        });

        // ---- Close helpers ----
        const closeModal = () => {
            this._hudElement?.classList.remove("is-modal-hidden");
            modal.remove();
            this._isShowingModal = false;
            this._activeModalRefresh = null;
            this._activeModalRealtimeRefresh = null;
            document.removeEventListener("keydown", escHandler);
            for (const cleanup of cleanupCallbacks) cleanup();
        };

        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeModal();
        };

        closeX.addEventListener("click", closeModal);
        document.addEventListener("keydown", escHandler);

        // Click on backdrop to close.
        // Track where the mousedown started so that dragging a slider out of
        // the modal and releasing on the backdrop does not close the modal.
        let mousedownOnBackdrop = false;
        modal.addEventListener("mousedown", (e) => {
            mousedownOnBackdrop = e.target === modal;
        });
        modal.addEventListener("click", (e) => {
            if (e.target === modal && mousedownOnBackdrop) closeModal();
        });

        modal.appendChild(win);
        document.body.appendChild(modal);
        this._hudElement?.classList.add("is-modal-hidden");
        this._isShowingModal = true;

        // Register reactive refresh callback.
        this._activeModalRefresh = () => {
            refreshCityPanel();
            refreshTradeTable();
            refreshProductionPanel();
            refreshShipyardLive?.();
            refreshMayorPanel();
        };
        this._activeModalRealtimeRefresh = () => {
            if (activeTab === "production") {
                refreshProductionPanel();
            }
            if (activeTab === "shipyard") {
                refreshShipyardLive?.();
            }
            if (activeTab === "mayor") {
                refreshMayorPanel();
            }
        };
    }

    /** Update the bottom-right ship panel with the given ship's state. */
    public updateShipPanel(ship: Entity, world: World): void {
        const nameComp = ship.getComponent(Name);
        const shipComp = ship.getComponent(Ship);
        const shipType = ship.getComponent(ShipType);
        const inventory = ship.getComponent(Inventory);
        const pos = ship.getComponent(Position);

        if (this._shipPanelName) {
            this._shipPanelName.textContent = nameComp?.value ?? "Ship";
        }

        if (this._shipPanelType) {
            this._shipPanelType.textContent = shipType?.shipClass ?? "Vessel";
        }

        // Determine current port
        if (this._shipPanelPort) {
            if (ship.hasComponent(TravelRoute)) {
                this._shipPanelPort.textContent = "At Sea";
                this._shipPanelPort.classList.add("on-sea");
            } else if (pos) {
                const city = world.query(City, Position, Name).find(e => {
                    const cp = e.getComponent(Position)!;
                    return Math.abs(cp.x - pos.x) < 0.001 && Math.abs(cp.y - pos.y) < 0.001;
                });
                this._shipPanelPort.textContent = city?.getComponent(Name)?.value ?? "At Sea";
                this._shipPanelPort.classList.toggle("on-sea", !city);
            } else {
                this._shipPanelPort.textContent = "Unknown";
            }
        }

        // Cargo count
        if (this._shipPanelCargo) {
            const total = inventory?.totalUnits() ?? 0;
            const cap = shipComp?.cargoCapacity ?? 0;
            this._shipPanelCargo.textContent = `${total}/${cap} cargo`;
            if (this._shipPanelCargoFill) {
                const fillPct = cap > 0 ? Math.min(100, (total / cap) * 100) : 0;
                this._shipPanelCargoFill.style.width = `${fillPct}%`;
            }
        }

        // Inventory manifest
        if (this._shipPanelInventory && inventory) {
            this._shipPanelInventory.innerHTML = "";
            const cargoEntries = [...inventory.entries()]
                .filter(([, qty]) => qty > 0)
                .sort(([goodA], [goodB]) => goodA.name.localeCompare(goodB.name));

            if (this._shipPanelInventoryCount) {
                this._shipPanelInventoryCount.textContent = `${cargoEntries.length} ${cargoEntries.length === 1 ? "good" : "goods"}`;
            }

            if (this._shipPanelEmpty) {
                this._shipPanelEmpty.classList.toggle("hidden", cargoEntries.length > 0);
            }

            for (const [good, qty] of cargoEntries) {
                if (qty <= 0) continue;
                const item = document.createElement("div");
                item.classList.add("ship-panel-item");
                item.title = `${good.name}: ${qty}`;

                const iconWrap = document.createElement("div");
                iconWrap.classList.add("ship-panel-item-icon-wrap");
                const img = document.createElement("img");
                img.src = `./assets/images/icons/${good.img}`;
                img.alt = good.name;
                img.title = good.name;

                const name = document.createElement("span");
                name.classList.add("ship-panel-item-name");
                name.textContent = good.name;

                const qtyLabel = document.createElement("span");
                qtyLabel.classList.add("ship-panel-item-qty");
                qtyLabel.textContent = `${qty} units`;

                iconWrap.appendChild(img);
                item.appendChild(iconWrap);
                item.appendChild(name);
                item.appendChild(qtyLabel);
                this._shipPanelInventory.appendChild(item);
            }
        }
    }

    /** Place a shipbuilding order at the given city. */
    private _placeShipBuildOrder(city: Entity, typeName: ShipClassName, cfg: ShipTypeConfig): void {
        if (!this._world) return;

        const companyGold = this._getPlayerCompanyGold();
        if (!companyGold || companyGold.amount < cfg.goldCost) return;

        // Deduct gold
        companyGold.amount -= cfg.goldCost;

        // Random build duration within the ship type's range
        const buildDays = cfg.buildDaysMin + Math.random() * (cfg.buildDaysMax - cfg.buildDaysMin);
        const buildDurationSecs = buildDays * REAL_SECONDS_PER_DAY;

        const materialsRequired = new Map(Object.entries(cfg.materials));

        const orderEntity = new EntityClass()
            .addComponent(new ShipBuildOrder(
                city.id,
                typeName,
                cfg.goldCost,
                materialsRequired,
                buildDurationSecs,
            ));

        this._world.addEntity(orderEntity);
    }
}