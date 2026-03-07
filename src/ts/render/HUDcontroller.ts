import type { Entity } from "../ecs/Entity";
import { City, Market, Name, Inventory, Ship } from "../gameplay/components";

export class HUDcontroller {
    private _cityNameElement: HTMLElement;
    private _citizensElement: HTMLElement;
    private _playtimeElement: HTMLElement;
    private _wealthElement: HTMLElement;
    private _isShowingModal: boolean = false;
    private _isOnSea: boolean = false;
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

    public updateCityInfo(cityName: string, citizens: number, playtime: string, wealth: number) {
        // Don't update city info if ship is currently on sea
        if (this._isOnSea) return;

        // Remove "on-sea" class if present
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
                const totalUnits = invComp.totalUnits();
                const capacity = shipComp.cargoCapacity;
                this._citizensElement.textContent = `${totalUnits}/${capacity} cargo`;
            } else {
                this._citizensElement.textContent = "0 cargo";
            }
            this._citizensElement.classList.add("on-sea");
        }
    }

    public setOnSeaState(isOnSea: boolean): void {
        this._isOnSea = isOnSea;
    }

    public createCityOverviewModal(city: Entity): void {
        document.querySelector("modal")?.remove();

        const cityComponent = city.getComponent(City);
        const nameComponent = city.getComponent(Name);
        if (!cityComponent || !nameComponent) return;

        const modal = document.createElement("div");
        modal.classList.add("modal");


        const modalTitle = document.createElement("h2");
        modalTitle.textContent = nameComponent.value;

        const modalContent = document.createElement("div");
        modalContent.classList.add("modal-content");
        const populationInfo = document.createElement("p");
        populationInfo.textContent = `Population: ${cityComponent.population}`;
        modalContent.appendChild(populationInfo);



        const closeButton = document.createElement("button");
        closeButton.textContent = "Close";
        closeButton.addEventListener("click", () => {
            modal.remove();
            this._isShowingModal = false;
        });

        modalContent.appendChild(modalTitle);
        modalContent.appendChild(modalContent);
        modalContent.appendChild(closeButton);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        this._isShowingModal = true;

    }

    public createTradeInterface(): HTMLElement {
        const tradeInterface = document.createElement("div");
        tradeInterface.classList.add("trade-interface");
        return tradeInterface;
    }
}