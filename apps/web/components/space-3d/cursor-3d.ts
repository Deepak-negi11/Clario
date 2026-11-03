import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { CURSOR_MARK_SVG } from "../../lib/agents/cursor-mark";

/** Extruded official facets keep the arrow silhouette recognizable as the camera moves. */
export function makeCursor3d() {
  const mark = new THREE.Group();
  const data = new SVGLoader().parse(CURSOR_MARK_SVG);
  for (const [layer, path] of data.paths.entries()) {
    const face = new THREE.MeshBasicMaterial({
      color: path.color,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const edge = new THREE.MeshStandardMaterial({
      color: path.color,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    for (const shape of path.toShapes()) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 36,
        bevelEnabled: true,
        bevelSize: 0.7,
        bevelThickness: 0.7,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 4,
      });
      const facet = new THREE.Mesh(geometry, [face, edge]);
      facet.position.z = layer * 0.9;
      facet.castShadow = true;
      mark.add(facet);
    }
  }
  // SVG's y points down; the emblem stands upright in world space, with visible edge depth.
  mark.scale.set(0.00165, -0.00165, 0.00165);
  mark.position.set((-466.73 * 0.00165) / 2, 0.73 + (533.32 * 0.00165) / 2, 0);
  const group = new THREE.Group();
  group.userData.agentKind = "cursor-agent";
  group.add(mark);
  return group;
}
