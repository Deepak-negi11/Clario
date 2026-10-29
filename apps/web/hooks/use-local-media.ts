"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaDeviceStatus = "idle" | "requesting" | "on" | "off" | "blocked" | "error";

function permissionErrorStatus(error: unknown): MediaDeviceStatus {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "blocked";
  }
  return "error";
}

export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micStatus, setMicStatus] = useState<MediaDeviceStatus>("idle");
  const [camStatus, setCamStatus] = useState<MediaDeviceStatus>("idle");
  const [screenStatus, setScreenStatus] = useState<MediaDeviceStatus>("idle");
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micRequestRef = useRef(false);
  const camRequestRef = useRef(false);
  const screenRequestRef = useRef(false);

  const updateStream = useCallback((next: MediaStream) => {
    streamRef.current = next;
    setStream(next);
  }, []);

  const toggleMic = useCallback(async () => {
    const currentTrack = streamRef.current?.getAudioTracks()[0];
    if (currentTrack) {
      currentTrack.stop();
      const remainingTracks = (streamRef.current?.getTracks() ?? []).filter((t) => t !== currentTrack);
      const next = new MediaStream(remainingTracks);
      updateStream(next);
      setMicStatus("off");
      return;
    }
    if (micRequestRef.current) return;

    micRequestRef.current = true;
    setMicStatus("requesting");
    try {
      const requested = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const track = requested.getAudioTracks()[0];
      if (!track) throw new Error("No microphone was found");
      track.enabled = true;
      const next = new MediaStream([...(streamRef.current?.getTracks() ?? []), track]);
      updateStream(next);
      setMicStatus("on");
    } catch (error) {
      setMicStatus(permissionErrorStatus(error));
    } finally {
      micRequestRef.current = false;
    }
  }, [updateStream]);

  const toggleCam = useCallback(async () => {
    const currentTrack = streamRef.current?.getVideoTracks()[0];
    if (currentTrack) {
      currentTrack.stop();
      const remainingTracks = (streamRef.current?.getTracks() ?? []).filter((t) => t !== currentTrack);
      const next = new MediaStream(remainingTracks);
      updateStream(next);
      setCamStatus("off");
      return;
    }
    if (camRequestRef.current) return;

    camRequestRef.current = true;
    setCamStatus("requesting");
    try {
      const requested = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const track = requested.getVideoTracks()[0];
      if (!track) throw new Error("No camera was found");
      track.enabled = true;
      const next = new MediaStream([...(streamRef.current?.getTracks() ?? []), track]);
      updateStream(next);
      setCamStatus("on");
    } catch (error) {
      setCamStatus(permissionErrorStatus(error));
    } finally {
      camRequestRef.current = false;
    }
  }, [updateStream]);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenStatus("off");
  }, []);

  const toggleScreen = useCallback(async () => {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    if (screenRequestRef.current) return;

    screenRequestRef.current = true;
    setScreenStatus("requesting");
    try {
      const requested = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = requested.getVideoTracks()[0];
      if (!track) throw new Error("No screen was selected");
      const next = new MediaStream([track]);
      screenStreamRef.current = next;
      setScreenStream(next);
      setScreenStatus("on");

      track.addEventListener("ended", () => {
        screenStreamRef.current = null;
        setScreenStream(null);
        setScreenStatus("off");
      });
    } catch (error) {
      setScreenStatus(permissionErrorStatus(error));
    } finally {
      screenRequestRef.current = false;
    }
  }, [stopScreenShare]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    stream,
    micStatus,
    camStatus,
    screenStatus,
    screenStream,
    micOn: micStatus === "on",
    camOn: camStatus === "on",
    screenOn: screenStatus === "on",
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}

export type LocalMediaController = ReturnType<typeof useLocalMedia>;
