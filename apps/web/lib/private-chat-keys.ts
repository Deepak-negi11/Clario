import {
  createDmKeyPair, decryptDm, deriveDmKey, dmSafetyCode, encryptDm, type DmCiphertext, type DmKeyPair,
} from "@repo/shared";

// The keys for this visit's private chats (dm-crypto.ts in @repo/shared). Kept in memory only, like
// the messages: a reload forgets them, and with them the open chats. Every conversation gets new key
// pairs, so asking again after a chat closed starts from fresh keys.

type Session = { key: CryptoKey; safetyCode: string; sent: number; received: number };

export type SealedDm = DmCiphertext & { seq: number };

// WebCrypto only exists on https pages and localhost.
export const privateChatSupported = () => typeof crypto !== "undefined" && !!crypto.subtle;

export function createPrivateChatKeys() {
  // My key pair for each request I sent that hasn't been answered, by the person I asked.
  const asked = new Map<string, Promise<DmKeyPair>>();
  // The public key from each request someone sent me, by who sent it.
  const offered = new Map<string, string>();
  // Each open chat's key, by the other person. A promise, so messages wait until it's ready.
  const sessions = new Map<string, Promise<Session | null>>();
  // Sending to and receiving from one person run one at a time, in order.
  const queues = new Map<string, Promise<unknown>>();

  function inOrder<T>(peerId: string, task: () => Promise<T>) {
    const run = (queues.get(peerId) ?? Promise.resolve()).then(task);
    queues.set(peerId, run.catch(() => undefined));
    return run;
  }

  async function open(mine: DmKeyPair, myId: string, peerId: string, theirPublicKey: string): Promise<Session | null> {
    try {
      const key = await deriveDmKey(mine, myId, theirPublicKey, peerId);
      return { key, safetyCode: await dmSafetyCode(mine.publicKey, theirPublicKey), sent: 0, received: -1 };
    } catch {
      return null; // not a valid public key
    }
  }

  return {
    // The public key to send with a request. Asking again before an answer sends the same one.
    async requestKey(peerId: string) {
      let mine = asked.get(peerId);
      if (!mine) {
        mine = createDmKeyPair();
        asked.set(peerId, mine);
        mine.catch(() => asked.delete(peerId));
      }
      return (await mine).publicKey;
    },

    // Someone asked to chat. If a chat with them was open, it ends: they come with new keys.
    offered(peerId: string, publicKey: string) {
      offered.set(peerId, publicKey);
      sessions.delete(peerId);
    },

    declined(peerId: string) {
      offered.delete(peerId);
    },

    // Say yes to their request with a new key pair. `answer` sends my public key; it runs before
    // anything is encrypted with the new key, so the yes reaches the server before any message.
    async accept(peerId: string, myId: string, answer: (publicKey: string) => void) {
      const theirs = offered.get(peerId);
      offered.delete(peerId);
      asked.delete(peerId);
      if (!theirs) return null;
      const session = createDmKeyPair()
        .then(async (mine) => {
          const opened = await open(mine, myId, peerId, theirs);
          if (opened) answer(mine.publicKey);
          return opened;
        })
        .catch(() => null);
      sessions.set(peerId, session);
      return (await session)?.safetyCode ?? null;
    },

    // They said yes to my request. Null when I no longer have the key pair I asked with.
    async accepted(peerId: string, myId: string, theirPublicKey: string) {
      const mine = asked.get(peerId);
      asked.delete(peerId);
      if (!mine) {
        sessions.delete(peerId);
        return null;
      }
      const session = mine.then((pair) => open(pair, myId, peerId, theirPublicKey)).catch(() => null);
      sessions.set(peerId, session);
      return (await session)?.safetyCode ?? null;
    },

    // Null when the chat is no longer open (or its key changed meanwhile).
    encrypt(peerId: string, myId: string, text: string) {
      const session = sessions.get(peerId);
      return inOrder(peerId, async (): Promise<SealedDm | null> => {
        const ready = await session;
        if (!ready || sessions.get(peerId) !== session) return null;
        const seq = ready.sent;
        ready.sent += 1;
        return { seq, ...(await encryptDm(ready.key, text, { fromUserId: myId, toUserId: peerId, seq })) };
      });
    },

    // Null when it can't be read: no open chat, another key, a changed byte, or a repeat.
    decrypt(peerId: string, myId: string, message: SealedDm) {
      const session = sessions.get(peerId);
      return inOrder(peerId, async () => {
        const ready = await session;
        if (!ready || message.seq <= ready.received) return null;
        const text = await decryptDm(ready.key, message, { fromUserId: peerId, toUserId: myId, seq: message.seq });
        if (text !== null) ready.received = message.seq;
        return text;
      });
    },

    // They left, or said no to my request: drop everything I had for them.
    forget(peerId: string) {
      asked.delete(peerId);
      offered.delete(peerId);
      sessions.delete(peerId);
    },

    forgetAll() {
      asked.clear();
      offered.clear();
      sessions.clear();
    },
  };
}

export type PrivateChatKeys = ReturnType<typeof createPrivateChatKeys>;
