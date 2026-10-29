// End-to-end encryption for private chats, with the WebCrypto API only (browsers and Bun).
// Each person makes a fresh ECDH P-256 key pair per conversation and keeps it in memory. The one
// who asks sends their public key with the request, the other sends theirs with the accept, and
// both derive the same AES-GCM key. The server passes along public keys and ciphertext only.
//
// P-256 rather than X25519: every browser and Bun support it in WebCrypto, so both sides always
// agree on the curve without having to negotiate one.

import { DM_TEXT_MAX_CHARS } from "./dm.schema";

const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;
const VERSION = "clario-dm-v1";

export type DmKeyPair = { privateKey: CryptoKey; publicKey: string };

// Who sent a message to whom, and its number in the conversation. Bound to the ciphertext, so the
// server can't send a message back to the person who wrote it, or deliver it twice.
export type DmContext = { fromUserId: string; toUserId: string; seq: number };

export type DmCiphertext = { iv: string; ciphertext: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The private key can't be exported; the public key is sent as base64 of its raw 65 bytes.
export async function createDmKeyPair(): Promise<DmKeyPair> {
  const pair = await crypto.subtle.generateKey(CURVE, false, ["deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: toBase64(new Uint8Array(raw)) };
}

// Both people get the same key: ECDH, then HKDF over the shared secret with both user ids and
// both public keys, so the key belongs to exactly this exchange between these two people.
export async function deriveDmKey(mine: DmKeyPair, myUserId: string, theirPublicKey: string, theirUserId: string) {
  const theirKey = await crypto.subtle.importKey("raw", fromBase64(theirPublicKey), CURVE, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: theirKey }, mine.privateKey, 256);
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const sides = [`${myUserId}:${mine.publicKey}`, `${theirUserId}:${theirPublicKey}`].sort();
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: encoder.encode([VERSION, ...sides].join("|")) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function additionalData({ fromUserId, toUserId, seq }: DmContext) {
  return encoder.encode(`${VERSION}|${fromUserId}>${toUserId}|${seq}`);
}

// A fresh random 12-byte IV for every message.
export async function encryptDm(key: CryptoKey, text: string, context: DmContext): Promise<DmCiphertext> {
  if (text.length > DM_TEXT_MAX_CHARS) throw new Error("Message too long");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(context) },
    key,
    encoder.encode(text),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(sealed)) };
}

// Null when it can't be read: another key, a changed byte, or the wrong sender, receiver or number.
export async function decryptDm(key: CryptoKey, message: DmCiphertext, context: DmContext): Promise<string | null> {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(message.iv), additionalData: additionalData(context) },
      key,
      fromBase64(message.ciphertext),
    );
    return decoder.decode(opened);
  } catch {
    return null;
  }
}

// A short code both people see when nobody swapped their keys on the way. They can compare it in
// person or on a call; a server in the middle would give each of them a different code.
export async function dmSafetyCode(publicKeyA: string, publicKeyB: string) {
  const keys = [publicKeyA, publicKeyB].sort();
  const digest = new DataView(await crypto.subtle.digest("SHA-256", encoder.encode(`${VERSION}-safety|${keys.join("|")}`)));
  const groups: string[] = [];
  for (let i = 0; i < 4; i += 1) groups.push(String(digest.getUint32(i * 4) % 10_000).padStart(4, "0"));
  return groups.join(" ");
}
