import type { Entity } from "../ecs/Entity";
import { City, Market, Name, Inventory, Ship, Gold, CityProduction, Kontor, type TradeGood } from "../gameplay/components";
import type { TradeSystem } from "../gameplay/systems";
import { GoodsRegistry } from "../gameplay/GoodsRegistry";

export class HUDcontroller {
    private _cityNameElement: HTMLElement;
    private _citizensElement: HTMLElement;
    private _playtimeElement: HTMLElement;
    private _wealthElement: HTMLElement;
    private _isShowingModal: boolean = false;
    private _isOnSea: boolean = false;
    private _tradeSystem: TradeSystem | null = null;
    static _instance: any;

    private constructor() {
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

    public updateCityInfo(cityName: string, citizens: number, playtime: string, wealth: number) {
        if (this._isOnSea) return;
        this._cityNameElement?.classList.remove("on-sea");
        this._citizensElement?.classList.remove("on-sea");
        if (this._cityNameElement) this._cityNameElement.textContent = cityName;
        if (this._citizensElement) this._citizensElement.textContent = `${citizens} citizens`;
        if (this._playtimeElement) this._playtimeElement.textContent = playtime;
        if (this._wealthElement) this._wealthElement.textContent = `${wealth} marks`;
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

        const cityComp = city.getComponent(City);
        const nameComp = city.getComponent(Name);
        const market = city.getComponent(Market);
        const cityGold = city.getComponent(Gold);
        const production = city.getComponent(CityProduction);
        if (!cityComp || !nameComp) return;

        const registry = GoodsRegistry.getInstance();
        const allGoods = registry.getAllGoods();

        // Inventory mode: "ship" or "kontor"
        let inventoryMode: "ship" | "kontor" = playerShip ? "ship" : "kontor";

        // Helper: get the active inventory entity.
        const getActiveEntity = (): Entity | null =>
            inventoryMode === "ship" ? playerShip : kontorEntity;
        const getActiveInventory = (): Inventory | null =>
            getActiveEntity()?.getComponent(Inventory) ?? null;
        const getActiveGold = (): Gold | null =>
            (playerShip?.getComponent(Gold) ?? kontorEntity?.getComponent(Gold)) ?? null;
        const getActiveCapacity = (): number => {
            if (inventoryMode === "ship") {
                const s = playerShip?.getComponent(Ship);
                return s ? s.cargoCapacity : Infinity;
            }
            const k = kontorEntity?.getComponent(Kontor);
            return k ? k.capacity : Infinity;
        };

        // ---- Build DOM ----
        const modal = document.createElement("div");
        modal.classList.add("modal");

        const win = document.createElement("div");
        win.classList.add("modal-window");

        const title = document.createElement("h2");
        title.classList.add("modal-title");
        title.textContent = nameComp.value;
        win.appendChild(title);

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
        win.appendChild(tabBar);

        // ---- City Panel ----
        const cityPanel = document.createElement("div");
        cityPanel.classList.add("modal-panel");
        cityPanel.id = "panel-city";
        cityPanel.innerHTML = `<p>Population: <strong>${cityComp.population}</strong></p>`;
        panels.push(cityPanel);
        win.appendChild(cityPanel);

        // ---- Production Panel ----
        const prodPanel = document.createElement("div");
        prodPanel.classList.add("modal-panel", "hidden");
        prodPanel.id = "panel-production";

        if (production && market) {
            const table = document.createElement("table");
            table.classList.add("production-table");
            table.innerHTML = `<thead><tr><th>Good</th><th>Rate/tick</th><th>Supply</th></tr></thead>`;
            const tbody = document.createElement("tbody");
            for (const [goodName, multiplier] of production.multipliers) {
                const good = registry.getGood(goodName);
                if (!good) continue;
                const baseProd = registry.getBaseProduction(goodName);
                const rate = baseProd * (production.citizens / 10) * multiplier;
                const supply = market.getEntry(good)?.supply ?? 0;
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${goodName}</td><td>${rate.toFixed(1)}</td><td>${Math.round(supply)}</td>`;
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            prodPanel.appendChild(table);
        } else {
            prodPanel.innerHTML = "<p>No production data.</p>";
        }
        panels.push(prodPanel);
        win.appendChild(prodPanel);

        // ---- Trade Panel ----
        const tradePanel = document.createElement("div");
        tradePanel.classList.add("modal-panel", "hidden");
        tradePanel.id = "panel-trade";

        // Inventory toggle (only if both ship and kontor present)
        const hasBoth = !!playerShip && !!kontorEntity;
        if (hasBoth) {
            const toggleRow = document.createElement("div");
            toggleRow.classList.add("inventory-toggle");

            const shipBtn = document.createElement("button");
            shipBtn.textContent = "Ship";
            shipBtn.classList.add("toggle-btn");
            if (inventoryMode === "ship") shipBtn.classList.add("active");

            const kontorBtn = document.createElement("button");
            kontorBtn.textContent = "Kontor";
            kontorBtn.classList.add("toggle-btn");
            if (inventoryMode === "kontor") kontorBtn.classList.add("active");

            shipBtn.addEventListener("click", () => {
                inventoryMode = "ship";
                shipBtn.classList.add("active");
                kontorBtn.classList.remove("active");
                refreshTradeTable();
                refreshTransferSection();
            });
            kontorBtn.addEventListener("click", () => {
                inventoryMode = "kontor";
                kontorBtn.classList.add("active");
                shipBtn.classList.remove("active");
                refreshTradeTable();
                refreshTransferSection();
            });

            toggleRow.appendChild(shipBtn);
            toggleRow.appendChild(kontorBtn);
            tradePanel.appendChild(toggleRow);
        }

        // Transfer section (only if both present)
        const transferDiv = document.createElement("div");
        transferDiv.classList.add("transfer-section");
        if (hasBoth) {
            tradePanel.appendChild(transferDiv);
        }

        const refreshTransferSection = () => {
            transferDiv.innerHTML = "";
            if (!hasBoth) return;

            const sourceInv = getActiveInventory();
            if (!sourceInv) return;

            const label = document.createElement("span");
            label.classList.add("transfer-label");
            label.textContent = "Transfer:";
            transferDiv.appendChild(label);

            const select = document.createElement("select");
            select.classList.add("transfer-select");
            for (const good of allGoods) {
                if (sourceInv.get(good) > 0) {
                    const opt = document.createElement("option");
                    opt.value = good.name;
                    opt.textContent = `${good.name} (${sourceInv.get(good)})`;
                    select.appendChild(opt);
                }
            }
            transferDiv.appendChild(select);

            const qtyInput = document.createElement("input");
            qtyInput.type = "number";
            qtyInput.min = "1";
            qtyInput.value = "1";
            qtyInput.classList.add("transfer-qty");
            transferDiv.appendChild(qtyInput);

            const destLabel = inventoryMode === "ship" ? "→ Kontor" : "→ Ship";
            const transferBtn = document.createElement("button");
            transferBtn.classList.add("transfer-btn");
            transferBtn.textContent = destLabel;
            transferBtn.addEventListener("click", () => {
                const goodName = select.value;
                const good = registry.getGood(goodName);
                const qty = Math.max(1, parseInt(qtyInput.value) || 0);
                if (!good) return;

                const srcEntity = getActiveEntity();
                const dstEntity = inventoryMode === "ship" ? kontorEntity : playerShip;
                if (!srcEntity || !dstEntity) return;

                const srcInv = srcEntity.getComponent(Inventory);
                const dstInv = dstEntity.getComponent(Inventory);
                if (!srcInv || !dstInv) return;

                // Capacity check on destination.
                const dstCap = inventoryMode === "ship"
                    ? (kontorEntity!.getComponent(Kontor)?.capacity ?? Infinity)
                    : (playerShip!.getComponent(Ship)?.cargoCapacity ?? Infinity);
                if (dstInv.totalUnits() + qty > dstCap) return;

                if (!srcInv.remove(good, qty)) return;
                dstInv.add(good, qty);
                refreshTradeTable();
                refreshTransferSection();
            });
            transferDiv.appendChild(transferBtn);
        };

        // Trade table
        const tradeTableWrap = document.createElement("div");
        tradeTableWrap.classList.add("trade-table-wrap");
        tradePanel.appendChild(tradeTableWrap);

        const refreshTradeTable = () => {
            tradeTableWrap.innerHTML = "";
            if (!market) return;

            const inv = getActiveInventory();
            const gold = getActiveGold();

            const infoRow = document.createElement("div");
            infoRow.classList.add("trade-info-row");
            infoRow.innerHTML = `<span>Gold: <strong>${gold?.amount ?? 0}</strong> marks</span>`;
            if (inv) {
                const cap = getActiveCapacity();
                infoRow.innerHTML += ` &nbsp;|&nbsp; <span>Cargo: <strong>${inv.totalUnits()}/${cap === Infinity ? "∞" : cap}</strong></span>`;
            }
            tradeTableWrap.appendChild(infoRow);

            const table = document.createElement("table");
            table.classList.add("trade-table");
            table.innerHTML = `<thead><tr><th>Good</th><th>Supply</th><th>Price</th><th>Held</th><th>Buy</th><th>Sell</th></tr></thead>`;
            const tbody = document.createElement("tbody");

            for (const good of allGoods) {
                const entry = market.getEntry(good);
                if (!entry) continue;
                const price = market.currentPrice(good);
                const supply = Math.round(entry.supply);
                const held = inv ? inv.get(good) : 0;

                const tr = document.createElement("tr");

                // Good | Supply | Price | Held
                tr.innerHTML = `<td>${good.name}</td><td>${supply}</td><td>${price}</td><td>${held}</td>`;

                // Buy cell
                const buyTd = document.createElement("td");
                buyTd.classList.add("trade-action-cell");
                const buyQty = document.createElement("input");
                buyQty.type = "number"; buyQty.min = "1"; buyQty.value = "1";
                buyQty.classList.add("trade-qty");
                const buyBtn = document.createElement("button");
                buyBtn.textContent = "Buy";
                buyBtn.classList.add("trade-btn", "buy-btn");
                buyBtn.addEventListener("click", () => {
                    const qty = Math.max(1, parseInt(buyQty.value) || 0);
                    if (!inv || !gold) return;
                    const unitPrice = market.currentPrice(good);
                    const totalCost = unitPrice * qty;
                    const ent = market.getEntry(good);
                    if (!ent || ent.supply < qty) return;
                    if (gold.amount < totalCost) return;
                    if (inv.totalUnits() + qty > getActiveCapacity()) return;
                    inv.add(good, qty);
                    gold.amount -= totalCost;
                    if (cityGold) cityGold.amount += totalCost;
                    market.update(good, { supply: Math.max(0, ent.supply - qty) });
                    refreshTradeTable();
                    refreshTransferSection();
                });
                buyTd.appendChild(buyQty);
                buyTd.appendChild(buyBtn);
                tr.appendChild(buyTd);

                // Sell cell
                const sellTd = document.createElement("td");
                sellTd.classList.add("trade-action-cell");
                const sellQty = document.createElement("input");
                sellQty.type = "number"; sellQty.min = "1"; sellQty.value = "1";
                sellQty.classList.add("trade-qty");
                const sellBtn = document.createElement("button");
                sellBtn.textContent = "Sell";
                sellBtn.classList.add("trade-btn", "sell-btn");
                sellBtn.addEventListener("click", () => {
                    const qty = Math.max(1, parseInt(sellQty.value) || 0);
                    if (!inv || !gold) return;
                    const unitPrice = market.currentPrice(good);
                    const revenue = unitPrice * qty;
                    if (!inv.remove(good, qty)) return;
                    gold.amount += revenue;
                    if (cityGold) cityGold.amount = Math.max(0, cityGold.amount - revenue);
                    const ent = market.getEntry(good);
                    if (ent) market.update(good, { supply: ent.supply + qty });
                    refreshTradeTable();
                    refreshTransferSection();
                });
                sellTd.appendChild(sellQty);
                sellTd.appendChild(sellBtn);
                tr.appendChild(sellTd);

                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            tradeTableWrap.appendChild(table);
        };

        // Initial render of trade content.
        refreshTradeTable();
        refreshTransferSection();

        panels.push(tradePanel);
        win.appendChild(tradePanel);

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
                    refreshTransferSection();
                }
            });
        });

        // Close button.
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Close";
        closeBtn.classList.add("modal-close");
        closeBtn.addEventListener("click", () => {
            modal.remove();
            this._isShowingModal = false;
        });
        win.appendChild(closeBtn);

        modal.appendChild(win);
        document.body.appendChild(modal);
        this._isShowingModal = true;
    }
}