import { SaveGameManager } from "../persistence/SaveGameManager";

interface TutorialStep {
    title: string;
    body: string;
}

const STEPS: TutorialStep[] = [
    {
        title: "Welcome, Merchant!",
        body: `You are a young Hanseatic trader. Sail the northern seas, buy low, sell high, and grow your trading empire across medieval Europe.`,
    },
    {
        title: "Navigating the Map",
        body: `<kbd>Scroll</kbd> to zoom in and out. Hold <kbd>Right‑Click</kbd> and drag to pan the map.`,
    },
    {
        title: "Setting Sail",
        body: `Hold <kbd>Shift</kbd> and click a city on the map to send your ship there. Your ship will chart a course along the sea routes automatically.`,
    },
    {
        title: "Reading the Map",
        body: `Cities glow <span class="tutorial-dot tutorial-dot-blue"></span> <strong>blue</strong> when your ship is docked there, and <span class="tutorial-dot tutorial-dot-red"></span> <strong>red</strong> when you own a Kontor in that city.`,
    },
    {
        title: "Fleet Controls",
        body: `Press <kbd>Tab</kbd> to cycle your active ship. The active ship is the one shown in the ship panel, which is also used for sailing orders. <br> It will be selected automatically when you click a city, but you can change it at any time with <kbd>Tab</kbd> or by clicking a ship in the dropdown when trading.`,
    },
    {
        title: "Trading Goods",
        body: `Click a city where your ship is docked to open its trade panel. Use the sliders to buy or sell goods - buy cheap, sail to another port, and sell for profit!`,
    },
    {
        title: "Scarce Goods",
        body: `Some goods are scarce in certain cities. Keep an eye out for these opportunities to buy low and sell high! <br> If you see an good icon (for example <img src="./assets/images/icons/gewuerze.png" alt="Spices" />) next to a city, it indicates the most scarce good in that city's market.`,
    },
    {
        title: "Shipbuilding",
        body: `Open a city and switch to the <strong>Production</strong> tab to inspect its <strong>Shipyard</strong>. If no vessel is already under construction, you can order a new ship there as soon as your company can afford the price and materials.`,
    },
    {
        title: "Kontors",
        body: `A Kontor is your warehouse in a city. It stores goods and gold while your ship sails on. You start with a Kontor in your home city, Lübeck. `,
    },
    {
        title: "Becoming Mayor",
        body: `If you build up enough reputation in a city, you can run for mayor there. Winning the election grants you a powerful bonus and a steady income from the city treasury.`,
    },
    {
        title: "Becoming Mayor",
        body: `To gain reputation, keep the city's market satisfied by ensuring its supply meets demand. If the market is scarce (supply is very low compared to demand), you gain reputation by selling goods there. If the market is oversupplied, you gain reputation by buying goods and helping to balance it out!`,
    }
];

export class TutorialController {
    private static _instance: TutorialController | null = null;

    private _panel: HTMLElement;
    private _titleEl: HTMLElement;
    private _bodyEl: HTMLElement;
    private _stepLabel: HTMLElement;
    private _nextBtn: HTMLButtonElement;
    private _backBtn: HTMLButtonElement;
    private _skipBtn: HTMLButtonElement;
    private _helpBtn: HTMLElement;
    private _currentStep = 0;

    private constructor() {
        this._panel = document.getElementById("tutorial-panel")!;
        this._titleEl = this._panel.querySelector(".tutorial-title")!;
        this._bodyEl = this._panel.querySelector(".tutorial-body")!;
        this._stepLabel = this._panel.querySelector(".tutorial-step-label")!;
        this._nextBtn = this._panel.querySelector(".tutorial-next-btn") as HTMLButtonElement;
        this._backBtn = this._panel.querySelector(".tutorial-back-btn") as HTMLButtonElement;
        this._skipBtn = this._panel.querySelector(".tutorial-skip-btn") as HTMLButtonElement;
        this._helpBtn = document.getElementById("tutorial-help-btn")!;

        this._nextBtn.addEventListener("click", () => this._next());
        this._backBtn.addEventListener("click", () => this._back());
        this._skipBtn.addEventListener("click", () => this.dismiss());
        this._helpBtn.addEventListener("click", () => this.show());
    }

    public static getInstance(): TutorialController {
        if (!TutorialController._instance) {
            TutorialController._instance = new TutorialController();
        }
        return TutorialController._instance;
    }

    public show(step = 0): void {
        this._currentStep = step;
        this._renderStep();
        this._panel.classList.remove("hidden");
        this._helpBtn.classList.add("hidden");
    }

    public dismiss(): void {
        this._panel.classList.add("hidden");
        SaveGameManager.markTutorialSeen();
        this.showHelpButton();
    }

    public showHelpButton(): void {
        this._helpBtn.classList.remove("hidden");
    }

    private _next(): void {
        if (this._currentStep >= STEPS.length - 1) {
            this.dismiss();
            return;
        }
        this._currentStep++;
        this._renderStep();
    }

    private _back(): void {
        if (this._currentStep <= 0) return;
        this._currentStep--;
        this._renderStep();
    }

    private _renderStep(): void {
        const step = STEPS[this._currentStep]!;
        this._stepLabel.textContent = `Tip ${this._currentStep + 1} / ${STEPS.length}`;
        this._titleEl.textContent = step.title;
        this._bodyEl.innerHTML = step.body;
        this._nextBtn.textContent = this._currentStep >= STEPS.length - 1 ? "Got it!" : "Next →";
        this._backBtn.disabled = this._currentStep === 0;
        this._backBtn.style.opacity = this._currentStep === 0 ? "0" : "1";
    }
}
