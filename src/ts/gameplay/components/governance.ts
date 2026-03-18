import { Component } from "../../ecs/Entity";

export type TreasuryLogType =
    | "election_fee"
    | "election_win"
    | "city_to_player"
    | "player_to_city"
    | "population_investment"
    | "facility_construction";

export interface TreasuryLogEntry {
    readonly timestamp: number;
    readonly type: TreasuryLogType;
    readonly amount: number;
    readonly cityBalanceAfter: number;
    readonly playerBalanceAfter: number;
    readonly note: string;
}

export interface CityFacility {
    readonly goodName: string;
    readonly weeklyOutput: number;
    readonly treasuryCost: number;
}

/** City treasury funds, independent from the shadow economy reserve. */
export class CityTreasury extends Component {
    constructor(public amount: number = 0) { super(); }
}

export class CityGovernance extends Component {
    public reputationPercent = 0;
    public lastElectionWeek = 0;
    public incumbentLocked = false;
    public candidateForElection = false;
    public candidacyPaidWeek = 0;
    public electionEligible = true;
    public readonly treasuryLog: TreasuryLogEntry[] = [];
}

export class CityFacilities extends Component {
    private readonly _facilities: CityFacility[] = [];

    addFacility(facility: CityFacility): boolean {
        this._facilities.push(facility);
        return true;
    }

    getFacility(goodName: string): CityFacility | undefined {
        return this._facilities.find(f => f.goodName === goodName);
    }

    *entries(): IterableIterator<[string, CityFacility]> {
        const byGood = new Map<string, CityFacility>();
        for (const facility of this._facilities) {
            const existing = byGood.get(facility.goodName);
            if (existing) {
                // Aggregate production for same good
                byGood.set(facility.goodName, {
                    goodName: facility.goodName,
                    weeklyOutput: existing.weeklyOutput + facility.weeklyOutput,
                    treasuryCost: existing.treasuryCost + facility.treasuryCost,
                });
            } else {
                byGood.set(facility.goodName, facility);
            }
        }
        yield* byGood.entries();
    }

    serialize(): CityFacility[] {
        return [...this._facilities];
    }

    restore(facilities: CityFacility[]): void {
        this._facilities.length = 0;
        this._facilities.push(...facilities);
    }
}
