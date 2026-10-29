import * as THREE from "three";

// A laptop whose lid opens, for desks you can sit at: a base with keys, and a lid hinged at the
// back whose screen, face down on the keys while shut, lights up as it opens. Built from boxes,
// since the Kenney laptop is one solid piece. It faces +z (you sit on that side), about the size
// of the Kenney one on a desk.

const WIDTH = 0.42;
const DEPTH = 0.3;
const BASE = 0.018;
const LID = 0.012;
const OPEN_ANGLE = 1.85; // radians from shut, a little past upright

export type Laptop = {
  object: THREE.Group;
  // 0 is shut, 1 open; in between eases the lid and fades the screen in.
  setOpen: (amount: number) => void;
};

export function makeLaptop(): Laptop {
  const object = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: "#c3c8d2", roughness: 0.35, metalness: 0.55 });
  const keys = new THREE.MeshStandardMaterial({ color: "#2b2f38", roughness: 0.8 });
  const screen = new THREE.MeshStandardMaterial({ color: "#0d1017", emissive: "#a8c8ff", emissiveIntensity: 0, roughness: 0.2 });
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  part(object, WIDTH, BASE, DEPTH, shell, 0, BASE / 2, 0);
  part(object, WIDTH * 0.86, 0.003, DEPTH * 0.42, keys, 0, BASE + 0.0015, -DEPTH * 0.12);

  // The lid turns about the back edge of the base; shut, it lies on the keys facing down.
  const hinge = new THREE.Group();
  hinge.position.set(0, BASE + 0.002, -DEPTH / 2);
  object.add(hinge);
  part(hinge, WIDTH, LID, DEPTH, shell, 0, LID / 2, DEPTH / 2);
  part(hinge, WIDTH * 0.9, 0.001, DEPTH * 0.86, screen, 0, -0.0006, DEPTH / 2).castShadow = false;

  return {
    object,
    setOpen: (amount) => {
      const eased = amount * amount * (3 - 2 * amount);
      hinge.rotation.x = -OPEN_ANGLE * eased;
      // The screen wakes once the lid is most of the way up.
      screen.emissiveIntensity = 1.1 * Math.max(0, (eased - 0.45) / 0.55);
    },
  };
}
