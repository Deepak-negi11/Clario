import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makePlant } from "./plants";

// Three open shelves, varied book spines, stacked books, a plant and a linen box,
// matching the walnut and silver bookcases generated for the 2D map.
export function makeBookcase(metal: boolean) {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: metal ? "#b9bfc2" : "#815a3d", roughness: metal ? 0.38 : 0.64, metalness: metal ? 0.55 : 0 });
  const back = new THREE.MeshStandardMaterial({ color: metal ? "#6f7477" : "#503924", roughness: 0.85 });
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    parts.push(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.012, w / 4, h / 4, d / 4)).translate(x, y, z));
  };
  for (const x of [-0.87, 0.87]) add(0.07, 1.96, 0.48, x, 1.02, -0.12);
  for (const y of [0.12, 0.74, 1.36, 1.98]) add(1.8, 0.065, 0.48, 0, y, -0.12);
  for (const x of [-0.78, 0.78]) add(0.075, 0.095, 0.3, x, 0.05, -0.12);
  const casing = new THREE.Mesh(mergeGeometries(parts), frame); casing.castShadow = casing.receiveShadow = true; group.add(casing);
  parts.forEach((part) => part.dispose());
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.69, 1.84, 0.035), back); rear.position.set(0, 1.04, -0.35); rear.receiveShadow = true; group.add(rear);
  const books: THREE.BufferGeometry[] = [];
  const colors = ["#354253", "#6c785f", "#9f6246", "#e0d5bd", "#b89145", "#474f5d"];
  const book = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
    const geometry = new RoundedBoxGeometry(w, h, d, 1, 0.006).translate(x, y, z);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) values.set(rgb.toArray(), i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3)); books.push(geometry);
  };
  for (let row = 0; row < 3; row++) {
    const floor = 0.155 + row * 0.62, count = row === 0 ? 5 : row === 2 ? 7 : 11;
    for (let i = 0; i < count; i++) {
      const height = 0.38 + ((i * 7 + row * 3) % 5) * 0.025;
      const x = row === 0 ? -0.15 + i * 0.135 : -0.71 + i * 0.135;
      book(0.105 + (i % 2) * 0.015, height, 0.31, x, floor + height / 2, -0.04, colors[(i + row) % colors.length]!);
    }
    if (row === 2) for (let i = 0; i < 3; i++) book(0.46, 0.07, 0.32, 0.49, floor + 0.035 + i * 0.075, -0.04, colors[i]!);
  }
  const spines = new THREE.Mesh(mergeGeometries(books), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
  spines.castShadow = spines.receiveShadow = true; group.add(spines); books.forEach((geometry) => geometry.dispose());
  const plant = makePlant("leafy", 0.45, 0.42, 17); plant.position.set(-0.56, 0.155, -0.04); group.add(plant);
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.28, 0.31, 2, 0.015), new THREE.MeshStandardMaterial({ color: "#d6cbb7", roughness: 0.95 }));
  box.position.set(0.65, 0.295, -0.04); box.castShadow = box.receiveShadow = true; group.add(box);
  return group;
}
