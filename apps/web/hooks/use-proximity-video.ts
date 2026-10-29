"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureEvent } from "../lib/analytics";

type Signal =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "candidate"; candidate: RTCIceCandidateInit };

function isSignal(value: unknown): value is Signal {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const signal = value as Record<string, unknown>;
  if (signal.kind === "offer" || signal.kind === "answer") {
    return typeof signal.sdp === "string";
  }
  return signal.kind === "candidate" && !!signal.candidate && typeof signal.candidate === "object";
}

type Params = {
  selfId: string | null;
  nearbyIds: Set<string>;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  toggleMic: () => void | Promise<void>;
  toggleCam: () => void | Promise<void>;
  toggleScreen: () => void | Promise<void>;
  sendSignal: (targetUserId: string, signal: Signal) => void;
  registerSignalHandler: (fn: (fromUserId: string, signal: unknown) => void) => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Every connection carries three slots in this fixed order on both sides,
// so a slot's position always tells us what it carries.
const AUDIO = 0;
const CAMERA = 1;
const SCREEN = 2;

function localTrackFor(slot: number, camera: MediaStream | null, screen: MediaStream | null) {
  if (slot === AUDIO) return camera?.getAudioTracks()[0] ?? null;
  if (slot === CAMERA) return camera?.getVideoTracks()[0] ?? null;
  return screen?.getVideoTracks()[0] ?? null;
}

export function useProximityVideo({
  selfId,
  nearbyIds,
  localStream,
  screenStream,
  micOn,
  camOn,
  screenOn,
  toggleMic,
  toggleCam,
  toggleScreen,
  sendSignal,
  registerSignalHandler,
}: Params) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
  const [retryTick, setRetryTick] = useState(0);
  const localStreamRef = useRef(localStream);
  const screenStreamRef = useRef(screenStream);
  const selfIdRef = useRef(selfId);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamRefs = useRef<Map<string, MediaStream>>(new Map());
  const remoteScreenStreamRefs = useRef<Map<string, MediaStream>>(new Map());
  const connectedPeersRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const ignoredOfferRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<Set<string>>(new Set());
  const signalQueueRef = useRef<Map<string, Promise<void>>>(new Map());

  localStreamRef.current = localStream;
  screenStreamRef.current = screenStream;
  selfIdRef.current = selfId;

  // Puts the current local tracks into the three slots.
  // Returns true when a slot starts or stops sending, which needs a new offer.
  const syncLocalTracks = useCallback((pc: RTCPeerConnection) => {
    let directionChanged = false;
    pc.getTransceivers().slice(0, 3).forEach((transceiver, slot) => {
      const track = localTrackFor(slot, localStreamRef.current, screenStreamRef.current);
      if ((transceiver.sender.track?.id ?? null) !== (track?.id ?? null)) {
        void transceiver.sender.replaceTrack(track);
      }
      const direction: RTCRtpTransceiverDirection = track ? "sendrecv" : "recvonly";
      if (transceiver.direction !== direction) {
        transceiver.direction = direction;
        directionChanged = true;
      }
    });
    return directionChanged;
  }, []);

  const sendOffer = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      if (pc.signalingState !== "stable") {
        pendingOfferRef.current.add(peerId);
        return;
      }
      pendingOfferRef.current.delete(peerId);
      makingOfferRef.current.add(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(peerId, { kind: "offer", sdp: pc.localDescription!.sdp! });
      } catch (error) {
        console.warn("WebRTC offer failed:", error);
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    },
    [sendSignal],
  );

  const closePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    remoteStreamRefs.current.delete(peerId);
    remoteScreenStreamRefs.current.delete(peerId);
    connectedPeersRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    ignoredOfferRef.current.delete(peerId);
    pendingOfferRef.current.delete(peerId);
    signalQueueRef.current.delete(peerId);
    setRemoteStreams((previous) => {
      if (!(peerId in previous)) return previous;
      const next = { ...previous };
      delete next[peerId];
      return next;
    });
    setRemoteScreenStreams((previous) => {
      if (!(peerId in previous)) return previous;
      const next = { ...previous };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (peerId: string, initiator: boolean) => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerId, { kind: "candidate", candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        const isScreen = pc.getTransceivers().indexOf(event.transceiver) === SCREEN;
        const streams = isScreen ? remoteScreenStreamRefs.current : remoteStreamRefs.current;
        let remote = streams.get(peerId);
        if (!remote) {
          remote = new MediaStream();
          streams.set(peerId, remote);
        }
        for (const old of remote.getTracks()) {
          if (old.kind === event.track.kind && old !== event.track) remote.removeTrack(old);
        }
        if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track);

        const stream = remote;
        if (isScreen) setRemoteScreenStreams((previous) => ({ ...previous, [peerId]: stream }));
        else setRemoteStreams((previous) => ({ ...previous, [peerId]: stream }));

        if (!isScreen && !connectedPeersRef.current.has(peerId)) {
          connectedPeersRef.current.add(peerId);
          captureEvent("proximity_connected");
        }
      };

      pc.onconnectionstatechange = () => {
        // Connected but nothing is being sent yet (camera and mic off): still show the person.
        if (pc.connectionState === "connected" && !remoteStreamRefs.current.has(peerId)) {
          const empty = new MediaStream();
          remoteStreamRefs.current.set(peerId, empty);
          setRemoteStreams((previous) => ({ ...previous, [peerId]: empty }));
        }
        if (pc.connectionState === "failed") {
          closePeer(peerId);
          setRetryTick((tick) => tick + 1);
        }
      };

      if (initiator) {
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
        syncLocalTracks(pc);
        void sendOffer(peerId, pc);
      }
      return pc;
    },
    [sendSignal, sendOffer, syncLocalTracks, closePeer],
  );

  // Handles one signal; signals from the same peer run strictly one after another.
  const handleSignal = useCallback(
    async (peerId: string, signal: Signal) => {
      let pc = peersRef.current.get(peerId);

      if (signal.kind === "offer") {
        const me = selfIdRef.current;
        if (!me) return;
        // "Perfect negotiation": if both sides offer at once, the polite side gives way.
        const polite = me > peerId;
        const collision = !!pc && (makingOfferRef.current.has(peerId) || pc.signalingState !== "stable");
        if (collision && !polite) {
          ignoredOfferRef.current.add(peerId);
          return;
        }
        ignoredOfferRef.current.delete(peerId);
        if (!pc) pc = createPeer(peerId, false);

        try {
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        } catch {
          // The caller rebuilt its connection (e.g. after a failure): start a fresh one here too.
          closePeer(peerId);
          pc = createPeer(peerId, false);
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        }
        // Slots now exist in the caller's order; fill them before answering.
        syncLocalTracks(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(peerId, { kind: "answer", sdp: pc.localDescription!.sdp! });
      } else if (signal.kind === "answer") {
        if (pc?.signalingState === "have-local-offer") {
          await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        }
      } else {
        if (!pc || !pc.remoteDescription) return;
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (error) {
          if (!ignoredOfferRef.current.has(peerId)) console.warn("WebRTC candidate failed:", error);
        }
      }

      if (pc && pc.signalingState === "stable" && pendingOfferRef.current.has(peerId)) {
        void sendOffer(peerId, pc);
      }
    },
    [createPeer, closePeer, sendOffer, sendSignal, syncLocalTracks],
  );

  useEffect(() => {
    registerSignalHandler((fromUserId, raw) => {
      if (!isSignal(raw)) return;
      const previous = signalQueueRef.current.get(fromUserId) ?? Promise.resolve();
      const next = previous
        .then(() => handleSignal(fromUserId, raw))
        .catch((error) => console.warn("WebRTC signaling failed:", error));
      signalQueueRef.current.set(fromUserId, next);
    });
  }, [registerSignalHandler, handleSignal]);

  useEffect(() => {
    if (!selfId) return;

    nearbyIds.forEach((peerId) => {
      if (!peersRef.current.has(peerId) && selfId < peerId) {
        createPeer(peerId, true);
      }
    });

    peersRef.current.forEach((_pc, peerId) => {
      if (!nearbyIds.has(peerId)) closePeer(peerId);
    });
  }, [nearbyIds, selfId, createPeer, closePeer, retryTick]);

  useEffect(() => {
    peersRef.current.forEach((pc, peerId) => {
      if (pc.getTransceivers().length < 3) return;
      if (syncLocalTracks(pc)) void sendOffer(peerId, pc);
    });
  }, [localStream, screenStream, syncLocalTracks, sendOffer]);

  useEffect(() => {
    const peers = peersRef.current;
    const remoteStreamMap = remoteStreamRefs.current;
    const remoteScreenStreamMap = remoteScreenStreamRefs.current;
    return () => {
      peers.forEach((pc) => pc.close());
      peers.clear();
      remoteStreamMap.clear();
      remoteScreenStreamMap.clear();
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    remoteScreenStreams,
    micOn,
    camOn,
    screenOn,
    screenStream,
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}
