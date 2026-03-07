import hanseEngine from "./setup";
import { runIntroSequence } from "./intro";
import { AudioManager } from "./audio/AudioManager";

document.querySelector<HTMLButtonElement>("button.hanse-launch")
    ?.addEventListener("click", async () => {
        // AudioManager.getInstance().play("ui_click");

        // Preload all game sounds while the start screen fades out.
        // Runs after the user gesture so the AudioContext is allowed to start.
        await AudioManager.getInstance().preloadAll();

        document.getElementById("intro")!.classList.add("hidden");
        await runIntroSequence();
        document.getElementById("game")!.classList.remove("hidden");
        hanseEngine.start();
    });
