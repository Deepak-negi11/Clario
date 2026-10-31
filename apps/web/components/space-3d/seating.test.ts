import { expect, test } from "bun:test";
import * as THREE from "three";
import { batchStaticSeating } from "./seating";

test("instancing retains each static chair's position and facing relative to its office", () => {
  const root = new THREE.Group(); root.position.set(2, 0, 4);
  const geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5), material = new THREE.MeshStandardMaterial();
  const originals: THREE.Matrix4[] = [];
  for (let i = 0; i < 3; i++) {
    const seat = new THREE.Group(); seat.userData.seating = "theatre-seat";
    seat.position.set(i * 2, 0, 3); seat.rotation.y = i * Math.PI / 2;
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(0, 0.4, -0.1); seat.add(mesh); root.add(seat);
  }
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  root.traverse((child) => { if ((child as THREE.Mesh).isMesh) originals.push(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)); });
  batchStaticSeating(root);
  const batch = root.children.find((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
  expect(batch.count).toBe(3); expect(batch.geometry).toBe(geometry);
  for (let i = 0; i < 3; i++) {
    const matrix = new THREE.Matrix4(); batch.getMatrixAt(i, matrix);
    matrix.elements.forEach((value, j) => expect(value).toBeCloseTo(originals[i]!.elements[j]!, 5));
  }
  geometry.dispose(); material.dispose(); batch.dispose();
});

test("task chairs keep their meshes so their holder can swivel independently", () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 3; i++) {
    const chair = new THREE.Group(); chair.userData.seating = "task-chair";
    chair.add(new THREE.Mesh(geometry, material)); root.add(chair);
  }
  batchStaticSeating(root);
  expect(root.children.every((chair) => chair.children[0] instanceof THREE.Mesh)).toBe(true);
  expect(root.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(false);
  geometry.dispose(); material.dispose();
});
