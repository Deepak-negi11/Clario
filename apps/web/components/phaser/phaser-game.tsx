"use client"

import { useEffect , useRef } from "react";
import Phaser from "phaser";
import { ArenaScene } from "./scenes/arena-scene";
import type { RefObject } from "react";
import type { Others,Position,Reaction,AgentActivities } from "../../hooks/use-space-socket";
import type { AvatarLook, MapTemplateId } from "@repo/shared";
import type { SceneBridge } from "./scene-bridge";

type PhaserGameProps ={
    mapTemplate?: MapTemplateId;
    othersRef?:RefObject<Others>;
    selfRef?:RefObject<Position>;
    moveRef?:RefObject<(next:Position) =>void>;

    namesRef?:RefObject<Record<string,string>>;
    // Custom avatar colours by user id; players without one use the default character.
    looksRef?:RefObject<Record<string,AvatarLook>>;

    nearbyRef?:RefObject<Set<string>>;

    reactionsRef?:RefObject<Reaction[]>;
    activitiesRef?:RefObject<AgentActivities>;
    playerClickRef?:RefObject<((userId:string|null)=>void)|null>;
    bridgeRef?:RefObject<SceneBridge>;
    selfId?: string | null;
    // Called once the map scene has loaded its art and drawn itself.
    onReady?: () => void;
}

export function PhaserGame({mapTemplate = "classic-office",othersRef,selfRef,moveRef,namesRef,looksRef,nearbyRef,reactionsRef,activitiesRef,playerClickRef,bridgeRef,selfId,onReady}:PhaserGameProps){


    const containerRef = useRef<HTMLDivElement | null>(null);

    // Kept in a ref so a new callback each render doesn't restart the game.
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;



    const gameRef = useRef<Phaser.Game | null>(null);


    useEffect(()=>{
        if(!containerRef.current) return;

        if(gameRef.current) return;


        gameRef.current = new Phaser.Game({
            type:Phaser.AUTO,
            parent:containerRef.current,
            // The game plays no sound; without this Phaser keeps an AudioContext that
            // throws "Cannot suspend a closed AudioContext" after the game is destroyed.
            audio: { noAudio: true },
            width: "100%",
            height: "100%",
            backgroundColor:"#0b110d",
            pixelArt:true,
            scale:{
                mode:Phaser.Scale.RESIZE,
                autoCenter:Phaser.Scale.CENTER_BOTH
            },

            callbacks:{
                preBoot:(game) =>{
                    game.registry.set("mapTemplate", mapTemplate);
                    game.registry.set("othersRef" , othersRef);
                    game.registry.set("selfRef", selfRef);
                    game.registry.set("moveRef" , moveRef);
                    game.registry.set("namesRef" , namesRef);
                    game.registry.set("looksRef" , looksRef);
                    game.registry.set("nearbyRef" , nearbyRef);
                    game.registry.set("reactionsRef" , reactionsRef);
                    game.registry.set("activitiesRef" , activitiesRef);
                    game.registry.set("playerClickRef" , playerClickRef);
                    game.registry.set("bridgeRef" , bridgeRef);
                },
                postBoot:(game) =>{
                    // The scene is still loading its images here; report ready when create() has run.
                    const scene = game.scene.scenes[0];
                    if (!scene || scene.sys.isActive()) onReadyRef.current?.();
                    else scene.events.once(Phaser.Scenes.Events.CREATE, () => onReadyRef.current?.());
                },
            },

            scene:[ArenaScene]
        });

        return ()=>{
            gameRef.current?.destroy(true);
            gameRef.current = null
        };


    },[mapTemplate, othersRef, selfRef, moveRef, namesRef, looksRef, nearbyRef, reactionsRef, activitiesRef, playerClickRef, bridgeRef]);

    useEffect(() => {
        if (gameRef.current) {
            gameRef.current.registry.set("selfId", selfId);
        }
    }, [selfId]);

    return <div ref ={containerRef} className="h-full w-full"/>



}
