import { describe, expect, test } from "bun:test";
import { PHOTO_AI_HAIR, PhotoAiRequestSchema, lookForAiHair, readPhotoAi } from "./photo-ai";

describe("readPhotoAi", () => {
  test("reads a plain or fenced JSON answer", () => {
    expect(readPhotoAi('{"face": true, "hair": "long", "glasses": true, "beard": false}')).toEqual({ hair: "long", glasses: true, beard: false });
    expect(readPhotoAi('```json\n{"face": true, "hair": "shaved", "beard": true}\n```')).toEqual({ hair: "shaved", glasses: false, beard: true });
    expect(readPhotoAi('Sure! {"face": true, "hair": "curly", "glasses": false, "beard": false}')).toEqual({ hair: "curly", glasses: false, beard: false });
  });

  test("no face, an unknown hairstyle or broken JSON gives nothing", () => {
    expect(readPhotoAi('{"face": false}')).toBeNull();
    expect(readPhotoAi('{"face": true}')).toBeNull();
    expect(readPhotoAi('{"face": true, "hair": "mohawk"}')).toBeNull();
    expect(readPhotoAi('{"face": true, "hair": "long", "glasses": "yes"}')).toBeNull();
    expect(readPhotoAi("{not json")).toBeNull();
    expect(readPhotoAi("")).toBeNull();
  });
});

describe("lookForAiHair", () => {
  test("every hairstyle the model can pick maps onto an avatar style", () => {
    for (const hair of PHOTO_AI_HAIR) expect(lookForAiHair(hair).style).toBeString();
    expect(lookForAiHair("shaved")).toEqual({ style: "bob", hairShape: "bald" });
    expect(lookForAiHair("bun")).toEqual({ style: "amelia", hairShape: "bun" });
    expect(lookForAiHair("side-part")).toEqual({ style: "alex", hairShape: null });
  });
});

describe("PhotoAiRequestSchema", () => {
  test("takes a JPEG data URL only, and not a huge one", () => {
    expect(PhotoAiRequestSchema.safeParse({ image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" }).success).toBe(true);
    expect(PhotoAiRequestSchema.safeParse({ image: "data:image/png;base64,iVBORw0KGgo=" }).success).toBe(false);
    expect(PhotoAiRequestSchema.safeParse({ image: "https://example.com/me.jpg" }).success).toBe(false);
    expect(PhotoAiRequestSchema.safeParse({ image: `data:image/jpeg;base64,${"A".repeat(200_001)}` }).success).toBe(false);
  });
});
