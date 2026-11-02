import * as THREE from "three";
import type { RefObject } from "react";
import type { SceneBridge } from "../phaser/scene-bridge";

// The notice board in the 3D view: a cork board on two legs, standing on the tile the 2D map
// picked for it (bridge.noticeBoardSpot, lib/maps/notice-board-spot.ts). Clicking it opens the
// board (office-3d.tsx asks isNoticeBoard); a red pin glows while there are posts you haven't read.

const FACE_Z = 0.035;

function board() {
  const group = new THREE.Group();
  group.userData.noticeBoard = true;
  const mat = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const wood = mat(0x8a5a2b, 0.7);
  const woodDark = mat(0x6b431f, 0.7);
  // Legs and feet.
  for (const x of [-0.34, 0.34]) {
    box(0.05, 0.62, 0.05, woodDark, x, 0.31, 0);
    box(0.16, 0.03, 0.22, wood, x, 0.015, 0);
  }
  // Frame and cork.
  box(0.92, 0.66, 0.06, wood, 0, 0.88, 0);
  box(0.84, 0.58, 0.02, mat(0xc39a6b, 0.95), 0, 0.88, 0.025);

  // Notes pinned up: a white page, a yellow sticky, a blue page and a card, each with a pin.
  const notes: Array<[number, number, number, number, number, number]> = [
    [0xf7f3ea, -0.22, 0.95, 0.26, 0.32, 0.05],
    [0xf6d860, 0.12, 1.02, 0.18, 0.18, -0.08],
    [0xdfe9ff, 0.2, 0.76, 0.28, 0.24, 0.04],
    [0xffffff, -0.18, 0.7, 0.2, 0.16, -0.06],
  ];
  const pins = [0xd94a3a, 0x3a6ee8, 0x2c8c84, 0xd94a3a];
  notes.forEach(([color, x, y, w, h, tilt], i) => {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color, 0.9));
    note.position.set(x, y, FACE_Z + 0.001 * i);
    note.rotation.z = tilt;
    group.add(note);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat(pins[i]!, 0.4));
    pin.position.set(x, y + h / 2 - 0.03, FACE_Z + 0.012);
    group.add(pin);
  });

  // The "new posts" pin in the top corner; it glows while there are some.
  const alert = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xd94a3a, emissive: 0xd94a3a, emissiveIntensity: 0.6, roughness: 0.35 }),
  );
  alert.position.set(0.42, 1.2, FACE_Z + 0.03);
  alert.visible = false;
  group.add(alert);
  return { group, alert };
}

// Whether a clicked object is (part of) the notice board.
export function isNoticeBoard(object: THREE.Object3D | null) {
  for (let node = object; node; node = node.parent) if (node.userData.noticeBoard) return true;
  return false;
}

export function attachNoticeBoard3d(scene: THREE.Scene, bridgeRef?: RefObject<SceneBridge>) {
  const { group, alert } = board();
  group.visible = false;
  scene.add(group);
  let placed: { x: number; y: number } | null = null;

  return {
    // Every frame: follow the board's tile (a built map can move it) and show new posts.
    update(time: number) {
      const bridge = bridgeRef?.current;
      const spot = bridge?.noticeBoardSpot ?? null;
      if (spot !== placed) {
        placed = spot;
        group.visible = !!spot;
        // Near the back of its tile, facing the room, so its back is to the wall behind it.
        if (spot) group.position.set(spot.x + 0.5, 0, spot.y + 0.3);
      }
      const unread = (bridge?.noticeUnread ?? 0) > 0;
      alert.visible = unread;
      if (unread) alert.scale.setScalar(1 + 0.12 * Math.sin(time * 4));
    },
    dispose() {
      scene.remove(group);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
    },
  };
}
