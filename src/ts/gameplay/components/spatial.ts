import { Component } from "../../ecs/Entity";

/** 2-D position on the world map (logical units, not pixels). */
export class Position extends Component {
    constructor(public x: number, public y: number) { super(); }
}
