import type { TradeGood } from "../gameplay/components/economy";

/**
 * Singleton that loads and caches good-icon sprites as `HTMLImageElement`s.
 * Call `loadGoodIcons()` once after the `GoodsRegistry` is ready, then use
 * `getIcon(goodName)` to retrieve a (possibly still loading) image.
 */
export class SpriteManager {
    private static _instance: SpriteManager | null = null;
    private readonly _sprites = new Map<string, HTMLImageElement>();
    private readonly _loadingPromises = new Map<string, Promise<void>>();

    private constructor() {}

    static getInstance(): SpriteManager {
        if (!SpriteManager._instance) {
            SpriteManager._instance = new SpriteManager();
        }
        return SpriteManager._instance;
    }

    /** Pre-load an `<img>` element for every good's icon file. */
    loadGoodIcons(goods: readonly TradeGood[]): void {
        void this.preloadGoodIcons(goods);
        console.log(`SpriteManager: loading ${this._sprites.size} good icons`);
    }

    async preloadGoodIcons(
        goods: readonly TradeGood[],
        onLoaded?: (goodName: string, loadedCount: number) => void,
    ): Promise<void> {
        let loadedCount = 0;

        for (const good of goods) {
            await this._queueSprite(good).then(() => {
                loadedCount += 1;
                onLoaded?.(good.name, loadedCount);
            });
        }
    }

    private _queueSprite(good: TradeGood): Promise<void> {
        const existingPromise = this._loadingPromises.get(good.name);
        if (existingPromise) return existingPromise;

        let img = this._sprites.get(good.name);
        if (!img) {
            img = new Image();
            this._sprites.set(good.name, img);
        }

        if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
        }

        const promise = new Promise<void>((resolve, reject) => {
            const onLoad = (): void => {
                cleanup();
                resolve();
            };

            const onError = (): void => {
                cleanup();
                reject(new Error(`Failed to load sprite for ${good.name}`));
            };

            const cleanup = (): void => {
                img?.removeEventListener("load", onLoad);
                img?.removeEventListener("error", onError);
            };

            img!.addEventListener("load", onLoad, { once: true });
            img!.addEventListener("error", onError, { once: true });
            img!.src = `/assets/images/icons/${good.img}`;
        });

        this._loadingPromises.set(good.name, promise);
        return promise;
    }

    /** Retrieve the icon image for a good by name. May still be loading. */
    getIcon(goodName: string): HTMLImageElement | undefined {
        return this._sprites.get(goodName);
    }

    /** True when every queued image has finished loading successfully. */
    isReady(): boolean {
        for (const img of this._sprites.values()) {
            if (!img.complete || img.naturalWidth === 0) return false;
        }
        return true;
    }
}
