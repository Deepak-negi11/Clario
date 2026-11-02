import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function makeOfficePrinter() {
  const group = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({
    color: "#e1e6e5",
    roughness: 0.42,
    clearcoat: 0.22,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#28333e",
    roughness: 0.6,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: "#8a9a9f",
    metalness: 0.65,
    roughness: 0.3,
  });
  const paper = new THREE.MeshStandardMaterial({
    color: "#f8f5eb",
    roughness: 1,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.018, h / 3)),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  box(0.68, 0.66, 0.62, dark, 0, 0.4);
  box(0.72, 0.23, 0.67, shell, 0, 0.84);
  box(0.64, 0.045, 0.56, shell, 0, 0.98, -0.04);
  // Scanner glass with a quiet tint, beneath the raised document feeder.
  box(
    0.5,
    0.008,
    0.35,
    new THREE.MeshPhysicalMaterial({
      color: "#87b9be",
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.15,
      depthWrite: false,
    }),
    0,
    1.008,
    -0.06,
  );
  box(0.57, 0.06, 0.35, shell, 0, 1.06, -0.15);
  box(0.4, 0.012, 0.29, paper, 0, 1.1, -0.14);
  box(0.51, 0.065, 0.025, dark, -0.02, 0.74, 0.345);
  box(0.44, 0.009, 0.2, paper, -0.02, 0.732, 0.4);
  box(0.55, 0.015, 0.06, metal, 0, 0.3, 0.322);
  box(0.55, 0.015, 0.06, metal, 0, 0.5, 0.322);
  const screen = box(0.15, 0.095, 0.02, dark, 0.21, 0.89, 0.35);
  screen.rotation.x = -0.18;
  box(
    0.12,
    0.058,
    0.006,
    new THREE.MeshStandardMaterial({
      color: "#75d5c3",
      emissive: "#24977d",
      emissiveIntensity: 0.35,
    }),
    0.21,
    0.89,
    0.365,
  );
  for (const x of [-0.25, 0.25])
    for (const z of [-0.22, 0.22]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12),
        dark,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.055, z);
      group.add(wheel);
    }
  return group;
}
