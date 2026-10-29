"use client";

import { useEffect, useRef } from "react";

// While `active`, reads the microphone loudness (0 to 1) about 60 times a second and passes it
// to `onLevel`, so Maya's listening ring can grow with the learner's voice. Best effort: if the
// mic can't be opened, nothing happens and speech recognition still works.
export function useMicLevel(active: boolean, onLevel: (level: number) => void) {
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((micStream) => {
        if (cancelled) {
          micStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = micStream;
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(micStream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          const rms = Math.sqrt(sum / samples.length);
          onLevelRef.current(Math.min(1, rms * 6));
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        // Permission denied or no mic: recognition reports that to the learner.
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      onLevelRef.current(0);
    };
  }, [active]);
}
