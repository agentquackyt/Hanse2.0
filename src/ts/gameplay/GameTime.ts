export const REAL_SECONDS_PER_DAY = 30;
export const DAYS_PER_WEEK = 7;
export const DEMAND_DAYS_PER_WEEK = 7;
export const REAL_SECONDS_PER_WEEK = REAL_SECONDS_PER_DAY * DAYS_PER_WEEK;
const GAME_SECONDS_PER_DAY = 24 * 60 * 60;

export interface GameTimeSnapshot {
    week: number;
    day: number;
    hour: number;
    minute: number;
}

export class GameTime {
    private static _instance: GameTime | null = null;
    private _elapsedRealSeconds = 0;

    private constructor() {}

    public static getInstance(): GameTime {
        if (!GameTime._instance) {
            GameTime._instance = new GameTime();
        }
        return GameTime._instance;
    }

    public advance(dt: number): void {
        this._elapsedRealSeconds += Math.max(0, dt);
    }

    public setElapsedRealSeconds(seconds: number): void {
        this._elapsedRealSeconds = Math.max(0, seconds);
    }

    public get elapsedRealSeconds(): number {
        return this._elapsedRealSeconds;
    }

    public snapshot(): GameTimeSnapshot {
        const totalDaysElapsed = Math.floor(this._elapsedRealSeconds / REAL_SECONDS_PER_DAY);
        const secondsIntoDay = this._elapsedRealSeconds % REAL_SECONDS_PER_DAY;
        const gameSecondsIntoDay = Math.floor((secondsIntoDay / REAL_SECONDS_PER_DAY) * GAME_SECONDS_PER_DAY);

        return {
            week: Math.floor(totalDaysElapsed / DAYS_PER_WEEK) + 1,
            day: (totalDaysElapsed % DAYS_PER_WEEK) + 1,
            hour: Math.floor(gameSecondsIntoDay / 3600),
            minute: Math.floor((gameSecondsIntoDay % 3600) / 60),
        };
    }

    public formatHudLabel(): string {
        const current = this.snapshot();
        return `Week ${current.week} · Day ${current.day}`;
    }
}