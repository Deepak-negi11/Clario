import Phaser from "phaser";
import type { SceneBridge } from "../scene-bridge";
import { addTalkNpc, type TalkNpc } from "./talk-npc";

// Maya, the mentor NPC for the Practice Session (PS7_BUILD_BRIEF.md section 16).
// She stands still on one tile. Walk next to her and press E (or click her) to open the
// panel; while the panel is open her tag shows whether she is listening, thinking or speaking.

const TEXTURE = "maya";

export function preloadMentorNpc(scene: Phaser.Scene) {
    scene.load.spritesheet(TEXTURE, "/assets/amelia-run.png", { frameWidth: 16, frameHeight: 32 });
}

export type MentorNpc = TalkNpc;

type MentorNpcOptions = {
    tileX: number;
    tileY: number;
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
};

export function addMentorNpc(scene: Phaser.Scene, { tileX, tileY, font, bridge, block }: MentorNpcOptions): MentorNpc {
    // Talk panels (hers and the AI coworkers') turn the game keyboard off while someone types.
    if (bridge) {
        bridge.setKeyboardEnabled = (enabled) => {
            if (scene.input.keyboard) scene.input.keyboard.enabled = enabled;
        };
        scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
            bridge.setKeyboardEnabled = undefined;
            bridge.mentorState = undefined;
        });
    }

    return addTalkNpc(scene, {
        tileX,
        tileY,
        font,
        bridge,
        block,
        texture: TEXTURE,
        name: "Maya",
        role: "mentor",
        tagColor: "#b8325e",
        talk: () => bridge?.openMentor?.(),
        state: () => bridge?.mentorState,
    });
}
