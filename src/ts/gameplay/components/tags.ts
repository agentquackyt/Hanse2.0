import { Component } from "../../ecs/Entity";

/** Marks this entity as directly controlled by the human player. */
export class PlayerControlled extends Component {}

/** Marks this entity as an AI-controlled actor. */
export class AiControlled extends Component {}
