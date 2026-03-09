import type { Entity } from "../ecs/Entity";
import { City, Market, Name, Inventory, Ship, Gold, CityProduction, Kontor, PlayerControlled, IsPlayerOwned, type TradeGood } from "../gameplay/components";
import type { TradeSystem } from "../gameplay/systems";
import { GoodsRegistry } from "../gameplay/GoodsRegistry";
import { DAYS_PER_WEEK } from "../gameplay/GameTime";
import { demandAlgorithm } from "../gameplay/algorithms/EconomyAlgorithms";
import { SatisfactionAlgorithm, SatisfactionLevel, GROWTH_BASE_PER_WEEK } from "../gameplay/algorithms/SatisfactionAlgorithm";

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
    private _playerShip: Entity | null = null;
    private _playerCompany: Entity | null = null;
    private _activeModalRefresh: (() => void) | null = null;
    static _instance: any;

    private constructor() {
        this._hudElement = document.getElementById("hud");
        this._cityNameElement = document.querySelector(".hub-info-city") as HTMLElement;
        this._citizensElement = document.querySelector(".hub-info-city-citizens") as HTMLElement;
        this._playtimeElement = document.querySelector(".hub-info-playtime") as HTMLElement;
        this._wealthElement = document.querySelector(".hub-info-wealth-value") as HTMLElement;
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

    public setPlayerShip(ship: Entity): void {
        this._playerShip = ship;
    }

    public setPlayerCompany(company: Entity): void {
        this._playerCompany = company;
        this._refreshHudWealth();
    }

    public updateGameTime(label: string): void {
        if (this._playtimeElement) {
            this._playtimeElement.textContent = label;
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
    }

    public setOnSeaState(isOnSea: boolean): void {
        this._isOnSea = isOnSea;
    }

    // ------------------------------------------------------------------ Modal

    public createCityOverviewModal(city: Entity, playerShip: Entity | null, kontorEntity: Entity | null): void {
        // Remove any existing modal.
        document.querySelector(".modal:not(.hidden)")?.remove();
        this._activeModalRefresh = null;

        const cityComp = city.getComponent(City);
        const nameComp = city.getComponent(Name);
        const market = city.getComponent(Market);
        const cityGold = city.getComponent(Gold);
        const production = city.getComponent(CityProduction);
        if (!cityComp || !nameComp) return;

        const registry = GoodsRegistry.getInstance();
        const allGoods = registry.getAllGoods();

        type EndpointKind = "harbor" | "ship" | "kontor";
        interface EndpointOption {
            id: EndpointKind;
            label: string;
            entity: Entity | null;
        }

        const endpointOptions: EndpointOption[] = [
            { id: "harbor", label: "Harbor", entity: city },
            ...(playerShip ? [{ id: "ship" as const, label: "Ship", entity: playerShip }] : []),
            ...(kontorEntity ? [{ id: "kontor" as const, label: "Kontor", entity: kontorEntity }] : []),
        ];

        let leftEndpointId: EndpointKind = "harbor";
        let rightEndpointId: EndpointKind = playerShip ? "ship" : "kontor";

        const cleanupCallbacks: Array<() => void> = [];

        const getEndpoint = (id: EndpointKind): EndpointOption =>
            endpointOptions.find(option => option.id === id) ?? endpointOptions[0]!;

        const getEndpointInventory = (id: EndpointKind): Inventory | null =>
            getEndpoint(id).entity?.getComponent(Inventory) ?? null;

        const getEndpointGold = (id: EndpointKind): Gold | null =>
            this._resolveEndpointGold(getEndpoint(id).entity);

        const getEndpointCapacity = (id: EndpointKind): number => {
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

        const getEndpointFreeCapacity = (id: EndpointKind): number => {
            if (id === "harbor") return Infinity;
            const inventory = getEndpointInventory(id);
            return Math.max(0, getEndpointCapacity(id) - (inventory?.totalUnits() ?? 0));
        };

        const getHeldQuantity = (id: EndpointKind, good: TradeGood): number => {
            if (id === "harbor") {
                return Math.max(0, Math.floor(market?.getEntry(good)?.supply ?? 0));
            }
            return getEndpointInventory(id)?.get(good) ?? 0;
        };

        const quoteHarborTransfer = (good: TradeGood, quantity: number, _mode: "buy" | "sell"): number => {
            if (!market || quantity <= 0) return 0;
            return market.currentPrice(good) * quantity;
        };

        const getMaxAffordableQty = (good: TradeGood, buyerId: EndpointKind, availableQty: number): number => {
            if (buyerId === "harbor") return availableQty;
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

        const getSummaryText = (id: EndpointKind): string => {
            const option = getEndpoint(id);
            if (id === "harbor") {
                let totalStock = 0;
                if (market) {
                    for (const [, entry] of market.goods()) totalStock += Math.floor(entry.supply);
                }
                return `${option.label}: ${cityGold?.amount ?? 0}£ · ${totalStock} stock`;
            }

            const inventory = getEndpointInventory(id);
            const gold = getEndpointGold(id)?.amount ?? 0;
            const capacity = getEndpointCapacity(id);
            const units = inventory?.totalUnits() ?? 0;
            return `${option.label}: ${gold}£ · ${units}/${capacity === Infinity ? "∞" : capacity} cargo`;
        };

        const getDirectionalMode = (sourceId: EndpointKind, targetId: EndpointKind): "trade-buy" | "trade-sell" | "transfer" | "none" => {
            if (sourceId === targetId) return "none";
            if (sourceId === "harbor" && targetId !== "harbor") return "trade-buy";
            if (sourceId !== "harbor" && targetId === "harbor") return "trade-sell";
            if (sourceId !== "harbor" && targetId !== "harbor") return "transfer";
            return "none";
        };

        const getMaxDirectionalQty = (good: TradeGood, sourceId: EndpointKind, targetId: EndpointKind): number => {
            if (sourceId === targetId) return 0;

            const sourceQty = getHeldQuantity(sourceId, good);
            if (sourceQty <= 0) return 0;

            const targetCapacity = getEndpointFreeCapacity(targetId);
            let maxQty = Math.min(sourceQty, targetCapacity);

            if (sourceId === "harbor" && targetId !== "harbor") {
                maxQty = Math.min(maxQty, getMaxAffordableQty(good, targetId, sourceQty));
            }

            return Math.max(0, maxQty);
        };

        const getDirectionalQuote = (good: TradeGood, quantity: number, sourceId: EndpointKind, targetId: EndpointKind): number => {
            const mode = getDirectionalMode(sourceId, targetId);
            if (mode === "trade-buy") return quoteHarborTransfer(good, quantity, "buy");
            if (mode === "trade-sell") return quoteHarborTransfer(good, quantity, "sell");
            return 0;
        };

        const executeDirectionalTransfer = (good: TradeGood, quantity: number, sourceId: EndpointKind, targetId: EndpointKind): boolean => {
            if (quantity <= 0 || sourceId === targetId) return false;

            const mode = getDirectionalMode(sourceId, targetId);
            const entry = market?.getEntry(good);
            const sourceInv = getEndpointInventory(sourceId);
            const targetInv = getEndpointInventory(targetId);
            const sourceGold = getEndpointGold(sourceId);
            const targetGold = getEndpointGold(targetId);

            if (mode === "trade-buy") {
                if (!entry || !targetInv || !targetGold) return false;
                if (entry.supply < quantity) return false;
                if (targetInv.totalUnits() + quantity > getEndpointCapacity(targetId)) return false;
                const totalCost = getDirectionalQuote(good, quantity, sourceId, targetId);
                if (targetGold.amount < totalCost) return false;
                targetInv.add(good, quantity);
                targetGold.amount -= totalCost;
                if (cityGold) cityGold.amount += totalCost;
                market!.update(good, { supply: Math.max(0, entry.supply - quantity) });
                return true;
            }

            if (mode === "trade-sell") {
                if (!entry || !sourceInv || !sourceGold) return false;
                if (!sourceInv.remove(good, quantity)) return false;
                const totalRevenue = getDirectionalQuote(good, quantity, sourceId, targetId);
                sourceGold.amount += totalRevenue;
                if (cityGold) cityGold.amount = Math.max(0, cityGold.amount - totalRevenue);
                market!.update(good, { supply: entry.supply + quantity });
                return true;
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
        const tabs = ["City", "Production", "Trade"] as const;
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
                const stock = Math.round(market?.getEntry(good)?.supply ?? 0);
                const demandedAmount = good.base_demand * cityComp.population / 1000;
                const currentPrice = market?.currentPrice(good) ?? 0;
                state.stockValue.textContent = `${stock}`;
                state.demandValue.textContent = demandedAmount >= 10
                    ? `${Math.round(demandedAmount)}`
                    : demandedAmount.toFixed(1);
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
                if (!good) continue;
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
            if (playerShip) return getSummaryText("ship");
            if (kontorEntity) return getSummaryText("kontor");
            return getSummaryText(rightEndpointId);
        };

        const getLeftMenuOptions = (): EndpointKind[] =>
            endpointOptions
                .map(option => option.id)
                .filter(id => id !== rightEndpointId);

        const getRightMenuOptions = (): EndpointKind[] =>
            endpointOptions
                .map(option => option.id)
                .filter(id => id !== "harbor" && id !== leftEndpointId);

        const ensureValidEndpoints = (): void => {
            if (rightEndpointId === "harbor") {
                const previousLeft = leftEndpointId;
                leftEndpointId = "harbor";
                rightEndpointId = previousLeft === "harbor"
                    ? (endpointOptions.find(option => option.id !== "harbor")?.id ?? "harbor")
                    : previousLeft;
            }

            if (leftEndpointId === rightEndpointId) {
                rightEndpointId = endpointOptions.find(option => option.id !== "harbor" && option.id !== leftEndpointId)?.id
                    ?? rightEndpointId;
            }

            if (leftEndpointId === "harbor" && rightEndpointId === "harbor") {
                rightEndpointId = endpointOptions.find(option => option.id !== "harbor")?.id ?? "harbor";
            }

            if (leftEndpointId !== "harbor" && rightEndpointId === leftEndpointId) {
                rightEndpointId = endpointOptions.find(option => option.id !== "harbor" && option.id !== leftEndpointId)?.id
                    ?? rightEndpointId;
            }
        };

        const refreshTradeSelectors = () => {
            ensureValidEndpoints();

            leftSelect.label.textContent = getEndpoint(leftEndpointId).label;
            rightSelect.label.textContent = getEndpoint(rightEndpointId).label;

            leftSelect.menu.querySelectorAll<HTMLElement>(".custom-select-option").forEach(option => {
                const optionId = option.dataset.value as EndpointKind;
                const allowed = getLeftMenuOptions().includes(optionId);
                option.classList.toggle("hidden", !allowed);
                option.classList.toggle("is-active", optionId === leftEndpointId);
            });
            rightSelect.menu.querySelectorAll<HTMLElement>(".custom-select-option").forEach(option => {
                const optionId = option.dataset.value as EndpointKind;
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
            infoRow.classList.toggle("hidden", !((leftEndpointId === "ship" && rightEndpointId === "kontor") || (leftEndpointId === "kontor" && rightEndpointId === "ship")));

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

        // ---- Close helpers ----
        const closeModal = () => {
            this._hudElement?.classList.remove("is-modal-hidden");
            modal.remove();
            this._isShowingModal = false;
            this._activeModalRefresh = null;
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
        };
    }
}