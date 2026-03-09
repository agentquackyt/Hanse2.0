import hanseEngine, { initWorld, renderSystem } from "./setup";
import "./Inspector";
import { runIntroSequence } from "./intro";
import { AudioManager } from "./audio/AudioManager";
import { preloadStartupAssets, type PreloadProgress } from "./boot/AssetPreloader";
import { SaveGameManager } from "./persistence/SaveGameManager";

const introScreen = document.getElementById("intro")!;
const loadingScreen = document.getElementById("loading-screen")!;
const gameScreen = document.getElementById("game")!;
const launchButton = document.getElementById("launch-game") as HTMLButtonElement | null;
const newVoyageButton = document.getElementById("new-voyage") as HTMLButtonElement | null;
const loadingStatus = document.getElementById("loading-status") as HTMLElement | null;
const loadingProgress = document.getElementById("loading-progress") as HTMLElement | null;

let isBooting = false;

function setIntroActive(isActive: boolean): void {
    document.body.classList.toggle("intro-active", isActive);
}

function updateLoadingText(progress: PreloadProgress | null, fallbackLabel: string): void {
    if (loadingStatus) {
        loadingStatus.textContent = progress?.label ?? fallbackLabel;
    }
    if (loadingProgress) {
        loadingProgress.textContent = progress
            ? `${progress.loaded}/${progress.total} resources ready`
            : "Preparing resources...";
    }
}

function refreshStartMenu(): void {
    const hasSave = SaveGameManager.hasSave();
    if (launchButton) {
        launchButton.textContent = hasSave ? "Resume Voyage" : "Set Sail";
    }
    newVoyageButton?.classList.toggle("hidden", !hasSave);
}

async function bootGame(options: { resume: boolean }): Promise<void> {
    if (isBooting) return;
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

        let latestProgress: PreloadProgress | null = null;
        const preloadPromise = Promise.all([
            AudioManager.getInstance().preloadAll(),
            preloadStartupAssets((progress) => {
                latestProgress = progress;
                updateLoadingText(progress, options.resume ? "Restoring your last voyage..." : "Preparing a new voyage...");
            }),
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

        hanseEngine.start();
        SaveGameManager.startAutosave(hanseEngine.world);
        SaveGameManager.saveWorld(hanseEngine.world);
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
