import Phaser from "phaser";
import { coworkerMission, getCoworker, type AvatarLook } from "@repo/shared";
import { HQ_COWORKERS } from "../../../lib/maps/clario-hq";
import type { SceneBridge } from "../scene-bridge";
import { addTalkNpc, type TalkNpc } from "./talk-npc";

// The AI coworkers in Clario HQ (HQ_COWORKERS), each in their own look. Talking to one opens
// their panel (components/coworkers/coworker-on-map.tsx) through bridge.openCoworker.

type CoworkerNpcOptions = {
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
    // The scene's texture for a look: the same recoloured sheets players get.
    texture: (look: AvatarLook) => string;
    busy?: () => boolean;
};

export function addCoworkerNpcs(scene: Phaser.Scene, { font, bridge, block, texture, busy }: CoworkerNpcOptions): TalkNpc[] {
    return HQ_COWORKERS.flatMap(({ id, x, y, look }) => {
        const coworker = getCoworker(id);
        if (!coworker) return [];
        const { name, role } = coworkerMission(coworker).coworker;
        return [addTalkNpc(scene, {
            tileX: x,
            tileY: y,
            font,
            bridge,
            block,
            texture: texture(look),
            name: name.split(" ")[0]!,
            role: role.toLowerCase(),
            tagColor: coworker.color,
            talk: () => bridge?.openCoworker?.(id),
            state: () => (bridge?.coworkerState?.id === id ? bridge.coworkerState.state : undefined),
            busy,
        })];
    });
}
