import { Component } from "../../ecs/Entity";

/** Human-readable display name. */
export class Name extends Component {
    constructor(public value: string) { super(); }
}

/** Marks an entity as a city or harbour. */
export class City extends Component {
    constructor(public population: number = 1_000) { super(); }
}

/** Marks an entity as a sailing vessel. */
export class Ship extends Component {
    constructor(
        /** Maximum cargo in trade-good units. */
        public cargoCapacity: number = 100,
        /** World-map units per second at full sail. */
        public speedUnitsPerSecond: number = 10,
    ) { super(); }
}

export class IsPlayerOwned extends Component { 
    constructor(public isPlayerOwned: boolean) { super(); }
}

/** A merchant's trading company information. */
export class Merchant extends Component {
    constructor(public companyName: string) { super(); }
}
