import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { FACE_POINTS, FACE_SIZE, affineFrom } from "@repo/shared";
import { lookFromDetection, type DetectedLook, type Landmark } from "./photo-analysis";
import { readPhotoLook, type PhotoLook } from "./photo-look";

// Reads a look from a photo with MediaPipe's face landmarker and hair segmenter, in the browser.
// The photo is never uploaded: the models come to the photo (about 8 MB, downloaded the first
// time someone picks a photo, then cached by the browser). If they can't load (offline, a
// blocked CDN), the older colour sampling in photo-look.ts is used instead.

// The engine's version must match the installed @mediapipe/tasks-vision.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAIR_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite";
// Big enough for the face's details, small enough to read in a moment on a phone.
const READ_SIZE = 512;

// The engine prints status lines ("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.")
// through console.error, so dev tools count them as errors. Those lines (and only those) are
// dropped while it loads and runs; the returned function puts console.error back.
function muteEngineInfo() {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original(...args);
  };
  return () => {
    console.error = original;
  };
}

function quietly<T>(run: () => T): T {
  const restore = muteEngineInfo();
  try {
    return run();
  } finally {
    restore();
  }
}

type Tasks = { face: FaceLandmarker; hair: ImageSegmenter };
let loading: Promise<Tasks> | null = null;
let loaded = false;

function loadTasks(): Promise<Tasks> {
  loading ??= (async () => {
    const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const restore = muteEngineInfo();
    const [face, hair] = await Promise.all([
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      }),
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAIR_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    ]).finally(restore);
    loaded = true;
    return { face, hair };
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export type PhotoReading =
  // `face`: the face cut from the photo (see cutFace), when asked for.
  | { method: "detected"; look: DetectedLook; face?: string }
  | { method: "colours"; look: PhotoLook }
  | { method: "none" };

/**
 * Reads a photo. `onStage` hears "loading" while the models download (first time only) and
 * "reading" while the photo is read.
 */
export async function readPhoto(
  file: Blob,
  onStage?: (stage: "loading" | "reading") => void,
  { cutFace: wantFace = false }: { cutFace?: boolean } = {},
): Promise<PhotoReading> {
  let tasks: Tasks;
  try {
    if (!loaded) onStage?.("loading");
    tasks = await loadTasks();
  } catch {
    onStage?.("reading");
    const look = await readPhotoLook(file);
    return look ? { method: "colours", look } : { method: "none" };
  }
  onStage?.("reading");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, READ_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return { method: "none" };
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const { width, height } = canvas;

  const landmarks = quietly(() => tasks.face.detect(canvas)).faceLandmarks[0];
  // The face is cut from the full photo, for detail; the landmarks are fractions of its size.
  const face = landmarks && wantFace ? cutFace(bitmap, landmarks) : undefined;
  bitmap.close();
  if (!landmarks) return { method: "none" };

  const segmented = quietly(() => tasks.hair.segment(canvas));
  const hair = new Uint8Array(width * height);
  try {
    const mask = segmented.categoryMask;
    if (mask) {
      // The model's classes are background and hair; ask for the index rather than assume it.
      const found = tasks.hair.getLabels().findIndex((label) => label.toLowerCase() === "hair");
      const hairIndex = found >= 0 ? found : 1;
      const values = mask.getAsUint8Array();
      // The mask can come back at another size; read it by position.
      for (let y = 0; y < height; y++) {
        const my = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
        for (let x = 0; x < width; x++) {
          const mx = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
          if (values[my * mask.width + mx] === hairIndex) hair[y * width + x] = 1;
        }
      }
    }
  } finally {
    segmented.close();
  }

  const look = lookFromDetection({ data: ctx.getImageData(0, 0, width, height).data, width, height, landmarks, hair });
  return look ? { method: "detected", look, ...(face ? { face } : {}) } : { method: "none" };
}

// The face, turned and scaled so the eyes and mouth land on FACE_POINTS, as a small JPEG data
// URL. The 3D people paint it onto their head (space-3d/people.ts).
function cutFace(photo: ImageBitmap, landmarks: Landmark[]) {
  const at = (index: number) => landmarks[index] ?? null;
  const middle = (...indices: number[]) => {
    const points = indices.map(at);
    if (points.some((point) => !point)) return null;
    return {
      x: (points.reduce((sum, point) => sum + point!.x, 0) / points.length) * photo.width,
      y: (points.reduce((sum, point) => sum + point!.y, 0) / points.length) * photo.height,
    };
  };
  // MediaPipe's face mesh: the eye corners (33, 133 and 362, 263) and the inner lips (13, 14).
  const imageLeftEye = middle(33, 133);
  const imageRightEye = middle(362, 263);
  const mouth = middle(13, 14);
  if (!imageLeftEye || !imageRightEye || !mouth) return undefined;
  const transform = affineFrom([imageLeftEye, imageRightEye, mouth], [FACE_POINTS.leftEye, FACE_POINTS.rightEye, FACE_POINTS.mouth]);
  if (!transform) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(...transform);
  ctx.drawImage(photo, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}
