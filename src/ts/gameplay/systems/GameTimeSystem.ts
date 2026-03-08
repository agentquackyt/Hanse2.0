import { TickSystem } from "../../ecs/System";
import { GameTime } from "../GameTime";
import { HUDcontroller } from "../../render/HUDcontroller";

export class GameTimeSystem extends TickSystem {
    private readonly _gameTime = GameTime.getInstance();

    override update(dt: number): void {
        this._gameTime.advance(dt);
        HUDcontroller.getInstance().updateGameTime(this._gameTime.formatHudLabel());
    }
}