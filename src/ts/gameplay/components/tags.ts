import { Component } from "../../ecs/Entity";

/** Marks this entity as directly controlled by the human player. */
export class PlayerControlled extends Component {}

/** Marks this entity as an AI-controlled actor. */
export class AiControlled extends Component {}

/** Marks the virtual shadow-producer entity used by the economy balancer. */
export class ShadowProducer extends Component {}

/** Marks which player ship is currently selected / active. */
export class ActiveShip extends Component {}
