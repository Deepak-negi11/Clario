import * as THREE from "three";
import { NIGHT_GLSL, sway, weather } from "./wind";

// The world round the 3D office, lit for the time of day where you are: a sky with the sun (or the
// moon and stars) and slow clouds whose shadows slide over the lawn, grass and trees moving in the
// wind (wind.ts), and a few birds wheeling overhead. Built in code and cheap to draw: the sky, the
// grass and the birds are a draw call each.

// Where the sun is worked out for (degrees north): about Dehradun's.
const LATITUDE = 30;
// Late morning: the sun is 35° to 75° up all year (full day from 20°), so it's always bright.
const DAYLIGHT_HOUR = 11;
const SKY_RADIUS = 300; // inside the camera's far plane (office-3d.tsx)
const BIRDS = 9;
// About this many tufts of grass are scattered round the lawn, thickest near the map's edge, where
// the camera mostly looks.
const TUFTS = 9000;

// The look of the sky and its light at a sun height (degrees): night, dusk, sunrise or sunset,
// golden hour and full day, blended between. `inside` is the office's own lighting (the
// hemisphere light), warm lamps after dark.
type Look = {
  at: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunPower: number;
  inside: string;
  insideGround: string;
  insidePower: number;
  reflections: number;
  cloud: string;
  cloudShade: string;
};
const LOOKS: Look[] = [
  { at: -18, zenith: "#060b18", horizon: "#132036", sun: "#8ea6dc", sunPower: 0.45, inside: "#ffd9a8", insideGround: "#3a3028", insidePower: 1.05, reflections: 0.14, cloud: "#1b2438", cloudShade: "#0e1422" },
  { at: -5, zenith: "#1a2a52", horizon: "#c57a78", sun: "#ff9f6a", sunPower: 0.5, inside: "#ffd9a8", insideGround: "#4a3a2e", insidePower: 0.95, reflections: 0.18, cloud: "#a2708a", cloudShade: "#3a3150" },
  { at: 3, zenith: "#476aa6", horizon: "#f3a466", sun: "#ffb070", sunPower: 1.5, inside: "#ffe9cf", insideGround: "#7a6650", insidePower: 0.7, reflections: 0.22, cloud: "#ffd2a8", cloudShade: "#9a8094" },
  { at: 7, zenith: "#4f86cc", horizon: "#f1d2a6", sun: "#ffd9a6", sunPower: 2.3, inside: "#ffffff", insideGround: "#8a7a62", insidePower: 0.58, reflections: 0.26, cloud: "#fff3e2", cloudShade: "#b9b8c4" },
  { at: 20, zenith: "#3c7ad2", horizon: "#b4d4f0", sun: "#fff1dc", sunPower: 2.7, inside: "#ffffff", insideGround: "#8a7a62", insidePower: 0.55, reflections: 0.28, cloud: "#ffffff", cloudShade: "#b8c4d6" },
];

export type World = {
  // After the office is built: dresses its lawn and paths (`userData.lawn` / `userData.outdoor` on
  // their meshes), scatters grass where `lawn(x, z)` says the ground is grass, and centres the sun's
  // shadows and the birds on the map (cols x rows tiles).
  furnish: (root: THREE.Object3D, cols: number, rows: number, lawn: (x: number, z: number) => boolean) => void;
  update: (dt: number, camera: THREE.Camera) => void;
  dispose: () => void;
};

export function makeWorld({ scene, sun, inside }: { scene: THREE.Scene; sun: THREE.DirectionalLight; inside: THREE.HemisphereLight }): World {
  const sky = makeSky();
  scene.add(sky.mesh);
  const birds = makeBirds();
  scene.add(birds.mesh);
  let grass: THREE.InstancedMesh | null = null;
  // Window glass (userData.glass), lit from inside after dark.
  let windows: THREE.MeshStandardMaterial[] = [];
  const dayGlass = new THREE.Color("#6fb5e0");
  const nightGlass = new THREE.Color("#ffc47a");
  const center = new THREE.Vector3();
  let span = 50;
  let wheel = 30;
  let time = 0;
  let lookAt = -Infinity;
  const toSun = new THREE.Vector3();
  const look = blendLook(35);
  const fogColor = new THREE.Color();

  // Light for this moment: where the sun (or, at night, the moon) is, and the colours of the sky,
  // the light and the fog. The map is always in daylight: the sun stands where it does at
  // DAYLIGHT_HOUR today, whatever the time.
  const relight = () => {
    const now = new Date();
    const { elevation, direction } = sunAt(new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAYLIGHT_HOUR));
    Object.assign(look, blendLook(elevation));
    const night = THREE.MathUtils.smoothstep(-elevation, -2, 8);
    weather.night.value = night;
    // The sun lights the map until it sets; then the moon, high over the other side.
    toSun.copy(direction);
    if (elevation < -2) toSun.set(-direction.x, Math.max(0.55, -direction.y), -direction.z).normalize();
    sun.position.copy(center).addScaledVector(toSun, 60);
    sun.target.position.copy(center);
    sun.color.set(look.sun);
    sun.intensity = look.sunPower;
    inside.color.set(look.inside);
    inside.groundColor.set(look.insideGround);
    inside.intensity = look.insidePower;
    scene.environmentIntensity = look.reflections;
    fogColor.set(look.horizon);
    if (scene.fog) scene.fog.color.copy(fogColor);
    if (scene.background instanceof THREE.Color) scene.background.copy(fogColor);
    const uniforms = sky.material.uniforms;
    uniforms.uSun!.value.copy(direction);
    uniforms.uMoon!.value.copy(toSun);
    uniforms.uSunColor!.value.set(look.sun);
    uniforms.uZenith!.value.set(look.zenith);
    uniforms.uHorizon!.value.set(look.horizon);
    uniforms.uCloud!.value.set(look.cloud);
    uniforms.uCloudShade!.value.set(look.cloudShade);
    uniforms.uNight!.value = night;
    // Cloud shadows only show in sunshine.
    cloudShade.value = 0.3 * THREE.MathUtils.smoothstep(elevation, 2, 18);
    birds.mesh.visible = night < 0.5;
    for (const glass of windows) {
      glass.emissive.copy(dayGlass).lerp(nightGlass, night);
      glass.emissiveIntensity = 0.25 + 0.9 * night;
    }
  };

  return {
    furnish(root, cols, rows, lawn) {
      center.set(cols / 2, 0, rows / 2);
      span = Math.max(cols, rows) / 2 + 12;
      wheel = Math.max(18, Math.min(cols, rows) * 0.45);
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 140 });
      sun.shadow.camera.updateProjectionMatrix();
      const glass = new Set<THREE.MeshStandardMaterial>();
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material.userData.glass) glass.add(material as THREE.MeshStandardMaterial);
        }
        if (!(mesh.userData.lawn || mesh.userData.outdoor)) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (mesh.userData.lawn) {
          const size = (mesh.geometry as THREE.PlaneGeometry).parameters;
          material.map = grassTexture(size.width / 2.5, size.height / 2.5);
          material.color.set("#ffffff");
        }
        outdoors(material);
      });
      windows = [...glass];
      if (grass) {
        scene.remove(grass);
        grass.geometry.dispose();
        (grass.material as THREE.Material).dispose();
        grass.dispose();
      }
      grass = makeGrass(cols, rows, lawn);
      scene.add(grass);
      lookAt = -Infinity;
    },
    update(dt, camera) {
      time += dt;
      weather.time.value = time;
      cloudDrift.value = time;
      // The light follows the clock; once a second is plenty.
      if (time - lookAt > 1) {
        lookAt = time;
        relight();
      }
      sky.mesh.position.copy(camera.position);
      sky.material.uniforms.uTime!.value = time;
      birds.fly(time, center, wheel);
    },
    dispose() {
      scene.remove(sky.mesh, birds.mesh);
      sky.mesh.geometry.dispose();
      sky.material.dispose();
      birds.mesh.geometry.dispose();
      (birds.mesh.material as THREE.Material).dispose();
      birds.mesh.dispose();
      if (grass) {
        scene.remove(grass);
        grass.geometry.dispose();
        (grass.material as THREE.Material).dispose();
        grass.dispose();
      }
    },
  };
}

// Where the sun is now, seen from LATITUDE: its height above the horizon (degrees) and the way to
// it in the map's space (x east, y up, z south). It rises in the east, is due south at noon and
// sets in the west, higher in summer than in winter.
export function sunAt(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = (date.getTime() - start.getTime()) / 86_400_000;
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const rad = THREE.MathUtils.degToRad;
  const declination = rad(23.44) * Math.sin((2 * Math.PI * (day - 81)) / 365);
  const hourAngle = rad((hours - 12) * 15);
  const latitude = rad(LATITUDE);
  const height = Math.asin(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle));
  // Clockwise from north.
  const bearing = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)) + Math.PI;
  const direction = new THREE.Vector3(Math.cos(height) * Math.sin(bearing), Math.sin(height), -Math.cos(height) * Math.cos(bearing));
  return { elevation: THREE.MathUtils.radToDeg(height), direction };
}

function blendLook(elevation: number): Look {
  const after = LOOKS.findIndex((look) => look.at >= elevation);
  if (after <= 0) return { ...LOOKS[after === 0 ? 0 : LOOKS.length - 1]! };
  const [a, b] = [LOOKS[after - 1]!, LOOKS[after]!];
  const t = THREE.MathUtils.smoothstep(elevation, a.at, b.at);
  const mixColor = (x: string, y: string) => `#${new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString()}`;
  return {
    at: elevation,
    zenith: mixColor(a.zenith, b.zenith),
    horizon: mixColor(a.horizon, b.horizon),
    sun: mixColor(a.sun, b.sun),
    sunPower: THREE.MathUtils.lerp(a.sunPower, b.sunPower, t),
    inside: mixColor(a.inside, b.inside),
    insideGround: mixColor(a.insideGround, b.insideGround),
    insidePower: THREE.MathUtils.lerp(a.insidePower, b.insidePower, t),
    reflections: THREE.MathUtils.lerp(a.reflections, b.reflections, t),
    cloud: mixColor(a.cloud, b.cloud),
    cloudShade: mixColor(a.cloudShade, b.cloudShade),
  };
}

// Value noise and a few octaves of it, for clouds and their shadows.
const NOISE_GLSL = /* glsl */ `
float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += weight * skyNoise(p);
    p = p * 2.03 + 17.0;
    weight *= 0.5;
  }
  return sum;
}
`;

// The sky: a dome round the camera, from the horizon's colour up to the zenith's, with a glow round
// the sun and its disc, the moon and stars at night, and clouds drifting across.
function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWay;
      void main() {
        vWay = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uMoon;
      uniform vec3 uSunColor;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uCloud;
      uniform vec3 uCloudShade;
      uniform float uNight;
      uniform float uTime;
      varying vec3 vWay;
      ${NOISE_GLSL}
      void main() {
        vec3 way = normalize(vWay);
        float up = way.y;
        // The camera never looks far above the horizon, so the blue deepens quickly from it.
        vec3 color = mix(uHorizon, uZenith, pow(clamp(up * 1.6, 0.0, 1.0), 0.55));
        // Below the horizon: the haze the far ground fades into.
        color = mix(uHorizon * 0.92, color, smoothstep(-0.12, 0.02, up));
        // The sun's glow and disc (set below the horizon), and the moon's at night.
        float sunward = max(dot(way, uSun), 0.0);
        color += uSunColor * (pow(sunward, 6.0) * 0.22 + pow(sunward, 90.0) * 0.5) * (1.0 - uNight * 0.85);
        color += uSunColor * smoothstep(0.99955, 0.9998, sunward) * 8.0 * smoothstep(-0.02, 0.02, uSun.y);
        float moonward = max(dot(way, uMoon), 0.0);
        color += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99965, 0.99985, moonward) * 2.5 + pow(moonward, 200.0) * 0.25) * uNight;
        // Stars: a scatter of points, fading toward the horizon.
        vec2 grid = way.xz / max(up, 0.08) * 70.0;
        float star = step(0.9975, skyHash(floor(grid))) * smoothstep(0.05, 0.35, up);
        color += vec3(star) * uNight * 0.9;
        // Clouds drifting overhead: big soft heaps, bright on top and on the sun's side, greyer
        // underneath. Seen low over the horizon they would crowd into a grey band, so the layer is
        // only gently curved there and thins out toward it.
        if (up > 0.0) {
          vec2 at = way.xz / (up + 0.5) * 1.1 + vec2(uTime * 0.006, uTime * 0.0025);
          float cover = skyFbm(at) + 0.12 * (skyNoise(at * 0.3 + 9.0) - 0.5);
          float cloud = smoothstep(0.46, 0.64, cover) * smoothstep(0.0, 0.2, up);
          float body = smoothstep(0.47, 0.8, skyFbm(at * 1.7 + 4.0));
          vec3 tint = mix(uCloudShade, uCloud, clamp(body * 0.7 + 0.35 * pow(sunward, 3.0) + 0.2, 0.0, 1.0));
          color = mix(color, tint, cloud * 0.95);
        }
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), material);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  // Clicks in the 3D view (walking, picking people) go through it.
  mesh.raycast = () => {};
  return { mesh, material };
}

// Shared by every outdoor ground material: how dark a cloud's shadow is, and how far they've drifted.
const cloudShade = { value: 0 };
const cloudDrift = { value: 0 };

// Cloud shadows sliding over a ground material, and the dark of night outside.
function outdoors(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudShade = cloudShade;
    shader.uniforms.uCloudDrift = cloudDrift;
    shader.uniforms.uNight = weather.night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vGround;\nuniform float uCloudShade;\nuniform float uCloudDrift;\nuniform float uNight;\n${NOISE_GLSL}\n${NIGHT_GLSL}`)
      .replace(
        "#include <opaque_fragment>",
        `float shade = smoothstep(0.5, 0.66, skyFbm(vGround * 0.028 + vec2(uCloudDrift * 0.018, uCloudDrift * 0.007)));
        outgoingLight = moonlit(outgoingLight * (1.0 - uCloudShade * shade), uNight);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "outdoor-ground";
  material.needsUpdate = true;
}

// A lawn's texture, repeated `across` x `down` times over it: short blades in mixed greens.
function grassTexture(across: number, down: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7fb763";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const greens = ["#6aa651", "#86c26a", "#77b55c", "#93c975", "#5f9a48", "#a2cf7f"];
  // Soft patches first, then blades over them, each drawn at its wrapped copies too so the tile
  // repeats without a seam.
  const wraps = [-256, 0, 256].flatMap((dx) => [-256, 0, 256].map((dy) => [dx, dy] as const));
  for (let i = 0; i < 40; i++) {
    const x = rand() * 256, y = rand() * 256, r = 18 + rand() * 36;
    ctx.fillStyle = `${greens[Math.floor(rand() * greens.length)]}40`;
    for (const [dx, dy] of wraps) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 256, y = rand() * 256, length = 3 + rand() * 6, angle = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    ctx.strokeStyle = greens[Math.floor(rand() * greens.length)]!;
    ctx.lineWidth = 0.8 + rand() * 0.9;
    for (const [dx, dy] of wraps) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx + Math.cos(angle) * length, y + dy + Math.sin(angle) * length);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(across, down);
  texture.anisotropy = 8;
  return texture;
}

// Tufts of grass over the lawn round the map: each a few blades fanning out, coloured darker at the
// root, swaying in the wind. One instanced mesh; they don't cast shadows but do take the trees'.
function makeGrass(cols: number, rows: number, lawn: (x: number, z: number) => boolean) {
  const blades = 7;
  const positions: number[] = [];
  const colors: number[] = [];
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + rand();
    const height = 0.12 + rand() * 0.12;
    const lean = 0.03 + rand() * 0.05;
    const [cx, cz] = [Math.cos(angle), Math.sin(angle)];
    const width = 0.022;
    positions.push(-cz * width, 0, cx * width, cz * width, 0, -cx * width, cx * lean, height, cz * lean);
    colors.push(0.78, 0.82, 0.72, 0.78, 0.82, 0.72, 1.05, 1.05, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // Lit like the lawn under them, from above, so they blend into it instead of flickering dark.
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(Array.from({ length: positions.length }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const material = sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), { bend: 1.1, darkAtNight: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, TUFTS);
  const place = new THREE.Object3D();
  const tint = new THREE.Color();
  const greens = ["#86c266", "#7cb85e", "#93c971", "#a0cf7a", "#74b058"];
  // Scattered round the map, most of them within a few tiles of its edge (and the building); the
  // fog hides the far ground anyway.
  let count = 0;
  for (let tries = 0; tries < TUFTS * 6 && count < TUFTS; tries++) {
    const out = 0.3 + Math.pow(rand(), 2.2) * 16;
    const side = rand();
    const along = rand();
    const [x, z] = side < 0.4 ? [-4 + along * (cols + 8), rows + out - 3.2]
      : side < 0.6 ? [-4 + along * (cols + 8), -out]
      : side < 0.8 ? [-out, -4 + along * (rows + 8)]
      : [cols + out, -4 + along * (rows + 8)];
    if (!lawn(x, z)) continue;
    place.position.set(x, 0, z);
    place.rotation.y = rand() * Math.PI * 2;
    place.scale.setScalar(0.7 + rand() * 0.7);
    place.updateMatrix();
    mesh.setMatrixAt(count, place.matrix);
    mesh.setColorAt(count, tint.set(greens[Math.floor(rand() * greens.length)]!));
    count++;
  }
  mesh.count = count;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // Clicks go through to the lawn under it (testing every tuft would be slow).
  mesh.raycast = () => {};
  return mesh;
}

// A small flock wheeling over the map, wings beating out of step: one instanced mesh whose wing tips
// the vertex shader flaps.
function makeBirds() {
  // A body and two wings, flat, nose toward +z; `wing` is how far out along a wing (0 at the body).
  const positions = [
    0, 0, 0.16, -0.035, 0, -0.08, 0.035, 0, -0.08,
    -0.03, 0, 0.05, -0.34, 0, -0.04, -0.03, 0, -0.06,
    0.03, 0, 0.05, 0.03, 0, -0.06, 0.34, 0, -0.04,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("wing", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 1], 1));
  geometry.computeVertexNormals();
  const phases = new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: BIRDS }, (_, i) => i * 1.7)), 1);
  geometry.setAttribute("phase", phases);
  const material = new THREE.MeshLambertMaterial({ color: "#4a4440", side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = weather.time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float wing;\nattribute float phase;\nuniform float uWindTime;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += wing * sin(uWindTime * 10.0 + phase) * 0.2;");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, BIRDS);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const place = new THREE.Object3D();
  const ahead = new THREE.Vector3();
  return {
    mesh,
    // Round a slowly wandering circle over `center`, `wheel` tiles out, each bird a little behind,
    // outside or above the one before, banking into the turn.
    fly(time: number, center: THREE.Vector3, wheel: number) {
      const turn = time * 0.16;
      for (let i = 0; i < BIRDS; i++) {
        const angle = turn - i * 0.045 - (i % 2) * 0.02;
        const radius = wheel + Math.sin(time * 0.05) * 6 + (i % 3) * 1.1;
        const height = 9 + Math.sin(time * 0.3 + i) * 0.6 + (i % 2) * 0.7;
        const x = center.x + Math.cos(angle) * radius + Math.sin(time * 0.02) * 8;
        const z = center.z + Math.sin(angle) * radius;
        place.position.set(x, height, z);
        ahead.set(-Math.sin(angle), 0, Math.cos(angle)).add(place.position);
        place.lookAt(ahead);
        place.rotateZ(-0.35);
        place.scale.setScalar(1.5);
        place.updateMatrix();
        mesh.setMatrixAt(i, place.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
