export type NotificationType = "info" | "success" | "warning" | "error";

export interface NotificationMessage {
    readonly title: string;
    readonly message: string;
    readonly type?: NotificationType;
    readonly durationMs?: number;
}

export class NotificationManager {
    private static _instance: NotificationManager | null = null;
    private _container: HTMLElement | null = null;

    public static getInstance(): NotificationManager {
        if (!NotificationManager._instance) {
            NotificationManager._instance = new NotificationManager();
        }
        return NotificationManager._instance;
    }

    public push(message: NotificationMessage): void {
        const container = this._ensureContainer();
        if (!container) return;

        const item = document.createElement("article");
        item.classList.add("notification-item", `notification-${message.type ?? "info"}`);

        const title = document.createElement("h4");
        title.classList.add("notification-title");
        title.textContent = message.title;

        const body = document.createElement("p");
        body.classList.add("notification-body");
        body.textContent = message.message;

        item.appendChild(title);
        item.appendChild(body);
        container.prepend(item);

        const duration = Math.max(1200, message.durationMs ?? 4500);
        window.setTimeout(() => {
            item.classList.add("notification-exit");
            window.setTimeout(() => item.remove(), 220);
        }, duration);
    }

    private _ensureContainer(): HTMLElement | null {
        if (this._container && document.body.contains(this._container)) {
            return this._container;
        }

        this._container = document.getElementById("notifications");
        if (this._container) return this._container;

        const dynamic = document.createElement("section");
        dynamic.id = "notifications";
        dynamic.classList.add("notifications-container");
        document.body.appendChild(dynamic);
        this._container = dynamic;
        return this._container;
    }
}
