import Phaser from "phaser";
import { customRoomAt, getChatRoomAtPosition, getMapTemplate, type ChatRoomZone, type CustomMap, type MapTemplateId } from "@repo/shared";
import { HQ_FLOORS, HQ_MENTOR } from "../../../lib/maps/clario-hq";
import { CAMPUS_ITEMS, CLASSIC_OFFICE_ITEMS } from "../../../lib/maps/classic-campus";
import { findPath } from "../../../lib/maps/path-finder";
import type { MinimapFloor, SceneBridge } from "../scene-bridge";
import { buildClarioHq, HQ_FLOOR_COLORS, itemTextureKey, makeHqTextures, placeItems, type HqSceneApi } from "./clario-hq-builder";
import { buildCustomMap, customMinimapFloors } from "./custom-map-builder";
import {
    GENERATED_PLANT_KEYS, beanbagKey, makeLoungeTextures, rugKey, sofaKey,
    type BeanbagColor, type RugColor, type SofaColor,
} from "./lounge-art";
import { AVATAR_BASES, type AvatarLook } from "@repo/shared";
import { FRAME_COUNT, FRAME_HEIGHT, FRAME_WIDTH, lookKey, recolorSheet, sheetUrl } from "../../../lib/avatar/recolor";

// First frame of each six-frame walk in a character sheet.
const WALK_START = { right: 0, up: 6, left: 12, down: 18 } as const;
type WalkDir = keyof typeof WALK_START;
import { addMentorNpc, preloadMentorNpc, type MentorNpc } from "./mentor-npc";
import { addCoworkerNpcs } from "./coworker-npcs";
import { addClaudeNpcs, type ClaudeNpcs } from "./claude-npcs";
import { addPlaySpots, type PlaySpots } from "./play-spots";
import { addPropsOnMap, RIDE_STEP_MS, type Holder, type PropsOnMap } from "./props-on-map";
import { isTypingIn } from "./talk-npc";
import type { TalkNpc } from "./talk-npc";
import { addErrandMarker } from "./errand-marker";

// Chairs and tables drawn in code (see makeFurnitureTextures) instead of loaded from image files.
// They keep the original keys and sizes, so every map layout stays exactly the same.
const GENERATED_TEXTURES = new Set([
    "conf-table", "team-desk", "desk-monitor", "office-chair", "office-chair-red", "campus-conf-red-down",
    "campus-conf-red-up", "ref-task-dark-up", "ref-task-dark-down", "ref-task-dark-left", "ref-task-dark-right",
    ...GENERATED_PLANT_KEYS,
]);

const TILE = 32;

// Minimap colours for the floor textures the older maps use.
const FLOOR_MINIMAP_COLORS: Record<string, number> = {
    "floor-wood": 0xe9dcc0, "floor-office": 0xb6bedc, "floor-conf": 0xc3d7ca,
    "floor-lounge": 0xdbcaad, "floor-cafe": 0xe5e0d2,
};

// Rooms with a dark floor get light sign text.
const LIGHT_SIGN_ROOMS = new Set(["hq-game-room"]);

export class ArenaScene extends Phaser.Scene{
    private cols = 44;
    private rows = 34;

    private tileX = 19;
    private tileY = 27;
    private selfRef?: { current: { x: number; y: number } };

    private maxTileX = 0;
    private maxTileY = 0;

    private facing : "down" |"up" | "right" | "left" = "down";
    private isMoving = false;

    private otherSprites:Record<string,Phaser.GameObjects.Sprite> = {}
    private otherRef?:{current:Record<string,{x:number;y:number}>}
    private moveRef?: {current:(p:{x:number;y:number})=>void}

    private namesRef?: {current:Record<string,string>}
    private looksRef?: {current:Record<string,AvatarLook>}

    private nearbyRef?: {current:Set<string>}

    private reactionsRef?: {current:{id:string;userId:string;emoji:string;at:number}[]}
    private shownReactions = new Set<string>();

    private activitiesRef?: {current:Record<string,{text:string;state:"cooking"|"done";at:number}>}
    private playerClickRef?: {current:((userId:string|null)=>void)|null}
    private agentPets: Record<string, Phaser.GameObjects.Sprite> = {};

    private otherTagNames: Record<string, string> = {};
    private selfTagName = "";


    private path: { x: number; y: number }[] = [];

    private otherTiles: Record<string, { x: number; y: number }> = {};


    private chairMap: Record<string, "up" | "down" | "left" | "right"> = {};
    private chairLiftMap: Record<string, number> = {};

    private nameTag!: Phaser.GameObjects.Container;
    private otherTags: Record<string, Phaser.GameObjects.Container> = {};

    private playerShadow!: Phaser.GameObjects.Ellipse;
    private otherShadows: Record<string, Phaser.GameObjects.Ellipse> = {};

    private blocked = new Set<string>();

    private wallCells = new Set<string>();

    private mapTemplateId: MapTemplateId = "classic-office";
    private bridge?: { current: SceneBridge };
    private minimapFloors: MinimapFloor[] = [];
    // A map built in the map builder, and everything drawn for it (redrawn while it is edited).
    private customMap: CustomMap | null = null;
    private customObjects: Phaser.GameObjects.GameObject[] = [];
    private builderGhost?: Phaser.GameObjects.Graphics;
    private builderGhostImage?: Phaser.GameObjects.Image;
    private labelFont = "sans-serif";
    private roomSigns: Record<string, { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; width: number }> = {};
    private roomHighlight!: Phaser.GameObjects.Graphics;
    private currentRoomId: string | null = null;

    private player!: Phaser.GameObjects.Sprite
    private mentor?: MentorNpc;
    private coworkers: TalkNpc[] = [];
    private claudes?: ClaudeNpcs;
    private playSpots?: PlaySpots;
    private props?: PropsOnMap;
    // The way each other person last walked, so their bike faces it.
    private otherFacing: Record<string, "down" | "up" | "left" | "right"> = {};

    constructor(){
        super("arena")
    }

    preload(){
        preloadMentorNpc(this);

        this.load.spritesheet("adam","/assets/adam-run.png",{
            frameWidth:16,
            frameHeight:32
        });
        // The other base characters; a player's custom look is a recoloured copy of one.
        for (const base of AVATAR_BASES) {
            if (base !== "adam") this.load.image(`avatar-base-${base}`, sheetUrl(base));
        }

        for (const i of [6, 7, 8, 9, 12, 17, 19, 20, 22, 23]) {
            this.load.image("furn" + i, "/assets/furniture/piece_" + i + ".png");
        }

        for (const n of [
            "table-big", "table-small", "seat-tl", "seat-bl",
            "chair-wood", "chair-wood2", "pot-1", "pot-2", "mirror",
            "lamp-warm", "lamp-blue", "shelf-single",
        ]) {
            this.load.image(n, "/assets/furniture/sub/" + n + ".png");
        }

        this.load.image("lounge-chair", "/assets/custom/lounge-chair-sprite.png");
        for (const n of [
            "desk-monitor", "office-chair", "office-chair-red", "cabinet",
            "whiteboard", "water-cooler", "conf-table", "tv-wall",
            "coffee-round", "bookshelf-big", "plant-tall", "plant-fern",
            "ping-pong", "foosball", "arcade", "sofa-green-wide",
            "sofa-cream-wide", "armchair-green", "armchair-purple",
            "office-chair-teal", "team-desk", "cafe-counter",
            "reception-desk", "campus-pond", "window-planter",
            "campus-sofa-green", "campus-sofa-caramel",
            "campus-loveseat-green", "campus-pouf-purple", "campus-pouf-blue",
            "campus-side-table", "campus-reception-bench",
            ...["up", "down", "left", "right"].flatMap((dir) => [
                `campus-tufted-green-${dir}`, `campus-club-teal-${dir}`,
                `campus-task-teal-${dir}`, `campus-conf-red-${dir}`,
                `campus-wood-chair-${dir}`, `ref-blue-wood-${dir}`,
                `ref-natural-${dir}`, `ref-woven-teal-${dir}`,
                `ref-conference-red-${dir}`, `ref-task-dark-${dir}`,
            ]),
            "ref-table-data", "ref-table-books", "ref-table-coffee",
            "ref-table-lounge", "ref-coffee-station", "ref-aquarium-console",
            "ref-wall-books", "ref-lounge-sofa",
        ]) {
            if (GENERATED_TEXTURES.has(n)) continue;
            this.load.image(n, "/assets/custom/" + n + ".png");
        }

        for (const n of [
            "tree-green", "tree-lime", "tree-teal", "tree-teal2",
            "bush-small", "bush-ball", "flower-red", "flower-blue",
            "flower-yellow", "rock-small", "rock-med",
        ]) {
            this.load.image(n, "/assets/outdoor/" + n + ".png");
        }
    }

    create(){
        const template = getMapTemplate(this.registry.get("mapTemplate"));
        const mapTemplate = template.id;
        this.cols = template.dimensions.width;
        this.rows = template.dimensions.height;
        this.customMap = mapTemplate === "custom-office" ? (this.registry.get("customMap") as CustomMap | null) ?? null : null;
        if (this.customMap) {
            this.cols = this.customMap.cols;
            this.rows = this.customMap.rows;
        }
        const worldWidth = this.cols * TILE;
        const worldHeight = this.rows * TILE;


        this.otherRef = this.registry.get("othersRef");
        this.selfRef = this.registry.get("selfRef");
        this.moveRef = this.registry.get("moveRef");
        this.namesRef = this.registry.get("namesRef");
        this.looksRef = this.registry.get("looksRef");
        this.nearbyRef = this.registry.get("nearbyRef");
        this.reactionsRef = this.registry.get("reactionsRef");
        this.activitiesRef = this.registry.get("activitiesRef");
        this.playerClickRef = this.registry.get("playerClickRef");


        const initialPos = this.selfRef?.current;
        if (initialPos) {
            this.tileX = initialPos.x;
            this.tileY = initialPos.y;
        }

        this.makeTextures();
        this.makeFurnitureTextures();
        makeLoungeTextures(this);
        this.makeClaudePetTextures();
        if (!this.anims.exists("claude-pet-walk")) {
            this.anims.create({
                key: "claude-pet-walk",
                frames: [
                    { key: "claude-pet-0" },
                    { key: "claude-pet-1" },
                    { key: "claude-pet-2" },
                    { key: "claude-pet-3" },
                ],
                frameRate: 10,
                repeat: -1,
            });
        }




        this.add.tileSprite(0, 0, worldWidth, worldHeight, "grass").setOrigin(0, 0).setDepth(-1010);
        if (mapTemplate === "clario-hq") {
            makeHqTextures(this);
            buildClarioHq(this, this.mapApi());
            this.minimapFloors = HQ_FLOORS.map(({ x, y, w, h, kind }) => ({ x, y, w, h, color: HQ_FLOOR_COLORS[kind] }));
        } else if (mapTemplate === "custom-office") {
            makeHqTextures(this);
            if (this.customMap) this.buildCustom(this.customMap);
        } else if (mapTemplate === "coworking-campus") {
            this.buildCoworkingCampus();
        } else {
        this.add.tileSprite(20 * TILE, 30 * TILE, 4 * TILE, 4 * TILE, "path").setOrigin(0, 0).setDepth(-1005);


        const pondG = this.add.graphics();
        pondG.fillStyle(0x5b8fb5, 1);
        pondG.fillEllipse(29 * TILE, 31.5 * TILE, 122, 78);
        pondG.fillStyle(0x7db8d8, 1);
        pondG.fillEllipse(29 * TILE, 31.5 * TILE, 100, 58);
        pondG.fillStyle(0xa8d4e8, 0.8);
        pondG.fillEllipse(28.3 * TILE, 31.1 * TILE, 30, 12);
        pondG.setDepth(-1004);
        for (let x = 27; x <= 30; x++) {
            for (let y = 30; y <= 32; y++) this.blocked.add(x + "," + y);
        }








        this.add.tileSprite(3 * TILE, 2 * TILE, 38 * TILE, 28 * TILE, "floor-wood").setOrigin(0, 0).setDepth(-1000);
        this.minimapFloors.push({ x: 3, y: 2, w: 38, h: 28, color: FLOOR_MINIMAP_COLORS["floor-wood"]! });




        this.wallRow(3, 40, 2);
        this.wallRow(3, 40, 29, [20, 21, 22, 23]);
        this.wallCol(3, 2, 29);
        this.wallCol(40, 2, 29);

        this.wallCol(10, 3, 23, [5, 6, 12, 13, 19, 20]);
        this.wallRow(4, 9, 9);
        this.wallRow(4, 9, 16);
        this.wallRow(4, 9, 23);

        this.wallCol(33, 3, 23, [5, 6, 12, 13, 19, 20]);
        this.wallRow(34, 39, 9);
        this.wallRow(34, 39, 16);
        this.wallRow(34, 39, 23);



        this.wallCol(19, 3, 8);
        this.wallRow(12, 19, 9, [14, 15]);
        this.wallCol(23, 3, 8);
        this.wallCol(31, 3, 8);
        this.wallRow(23, 31, 9, [26, 27]);

        this.wallRow(12, 20, 11);
        this.wallCol(12, 12, 19);
        this.wallCol(20, 12, 18, [14, 15]);
        this.wallRow(12, 20, 19, [16, 17]);



        const edgeTouchesWall = (x: number, y: number, len: number, horizontal: boolean) => {
            for (let i = 0; i < len; i++) {
                const tx = horizontal ? x + i : x;
                const ty = horizontal ? y : y + i;
                if (this.wallCells.has(tx + "," + ty)) return true;
            }
            return false;
        };




        const zone = (x: number, y: number, w: number, h: number, key: string) => {
            this.minimapFloors.push({ x, y, w, h, color: FLOOR_MINIMAP_COLORS[key] ?? 0xe9dcc0 });
            const left = edgeTouchesWall(x - 1, y, h, false) ? 0.5 : 0;
            const right = edgeTouchesWall(x + w, y, h, false) ? 0.5 : 0;
            const top = edgeTouchesWall(x, y - 1, w, true) ? 0.5 : 0;
            const bottom = edgeTouchesWall(x, y + h, w, true) ? 0.5 : 0;
            this.add.tileSprite(
                (x - left) * TILE,
                (y - top) * TILE,
                (w + left + right) * TILE,
                (h + top + bottom) * TILE,
                key,
            ).setOrigin(0, 0).setDepth(-998);
        };


        zone(4, 3, 6, 6, "floor-office");
        zone(4, 10, 6, 6, "floor-office");
        zone(4, 17, 6, 6, "floor-office");
        zone(34, 3, 6, 6, "floor-office");
        zone(34, 10, 6, 6, "floor-office");
        zone(34, 17, 6, 6, "floor-office");
        zone(12, 3, 7, 6, "floor-office");
        zone(24, 3, 7, 6, "floor-office");
        zone(20, 3, 3, 6, "floor-cafe");

        zone(13, 12, 7, 7, "floor-conf");
        zone(22, 11, 10, 8, "floor-lounge");
        zone(12, 21, 10, 6, "floor-cafe");
        zone(34, 24, 6, 5, "floor-office");
        zone(4, 24, 6, 5, "floor-cafe");


        this.drawWalls();


        const rug = (x: number, y: number, w: number, h: number, color: number, alpha: number) => {
            const g = this.add.graphics();
            g.fillStyle(color, alpha);
            g.fillRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 10);
            g.setDepth(-996);
        };
        rug(13, 12, 7, 7, 0x5f7d6d, 0.12);
        rug(12, 21, 10, 6, 0x59726a, 0.16);
        rug(34, 24, 6, 5, 0x53667e, 0.14);






        const treeKeys = ["tree-green", "tree-lime", "tree-teal", "tree-teal2"];
        const tree = (tx: number, ty: number, k: number) => {
            this.add.image(tx * TILE, (ty + 1) * TILE, treeKeys[k % 4]!)
                .setOrigin(0, 1)
                .setDepth((ty + 1) * TILE);
            this.blocked.add(tx + "," + ty);
            this.blocked.add((tx + 1) + "," + ty);
        };

        [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42].forEach((x, i) => tree(x, 0, i));

        [3, 7, 11, 15, 19, 23, 27, 31].forEach((y, i) => { tree(0, y, i + 1); tree(42, y, i); });

        [1, 5, 9, 13, 16, 25, 33, 37, 40].forEach((x, i) => tree(x, 32, i + 2));


        const decor = (key: string, tx: number, ty: number, block: boolean) => {
            this.add.image((tx + 0.5) * TILE, (ty + 1) * TILE, key)
                .setOrigin(0.5, 1)
                .setDepth(block ? (ty + 1) * TILE : ty * TILE);
            if (block) this.blocked.add(tx + "," + ty);
        };
        decor("rock-small", 26, 30, true);
        decor("rock-med", 31, 31, true);
        decor("bush-small", 2, 30, true);
        decor("bush-small", 41, 30, true);
        decor("bush-ball", 2, 5, true);
        decor("bush-ball", 41, 13, true);
        decor("flower-red", 18, 30, false);
        decor("flower-blue", 24, 30, false);
        decor("flower-yellow", 6, 30, false);
        decor("flower-red", 35, 31, false);
        decor("flower-blue", 2, 14, false);
        decor("flower-yellow", 41, 21, false);
        decor("flower-blue", 13, 31, false);
        decor("flower-red", 32, 30, false);




        const placeItem = (key: string, fx: number, fy: number, opts?: {
            blockedOffsets?: [number, number][],
            chairOffsets?: { dx: number; dy: number; dir: "up" | "down" | "left" | "right" }[]
        }) => {
            const piece = this.add.image(fx * TILE, fy * TILE, key).setOrigin(0, 0);
            piece.setDepth(piece.y + piece.displayHeight);
            this.groundShadow(piece.x + piece.displayWidth / 2, piece.y + piece.displayHeight - 3, piece.displayWidth * 0.86);

            if (opts?.blockedOffsets) {
                opts.blockedOffsets.forEach(([dx, dy]) => {
                    this.blocked.add((fx + dx) + "," + (fy + dy));
                });
            } else {
                this.blockFootprint(fx, fy, piece.displayWidth, piece.displayHeight);
            }

            if (opts?.chairOffsets) {
                opts.chairOffsets.forEach(({ dx, dy, dir }) => {
                    this.chairMap[(fx + dx) + "," + (fy + dy)] = dir;
                });
            }
        };



        const pot = (key: string, tx: number, ty: number) =>
            placeItem(key, tx, ty, { blockedOffsets: [[0, 0]] });


        const wallMount = (key: string, cx: number, wy: number, scale = 1) =>
            this.add.image(cx * TILE, wy * TILE + 20, key).setScale(scale).setDepth(wy * TILE + 40);



        // Furniture: the same pieces as Clario HQ, listed in lib/maps/classic-campus.ts.
        makeHqTextures(this);
        placeItems(this, this.mapApi(), CLASSIC_OFFICE_ITEMS);
        wallMount("furn22", 15, 2, 0.6);
        wallMount("furn22", 27, 2, 0.6);
        wallMount("tv-wall", 16, 11);

        this.buildLounge(22, 11, { rug: "gray", sofa: "tan", beanbags: ["blue", "pink", "purple", "blue"] });

        pot("plant-tall", 19, 28);
        pot("plant-tall", 24, 28);
        pot("plant-fern", 22, 20);
        pot("plant-fern", 26, 20);
        pot("plant-fern", 30, 20);
        }

        this.mapTemplateId = mapTemplate;
        this.labelFont = getComputedStyle(document.body).fontFamily || "sans-serif";
        this.roomHighlight = this.add.graphics().setDepth(-990);
        this.buildRoomSigns();
        // The font may still be downloading; redraw signs and name tags once it is ready.
        void document.fonts.load(`600 12px ${this.labelFont}`).then(() => {
            if (!this.sys.isActive()) return;
            this.buildRoomSigns();
            this.selfTagName = "";
            this.otherTagNames = {};
        });




        this.maxTileX = this.cols - 1;
        this.maxTileY = this.rows - 1;

        const px = this.tileX * TILE + TILE / 2;
        const py = this.tileY * TILE + TILE / 2;

        this.player = this.add.sprite(px, py, "adam", 0);
        this.player.setScale(2);
        // Your own avatar isn't clickable: a click on it lands on the map like any other click
        // and closes an open player card, instead of opening an agent card about yourself.

        this.playerShadow = this.add.ellipse(px, py + 26, 26, 10, 0x000000, 0.25);

        const selfId = this.registry.get("selfId");
        const selfNameRaw = selfId ? (this.namesRef?.current?.[selfId] ?? "You") : "You";
        const selfName = selfNameRaw.length > 20 ? selfNameRaw.slice(0, 20) + "..." : selfNameRaw;
        this.nameTag = this.makeNameTag(selfName, true, false);
        this.nameTag.setPosition(px, py - 34);

        this.anims.create({key:"walk-down" , frames:this.anims.generateFrameNumbers("adam" ,{
            start:18,
            end:23
        }),
        frameRate:10,
        repeat:-1
        })

        this.anims.create({ key: "walk-up",
            frames: this.anims.generateFrameNumbers("adam",
                { start: 6,  end: 11
        }), frameRate: 10, repeat: -1 });

        this.anims.create({ key: "walk-left",  frames:
        this.anims.generateFrameNumbers("adam", { start: 12, end: 17
        }), frameRate: 10, repeat: -1 });

        this.anims.create({ key: "walk-right", frames:
        this.anims.generateFrameNumbers("adam", { start: 0, end: 5
        }), frameRate: 10, repeat: -1 });

        this.input.keyboard?.on("keydown-LEFT", () => this.move(-1,
        0));
        this.input.keyboard?.on("keydown-RIGHT", () => this.move(1,
        0));
        this.input.keyboard?.on("keydown-UP", () => this.move(0,
        -1));
        this.input.keyboard?.on("keydown-DOWN", () => this.move(0,
        1));




        const pointerTile = (pointer: Phaser.Input.Pointer) => ({
            tx: Phaser.Math.Clamp(Math.floor(pointer.worldX / TILE), 0, this.maxTileX),
            ty: Phaser.Math.Clamp(Math.floor(pointer.worldY / TILE), 0, this.maxTileY),
        });
        this.input.on("pointerdown",(pointer:Phaser.Input.Pointer)=>{
            this.playerClickRef?.current?.(null);
            const { tx, ty } = pointerTile(pointer);
            // While the map builder is open, clicks build instead of walking.
            const builder = this.bridge?.current.builder;
            if (builder?.active) {
                builder.onPointer(tx, ty, "down");
                return;
            }
            this.path = this.findPath(this.tileX, this.tileY, tx, ty);
            if (!this.isMoving) this.followPath();
        })
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            const builder = this.bridge?.current.builder;
            if (!builder?.active) return;
            const { tx, ty } = pointerTile(pointer);
            builder.onPointer(tx, ty, pointer.isDown ? "drag" : "hover");
        });
        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            const builder = this.bridge?.current.builder;
            if (!builder?.active) return;
            const { tx, ty } = pointerTile(pointer);
            builder.onPointer(tx, ty, "up");
        });



        this.cameras.main.setBounds(0,0,worldWidth,worldHeight);
        this.cameras.main.startFollow(this.player , true ,0.1 , 0.1);


        const getMinZoom = () => {
            return Math.max(this.cameras.main.width / worldWidth, this.cameras.main.height / worldHeight);
        };


        const dbgZoom = Number(new URLSearchParams(window.location.search).get("zoom"));
        const initialZoom = dbgZoom > 0 ? dbgZoom : Math.max(getMinZoom(), 1);
        this.cameras.main.setZoom(Phaser.Math.Clamp(initialZoom, getMinZoom(), 4.0));


        this.input.on("wheel", (pointer: Phaser.Input.Pointer, gameObjects: unknown, deltaX: number, deltaY: number) => {
            let zoom = this.cameras.main.zoom;

            zoom *= Math.exp(-deltaY * 0.0012);
            zoom = Phaser.Math.Clamp(zoom, getMinZoom(), 4.0);
            this.cameras.main.setZoom(zoom);
        });


        this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
            const minZoom = Math.max(gameSize.width / worldWidth, gameSize.height / worldHeight);
            if (this.cameras.main.zoom < minZoom) {
                this.cameras.main.setZoom(minZoom);
            }
        });

        // Hand the minimap and zoom buttons what they need.
        this.bridge = this.registry.get("bridgeRef");
        const bridge = this.bridge?.current;
        if (bridge) {
            bridge.map = {
                cols: this.cols,
                rows: this.rows,
                walls: [...this.wallCells],
                blocked: [...this.blocked],
                floors: this.minimapFloors,
            };
            const zoomTo = (zoom: number) => {
                this.cameras.main.zoomTo(Phaser.Math.Clamp(zoom, getMinZoom(), 4.0), 180, "Sine.easeOut");
            };
            bridge.zoomBy = (factor) => zoomTo(this.cameras.main.zoom * factor);
            bridge.zoomToFit = () => zoomTo(getMinZoom());
            bridge.walkTo = (x, y) => {
                const tx = Phaser.Math.Clamp(Math.round(x), 0, this.maxTileX);
                const ty = Phaser.Math.Clamp(Math.round(y), 0, this.maxTileY);
                this.path = this.findPath(this.tileX, this.tileY, tx, ty);
                if (!this.isMoving) this.followPath();
            };
            const errandMarker = addErrandMarker(this);
            bridge.setErrandTarget = (room) => errandMarker.show(room);
            bridge.setBuilderGhost = (ghost) => this.showBuilderGhost(ghost);
            bridge.previewItem = (item) => {
                const key = itemTextureKey({ ...item, x: 0, y: 0 });
                return this.textures.exists(key) ? this.textures.getBase64(key) : null;
            };
            // The owner's edits arrive as a new map in the registry; redraw it in place.
            const onCustomMap = (_parent: unknown, map: CustomMap | null) => {
                if (mapTemplate !== "custom-office" || !map) return;
                this.buildCustom(map);
                this.buildRoomSigns();
            };
            this.registry.events.on("changedata-customMap", onCustomMap);
            this.events.once(Phaser.Scenes.Events.DESTROY, () => {
                bridge.map = null;
                bridge.view = null;
                bridge.zoomBy = undefined;
                bridge.zoomToFit = undefined;
                bridge.walkTo = undefined;
                bridge.setErrandTarget = undefined;
                bridge.setBuilderGhost = undefined;
                bridge.previewItem = undefined;
                this.registry.events.off("changedata-customMap", onCustomMap);
            });
        }

        // Maya, the Practice Session mentor, waits in Focus Room 2 of Clario HQ, and the AI
        // coworkers at their spots around the office.
        if (mapTemplate === "clario-hq") {
            const block = (x: number, y: number) => this.blocked.add(x + "," + y);
            this.mentor = addMentorNpc(this, { tileX: HQ_MENTOR.x, tileY: HQ_MENTOR.y, font: this.labelFont, bridge, block });
            this.coworkers = addCoworkerNpcs(this, { font: this.labelFont, bridge, block, texture: (look) => this.lookTexture(look) });
            // Claude at work in every Open Desks cubicle.
            this.claudes = addClaudeNpcs(this, { font: this.labelFont, block });
            // The Game Room machines and tables, and the TVs.
            this.playSpots = addPlaySpots(this, {
                font: this.labelFont,
                bridge,
                busy: () => !!this.props?.busy() || [this.mentor, ...this.coworkers].some((npc) => npc?.near()),
            });
            // The bikes in their rack and the vending machine's drinks.
            this.props = addPropsOnMap(this, { font: this.labelFont, bridge, selfId: () => this.registry.get("selfId") as string | null });

            // E uses the one thing in reach, in this order: get off your bike, talk to whoever is
            // next to you, a game or TV, then the bike rack, the vending machine or a sip of your
            // drink. Q throws a drink away. Neither works while you type in a panel.
            this.input.keyboard?.on("keydown-E", (event: KeyboardEvent) => {
                if (isTypingIn(event.target)) return;
                const npc = [this.mentor, ...this.coworkers].find((each) => each?.near());
                const used = !!this.props?.getOff() || (npc ? (npc.talk(), true) : false) || !!this.playSpots?.use() || !!this.props?.use();
                // Otherwise the "e" would land in the panel or overlay that just opened.
                if (used) event.preventDefault();
            });
            this.input.keyboard?.on("keydown-Q", (event: KeyboardEvent) => {
                if (!isTypingIn(event.target) && this.props?.drop()) event.preventDefault();
            });
        }
    }

    private buildCoworkingCampus() {
        // Clario HQ's furniture (office-art.ts), used for the courtyard chairs and every room.
        makeHqTextures(this);

        this.add.tileSprite(24 * TILE, 0, 4 * TILE, 9 * TILE, "path").setOrigin(0, 0).setDepth(-1005);
        this.add.tileSprite(3 * TILE, 8 * TILE, 46 * TILE, 27 * TILE, "floor-wood").setOrigin(0, 0).setDepth(-1000);
        this.minimapFloors.push({ x: 3, y: 8, w: 46, h: 27, color: FLOOR_MINIMAP_COLORS["floor-wood"]! });

        this.wallRow(3, 48, 8, [24, 25, 26, 27]);
        this.wallRow(3, 48, 34, [24, 25, 26, 27]);
        this.wallCol(3, 8, 34);
        this.wallCol(48, 8, 34);
        this.wallCol(15, 9, 16, [12, 13]);
        this.wallCol(36, 9, 16, [12, 13]);
        this.wallRow(4, 14, 17, [9, 10]);
        this.wallRow(37, 47, 17, [41, 42]);
        this.wallRow(4, 47, 28, [12, 13, 25, 26, 38, 39]);



        const touchesWall = (x: number, y: number, length: number, horizontal: boolean) => {
            for (let i = 0; i < length; i++) {
                const tx = horizontal ? x + i : x;
                const ty = horizontal ? y : y + i;
                if (this.wallCells.has(tx + "," + ty)) return true;
            }
            return false;
        };
        const zone = (x: number, y: number, w: number, h: number, key: string) => {
            this.minimapFloors.push({ x, y, w, h, color: FLOOR_MINIMAP_COLORS[key] ?? 0xe9dcc0 });
            const left = touchesWall(x - 1, y, h, false) ? 0.5 : 0;
            const right = touchesWall(x + w, y, h, false) ? 0.5 : 0;
            const top = touchesWall(x, y - 1, w, true) ? 0.5 : 0;
            const bottom = touchesWall(x, y + h, w, true) ? 0.5 : 0;
            this.add.tileSprite(
                (x - left) * TILE,
                (y - top) * TILE,
                (w + left + right) * TILE,
                (h + top + bottom) * TILE,
                key,
            ).setOrigin(0, 0).setDepth(-998);
        };
        zone(4, 9, 11, 8, "floor-conf");
        zone(37, 9, 11, 8, "floor-office");
        zone(16, 9, 20, 8, "floor-cafe");
        zone(4, 18, 16, 10, "floor-office");
        zone(21, 18, 10, 10, "floor-lounge");
        zone(32, 18, 16, 10, "floor-office");
        zone(4, 29, 13, 5, "floor-cafe");
        zone(18, 29, 16, 5, "floor-lounge");
        zone(35, 29, 13, 5, "floor-cafe");
        this.drawWalls();

        const rug = (x: number, y: number, w: number, h: number, color: number) => {
            this.add.rectangle((x + w / 2) * TILE, (y + h / 2) * TILE, w * TILE, h * TILE, color, 0.18)
                .setDepth(-996);
        };
        rug(5, 19, 14, 8, 0x8194bc);
        rug(33, 19, 14, 8, 0x8f86be);

        const place = (key: string, tx: number, ty: number, blockedOffsets?: [number, number][]) => {
            const image = this.add.image(tx * TILE, ty * TILE, key).setOrigin(0, 0);
            image.setDepth(image.y + image.displayHeight);
            this.groundShadow(image.x + image.displayWidth / 2, image.y + image.displayHeight - 3, image.displayWidth * 0.86);
            if (blockedOffsets) {
                for (const [dx, dy] of blockedOffsets) {
                    const blockedX = Math.round(tx + dx);
                    const blockedY = Math.round(ty + dy);
                    this.blocked.add(blockedX + "," + blockedY);
                }
            } else {
                this.blockFootprint(tx, ty, image.displayWidth, image.displayHeight);
            }
        };
        const chair = (key: string, tx: number, ty: number, dir: "up" | "down" | "left" | "right", lift?: number) => {
            this.groundShadow((tx + 0.5) * TILE, (ty + 1) * TILE + 3, 22);
            this.add.image((tx + 0.5) * TILE, (ty + 1) * TILE + 6, key)
                .setOrigin(0.5, 1)
                .setDepth(dir === "up" ? (ty + 1) * TILE + 8 : ty * TILE - 2);
            const tileKey = tx + "," + ty;
            this.chairMap[tileKey] = dir;
            if (lift !== undefined) this.chairLiftMap[tileKey] = lift;
        };
        type SeatDirection = "up" | "down" | "left" | "right";
        type SeatFamily = {
            key: string;
            seatLift?: Partial<Record<SeatDirection, number>>;
        };
        const seatFamilies = {
            natural: { key: "hq-cafe-chair" },
        } satisfies Record<string, SeatFamily>;
        const directionalChair = (family: SeatFamily, tx: number, ty: number, dir: SeatDirection) =>
            chair(`${family.key}-${dir}`, tx, ty, dir, family.seatLift?.[dir]);


        const pot = (key: string, tx: number, ty: number) => place(key, tx, ty, [[0, 0]]);
        const wallMount = (key: string, cx: number, y: number, scale = 1) =>
            this.add.image(cx * TILE, y * TILE + 20, key).setScale(scale).setDepth(y * TILE + 40);

        place("campus-pond", 23.5, 2, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]]);
        directionalChair(seatFamilies.natural, 22, 3, "right");
        directionalChair(seatFamilies.natural, 29, 3, "left");
        directionalChair(seatFamilies.natural, 24, 6, "up");
        directionalChair(seatFamilies.natural, 27, 6, "up");

        for (const [key, x, y] of [
            ["flower-blue", 21, 6], ["flower-red", 22, 6],
            ["flower-red", 29, 6], ["flower-blue", 30, 6],
            ["flower-blue", 22, 2], ["flower-red", 29, 2],
        ] as [string, number, number][]) {
            this.add.image((x + 0.5) * TILE, (y + 1) * TILE, key)
                .setOrigin(0.5, 1)
                .setScale(1.35)
                .setDepth((y + 1) * TILE);
        }


        // Furniture: the same pieces as Clario HQ, listed in lib/maps/classic-campus.ts.
        placeItems(this, this.mapApi(), CAMPUS_ITEMS);
        wallMount("tv-wall", 9, 8, 0.85);
        wallMount("flower-blue", 25, 8);
        pot("plant-fern", 4, 18);
        pot("plant-fern", 47, 18);
        for (const [key, x, y] of [
            ["flower-blue", 19.5, 27], ["flower-red", 32.5, 27], ["flower-blue", 21.5, 27], ["flower-red", 30.5, 27],
        ] as [string, number, number][]) {
            this.add.image(x * TILE, y * TILE, key).setOrigin(0.5, 1).setScale(1.4).setDepth(y * TILE);
        }

        this.buildLounge(21, 19, { rug: "blue", sofa: "sage", beanbags: ["purple", "blue", "pink", "purple"] });


        const treeKeys = ["tree-green", "tree-lime", "tree-teal", "tree-teal2"];
        const tree = (tx: number, ty: number, i: number) => {
            this.add.image(tx * TILE, (ty + 1) * TILE, treeKeys[i % treeKeys.length]!)
                .setOrigin(0, 1)
                .setDepth((ty + 1) * TILE);
            this.blocked.add(tx + "," + ty);
            if (tx + 1 < this.cols) this.blocked.add((tx + 1) + "," + ty);
        };
        [0, 4, 8, 13, 17, 33, 38, 43, 48, 50].forEach((x, i) => tree(x, 0, i));
        [4, 10, 16, 22, 28, 34].forEach((y, i) => {
            tree(0, y, i + 1);
            tree(50, y, i + 2);
        });
        [1, 6, 11, 16, 20, 30, 35, 41, 46].forEach((x, i) => tree(x, 36, i + 2));
        for (const [key, x, y] of [
            ["flower-red", 18, 4], ["flower-blue", 33, 5], ["flower-yellow", 20, 7],
            ["bush-small", 2, 7], ["bush-ball", 49, 7], ["rock-small", 17, 6],
            ["flower-blue", 28, 36], ["flower-red", 22, 36],
        ] as [string, number, number][]) {
            this.add.image((x + 0.5) * TILE, (y + 1) * TILE, key).setOrigin(0.5, 1).setDepth(y * TILE);
        }


        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                const insideBuilding = x >= 3 && x <= 48 && y >= 8 && y <= 34;
                const courtyardPath = x >= 20 && x <= 31 && y < 8;
                const entrancePath = x >= 24 && x <= 27 && y >= 34;
                if (!insideBuilding && !courtyardPath && !entrancePath) this.blocked.add(x + "," + y);
            }
        }
    }


    // Gather-style lounge on a 10 x 8 tile block with top-left tile (ox, oy): a rug, one sofa
    // facing two sofas across a coffee table, bean bags at the sides, and shelves, lamps and
    // plants around it. The furniture itself is drawn in lounge-art.ts.
    private buildLounge(ox: number, oy: number, look: {
        rug: RugColor;
        sofa: SofaColor;
        beanbags: [BeanbagColor, BeanbagColor, BeanbagColor, BeanbagColor];
    }) {
        this.add.image((ox + 1) * TILE, (oy + 1) * TILE, rugKey(look.rug)).setOrigin(0, 0).setDepth(-996);

        // Free-standing pieces: bottom edge on the footprint's last row, whole footprint blocked.
        const prop = (key: string, dx: number, dy: number, w = 1, h = 1) => {
            const tx = ox + dx, ty = oy + dy, bottom = (ty + h) * TILE;
            this.groundShadow((tx + w / 2) * TILE, bottom - 1, w * TILE * 0.8);
            this.add.image((tx + w / 2) * TILE, bottom + 2, key).setOrigin(0.5, 1).setDepth(bottom);
            for (let x = tx; x < tx + w; x++) {
                for (let y = ty; y < ty + h; y++) this.blocked.add(x + "," + y);
            }
        };
        const seats = (dx: number, dy: number, count: number, dir: "up" | "down" | "left" | "right", lift?: number) => {
            for (let i = 0; i < count; i++) {
                const tile = (ox + dx + i) + "," + (oy + dy);
                this.chairMap[tile] = dir;
                if (lift !== undefined) this.chairLiftMap[tile] = lift;
            }
        };
        // Below a seated avatar (so they draw on top of the seat) but above someone standing
        // one row behind it (so the seat hides their feet).
        const seatDepth = (dy: number) => (oy + dy) * TILE + 20;

        const sofaFacingDown = (dx: number, dy: number) => {
            const cx = (ox + dx + 1) * TILE, bottom = (oy + dy + 1) * TILE;
            this.groundShadow(cx, bottom + 2, TILE * 2.1);
            this.add.image(cx, bottom + 4, sofaKey(look.sofa, 2, "front")).setOrigin(0.5, 1).setDepth(seatDepth(dy));
            seats(dx, dy, 2, "down");
        };
        // Seen from behind: the seat draws behind a seated avatar, the backrest in front of it.
        const sofaFacingUp = (dx: number, dy: number) => {
            const cx = (ox + dx + 1) * TILE, bottom = (oy + dy + 1) * TILE;
            this.groundShadow(cx, bottom + 2, TILE * 2.1);
            const rest = this.add.image(cx, bottom + 4, sofaKey(look.sofa, 2, "back-rest")).setOrigin(0.5, 1).setDepth(bottom + 8);
            this.add.image(cx, rest.y - rest.height, sofaKey(look.sofa, 2, "back-seat")).setOrigin(0.5, 1).setDepth((oy + dy) * TILE - 2);
            // Sit a little higher so head and shoulders show over the backrest.
            seats(dx, dy, 2, "up", 22);
        };
        // A seated avatar sinks into the bean bag: it draws over their legs (with this lift a
        // seated avatar's depth is row * TILE + 24), while anyone walking past stays on top.
        const beanbag = (color: BeanbagColor, dx: number, dy: number, facing: "left" | "right") => {
            const cx = (ox + dx + 0.5) * TILE, bottom = (oy + dy + 1) * TILE;
            this.groundShadow(cx, bottom, 26);
            this.add.image(cx, bottom + 2, beanbagKey(color, facing)).setOrigin(0.5, 1).setDepth((oy + dy) * TILE + 30);
            seats(dx, dy, 1, facing, 24);
        };

        prop("plant-leafy", 0, 1);
        prop("cube-shelf", 1, 0, 2, 2);
        prop("cube-shelf", 7, 0, 2, 2);
        prop("plant-leafy", 9, 1);

        prop("side-table-lamp", 3, 2);
        sofaFacingDown(4, 2);
        prop("side-table-vase", 6, 2);

        const [left1, left2, right1, right2] = look.beanbags;
        beanbag(left1, 2, 3, "right");
        beanbag(left2, 2, 4, "right");
        prop("coffee-oval", 4, 4, 2);
        beanbag(right1, 7, 3, "left");
        beanbag(right2, 7, 4, "left");

        prop("plant-tall", 1, 6);
        sofaFacingUp(2, 6);
        sofaFacingUp(6, 6);
        prop("side-table-lamp", 8, 6);
    }

    update() {
        this.updateCurrentRoom();
        this.mentor?.update(this.tileX, this.tileY);
        for (const coworker of this.coworkers) coworker.update(this.tileX, this.tileY);
        this.claudes?.update(this.tileX, this.tileY);
        this.playSpots?.update(this.tileX, this.tileY);
        const bridge = this.bridge?.current;
        if (bridge) {
            const { x, y, width, height } = this.cameras.main.worldView;
            bridge.view = { x, y, width, height };
        }

        const serverSelf = this.selfRef?.current;
        if (serverSelf && !this.isMoving) {
            if (this.tileX !== serverSelf.x || this.tileY !== serverSelf.y) {

                this.tileX = serverSelf.x;
                this.tileY = serverSelf.y;
                this.player.setPosition(
                    this.tileX * TILE + TILE / 2,
                    this.tileY * TILE + TILE / 2
                );
                this.path = [];
            }
        }


        this.spawnReactions();
        this.updateAgentPets();

        this.syncAvatar(this.player, this.registry.get("selfId") as string | null);
        const currentTileKey = this.tileX + "," + this.tileY;
        const chairDir = this.chairMap[currentTileKey];
        // Riding a bike over a chair doesn't sit you down on it.
        const isSelfSitting = !!chairDir && !this.isMoving && !this.props?.riding(this.registry.get("selfId") as string | null);

        if (isSelfSitting && chairDir) {
            const seat = this.seatedPoint(this.tileX, this.tileY, chairDir, this.chairLiftMap[currentTileKey]);
            this.player.setPosition(seat.x, seat.y);
            this.setSittingPose(this.player, chairDir);
            this.player.setScale(2.0);
        } else {
            this.player.setScale(2.0);
            if (!this.isMoving) {
                this.player.setPosition(
                    this.tileX * TILE + TILE / 2,
                    this.tileY * TILE + TILE / 2
                );
            }
        }

        const myFeet = this.player.y + this.player.displayHeight / 2;


        this.player.setDepth(myFeet);


        this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight / 2 - 6);
        this.playerShadow.setDepth(this.player.depth - 2);
        this.playerShadow.setAlpha(isSelfSitting ? 0.08 : 0.25);


        const selfId = this.registry.get("selfId");
        const selfNameRaw = selfId ? (this.namesRef?.current?.[selfId] ?? "You") : "You";
        const selfName = selfNameRaw.length > 20 ? selfNameRaw.slice(0, 20) + "..." : selfNameRaw;
        const isSelfCooking = !!(selfId && this.activitiesRef?.current?.[selfId]?.state === "cooking");
        const selfTagState = `${selfName}:${isSelfSitting ? "sitting" : "standing"}:${isSelfCooking ? "cooking" : "idle"}`;
        if (this.selfTagName !== selfTagState) {
            this.nameTag?.destroy();
            this.nameTag = this.makeNameTag(selfName, true, isSelfSitting, isSelfCooking);
            this.selfTagName = selfTagState;
        }
        this.nameTag.setPosition(this.player.x, this.player.y - 38);


        const others = this.otherRef?.current ?? {};

        for (const id in others) {
            const p = others[id];
            if (!p) continue;
            const px = p.x * TILE + TILE / 2;
            const py = p.y * TILE + TILE / 2;

            let sprite = this.otherSprites[id];
            if (!sprite) {

                sprite = this.add.sprite(px, py, "adam", 18).setScale(2);
                sprite.setInteractive({ cursor: "pointer" });
                sprite.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
                    event.stopPropagation();
                    this.playerClickRef?.current?.(id);
                });
                this.otherSprites[id] = sprite;
                this.otherTiles[id] = { x: p.x, y: p.y };
                this.otherShadows[id] = this.add.ellipse(px, py, 26, 10, 0x000000, 0.25);

                const startName = this.namesRef?.current?.[id] ?? id.slice(0, 5);
                const startCooking = this.activitiesRef?.current?.[id]?.state === "cooking";
                this.otherTags[id] = this.makeNameTag(startName, false, false, startCooking);
                this.otherTagNames[id] = `${startName}:standing:${startCooking ? "cooking" : "idle"}`;
            } else {
                const last = this.otherTiles[id];
                if (last && (last.x !== p.x || last.y !== p.y)) {


                    const dx = p.x - last.x;
                    const dy = p.y - last.y;
                    const dir =
                        Math.abs(dx) > Math.abs(dy)
                            ? (dx < 0 ? "left" : "right")
                            : (dy < 0 ? "up" : "down");


                    const movingSprite = sprite;
                    this.otherFacing[id] = dir;
                    movingSprite.anims.play(this.walkAnim(movingSprite, dir), true);
                    this.tweens.killTweensOf(movingSprite);
                    this.tweens.add({
                        targets: movingSprite,
                        x: px,
                        y: py,
                        duration: this.props?.riding(id) ? RIDE_STEP_MS : 200,
                        ease: "Linear",
                        onComplete: () => {
                            movingSprite.anims.stop();
                            movingSprite.setFrame(this.standingFrame(dir));
                        },
                    });
                    this.otherTiles[id] = { x: p.x, y: p.y };
                }
            }


            if (!sprite) continue;

            this.syncAvatar(sprite, id);
            const otherTileKey = p.x + "," + p.y;
            const otherChairDir = this.chairMap[otherTileKey];
            const isOtherMoving = this.tweens.isTweening(sprite);
            const isOtherSitting = !!otherChairDir && !isOtherMoving && !this.props?.riding(id);

            if (isOtherSitting && otherChairDir) {
                const seat = this.seatedPoint(p.x, p.y, otherChairDir, this.chairLiftMap[otherTileKey]);
                sprite.setPosition(seat.x, seat.y);
                this.setSittingPose(sprite, otherChairDir);
                sprite.setScale(2.0);
            } else {
                sprite.setScale(2.0);
                if (!isOtherMoving) {
                    sprite.setPosition(px, py);
                }
            }

            const feet = sprite.y + sprite.displayHeight / 2;
            sprite.setDepth(feet);

            const shadow = this.otherShadows[id];
            if (shadow) {
                shadow.setPosition(sprite.x, sprite.y + sprite.displayHeight / 2 - 6);
                shadow.setDepth(sprite.depth - 2);
            }



            const near = this.nearbyRef?.current?.has(id) ?? true;
            sprite.setAlpha(near ? 1 : 0.35);
            shadow?.setAlpha(isOtherSitting ? (near ? 0.08 : 0.03) : (near ? 0.25 : 0.1));


            const realName = this.namesRef?.current?.[id];
            const baseName = realName || id.slice(0, 5);
            const isOtherCooking = this.activitiesRef?.current?.[id]?.state === "cooking";
            const tagState = `${baseName}:${isOtherSitting ? "sitting" : "standing"}:${isOtherCooking ? "cooking" : "idle"}`;

            if (this.otherTagNames[id] !== tagState) {
                this.otherTags[id]?.destroy();
                this.otherTags[id] = this.makeNameTag(baseName, false, isOtherSitting, isOtherCooking);
                this.otherTagNames[id] = tagState;
            }
            const tag = this.otherTags[id];
            if (tag) {
                tag.setPosition(sprite.x, sprite.y - 38);
                tag.setAlpha(near ? 1 : 0.5);
            }
        }


        for (const id in this.otherSprites) {
            if (!others[id]) {
                this.otherSprites[id]?.destroy();
                this.otherTags[id]?.destroy();
                this.otherShadows[id]?.destroy();
                delete this.otherSprites[id];
                delete this.otherTags[id];
                delete this.otherTagNames[id];
                delete this.otherShadows[id];
                delete this.otherTiles[id];
                delete this.otherFacing[id];
            }
        }

        // Everyone's bike or drink, drawn over their sprites now that those are in place.
        if (this.props) {
            const selfId = this.registry.get("selfId") as string | null;
            const people: Holder[] = Object.entries(this.otherSprites).map(([id, sprite]) => ({ id, sprite, facing: this.otherFacing[id] ?? "down" }));
            if (selfId) people.push({ id: selfId, sprite: this.player, facing: this.facing });
            this.props.update({ x: this.tileX, y: this.tileY }, people);
        }
    }

    private move(dx:number , dy:number){
        this.path = [];
        const dir = dx<0 ?"left" :dx>0 ?"right" :dy<0 ?"up":"down";
        this.moveToTile(this.tileX + dx , this.tileY + dy,dir);

    }

    private moveTo(tx:number , ty:number){
        const dx = tx - this.tileX;
        const dy = ty - this.tileY;
        const dir =
        Math.abs(dx) > Math.abs(dy)
            ? (dx < 0 ? "left" : "right")
            : (dy < 0 ? "up" : "down");
        this.moveToTile(tx, ty, dir);

    }
    private moveToTile(tx: number, ty: number, dir: "down" | "up" | "left" |"right") {
        if (this.isMoving) return;

        const nextX = Phaser.Math.Clamp(tx, 0, this.maxTileX);
        const nextY = Phaser.Math.Clamp(ty, 0, this.maxTileY);
        if (nextX === this.tileX && nextY === this.tileY) return;



        if (this.blocked.has(nextX + "," + nextY)) {
            this.path = [];
            return;
        }

        this.tileX = nextX;
        this.tileY = nextY;
        this.facing = dir;
        this.isMoving = true;

        this.moveRef?.current?.({ x: this.tileX, y: this.tileY });

        this.player.anims.play(this.walkAnim(this.player, dir), true);

        this.tweens.add({
        targets: this.player,
        x: this.tileX * TILE + TILE / 2,
        y: this.tileY * TILE + TILE / 2,
        duration: this.props?.riding(this.registry.get("selfId") as string | null) ? RIDE_STEP_MS : 200,
        ease: "Linear",
        onComplete: () => {
            this.isMoving = false;

            if (this.path.length > 0) {
                this.followPath();
            } else {
                this.player.anims.stop();
                this.player.setFrame(this.standingFrame(dir));
            }
        },
        });
    }


    private followPath() {
        const next = this.path.shift();
        if (!next) return;
        const dx = next.x - this.tileX;
        const dy = next.y - this.tileY;
        const dir = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
        this.moveToTile(next.x, next.y, dir);
    }





    // A* over the blocked tiles (lib/maps/path-finder.ts), for clicks on the map and the 3D view.
    private findPath(sx: number, sy: number, gx: number, gy: number): { x: number; y: number }[] {
        return findPath({ x: sx, y: sy }, { x: gx, y: gy }, {
            cols: this.maxTileX + 1,
            rows: this.maxTileY + 1,
            isBlocked: (x, y) => this.blocked.has(x + "," + y),
        });
    }



    private blockFootprint(tx: number, ty: number, widthPx: number, heightPx: number) {
        const cols = Math.max(1, Math.round(widthPx / TILE));
        const rows = Math.max(1, Math.round(heightPx / TILE));
        for (let x = tx; x < tx + cols; x++) {
            for (let y = ty; y < ty + rows; y++) {
                this.blocked.add(x + "," + y);
            }
        }
    }



    private wallRow(x1: number, x2: number, y: number, skip: number[] = []) {
        for (let x = x1; x <= x2; x++) {
            if (skip.includes(x)) continue;
            this.wallCells.add(x + "," + y);
            this.blocked.add(x + "," + y);
        }
    }


    private wallCol(x: number, y1: number, y2: number, skip: number[] = []) {
        for (let y = y1; y <= y2; y++) {
            if (skip.includes(y)) continue;
            this.wallCells.add(x + "," + y);
            this.blocked.add(x + "," + y);
        }
    }




    // Room partitions drawn in a top-down 3/4 view: a light top cap, a darker
    // front face under horizontal runs, and a thin dark edge so rooms read clearly.
    private drawWalls() {
        const T = 4;
        const FACE = 2;
        const off = (TILE - T) / 2;
        const CAP = 0xe4e7ed, EDGE = 0x5d6474, FRONT = 0xa3aab8;

        for (const cell of this.wallCells) {
            const [x, y] = cell.split(",").map(Number) as [number, number];
            const px = x * TILE, py = y * TILE;
            const d = py + TILE;
            const n = this.wallCells.has(x + "," + (y - 1));
            const s = this.wallCells.has(x + "," + (y + 1));
            const w = this.wallCells.has((x - 1) + "," + y);
            const e = this.wallCells.has((x + 1) + "," + y);

            const bar = (bx: number, by: number, bw: number, bh: number) => {
                const horizontal = bw >= bh;
                if (horizontal) {
                    this.add.rectangle(bx, by + bh, bw, FACE, FRONT).setOrigin(0, 0).setDepth(d);
                    this.add.rectangle(bx, by + bh + FACE - 1, bw, 1, EDGE, 0.55).setOrigin(0, 0).setDepth(d);
                }
                this.add.rectangle(bx, by, bw, bh, CAP).setOrigin(0, 0).setDepth(d);
                this.add.rectangle(bx, by, horizontal ? bw : 1, horizontal ? 1 : bh, EDGE, 0.6).setOrigin(0, 0).setDepth(d);
                if (!horizontal) {
                    this.add.rectangle(bx + bw - 1, by, 1, bh, EDGE, 0.6).setOrigin(0, 0).setDepth(d);
                }
            };


            if (!n && !s && !w && !e) {
                bar(px + off, py + off, T, T);
                continue;
            }


            if (w || e) {
                const bx = w ? px : px + off;
                const bw = (w && e) ? TILE : (TILE - off);
                bar(bx, py + off, bw, T);
            }
            if (n || s) {
                const by = n ? py : py + off;
                const bh = (n && s) ? TILE : (TILE - off);
                bar(px + off, by, T, bh);
            }
        }

        // Doorways: a short opening in a wall gets a post at each end and a threshold
        // across the floor, so the two rooms read as connected rather than broken.
        const isWall = (x: number, y: number) => this.wallCells.has(x + "," + y);
        for (const cell of this.wallCells) {
            const [x, y] = cell.split(",").map(Number) as [number, number];
            for (const horizontal of [true, false]) {
                const dx = horizontal ? 1 : 0;
                const dy = horizontal ? 0 : 1;
                if (isWall(x + dx, y + dy) || !isWall(x - dx, y - dy)) continue;
                let gap = 1;
                while (gap <= 4 && !isWall(x + dx * (gap + 1), y + dy * (gap + 1))) gap++;
                if (gap > 4 || !isWall(x + dx * (gap + 2), y + dy * (gap + 2))) continue;

                const start = (horizontal ? x : y) * TILE + off + T;
                const end = ((horizontal ? x : y) + gap + 1) * TILE + off;
                const across = (horizontal ? y : x) * TILE + off;
                const rect = (a: number, b: number, len: number, thick: number, color: number, alpha: number, depth: number) =>
                    (horizontal
                        ? this.add.rectangle(a, b, len, thick, color, alpha)
                        : this.add.rectangle(b, a, thick, len, color, alpha)
                    ).setOrigin(0, 0).setDepth(depth);

                rect(start, across - 1, end - start, T + 2, 0xd9ccb1, 0.9, -980);
                rect(start, across - 1, end - start, 1, 0xb39d75, 0.8, -980);
                rect(start, across + T, end - start, 1, 0xb39d75, 0.8, -980);
                const postDepth = (horizontal ? y : y + gap) * TILE + TILE;
                rect(start - 2, across - 1, 3, T + FACE + 2, EDGE, 1, postDepth);
                rect(end - 1, across - 1, 3, T + FACE + 2, EDGE, 1, postDepth);
            }
        }
    }



    // Pixel-art chairs and tables. Each art pixel is 2x2 world pixels, matching the
    // characters. Sizes match the images they replace so layouts don't move.
    private makeFurnitureTextures() {
        const P = 2;
        const C = {
            ink: 0x262a33, dark: 0x3e4553, mid: 0x59627a, light: 0x7d88a0, metal: 0x9aa3b2,
            woodTop: 0xe4ca9f, wood: 0xcfae7c, woodEdge: 0x9b7646, woodDark: 0x7a5a33,
            screen: 0x8ec9e0, screenHi: 0xc7ebf7, paper: 0xf6f3ec, key: 0xd3d8e0,
            red: 0xc44a4a, redDark: 0x8e2f33, redLight: 0xe27d74, mug: 0xd9553f,
        };
        type Px = (color: number, x: number, y: number, w?: number, h?: number) => void;
        const make = (key: string, w: number, h: number, paint: (px: Px) => void, mirror = false) => {
            const g = this.add.graphics();
            const px: Px = (color, x, y, pw = 1, ph = 1) => {
                g.fillStyle(color, 1);
                g.fillRect((mirror ? w - x - pw : x) * P, y * P, pw * P, ph * P);
            };
            paint(px);
            g.generateTexture(key, w * P, h * P);
            g.destroy();
        };

        // Rounded rectangle: corner pixels left out.
        const round = (px: Px, color: number, x: number, y: number, w: number, h: number) => {
            px(color, x + 1, y, w - 2, 1);
            px(color, x, y + 1, w, h - 2);
            px(color, x + 1, y + h - 1, w - 2, 1);
        };
        const fabric = { dark: 0x3e4553, mid: 0x515b70, light: 0x6f7a91 };

        // Office task chair, 4 directions (22x24 art pixels): rounded back, armrests, 5-wheel base.
        make("ref-task-dark-down", 22, 24, (px) => {
            round(px, C.ink, 6, 3, 10, 9); round(px, fabric.dark, 7, 4, 8, 7); px(fabric.light, 8, 4, 6, 1);
            px(C.ink, 3, 11, 2, 5); px(C.ink, 17, 11, 2, 5); px(fabric.mid, 3, 11, 2, 1); px(fabric.mid, 17, 11, 2, 1);
            round(px, C.ink, 5, 12, 12, 7); round(px, fabric.mid, 6, 13, 10, 5); px(fabric.light, 6, 13, 10, 1); px(fabric.dark, 6, 17, 10, 1);
            px(C.ink, 10, 19, 2, 2); px(C.metal, 10, 19, 1, 2);
            px(C.ink, 6, 21, 10, 1); px(C.ink, 5, 22, 1, 1); px(C.ink, 16, 22, 1, 1);
            px(C.ink, 4, 23, 2, 1); px(C.ink, 10, 23, 2, 1); px(C.ink, 16, 23, 2, 1);
        });
        // Seen from behind: the same chair turned round. The backrest is nearest the viewer, so it is
        // painted last and hides the seat; no cushion shows below it, or it reads as a front view.
        // Its top stays low enough that a seated avatar's head shows above it.
        make("ref-task-dark-up", 22, 24, (px) => {
            round(px, C.ink, 5, 12, 12, 7); round(px, fabric.mid, 6, 13, 10, 5);
            px(C.ink, 3, 11, 2, 5); px(C.ink, 17, 11, 2, 5); px(fabric.mid, 3, 11, 2, 1); px(fabric.mid, 17, 11, 2, 1);
            round(px, C.ink, 6, 8, 10, 10); round(px, fabric.dark, 7, 9, 8, 8); px(fabric.light, 8, 9, 6, 1);
            px(C.ink, 10, 19, 2, 2); px(C.metal, 10, 19, 1, 2);
            px(C.ink, 6, 21, 10, 1); px(C.ink, 5, 22, 1, 1); px(C.ink, 16, 22, 1, 1);
            px(C.ink, 4, 23, 2, 1); px(C.ink, 10, 23, 2, 1); px(C.ink, 16, 23, 2, 1);
        });
        const sideChair = (px: Px) => {
            round(px, C.ink, 13, 3, 4, 13); px(fabric.dark, 14, 4, 2, 11); px(fabric.mid, 14, 4, 1, 11);
            round(px, C.ink, 3, 12, 13, 5); px(fabric.mid, 4, 13, 11, 3); px(fabric.light, 4, 13, 11, 1);
            px(C.ink, 5, 10, 8, 1); px(C.ink, 11, 11, 1, 1);
            px(C.ink, 9, 17, 2, 3); px(C.metal, 9, 17, 1, 3);
            px(C.ink, 4, 20, 12, 1);
            px(C.ink, 3, 21, 2, 1); px(C.ink, 9, 21, 2, 1); px(C.ink, 15, 21, 2, 1);
        };
        make("ref-task-dark-left", 22, 24, sideChair);
        make("ref-task-dark-right", 22, 24, sideChair, true);

        // Meeting chair, red upholstery (17x22).
        make("campus-conf-red-down", 17, 22, (px) => {
            round(px, C.ink, 3, 3, 11, 8); round(px, C.red, 4, 4, 9, 6); px(C.redLight, 5, 4, 7, 1);
            round(px, C.ink, 2, 11, 13, 7); round(px, C.red, 3, 12, 11, 5); px(C.redLight, 3, 12, 11, 1); px(C.redDark, 3, 16, 11, 1);
            px(C.ink, 3, 18, 1, 3); px(C.ink, 13, 18, 1, 3); px(C.metal, 6, 18, 1, 2); px(C.metal, 10, 18, 1, 2);
        });
        // Seen from behind, for the seats below the table: backrest in front, hiding the seat.
        make("campus-conf-red-up", 17, 22, (px) => {
            round(px, C.ink, 2, 11, 13, 7); round(px, C.red, 3, 12, 11, 5);
            round(px, C.ink, 3, 8, 11, 10); round(px, C.red, 4, 9, 9, 8); px(C.redLight, 5, 9, 7, 1); px(C.redDark, 4, 16, 9, 1);
            px(C.ink, 3, 18, 1, 3); px(C.ink, 13, 18, 1, 3); px(C.metal, 6, 18, 1, 2); px(C.metal, 10, 18, 1, 2);
        });

        // Classic office chairs (14x18). "office-chair" is only placed facing up, so it is drawn from behind:
        // backrest in front hiding the seat, armrests either side.
        make("office-chair", 14, 18, (px) => {
            round(px, C.ink, 2, 8, 10, 5); round(px, fabric.mid, 3, 9, 8, 3);
            px(C.ink, 0, 7, 2, 4); px(C.ink, 12, 7, 2, 4); px(fabric.mid, 0, 7, 2, 1); px(fabric.mid, 12, 7, 2, 1);
            round(px, C.ink, 3, 4, 8, 8); round(px, fabric.dark, 4, 5, 6, 6); px(fabric.light, 4, 5, 6, 1);
            px(C.ink, 6, 13, 2, 2); px(C.ink, 3, 15, 8, 1); px(C.ink, 2, 16, 2, 1); px(C.ink, 6, 16, 2, 1); px(C.ink, 10, 16, 2, 1);
        });
        make("office-chair-red", 14, 18, (px) => {
            round(px, C.ink, 3, 2, 8, 6); round(px, C.red, 4, 3, 6, 4); px(C.redLight, 4, 3, 6, 1);
            round(px, C.ink, 2, 8, 10, 5); round(px, C.red, 3, 9, 8, 3); px(C.redLight, 3, 9, 8, 1); px(C.redDark, 3, 11, 8, 1);
            px(C.ink, 6, 13, 2, 2); px(C.ink, 3, 15, 8, 1); px(C.ink, 2, 16, 2, 1); px(C.ink, 6, 16, 2, 1); px(C.ink, 10, 16, 2, 1);
        });
        make("office-chair-red-up", 14, 18, (px) => {
            round(px, C.ink, 2, 8, 10, 5); round(px, C.red, 3, 9, 8, 3);
            round(px, C.ink, 3, 4, 8, 8); round(px, C.red, 4, 5, 6, 6); px(C.redLight, 4, 5, 6, 1); px(C.redDark, 4, 10, 6, 1);
            px(C.ink, 6, 13, 2, 2); px(C.ink, 3, 15, 8, 1); px(C.ink, 2, 16, 2, 1); px(C.ink, 6, 16, 2, 1); px(C.ink, 10, 16, 2, 1);
        });

        const monitor = (px: Px, x: number) => {
            px(C.ink, x, 0, 14, 10); px(C.screen, x + 1, 1, 12, 7); px(C.screenHi, x + 1, 1, 12, 2);
            px(C.ink, x + 6, 10, 2, 2); px(C.metal, x + 4, 12, 6, 1);
        };
        const paper = (px: Px, x: number, y: number) => {
            px(C.paper, x, y, 5, 6); px(C.key, x + 1, y + 2, 3, 1); px(C.key, x + 1, y + 4, 2, 1);
        };

        // Two-person desk with two monitors (64x35).
        make("team-desk", 64, 35, (px) => {
            px(C.woodDark, 2, 26, 3, 9); px(C.woodDark, 59, 26, 3, 9); px(C.woodEdge, 5, 26, 54, 3);
            px(C.woodEdge, 0, 8, 64, 18); px(C.woodTop, 1, 9, 62, 13);
            px(C.wood, 1, 22, 62, 3); px(C.woodDark, 0, 25, 64, 1); px(C.wood, 31, 9, 2, 13);
            monitor(px, 9); monitor(px, 41);
            px(C.key, 10, 15, 10, 2); px(C.key, 22, 15, 2, 2);
            px(C.key, 42, 15, 10, 2); px(C.key, 54, 15, 2, 2);
            paper(px, 3, 12); paper(px, 56, 12);
        });

        // Single desk with a monitor (32x26), classic office.
        make("desk-monitor", 32, 26, (px) => {
            px(C.woodDark, 2, 20, 2, 6); px(C.woodDark, 28, 20, 2, 6);
            px(C.woodEdge, 0, 8, 32, 12); px(C.woodTop, 1, 9, 30, 8);
            px(C.wood, 1, 17, 30, 2); px(C.woodDark, 0, 19, 32, 1);
            px(C.ink, 10, 0, 12, 9); px(C.screen, 11, 1, 10, 6); px(C.screenHi, 11, 1, 10, 2);
            px(C.ink, 15, 9, 2, 2); px(C.metal, 13, 11, 6, 1);
            px(C.key, 11, 13, 10, 2); paper(px, 3, 10); px(C.mug, 25, 12, 2, 2);
        });

        // Meeting table with laptop and notes (64x38).
        make("conf-table", 64, 38, (px) => {
            px(C.woodDark, 3, 30, 3, 8); px(C.woodDark, 58, 30, 3, 8);
            px(C.woodEdge, 0, 6, 64, 24); px(C.woodTop, 1, 7, 62, 19);
            px(C.wood, 1, 26, 62, 3); px(C.woodDark, 0, 29, 64, 1); px(C.wood, 4, 16, 56, 1);
            px(C.ink, 27, 10, 10, 7); px(C.screen, 28, 11, 8, 4); px(C.screenHi, 28, 11, 8, 1); px(C.key, 27, 17, 10, 2);
            paper(px, 8, 10); paper(px, 51, 10);
            px(C.screenHi, 19, 11, 2, 2); px(C.screen, 19, 13, 2, 1);
            px(C.screenHi, 43, 11, 2, 2); px(C.screen, 43, 13, 2, 1);
        });
    }

    private makeTextures() {
        const g = this.add.graphics();


        let seed = 7;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };


        g.clear();
        g.fillStyle(0x7cc25e); g.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 90; i++) {
            const c = [0x74b850, 0x8ccf6b, 0x6fae4c][i % 3]!;
            g.fillStyle(c, 1);
            g.fillRect(Math.floor(rand() * 62), Math.floor(rand() * 62), 2, 2);
        }
        g.generateTexture("grass", 64, 64);


        g.clear();
        g.fillStyle(0xcdc7b9); g.fillRect(0, 0, 32, 32);
        g.fillStyle(0xbbb4a4); g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
        for (let i = 0; i < 6; i++) {
            g.fillStyle(0xc2bcae, 1);
            g.fillRect(Math.floor(rand() * 30), Math.floor(rand() * 30), 2, 2);
        }
        g.generateTexture("path", 32, 32);


        g.clear();
        g.fillStyle(0xe9dcc0); g.fillRect(0, 0, 64, 64);
        g.fillStyle(0xe4d5b4); g.fillRect(0, 16, 64, 16); g.fillRect(0, 48, 64, 16);
        g.fillStyle(0xd9c9a5);
        for (const y of [15, 31, 47, 63]) g.fillRect(0, y, 64, 1);
        g.fillRect(31, 0, 1, 16); g.fillRect(15, 16, 1, 16);
        g.fillRect(47, 16, 1, 16); g.fillRect(31, 32, 1, 16);
        g.fillRect(15, 48, 1, 16); g.fillRect(47, 48, 1, 16);
        g.generateTexture("floor-wood", 64, 64);


        const checker = (key: string, a: number, b: number, cell: number) => {
            g.clear();
            g.fillStyle(a); g.fillRect(0, 0, 64, 64);
            g.fillStyle(b);
            for (let cx = 0; cx < 64 / cell; cx++)
                for (let cy = 0; cy < 64 / cell; cy++)
                    if ((cx + cy) % 2 === 0) g.fillRect(cx * cell, cy * cell, cell, cell);
            g.generateTexture(key, 64, 64);
        };
        checker("floor-office", 0xb9c1de, 0xb3bbda, 16);
        checker("floor-conf", 0xc6dacd, 0xbfd4c6, 16);
        checker("floor-lounge", 0xdecdb0, 0xd8c6a6, 16);
        checker("floor-cafe", 0xeae6db, 0xdfd8c8, 16);


        g.clear();
        g.fillStyle(0x5a6170); g.fillRect(0, 0, 32, 14);
        g.fillStyle(0x6b7382); g.fillRect(0, 0, 32, 2);
        g.fillStyle(0xa6aebc); g.fillRect(0, 14, 32, 18);
        g.fillStyle(0x8f97a6); g.fillRect(0, 29, 32, 3);
        g.generateTexture("wall", 32, 32);

        g.destroy();
    }




    // Recreates the Claude Code terminal mascot (orange pixel critter) as four
    // 14x12 canvas textures — alternating leg pairs plus a body dip make the
    // scamper read as running, not sliding.
    private makeClaudePetTextures() {
        const BODY = 0xe8896b;
        const EYE = 0x141414;
        const W = 14;
        const H = 12;
        const BOB = [0, 1, 1, 0];

        const draw = (g: Phaser.GameObjects.Graphics, step: number) => {
            const bob = BOB[step] ?? 0;
            g.fillStyle(BODY, 1);
            g.fillRect(3, 1 + bob, 8, 8);
            g.fillRect(0, 3 + bob, 3, 3);
            g.fillRect(11, 3 + bob, 3, 3);

            g.fillStyle(EYE, 1);
            g.fillRect(4, 3 + bob, 2, 2);
            g.fillRect(8, 3 + bob, 2, 2);

            g.fillStyle(BODY, 1);
            [4, 6, 8, 10].forEach((lx, i) => {
                const lifted = (i % 2 === 0) === (step % 2 === 0);
                g.fillRect(lx, 9, 1, lifted ? 2 : 3);
            });
        };

        for (let step = 0; step < 4; step++) {
            const g = this.add.graphics();
            draw(g, step);
            g.generateTexture(`claude-pet-${step}`, W, H);
            g.destroy();
        }
    }

    // The Claude pet hovers above a player's head while their agent reports
    // activity. Your own pet is always visible; other players' pets appear
    // only when they are close to you.
    private updateAgentPets() {
        const activities = this.activitiesRef?.current;
        if (!activities) return;
        const selfId = this.registry.get("selfId") as string | null;
        const nearby = this.nearbyRef?.current;

        for (const [userId, activity] of Object.entries(activities)) {
            if (activity?.state !== "cooking") continue;
            const isSelf = userId === selfId;
            const sprite = isSelf ? this.player : this.otherSprites[userId];
            if (!sprite) continue;
            if (!isSelf && !(nearby?.has(userId) ?? false)) continue;

            if (!this.agentPets[userId]) {
                const pet = this.add.sprite(0, 0, "claude-pet-0").setScale(2);
                pet.play("claude-pet-walk");
                this.agentPets[userId] = pet;
            }
            const pet = this.agentPets[userId];
            const hop = Math.abs(Math.sin(this.time.now / 130 + userId.length)) * 2;
            pet.setPosition(sprite.x, sprite.y - 62 - hop);
            pet.setDepth(10001);
            pet.setAlpha(sprite.alpha);
        }

        for (const userId of Object.keys(this.agentPets)) {
            const stillCooking = activities[userId]?.state === "cooking";
            const isSelf = userId === selfId;
            const sprite = isSelf ? this.player : this.otherSprites[userId];
            const isNear = isSelf || (nearby?.has(userId) ?? false);
            if (!stillCooking || !sprite || !isNear) {
                this.agentPets[userId]?.destroy();
                delete this.agentPets[userId];
            }
        }
    }

    // Soft contact shadow so furniture sits on the floor instead of floating.
    // Drawn just above the floor and room highlight, below every object and avatar.
    private groundShadow(cx: number, bottomY: number, width: number) {
        const height = Phaser.Math.Clamp(width * 0.16, 5, 12);
        this.add.ellipse(cx, bottomY, width, height, 0x1b2130, 0.16).setDepth(-985);
    }

    private smoothText(text: Phaser.GameObjects.Text) {
        text.setResolution(3);
        text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        return text;
    }

    // A small sign inside every named room, placed on the first stretch of
    // floor that has no furniture (top row first, then bottom row).
    // Tells the map builders (HQ's and custom maps') which tiles block, are walls or are seats.
    private mapApi(): HqSceneApi {
        return {
            block: (x, y) => this.blocked.add(x + "," + y),
            wall: (x, y) => {
                this.wallCells.add(x + "," + y);
                this.blocked.add(x + "," + y);
            },
            seat: (x, y, dir, lift) => {
                this.chairMap[x + "," + y] = dir;
                if (lift !== undefined) this.chairLiftMap[x + "," + y] = lift;
            },
            shadow: (cx, bottomY, width) => this.groundShadow(cx, bottomY, width),
        };
    }

    // Draws a map built in the map builder, replacing whatever was drawn for it before.
    private buildCustom(map: CustomMap) {
        for (const object of this.customObjects) object.destroy();
        this.blocked.clear();
        this.wallCells.clear();
        this.chairMap = {};
        this.chairLiftMap = {};
        const before = new Set(this.children.list);
        buildCustomMap(this, map, this.mapApi());
        this.customObjects = this.children.list.filter((object) => !before.has(object));
        this.customMap = map;
        this.minimapFloors = customMinimapFloors(map);
        const bridge = this.bridge?.current;
        if (bridge?.map) bridge.map = { ...bridge.map, walls: [...this.wallCells], blocked: [...this.blocked], floors: this.minimapFloors };
    }

    // The map builder's preview: the tiles an edit covers (green if it fits, red if not) and,
    // for furniture, the piece itself, faded.
    private showBuilderGhost(ghost: Parameters<NonNullable<SceneBridge["setBuilderGhost"]>>[0]) {
        this.builderGhost ??= this.add.graphics().setDepth(9300);
        this.builderGhost.clear();
        this.builderGhostImage?.setVisible(false);
        if (!ghost) return;
        const color = ghost.ok ? 0x22a861 : 0xe5484d;
        const x = ghost.x * TILE, y = ghost.y * TILE, w = ghost.w * TILE, h = ghost.h * TILE;
        this.builderGhost.fillStyle(color, 0.16).fillRect(x, y, w, h);
        this.builderGhost.lineStyle(2, color, 0.9).strokeRect(x + 1, y + 1, w - 2, h - 2);
        if (!ghost.item) return;
        const key = itemTextureKey({ ...ghost.item, x: ghost.x, y: ghost.y });
        if (!this.textures.exists(key)) return;
        this.builderGhostImage ??= this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(9299);
        this.builderGhostImage.setTexture(key).setPosition(x + w / 2, y + h).setAlpha(ghost.ok ? 0.7 : 0.4).setVisible(true);
    }

    private buildRoomSigns() {
        for (const sign of Object.values(this.roomSigns)) {
            sign.bg.destroy();
            sign.text.destroy();
        }
        this.roomSigns = {};
        const rooms: ChatRoomZone[] = this.customMap?.rooms ?? getMapTemplate(this.mapTemplateId).chatRooms;
        for (const room of rooms) {
            const padX = 8;
            const text = this.smoothText(this.add.text(0, 0, room.name, {
                fontFamily: this.labelFont,
                fontSize: "12px",
                fontStyle: "600",
                color: "#4a505e",
            })).setOrigin(0, 0.5).setDepth(9001);
            text.setShadow(0, 1, "rgba(255,255,255,0.8)", 0);
            const width = Math.ceil(text.width) + padX * 2;
            const spot = room.sign ?? this.findSignSpot(room.bounds, Math.ceil((width + 8) / TILE));
            const x = spot.x * TILE + 4;
            const y = spot.y * TILE + TILE / 2;
            text.setPosition(x + padX, y);
            const bg = this.add.graphics().setPosition(x, y).setDepth(9000);
            this.roomSigns[room.id] = { bg, text, width };
            this.styleRoomSign(room.id, room.id === this.currentRoomId);
        }
    }

    private findSignSpot(bounds: { x: number; y: number; width: number; height: number }, tilesWide: number) {
        // Furniture is drawn taller than the tiles it stands on, so a sign in the top row
        // also needs the row below it to be free.
        // Last resort for packed rooms: just above the room, like a door sign (only if it's open floor, not a wall).
        const candidates = [
            { y: bounds.y, check: [bounds.y, bounds.y + 1] },
            { y: bounds.y + bounds.height - 1, check: [bounds.y + bounds.height - 1] },
            { y: bounds.y - 1, check: [bounds.y - 1] },
        ];
        for (const { y, check } of candidates) {
            for (let x = bounds.x; x + tilesWide <= bounds.x + bounds.width; x++) {
                let clear = true;
                for (let dx = 0; dx < tilesWide && clear; dx++) {
                    if (check.some((row) => this.blocked.has(`${x + dx},${row}`) || this.chairMap[`${x + dx},${row}`])) clear = false;
                }
                if (clear) return { x, y };
            }
        }
        return { x: bounds.x, y: bounds.y };
    }

    private styleRoomSign(id: string, active: boolean) {
        const sign = this.roomSigns[id];
        if (!sign) return;
        sign.bg.clear();
        // Just the name. The room you're in gets stronger text and a small green dot.
        if (active) {
            sign.bg.fillStyle(0x22a861, 1);
            sign.bg.fillCircle(3, 0, 3);
        }
        if (LIGHT_SIGN_ROOMS.has(id)) {
            sign.text.setColor(active ? "#ffffff" : "#c9cee0");
            sign.text.setShadow(0, 1, "rgba(0,0,0,0.6)", 0);
        } else {
            sign.text.setColor(active ? "#12151c" : "#4a505e");
        }
    }

    // Outlines the room you are standing in and lights up its sign.
    private updateCurrentRoom() {
        const here = { x: this.tileX, y: this.tileY };
        const room = this.customMap ? customRoomAt(this.customMap, here) : getChatRoomAtPosition(this.mapTemplateId, here);
        const id = room?.id ?? null;
        if (id === this.currentRoomId) return;
        if (this.currentRoomId) this.styleRoomSign(this.currentRoomId, false);
        this.currentRoomId = id;
        this.roomHighlight.clear();
        if (!room) return;
        this.styleRoomSign(room.id, true);
        const { x, y, width, height } = room.bounds;
        this.roomHighlight.fillStyle(0xffffff, 0.08);
        this.roomHighlight.fillRect(x * TILE, y * TILE, width * TILE, height * TILE);
        this.roomHighlight.lineStyle(1, 0xffffff, 0.5);
        this.roomHighlight.strokeRect(x * TILE + 0.5, y * TILE + 0.5, width * TILE - 1, height * TILE - 1);
    }

    private makeNameTag(label: string, isSelf: boolean, isSitting: boolean = false, isCooking: boolean = false) {
        const text = this.smoothText(this.add.text(0, 0, label, {
            fontFamily: this.labelFont,
            fontSize: "13px",
            fontStyle: "600",
            color: isSelf ? "#12151c" : "#ffffff",
        })).setOrigin(0, 0.5);


        const padX = 8;
        const dotR = 4;
        const gap = 6;
        const pillH = 22;
        const pillW = padX + dotR * 2 + gap + text.width + padX;


        const left = -pillW / 2;
        const dotX = left + padX + dotR;
        text.setX(dotX + dotR + gap);


        const bg = this.add.graphics();
        bg.fillStyle(isSelf ? 0xffffff : 0x12151c, isSelf ? 0.96 : (isSitting ? 0.7 : 0.84));
        bg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 5);
        if (isSelf) {
            bg.lineStyle(1, 0x12151c, 0.2);
            bg.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 5);
        }


        const dot = this.add.graphics();
        dot.fillStyle(isCooking ? 0xff7a1a : (isSitting ? 0xf59e0b : 0x22c55e), 1);
        dot.fillCircle(dotX, 0, dotR);



        return this.add.container(0, 0, [bg, text, dot]).setDepth(10000);
    }




    private setSittingPose(sprite: Phaser.GameObjects.Sprite, dir: "down" | "up" | "left" | "right") {
        if (sprite.anims.isPlaying) sprite.anims.stop();
        sprite.setFrame(this.standingFrame(dir));
    }

    // Texture for a player: the default character, or a recoloured copy of the base character
    // they picked. Each distinct look is made once, with its own walk animations.
    private avatarTexture(userId: string | null | undefined) {
        const look = userId ? this.looksRef?.current?.[userId] : undefined;
        return look ? this.lookTexture(look) : "adam";
    }

    private lookTexture(look: AvatarLook) {
        const key = lookKey(look);
        if (this.textures.exists(key)) return key;
        const sourceKey = look.base === "adam" ? "adam" : `avatar-base-${look.base}`;
        if (!this.textures.exists(sourceKey)) return "adam";
        const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
        const texture = this.textures.addCanvas(key, recolorSheet(source, source.width, source.height, look));
        if (!texture) return "adam";
        for (let i = 0; i < FRAME_COUNT; i++) texture.add(i, 0, i * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT);
        for (const dir of Object.keys(WALK_START) as WalkDir[]) {
            this.anims.create({
                key: `walk-${dir}:${key}`,
                frames: this.anims.generateFrameNumbers(key, { start: WALK_START[dir], end: WALK_START[dir] + 5 }),
                frameRate: 10,
                repeat: -1,
            });
        }
        return key;
    }

    // Swaps a sprite to its player's current look (they can arrive after the sprite exists).
    private syncAvatar(sprite: Phaser.GameObjects.Sprite, userId: string | null | undefined) {
        const key = this.avatarTexture(userId);
        if (sprite.texture.key === key) return;
        const frame = Number(sprite.frame.name) || 0;
        sprite.anims.stop();
        sprite.setTexture(key, frame);
    }

    private walkAnim(sprite: Phaser.GameObjects.Sprite, dir: WalkDir) {
        return sprite.texture.key === "adam" ? `walk-${dir}` : `walk-${dir}:${sprite.texture.key}`;
    }




    private seatedPoint(tileX: number, tileY: number, dir: "up" | "down" | "left" | "right", customLift?: number) {
        const lift = customLift ?? (dir === "up" ? 12 : 8);
        return {
            x: tileX * TILE + TILE / 2,
            y: tileY * TILE + TILE / 2 - lift,
        };
    }



    private spawnReactions() {
        const list = this.reactionsRef?.current;
        if (!list) return;

        for (const r of list) {
            if (this.shownReactions.has(r.id)) continue;
            this.shownReactions.add(r.id);

            const target = this.otherSprites[r.userId] ?? this.player;
            const emoji = this.add
                .text(target.x, target.y - 40, r.emoji, { fontSize: "24px" })
                .setOrigin(0.5, 1)
                .setDepth(20000);

            this.tweens.add({
                targets: emoji,
                y: target.y - 90,
                alpha: 0,
                duration: 1800,
                ease: "Cubic.easeOut",
                onComplete: () => emoji.destroy(),
            });
        }


        const liveIds = new Set(list.map((r) => r.id));
        for (const id of this.shownReactions) {
            if (!liveIds.has(id)) this.shownReactions.delete(id);
        }
    }

    private standingFrame(dir:"down"|"up"|"left" | "right"){
        if(dir === "up") return 6;
        if(dir === "left") return 12;
        if(dir === "right") return 0;
        return 18;
    }
}
