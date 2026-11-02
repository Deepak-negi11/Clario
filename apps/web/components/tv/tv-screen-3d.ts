import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import type { RefObject } from "react";
import type { SceneBridge } from "../phaser/scene-bridge";
import { drawTvHome, hitAt, loadSuggestions, type HomeAction, type HomeHit } from "./tv-home";
import { createTvPlayer, type TvPlayer } from "./tv-player";
import type { TvStore } from "./tv-store";

// The TVs playing on the 3D office's screens: the Lounge TV, the Demo Stage screen, the Game Room's.
// A YouTube player is a cross-origin iframe, which WebGL can't draw into a texture, so each one sits
// in a CSS3D layer behind the WebGL canvas, placed and turned exactly like its screen with the same
// camera. A see-through patch on the screen (the WebGL renderer needs `alpha: true`) lets it show
// through, and anyone walking in front of the screen still covers it, as they would a real one.
// Each screen plays its own channel. Only the nearest one with something on is heard, louder close
// up, so two TVs never talk over each other. A TV turned on with nothing playing shows its home
// screen of suggestions (tv-home.ts); a click on one of them, caught before the 3D view takes it as
// a walk, plays it.
//
// office-scene.ts tags each screen (`userData.tvScreen = { id, face }`, the id from tvScreenId in
// lib/maps/play-spots.ts); the 3D view creates its WebGL renderer with `alpha: true` and calls
// render/resize/dispose.

// What a tag says: the screen's channel, and where its face is: "model" for the televisionModern
// model's screen, "box" for the front of a tagged box (a screen hung on a wall).
export type TvScreenTag = { id: string; face?: "model" | "box" };

// The televisionModern model's screen, in the model's own units: the recessed face inside the
// bezel (read from public/assets/3d/kenney/televisionModern.glb).
const MODEL_SCREEN = { x: 0.334, y0: 0.078, y1: 0.446, z: 0.021 };
const PIXELS_WIDE = 1280;
// Full volume within this many tiles of a TV, silent from FADE_TO.
const FADE_FROM = 4;
const FADE_TO = 16;
// How often to look for screens again while a rebuilt office may have added some, in ms.
const LOOK_EVERY = 1000;

export type TvScreen3d = {
  render: (self: { x: number; y: number } | null | undefined) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

type Screen = {
  id: string;
  tagged: THREE.Object3D;
  center: THREE.Vector3;
  // The picture's size in its own pixels, and its home screen: the page shown and where its tiles are.
  size: { width: number; height: number };
  home: HTMLDivElement;
  homePage: number | null;
  hits: HomeHit[];
  picture: CSS3DObject;
  hole: THREE.Mesh;
  player: TvPlayer;
  store: TvStore | null;
  unsubscribe: (() => void) | null;
  lastVolume: number;
};

const tagOf = (object: THREE.Object3D): TvScreenTag | null => {
  const tag = object.userData.tvScreen as TvScreenTag | undefined;
  return tag && typeof tag === "object" && typeof tag.id === "string" ? tag : null;
};

// Where a tagged screen's face is in the world: its middle, size and the way it faces.
function faceOf(tagged: THREE.Object3D, tag: TvScreenTag) {
  tagged.updateWorldMatrix(true, true);
  let local: { center: THREE.Vector3; right: THREE.Vector3; top: THREE.Vector3; front: THREE.Vector3 };
  let node = tagged;
  if (tag.face === "box" && tagged instanceof THREE.Mesh) {
    tagged.geometry.computeBoundingBox();
    const box = tagged.geometry.boundingBox as THREE.Box3;
    const y = (box.min.y + box.max.y) / 2;
    const x = (box.min.x + box.max.x) / 2;
    local = {
      center: new THREE.Vector3(x, y, box.max.z),
      right: new THREE.Vector3(box.max.x, y, box.max.z),
      top: new THREE.Vector3(x, box.max.y, box.max.z),
      front: new THREE.Vector3(x, y, box.max.z + 1),
    };
  } else {
    node = tagged.children[0] ?? tagged;
    const y = (MODEL_SCREEN.y0 + MODEL_SCREEN.y1) / 2;
    local = {
      center: new THREE.Vector3(0, y, MODEL_SCREEN.z),
      right: new THREE.Vector3(MODEL_SCREEN.x, y, MODEL_SCREEN.z),
      top: new THREE.Vector3(0, MODEL_SCREEN.y1, MODEL_SCREEN.z),
      front: new THREE.Vector3(0, y, MODEL_SCREEN.z + 1),
    };
  }
  const at = (point: THREE.Vector3) => node.localToWorld(point.clone());
  const center = at(local.center);
  return {
    center,
    width: at(local.right).distanceTo(center) * 2,
    height: at(local.top).distanceTo(center) * 2,
    facing: at(local.front).sub(center).normalize(),
  };
}

export function attachTvScreen({
  scene,
  camera,
  mount,
  canvas,
  bridgeRef,
}: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  mount: HTMLElement;
  // The WebGL canvas: it's lifted above the picture layer so the pictures only show through the patches.
  canvas: HTMLCanvasElement;
  bridgeRef?: RefObject<SceneBridge>;
}): TvScreen3d {
  const cssScene = new THREE.Scene();
  const css = new CSS3DRenderer();
  css.setSize(mount.clientWidth, mount.clientHeight);
  Object.assign(css.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" });
  mount.prepend(css.domElement);
  if (!canvas.style.position) canvas.style.position = "relative";
  canvas.style.zIndex = "1";

  const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false });
  const holeGeometry = new THREE.PlaneGeometry(1, 1);
  const screens = new Map<string, Screen>();
  // The bridge's channel source; it may arrive after this view does, or be replaced.
  let source: ((id: string) => TvStore) | undefined;

  // Still in the scene? (A custom map being edited rebuilds the office, TVs and all.)
  const inScene = (object: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === scene) return true;
    return false;
  };

  // The home screen while the TV is on with nothing playing: drawn again when its page changes.
  const showHome = (screen: Screen) => {
    const store = screen.store;
    const page = store && !store.channel() ? store.home() : null;
    if (page === screen.homePage) return;
    screen.homePage = page;
    screen.hits = [];
    if (page === null) {
      screen.home.style.display = "none";
      return;
    }
    screen.home.style.display = "block";
    const draw = (state: Parameters<typeof drawTvHome>[1]["state"]) => {
      if (screen.homePage === page) screen.hits = drawTvHome(screen.home, { ...screen.size, state });
    };
    draw("loading");
    loadSuggestions(page).then(draw, () => draw("error"));
  };

  const connect = (screen: Screen) => {
    screen.unsubscribe?.();
    if (screen.store) screen.store.onScreen = false;
    screen.store = source?.(screen.id) ?? null;
    screen.unsubscribe = null;
    if (!screen.store) {
      screen.player.show(null);
      return showHome(screen);
    }
    const store = screen.store;
    store.onScreen = true;
    const show = () => {
      screen.player.show(store.channel());
      showHome(screen);
    };
    screen.unsubscribe = store.subscribe(show);
    show();
  };

  const add = (tagged: THREE.Object3D, tag: TvScreenTag) => {
    const face = faceOf(tagged, tag);
    // The screen's picture: black behind the player, so a widescreen video shows bars at the sides.
    const size = { width: PIXELS_WIDE, height: Math.round((PIXELS_WIDE * face.height) / face.width) };
    const element = document.createElement("div");
    Object.assign(element.style, { position: "relative", width: `${size.width}px`, height: `${size.height}px`, background: "#000", pointerEvents: "none" });
    const player = createTvPlayer(element, "YouTube video on a TV in the 3D office");
    const home = document.createElement("div");
    home.style.display = "none";
    element.append(home);
    const picture = new CSS3DObject(element);
    // The see-through patch: writes "nothing here" into the canvas so the layer behind shows.
    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.visible = false;
    const position = face.center.clone().addScaledVector(face.facing, 0.004);
    hole.position.copy(position);
    hole.scale.set(face.width, face.height, 1);
    hole.lookAt(position.clone().add(face.facing));
    picture.position.copy(position);
    picture.quaternion.copy(hole.quaternion);
    picture.scale.setScalar(face.width / PIXELS_WIDE);
    scene.add(hole);
    cssScene.add(picture);
    const screen: Screen = { id: tag.id, tagged, center: face.center, size, home, homePage: null, hits: [], picture, hole, player, store: null, unsubscribe: null, lastVolume: -1 };
    screens.set(tag.id, screen);
    connect(screen);
  };

  const remove = (screen: Screen) => {
    screen.unsubscribe?.();
    if (screen.store) screen.store.onScreen = false;
    screen.player.dispose();
    scene.remove(screen.hole);
    cssScene.remove(screen.picture);
    screens.delete(screen.id);
  };

  // Finds the tagged screens: the ones gone with a rebuilt office go, new ones come.
  let lookedAt = -Infinity;
  const look = () => {
    const now = performance.now();
    const lost = [...screens.values()].filter((screen) => !inScene(screen.tagged));
    if (lost.length === 0 && now - lookedAt < LOOK_EVERY) return;
    lookedAt = now;
    for (const screen of lost) remove(screen);
    scene.traverse((object) => {
      const tag = tagOf(object);
      if (tag && !screens.has(tag.id)) add(object, tag);
    });
  };

  // Clicks on a home screen: the tile under the pointer, found on the screen's see-through patch.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tileAt = (event: PointerEvent): { screen: Screen; action: HomeAction } | null => {
    const homes = [...screens.values()].filter((screen) => screen.homePage !== null && screen.hits.length > 0);
    if (homes.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const screen of homes) {
      const uv = raycaster.intersectObject(screen.hole, false)[0]?.uv;
      if (!uv) continue;
      const hit = hitAt(screen.hits, uv.x * screen.size.width, (1 - uv.y) * screen.size.height);
      if (hit) return { screen, action: hit.action };
    }
    return null;
  };
  let pressed: { screen: Screen; action: HomeAction } | null = null;
  // Caught on the way down to the canvas, so the 3D view doesn't also walk you there.
  const onPointerDown = (event: PointerEvent) => {
    if (event.target !== canvas || event.button !== 0) return;
    pressed = tileAt(event);
    if (pressed) event.stopPropagation();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pressed) return;
    const down = pressed;
    pressed = null;
    event.stopPropagation();
    const up = tileAt(event);
    if (!up || up.screen !== down.screen || up.action !== down.action) return;
    const store = down.screen.store;
    if (!store) return;
    if (down.action.kind === "play") store.play({ id: down.action.video.id, title: down.action.video.title });
    else store.setHome((down.screen.homePage ?? 0) + 1);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.target !== canvas || event.buttons !== 0) return;
    canvas.style.cursor = tileAt(event) ? "pointer" : "";
  };
  mount.addEventListener("pointerdown", onPointerDown, true);
  mount.addEventListener("pointerup", onPointerUp, true);
  mount.addEventListener("pointermove", onPointerMove, true);

  return {
    render(self) {
      const next = bridgeRef?.current.tv;
      if (next !== source) {
        source = next;
        for (const screen of screens.values()) connect(screen);
      }
      look();

      // Louder close up: fades out from FADE_FROM to FADE_TO tiles away (self is in tiles). Only the
      // nearest screen with something on is heard.
      let heard: Screen | null = null;
      let heardFade = 0;
      let showing = false;
      for (const screen of screens.values()) {
        const playing = !!screen.store?.channel();
        screen.hole.visible = playing || screen.homePage !== null;
        showing ||= screen.hole.visible;
        if (!playing) continue;
        let fade = 1;
        if (self) {
          const distance = Math.hypot(self.x + 0.5 - screen.center.x, self.y + 0.5 - screen.center.z);
          fade = Math.max(0, Math.min(1, 1 - (distance - FADE_FROM) / (FADE_TO - FADE_FROM)));
        }
        if (fade > heardFade) {
          heard = screen;
          heardFade = fade;
        }
      }
      for (const screen of screens.values()) {
        const store = screen.store;
        if (!store) continue;
        const volume = screen === heard && !store.muted() ? Math.round(store.volume() * heardFade) : 0;
        if (Math.abs(volume - screen.lastVolume) >= 2 || (volume === 0) !== (screen.lastVolume === 0)) {
          screen.lastVolume = volume;
          screen.player.setVolume(volume);
        }
      }
      if (showing) css.render(cssScene, camera);
    },
    resize(width, height) {
      css.setSize(width, height);
    },
    dispose() {
      mount.removeEventListener("pointerdown", onPointerDown, true);
      mount.removeEventListener("pointerup", onPointerUp, true);
      mount.removeEventListener("pointermove", onPointerMove, true);
      for (const screen of [...screens.values()]) remove(screen);
      holeGeometry.dispose();
      holeMaterial.dispose();
      css.domElement.remove();
    },
  };
}
