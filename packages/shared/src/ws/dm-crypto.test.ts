import { describe, expect, test } from "bun:test";
import {
  createDmKeyPair, decryptDm, deriveDmKey, dmSafetyCode, encryptDm, fromBase64, toBase64, type DmCiphertext,
} from "./dm-crypto";
import { DM_TEXT_MAX_CHARS } from "./dm.schema";
import { ClientMessage, ServerMessage } from "./ws.schema";

// Asha asks Ben to chat; each derives the key from their own private key and the other's public one.
async function pair() {
  const asha = await createDmKeyPair();
  const ben = await createDmKeyPair();
  const ashaKey = await deriveDmKey(asha, "asha", ben.publicKey, "ben");
  const benKey = await deriveDmKey(ben, "ben", asha.publicKey, "asha");
  return { asha, ben, ashaKey, benKey };
}

const toBen = { fromUserId: "asha", toUserId: "ben", seq: 0 };

function flipByte(base64: string, index: number) {
  const bytes = fromBase64(base64);
  bytes[index] = bytes[index]! ^ 0x01;
  return toBase64(bytes);
}

describe("private chat encryption", () => {
  test("a message round-trips between the two people, Unicode included", async () => {
    const { ashaKey, benKey } = await pair();
    const text = "Can we move standup to 10? 🙏 नमस्ते";
    const sealed = await encryptDm(ashaKey, text, toBen);
    expect(sealed.ciphertext).not.toContain("standup");
    expect(await decryptDm(benKey, sealed, toBen)).toBe(text);
    // And back the other way with the same key.
    const reply = { fromUserId: "ben", toUserId: "asha", seq: 0 };
    expect(await decryptDm(ashaKey, await encryptDm(benKey, "Sure", reply), reply)).toBe("Sure");
  });

  test("every message gets a fresh IV, so the same text never looks the same", async () => {
    const { ashaKey } = await pair();
    const first = await encryptDm(ashaKey, "ok", toBen);
    const second = await encryptDm(ashaKey, "ok", toBen);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test("someone with another key can't read it", async () => {
    const { ashaKey, ben } = await pair();
    const sealed = await encryptDm(ashaKey, "salary is 12 LPA", toBen);
    // Chen sits in the middle with her own key pair and Ben's public key.
    const chen = await createDmKeyPair();
    const chenKey = await deriveDmKey(chen, "chen", ben.publicKey, "ben");
    expect(await decryptDm(chenKey, sealed, toBen)).toBeNull();
  });

  test("a changed byte in the ciphertext, the tag or the IV is refused", async () => {
    const { ashaKey, benKey } = await pair();
    const sealed = await encryptDm(ashaKey, "meet at 3", toBen);
    const length = fromBase64(sealed.ciphertext).length;
    const tampered: DmCiphertext[] = [
      { ...sealed, ciphertext: flipByte(sealed.ciphertext, 0) },
      { ...sealed, ciphertext: flipByte(sealed.ciphertext, length - 1) },
      { ...sealed, iv: flipByte(sealed.iv, 0) },
    ];
    for (const message of tampered) expect(await decryptDm(benKey, message, toBen)).toBeNull();
  });

  test("a message can't be passed off as from someone else, sent back, or replayed as a later one", async () => {
    const { ashaKey, benKey } = await pair();
    const sealed = await encryptDm(ashaKey, "yes, approved", toBen);
    expect(await decryptDm(benKey, sealed, { ...toBen, fromUserId: "chen" })).toBeNull();
    expect(await decryptDm(ashaKey, sealed, { fromUserId: "ben", toUserId: "asha", seq: 0 })).toBeNull();
    expect(await decryptDm(benKey, sealed, { ...toBen, seq: 1 })).toBeNull();
  });

  test("junk that isn't base64 is refused instead of throwing", async () => {
    const { benKey } = await pair();
    expect(await decryptDm(benKey, { iv: "%%%", ciphertext: "not base64!" }, toBen)).toBeNull();
  });

  test("messages longer than the limit aren't encrypted", async () => {
    const { ashaKey } = await pair();
    await expect(encryptDm(ashaKey, "x".repeat(DM_TEXT_MAX_CHARS + 1), toBen)).rejects.toThrow();
  });

  test("both people see the same safety code; a swapped key changes it", async () => {
    const { asha, ben } = await pair();
    const code = await dmSafetyCode(asha.publicKey, ben.publicKey);
    expect(code).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    expect(await dmSafetyCode(ben.publicKey, asha.publicKey)).toBe(code);
    const mallory = await createDmKeyPair();
    expect(await dmSafetyCode(asha.publicKey, mallory.publicKey)).not.toBe(code);
  });
});

describe("private chat messages", () => {
  test("requests, answers and messages carry keys and ciphertext, and fit the schema", async () => {
    const { asha, ashaKey } = await pair();
    const sealed = await encryptDm(ashaKey, "न".repeat(DM_TEXT_MAX_CHARS), toBen);
    for (const message of [
      { type: "dm-request", payload: { targetUserId: "ben", publicKey: asha.publicKey } },
      { type: "dm-response", payload: { targetUserId: "asha", accept: true, publicKey: asha.publicKey } },
      { type: "dm-response", payload: { targetUserId: "asha", accept: false } },
      { type: "dm", payload: { targetUserId: "ben", seq: 0, ...sealed } },
    ]) {
      expect(ClientMessage.safeParse(message).success).toBe(true);
    }
    const relayed = { type: "dm", payload: { fromUserId: "asha", seq: 0, ...sealed, at: 1 } };
    expect(ServerMessage.safeParse(relayed).success).toBe(true);
  });

  test("a yes needs a public key, and a request needs a real one", () => {
    expect(ClientMessage.safeParse({ type: "dm-response", payload: { targetUserId: "asha", accept: true } }).success).toBe(false);
    expect(ClientMessage.safeParse({ type: "dm-request", payload: { targetUserId: "ben" } }).success).toBe(false);
    expect(ClientMessage.safeParse({ type: "dm-request", payload: { targetUserId: "ben", publicKey: "abc=" } }).success).toBe(false);
  });

  test("plain text is not a message, and any text sent along is dropped", () => {
    expect(ClientMessage.safeParse({ type: "dm", payload: { targetUserId: "ben", text: "hi" } }).success).toBe(false);
    const parsed = ClientMessage.parse({
      type: "dm",
      payload: { targetUserId: "ben", seq: 0, iv: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(24), text: "hi" },
    });
    expect(JSON.stringify(parsed)).not.toContain("hi");
  });
});
