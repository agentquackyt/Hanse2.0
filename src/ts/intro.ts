import { AudioManager, type SoundId } from "./audio/AudioManager";

interface Slide {
    text: string;
    /** How long to hold the fully-visible slide, in ms. */
    hold?: number;
    /** Sound to play the moment the slide becomes visible. */
    triggerSound?: SoundId;
    keep?: boolean; // If true, the next slide will be expanding the previous instead of replacing it (new line)
}

const SLIDES: Slide[] = [
    { text: "Northern Europe\n1241 AD", hold: 2600 },
    { text: "", hold: 150 },
    { text: "The Hanseatic League binds the merchant cities of the Baltic coast.", hold: 3700, triggerSound: "Deus_Maris" },
    { text: "From Lübeck they sail north and east,\ncarrying grain, timber, cloth, and fur.", hold: 3500 },
    { text: "But the League is a closed club, \na secret society of powerful merchants.", hold: 3500 },
    { text: "A network of alliances, favors, and debts keeps the outsiders out.", hold: 3500 },
    { text: "Yet still...", hold: 1000 },
    { text: "... are you a young merchant with one ship,\na little gold, and great ambition.", hold: 3700 },
    { text: "Set sail, young merchant!", hold: 1500 },
    { text: "The Baltic awaits.", hold: 1000 },
];

const FADE_MS = 500;

export function runIntroSequence(): Promise<void> {
    return new Promise((resolve) => {
        const overlay = document.getElementById("intro-seq")!;
        overlay.innerHTML = "";
        overlay.classList.remove("hidden");

        // Skip button
        const skipBtn = document.createElement("button");
        skipBtn.textContent = "Skip Intro";
        skipBtn.className = "intro-skip";
        overlay.appendChild(skipBtn);

        // Container for captions
        const captionContainer = document.createElement("div");
        captionContainer.className = "intro-captions-container";
        overlay.appendChild(captionContainer);

        let done = false;

        function finish(): void {
            if (done) return;
            done = true;
            overlay.classList.add("hidden");
            resolve();
        }

        skipBtn.addEventListener("click", () => {
            AudioManager.getInstance().stop("Deus_Maris");
            overlay.animate(
                [{ opacity: 1 }, { opacity: 0 }],
                { duration: 300, fill: "forwards" },
            ).onfinish = finish;
        });

        let index = 0;
        let previousKeep = false;

        function runSlide(): void {
            if (done) return;

            if (index >= SLIDES.length) {
                overlay.animate(
                    [{ opacity: 1 }, { opacity: 0 }],
                    { duration: FADE_MS * 1.5, fill: "forwards", easing: "ease-in" },
                ).onfinish = finish;
                return;
            }

            const { text, hold = 2500, triggerSound, keep = false } = SLIDES[index] as Slide;

            // Clear container if previous slide didn't have keep
            if (!previousKeep) {
                captionContainer.innerHTML = "";
            }

            // Create new caption element
            const caption = document.createElement("p");
            caption.className = "intro-caption";
            caption.textContent = text;
            captionContainer.appendChild(caption);

            if (triggerSound) {
                AudioManager.getInstance().play(triggerSound, 0.7);
            }

            // Fade in
            caption.animate(
                [
                    { opacity: 0, transform: "translateY(10px)" },
                    { opacity: 1, transform: "translateY(0)" },
                ],
                { duration: FADE_MS, fill: "forwards", easing: "ease-out" },
            ).onfinish = () => {
                if (done) return;
                // Hold, then fade out (unless keep is true)
                setTimeout(() => {
                    if (done) return;
                    if (!keep) {
                        caption.animate(
                            [
                                { opacity: 1, transform: "translateY(0)" },
                                { opacity: 0, transform: "translateY(-10px)" },
                            ],
                            { duration: FADE_MS, fill: "forwards", easing: "ease-in" },
                        ).onfinish = () => {
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

        // Fade in the whole overlay, then start the first slide
        overlay.style.opacity = "0";
        overlay.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: FADE_MS, fill: "forwards", easing: "ease-out" },
        ).onfinish = runSlide;
    });
}
