import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import type { RefObject } from "react";
import type { SceneBridge } from "../phaser/scene-bridge";
import { createTvPlayer } from "./tv-player";
import type { TvStore } from "./tv-store";

// The Lounge TV playing on the 3D office's TV. A YouTube player is a cross-origin iframe, which
// WebGL can't draw into a texture, so it sits in a CSS3D layer behind the WebGL canvas, placed and
// turned exactly like the TV's screen with the same camera. A see-through patch on the screen
// (the WebGL renderer needs `alpha: true`) lets it show through, and anyone walking in front of
// the TV still covers it, as they would a real one. Its volume fades as you walk away.
//
// The 3D view creates its WebGL renderer with `alpha: true`, tags the TV model
// (`userData.tvScreen`), and calls render/resize/dispose.

// The televisionModern model's screen, in the model's own units: the recessed face inside the
// bezel (read from public/assets/3d/kenney/televisionModern.glb).
const MODEL_SCREEN = { x: 0.334, y0: 0.078, y1: 0.446, z: 0.021 };
const PIXELS_WIDE = 1280;
// Full volume within this many tiles of the TV, silent from FADE_TO.
const FADE_FROM = 4;
const FADE_TO = 16;

export type TvScreen3d = {
  render: (self: { x: number; y: number } | null | undefined) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

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
  // The WebGL canvas: it's lifted above the picture layer so the picture only shows through the patch.
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

  // The screen's picture: black behind the player, so a widescreen TV shows bars at the sides.
  const element = document.createElement("div");
  Object.assign(element.style, { position: "relative", width: `${PIXELS_WIDE}px`, background: "#000", pointerEvents: "none" });
  const player = createTvPlayer(element, "YouTube video on the 3D Lounge TV");
  const picture = new CSS3DObject(element);
  cssScene.add(picture);

  // The see-through patch: writes "nothing here" into the canvas so the layer behind shows.
  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false }),
  );
  hole.visible = false;
  hole.castShadow = false;
  hole.receiveShadow = false;
  scene.add(hole);

  let tvPosition: THREE.Vector3 | null = null;
  let placedFor: THREE.Object3D | null = null;

  // Still in the scene? (A custom map being edited rebuilds the office, TV and all.)
  const inScene = (object: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === scene) return true;
    return false;
  };

  // Finds the first tagged TV (the Lounge's) and puts the picture and the patch on its screen.
  const place = () => {
    let tv: THREE.Object3D | null = null;
    scene.traverse((object) => {
      if (!tv && object.userData.tvScreen) tv = object;
    });
    if (!tv || tv === placedFor) return !!tv;
    const holder = tv as THREE.Object3D;
    const model = holder.children[0] ?? holder;
    holder.updateWorldMatrix(true, true);
    const at = (x: number, y: number, z: number) => model.localToWorld(new THREE.Vector3(x, y, z));
    const middleY = (MODEL_SCREEN.y0 + MODEL_SCREEN.y1) / 2;
    const center = at(0, middleY, MODEL_SCREEN.z);
    const width = at(MODEL_SCREEN.x, middleY, MODEL_SCREEN.z).distanceTo(at(-MODEL_SCREEN.x, middleY, MODEL_SCREEN.z));
    const height = at(0, MODEL_SCREEN.y1, MODEL_SCREEN.z).distanceTo(at(0, MODEL_SCREEN.y0, MODEL_SCREEN.z));
    const facing = at(0, middleY, MODEL_SCREEN.z + 1).sub(center).normalize();

    const position = center.clone().addScaledVector(facing, 0.004);
    hole.position.copy(position);
    hole.scale.set(width, height, 1);
    hole.lookAt(position.clone().add(facing));

    element.style.height = `${Math.round((PIXELS_WIDE * height) / width)}px`;
    picture.position.copy(position);
    picture.quaternion.copy(hole.quaternion);
    picture.scale.setScalar(width / PIXELS_WIDE);
    tvPosition = center;
    placedFor = holder;
    return true;
  };

  // The channel comes from the store ArcadeOnMap puts on the bridge, which may arrive after this
  // view does, or be replaced: (re)connect whenever the bridge has a different one.
  let unsubscribe: (() => void) | null = null;
  let lastVolume = -1;
  let store: TvStore | undefined;
  const connect = () => {
    const next = bridgeRef?.current.tv;
    if (next === store) return;
    unsubscribe?.();
    if (store) store.onScreen = false;
    store = next;
    unsubscribe = null;
    if (!store) return player.show(null);
    const current = store;
    current.onScreen = true;
    const show = () => player.show(current.channel());
    unsubscribe = current.subscribe(show);
    show();
  };
  connect();

  return {
    render(self) {
      connect();
      if (placedFor && !inScene(placedFor)) {
        placedFor = null;
        hole.visible = false;
      }
      if (!placedFor && !place()) return;
      if (store) {
        hole.visible = !!store.channel();
        // Louder close up: fades out from FADE_FROM to FADE_TO tiles away (self is in tiles).
        let fade = 1;
        if (self && tvPosition) {
          const distance = Math.hypot(self.x + 0.5 - tvPosition.x, self.y + 0.5 - tvPosition.z);
          fade = Math.max(0, Math.min(1, 1 - (distance - FADE_FROM) / (FADE_TO - FADE_FROM)));
        }
        const volume = store.muted() ? 0 : Math.round(store.volume() * fade);
        if (Math.abs(volume - lastVolume) >= 2 || (volume === 0) !== (lastVolume === 0)) {
          lastVolume = volume;
          player.setVolume(volume);
        }
      }
      if (hole.visible) css.render(cssScene, camera);
    },
    resize(width, height) {
      css.setSize(width, height);
    },
    dispose() {
      unsubscribe?.();
      if (store) store.onScreen = false;
      player.dispose();
      scene.remove(hole);
      hole.geometry.dispose();
      (hole.material as THREE.Material).dispose();
      css.domElement.remove();
    },
  };
}
