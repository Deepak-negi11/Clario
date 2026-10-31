import Phaser from "phaser";
import { coworkerMission, getCoworker, type AvatarLook, type CoworkerId } from "@repo/shared";
import { HQ_COWORKERS } from "../../../lib/maps/clario-hq";
import type { SceneBridge } from "../scene-bridge";
import { addTalkNpc, type TalkNpc } from "./talk-npc";

// The AI coworkers, each in their own look (the same on every map), standing at `spots`: Clario
// HQ's (HQ_COWORKERS), or the ones the scene chose on another map (lib/maps/coworker-spots.ts).
// Talking to one opens their panel (components/coworkers/coworker-on-map.tsx) through
// bridge.openCoworker.

export type CoworkerNpc = TalkNpc & { id: CoworkerId };

const LOOKS = new Map(HQ_COWORKERS.map(({ id, look }) => [id, look]));

type CoworkerNpcOptions = {
    spots: Partial<Record<CoworkerId, { x: number; y: number }>>;
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
    unblock: (x: number, y: number) => void;
    // The scene's texture for a look: the same recoloured sheets players get.
    texture: (look: AvatarLook) => string;
    busy?: () => boolean;
};

export function addCoworkerNpcs(scene: Phaser.Scene, { spots, font, bridge, block, unblock, texture, busy }: CoworkerNpcOptions): CoworkerNpc[] {
    return (Object.entries(spots) as [CoworkerId, { x: number; y: number }][]).flatMap(([id, { x, y }]) => {
        const coworker = getCoworker(id);
        const look = LOOKS.get(id);
        if (!coworker || !look) return [];
        const { name, role } = coworkerMission(coworker).coworker;
        return [{ id, ...addTalkNpc(scene, {
            tileX: x,
            tileY: y,
            font,
            bridge,
            block,
            unblock,
            texture: texture(look),
            name: name.split(" ")[0]!,
            role: role.toLowerCase(),
            tagColor: coworker.color,
            talk: () => bridge?.openCoworker?.(id),
            state: () => (bridge?.coworkerState?.id === id ? bridge.coworkerState.state : undefined),
            busy,
        }) }];
    });
}
