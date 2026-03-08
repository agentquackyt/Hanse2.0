import type { TradeGood } from "../gameplay/components/economy";

/**
 * Singleton that loads and caches good-icon sprites as `HTMLImageElement`s.
 * Call `loadGoodIcons()` once after the `GoodsRegistry` is ready, then use
 * `getIcon(goodName)` to retrieve a (possibly still loading) image.
 */
export class SpriteManager {
    private static _instance: SpriteManager | null = null;
    private readonly _sprites = new Map<string, HTMLImageElement>();

    private constructor() {}

    static getInstance(): SpriteManager {
        if (!SpriteManager._instance) {
            SpriteManager._instance = new SpriteManager();
        }
        return SpriteManager._instance;
    }

    /** Pre-load an `<img>` element for every good's icon file. */
    loadGoodIcons(goods: readonly TradeGood[]): void {
        for (const good of goods) {
            if (this._sprites.has(good.name)) continue;
            const img = new Image();
            img.src = `/assets/images/icons/${good.img}`;
            this._sprites.set(good.name, img);
        }
        console.log(`SpriteManager: loading ${this._sprites.size} good icons`);
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
