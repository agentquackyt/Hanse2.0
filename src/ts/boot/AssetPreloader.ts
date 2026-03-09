import { GoodsRegistry } from "../gameplay/GoodsRegistry";
import { SpriteManager } from "../render/SpriteManager";

export interface PreloadProgress {
    loaded: number;
    total: number;
    label: string;
}

const STATIC_IMAGE_URLS = [
    "./assets/images/texture_background.webp",
    "./assets/images/world_map_2.svg",
    "./assets/images/new_world_map.png",
    "./assets/images/ship.svg",
];

const preloadedImages = new Map<string, HTMLImageElement>();
const imagePromises = new Map<string, Promise<HTMLImageElement>>();

export function loadImageAsset(url: string): Promise<HTMLImageElement> {
    const existingImage = preloadedImages.get(url);
    if (existingImage) {
        return Promise.resolve(existingImage);
    }

    const existingPromise = imagePromises.get(url);
    if (existingPromise) {
        return existingPromise;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            preloadedImages.set(url, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
        img.src = url;
    });

    imagePromises.set(url, promise);
    return promise;
}

export function getPreloadedImage(url: string): HTMLImageElement | null {
    return preloadedImages.get(url) ?? null;
}

export async function preloadStartupAssets(onProgress?: (progress: PreloadProgress) => void): Promise<void> {
    const registry = await GoodsRegistry.load();
    const goods = registry.getAllGoods();
    const total = STATIC_IMAGE_URLS.length + goods.length;
    let loaded = 0;

    const report = (label: string): void => {
        onProgress?.({ loaded, total, label });
    };

    report("Preparing the docks...");

    for (const url of STATIC_IMAGE_URLS) {
        report(`Loading ${url.split("/").at(-1) ?? url}`);
        await loadImageAsset(url);
        loaded += 1;
        report(`Loaded ${url.split("/").at(-1) ?? url}`);
    }

    await SpriteManager.getInstance().preloadGoodIcons(goods, (goodName, finishedCount) => {
        loaded = STATIC_IMAGE_URLS.length + finishedCount;
        report(`Loading ${goodName}`);
    });

    loaded = total;
    report("All resources ready");
}