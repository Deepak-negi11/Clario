import * as THREE from "three";
import type { RefObject } from "react";
import type { SceneBridge } from "../phaser/scene-bridge";

// The front-door badge readers in the 3D view, where the 2D map has them: the map's "badge-reader"
// items, and the one the 2D map stood by the spawn on a map with none (bridge.badgeReaderTile).
// Each is a dark reader box with a lighter card pad on a slim post, at shoulder height, with an LED
// that follows bridge.badgeLight: bright green just after a badge-in, dim green while you are in,
// amber otherwise. Clicking one badges you in (bridge.badgeIn, as E next to it does).

const FLASH_MS = 1200;
type Tile = { x: number; y: number };

function makeReader() {
  const group = new THREE.Group();
  group.userData.badgeReader = true;
  const dark = new THREE.MeshStandardMaterial({ color: "#1b1e26", roughness: 0.5, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: "#7b818c", roughness: 0.4, metalness: 0.6 });
  const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 24), steel), 0, 0.015, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 12), steel), 0, 0.65, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.04), dark), 0, 1.38, 0.01);
  // The card pad, with a contactless mark, and the LED above it.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.006), new THREE.MeshStandardMaterial({ color: "#4c5462", roughness: 0.4 })), 0, 1.35, 0.033);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: "#a9b2c1", roughness: 0.4 })), 0, 1.345, 0.037);
  const led = add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshStandardMaterial({ color: "#f2a33a", emissive: "#f2a33a", emissiveIntensity: 0.8 })), 0, 1.445, 0.032);
  return { group, led };
}

// Whether a clicked object is (part of) a badge reader.
export function isBadgeReader(object: THREE.Object3D | null) {
  for (let node = object; node; node = node.parent) if (node.userData.badgeReader) return true;
  return false;
}

// `tiles`: the map's own readers (Clario HQ's or a built map's items), read every frame.
export function attachBadgeReaders3d(scene: THREE.Scene, bridgeRef: RefObject<SceneBridge> | undefined, tiles: () => readonly Tile[]) {
  let readers: { group: THREE.Group; led: THREE.Mesh }[] = [];
  let placedKey = "";
  const clear = () => {
    for (const { group } of readers) {
      scene.remove(group);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
    }
    readers = [];
  };
  const flash = new THREE.Color("#6dff96");
  const inside = new THREE.Color("#2fbf5a");
  const idle = new THREE.Color("#f2a33a");

  return {
    update() {
      const bridge = bridgeRef?.current;
      const own = tiles();
      const all = own.length ? own : bridge?.badgeReaderTile ? [bridge.badgeReaderTile] : [];
      const key = all.map((tile) => `${tile.x},${tile.y}`).join(" ");
      if (key !== placedKey) {
        placedKey = key;
        clear();
        readers = all.map((tile) => {
          const reader = makeReader();
          // Near the back of its tile, facing the room, like the 2D art.
          reader.group.position.set(tile.x + 0.5, 0, tile.y + 0.35);
          scene.add(reader.group);
          return reader;
        });
      }
      const light = bridge?.badgeLight;
      const flashing = !!light && Date.now() - light.flashAt < FLASH_MS;
      const color = flashing ? flash : light?.in ? inside : idle;
      for (const { led } of readers) {
        const material = led.material as THREE.MeshStandardMaterial;
        material.color.copy(color);
        material.emissive.copy(color);
        material.emissiveIntensity = flashing ? 2.4 : light?.in ? 1.1 : 0.7;
        led.scale.setScalar(flashing ? 1 + 0.3 * Math.sin(Date.now() / 60) : 1);
      }
    },
    dispose: clear,
  };
}
