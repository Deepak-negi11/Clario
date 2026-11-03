import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  agentCompanionTexturePath,
  type AgentIdentity,
} from "../../lib/agents/identity";
import { makeClaude3d } from "./claude-3d";
import { makeCursor3d } from "./cursor-3d";

export function makeAgent3d(kind: AgentIdentity, phase = 0) {
  if (kind === "claude-code") {
    const clawd = makeClaude3d(phase);
    clawd.userData.agentKind = kind;
    return clawd;
  }
  if (kind === "cursor-agent") return makeCursor3d();
  const group = new THREE.Group();
  group.userData.agentKind = kind;
  if (kind === "codex") {
    const texture = new THREE.TextureLoader().load(
      agentCompanionTexturePath(kind),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.9),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.04,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    icon.position.set(0, 0.73, 0.058);
    group.add(icon);
    return group;
  }
  const dark = new THREE.MeshStandardMaterial({
    color: "#26383a",
    roughness: 0.48,
    metalness: 0.12,
  });
  const light = new THREE.MeshStandardMaterial({
    color: "#f0f3ed",
    roughness: 0.35,
  });
  const shape = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    x: number,
    y: number,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  shape(new RoundedBoxGeometry(0.72, 0.51, 0.14, 4, 0.09), dark, 0, 0.73);
  const stroke = (ax: number, ay: number, bx: number, by: number) => {
    const start = new THREE.Vector3(ax, ay, 0.079),
      end = new THREE.Vector3(bx, by, 0.079);
    const bar = shape(
      new THREE.CylinderGeometry(0.018, 0.018, start.distanceTo(end), 10),
      light,
      0,
      0,
    );
    bar.position.copy(start).add(end).multiplyScalar(0.5);
    bar.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
  };
  stroke(-0.21, 0.83, -0.1, 0.73);
  stroke(-0.1, 0.73, -0.21, 0.63);
  stroke(0.01, 0.63, 0.19, 0.63);
  const led = shape(
    new THREE.SphereGeometry(0.02, 10, 8),
    new THREE.MeshStandardMaterial({
      color: "#a4dcba",
      emissive: "#53a982",
      emissiveIntensity: 0.35,
    }),
    0.24,
    0.88,
    0.078,
  );
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  led.onBeforeRender = () => {
    led.scale.setScalar(
      reduce.matches
        ? 1
        : 0.85 + 0.15 * Math.sin(performance.now() / 800 + phase),
    );
  };
  return group;
}
