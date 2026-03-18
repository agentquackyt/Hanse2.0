import { TickSystem } from "../../ecs/System";
import { Entity } from "../../ecs/Entity";
import { GameTime } from "../GameTime";
import {
    City,
    CityGovernance,
    CityTreasury,
    Gold,
    Inventory,
    IsPlayerOwned,
    Kontor,
    Merchant,
    Name,
    PlayerIsMayor,
    Position,
} from "../components";
import { NotificationManager } from "../../render/NotificationManager";
import { HUDcontroller } from "../../render/HUDcontroller";

export const ELECTION_INTERVAL_WEEKS = 2;
export const ELECTION_FEE_GOLD = 5_000;
export const ELECTION_WIN_REPUTATION = 50;

const MAX_LEDGER_ENTRIES = 200;

export class ElectionSystem extends TickSystem {
    private _accumulated = 0;
    private _lastProcessedWeek = 0;

    override update(dt: number): void {
        this._accumulated += dt;
        if (this._accumulated < 1) return;
        this._accumulated = 0;

        const week = GameTime.getInstance().snapshot().week;
        if (week < ELECTION_INTERVAL_WEEKS) return;
        if (week === this._lastProcessedWeek) return;
        if (week % ELECTION_INTERVAL_WEEKS !== 0) return;

        this._lastProcessedWeek = week;

        for (const city of this.world.query(City, Name, Gold, CityGovernance)) {
            const governance = city.getComponent(CityGovernance)!;
            if (governance.incumbentLocked && city.hasComponent(PlayerIsMayor)) {
                governance.lastElectionWeek = week;
                continue;
            }

            if (governance.lastElectionWeek === week) continue;
            this._runElection(city, week);
        }

        HUDcontroller.getInstance().notifyDataChange();
    }

    private _runElection(city: Entity, week: number): void {
        const cityName = city.getComponent(Name)?.value ?? "City";
        const cityTreasury = city.getComponent(CityTreasury)!;
        const governance = city.getComponent(CityGovernance)!;
        governance.lastElectionWeek = week;

        // Elections only evaluate the player if candidacy fee was paid via UI action.
        console.log(`[ElectionSystem] Checking election for ${cityName}, candidateForElection=${governance.candidateForElection}`);
        if (!governance.candidateForElection) return;

        const playerCompany = this.world.query(Merchant, Gold, IsPlayerOwned)[0];
        const playerGold = playerCompany?.getComponent(Gold);
        if (!playerGold) return;

        const reputation = Math.max(0, Math.min(100, governance.reputationPercent));
        const playerIsTopTrader = true;
        const playerWon = playerIsTopTrader && reputation >= ELECTION_WIN_REPUTATION;

        console.log(`[ElectionSystem] ${cityName}: reputation=${Math.round(reputation)}%, playerWon=${playerWon}`);

        // A paid candidacy is consumed by this election cycle.
        governance.candidateForElection = false;

        if (!playerWon) {
            NotificationManager.getInstance().push({
                title: `${cityName}: Election lost`,
                message: `Reputation is ${Math.round(reputation)}%. Reach at least 50% to win.`,
                type: "info",
            });
            return;
        }

        console.log(`[ElectionSystem] ${cityName}: Player won! Granting mayor status and kontor.`);
        city.addComponent(new PlayerIsMayor());
        governance.incumbentLocked = true;
        this._grantKontorIfMissing(city);
        HUDcontroller.getInstance().notifyDataChange();

        this._logElection(governance, {
            timestamp: Date.now(),
            type: "election_win",
            amount: 0,
            cityBalanceAfter: cityTreasury.amount,
            playerBalanceAfter: playerGold.amount,
            note: "Player elected mayor; incumbency is now permanent",
        });

        NotificationManager.getInstance().push({
            title: `${cityName}: You are now Mayor`,
            message: "Your incumbency is permanent in this city. Treasury authority unlocked.",
            type: "success",
            durationMs: 6200,
        });
    }

    private _grantKontorIfMissing(city: Entity): void {
        const cityPos = city.getComponent(Position);
        const cityName = city.getComponent(Name)?.value ?? "City";
        if (!cityPos) {
            console.log(`[Kontor] ${cityName}: No position found, skipping kontor creation`);
            return;
        }

        console.log(`[Kontor] ${cityName}: Checking for existing kontors at (${cityPos.x}, ${cityPos.y})`);

        for (const kontor of this.world.query(Kontor, IsPlayerOwned, Position)) {
            const pos = kontor.getComponent(Position)!;
            console.log(`[Kontor] Found existing kontor at (${pos.x}, ${pos.y})`);
            if (Math.abs(pos.x - cityPos.x) < 0.001 && Math.abs(pos.y - cityPos.y) < 0.001) {
                console.log(`[Kontor] ${cityName}: Kontor already exists at this location`);
                return;
            }
        }

        console.log(`[Kontor] ${cityName}: Creating new kontor`);
        const kontor = new Entity()
            .addComponent(new Position(cityPos.x, cityPos.y))
            .addComponent(new Name(`Kontor ${cityName}`))
            .addComponent(new Kontor(250))
            .addComponent(new IsPlayerOwned(true))
            .addComponent(new Inventory())
            .addComponent(new Gold(0));

        this.world.addEntity(kontor);
        console.log(`[Kontor] ${cityName}: Kontor entity created and added to world`);

        NotificationManager.getInstance().push({
            title: `${cityName}: Kontor granted`,
            message: "A mayoral kontor has been established for your company.",
            type: "success",
        });
    }

    private _logElection(governance: CityGovernance, entry: {
        timestamp: number;
        type: "election_win";
        amount: number;
        cityBalanceAfter: number;
        playerBalanceAfter: number;
        note: string;
    }): void {
        governance.treasuryLog.unshift(entry);
        if (governance.treasuryLog.length > MAX_LEDGER_ENTRIES) {
            governance.treasuryLog.length = MAX_LEDGER_ENTRIES;
        }
    }
}
