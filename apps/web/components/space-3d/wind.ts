import * as THREE from "three";

// Wind for the 3D office's trees and grass, and how dark it is outside. The values are shared by
// every material that sways, so world.ts moves the whole garden by setting them once a frame.
export const weather = {
  // Seconds of wind (it keeps blowing while the time of day changes).
  time: { value: 0 },
  // How hard it blows, about 1 on a breezy day.
  strength: { value: 1 },
  // 0 by day to 1 at night, for darkening what is outside to moonlight (NIGHT_GLSL).
  night: { value: 0 },
};

// Sways a material's vertices in the wind, more the higher they are above its object's origin
// (the foot of a tree or a tuft of grass), so trunks bend and crowns sway. `flutter` adds a quick
// shiver to each vertex, for leaves; `rooted` says the geometry has a windRoot attribute; and
// `darkAtNight` dims it outdoors after dark. The shadow it casts sways with it (shadowOf).
type Sway = { bend: number; flutter?: number; rooted?: boolean; darkAtNight?: number };
export function sway<T extends THREE.Material>(material: T, { bend, flutter = 0, rooted = false, darkAtNight = 0 }: Sway) {
  if (rooted) material.defines = { ...material.defines, WIND_ROOT: "" };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = weather.time;
    shader.uniforms.uWindStrength = weather.strength;
    shader.uniforms.uNight = weather.night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_GLSL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed = windMove(transformed, ${glslFloat(bend)}, ${glslFloat(flutter)});`);
    if (darkAtNight > 0) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uNight;\n${NIGHT_GLSL}`)
        .replace("#include <opaque_fragment>", `outgoingLight = moonlit(outgoingLight, ${glslFloat(darkAtNight)} * uNight);\n#include <opaque_fragment>`);
    }
  };
  // Materials that sway differently must not share one compiled program.
  material.customProgramCacheKey = () => `sway:${bend}:${flutter}:${rooted}:${darkAtNight}`;
  return material;
}

// The depth material a swaying mesh's shadow is drawn with, so the shadow moves with it. `cutout`
// is the texture whose alpha cuts out the shape (for leaf cards).
export function shadowOf({ bend, flutter = 0, rooted = false }: Sway, cutout?: THREE.Texture) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: cutout ?? null, alphaTest: cutout ? 0.5 : 0 });
  if (rooted) material.defines = { WIND_ROOT: "" };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = weather.time;
    shader.uniforms.uWindStrength = weather.strength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_GLSL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed = windMove(transformed, ${glslFloat(bend)}, ${glslFloat(flutter)});`);
  };
  material.customProgramCacheKey = () => `sway-depth:${bend}:${flutter}:${rooted}:${cutout ? 1 : 0}`;
  return material;
}

// Outdoors at night: dim, and bluer, as by moonlight. `night` is 0 by day to 1.
export const NIGHT_GLSL = /* glsl */ `
vec3 moonlit(vec3 light, float night) {
  return light * mix(vec3(1.0), vec3(0.2, 0.25, 0.38), night);
}
`;

const glslFloat = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

// The sway: a slow lean that comes and goes in gusts, out of step from plant to plant, growing with
// the square of the height, and a fast shiver along the normal. A plant sways as one from its root:
// an instance's origin, the `windRoot` attribute (x, z) of a mesh holding many (WIND_ROOT), or else
// the object's origin.
const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform float uWindStrength;
#ifdef WIND_ROOT
  attribute vec2 windRoot;
#endif
vec3 windMove(vec3 local, float bend, float flutter) {
  vec4 at = vec4(local, 1.0);
  #ifdef USE_INSTANCING
    at = instanceMatrix * at;
    vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #elif defined(WIND_ROOT)
    vec3 root = (modelMatrix * vec4(windRoot.x, 0.0, windRoot.y, 1.0)).xyz;
  #else
    vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  vec3 world = (modelMatrix * at).xyz;
  float height = max(local.y, 0.0);
  float phase = dot(root.xz, vec2(0.37, 0.21));
  float gust = 0.55 + 0.45 * sin(uWindTime * 0.31 + root.x * 0.045 + root.z * 0.03);
  float lean = sin(uWindTime * 1.25 + phase) * 0.7 + sin(uWindTime * 2.3 + phase * 1.7) * 0.3;
  vec2 way = normalize(vec2(1.0, 0.45));
  local.xz += way * (lean + 0.6) * gust * bend * height * height * uWindStrength;
  local += normal * sin(uWindTime * 7.0 + dot(world, vec3(3.1, 2.3, 4.7))) * flutter * uWindStrength;
  return local;
}
`;
