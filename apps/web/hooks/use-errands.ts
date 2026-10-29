"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_ERRAND_PROGRESS, completeErrand, enterRoom, getErrand, getMapTemplate, parseErrandProgress, runSeconds,
  startRun, visitRoom,
  type ErrandProgress, type ErrandReward, type ErrandRun,
} from "@repo/shared";

// Errands on the Clario HQ map: the run you're on, and your XP, coins and badges.
// Progress is kept in this browser, per account (the server doesn't store it yet).

const ROOM_IDS = getMapTemplate("clario-hq").chatRooms.map((room) => room.id);

export type ErrandCelebration = {
  // null for a badge earned outside an errand (exploring the office).
  title: string | null;
  reward: ErrandReward | null;
  seconds: number | null;
  why: string | null;
  newBadges: string[];
  levelUp: boolean;
  at: number;
};

function readProgress(key: string): ErrandProgress {
  try {
    return parseErrandProgress(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return EMPTY_ERRAND_PROGRESS;
  }
}

export function useErrands(userId: string | null, roomId: string | null, enabled: boolean) {
  const storageKey = enabled && userId ? `clario:errands:${userId}` : null;
  const [progress, setProgress] = useState<ErrandProgress>(EMPTY_ERRAND_PROGRESS);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [run, setRun] = useState<ErrandRun | null>(null);
  // The option picked last, so its explanation can be shown.
  const [lastPick, setLastPick] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<ErrandCelebration | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The handlers read the latest values through refs, so they never act on a stale copy.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const runRef = useRef(run);
  runRef.current = run;
  const roomRef = useRef(roomId);
  roomRef.current = roomId;

  useEffect(() => {
    if (!storageKey) return;
    setProgress(readProgress(storageKey));
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // Storage can be unavailable (private mode); progress then lasts until the page closes.
    }
  }, [progress, storageKey, loadedKey]);

  // Walking into a room counts towards Office Explorer and moves a run on.
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey || !roomId) return;
    const visit = visitRoom(progressRef.current, roomId, ROOM_IDS);
    if (visit.progress !== progressRef.current) {
      setProgress(visit.progress);
      if (visit.newBadges.length) {
        setCelebration({ title: null, reward: null, seconds: null, why: null, newBadges: visit.newBadges, levelUp: false, at: Date.now() });
      }
    }
    const current = runRef.current;
    const errand = current && getErrand(current.errandId);
    if (current && errand) setRun(enterRoom(current, errand, roomId, Date.now()));
  }, [roomId, storageKey, loadedKey]);

  // A ticking clock for the timer, only while you're running.
  const running = !!run && run.arrivedAt === null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback((errandId: string) => {
    const errand = getErrand(errandId);
    if (!errand) return;
    setCelebration(null);
    setLastPick(null);
    setNow(Date.now());
    setRun(startRun(errand, Date.now(), roomRef.current));
  }, []);

  const cancel = useCallback(() => {
    setRun(null);
    setLastPick(null);
  }, []);

  const pick = useCallback((index: number) => {
    const current = runRef.current;
    const errand = current && getErrand(current.errandId);
    const option = errand?.message.options[index];
    if (!current || !errand || !option || current.arrivedAt === null) return;
    setLastPick(index);
    if (!option.best) {
      if (!current.wrongPicks.includes(index)) setRun({ ...current, wrongPicks: [...current.wrongPicks, index] });
      return;
    }
    const seconds = runSeconds(current, Date.now());
    const result = completeErrand(progressRef.current, errand, seconds, current.wrongPicks.length, ROOM_IDS);
    setProgress(result.progress);
    setRun(null);
    setLastPick(null);
    setCelebration({
      title: errand.title, reward: result.reward, seconds, why: option.why,
      newBadges: result.newBadges, levelUp: result.levelUp, at: Date.now(),
    });
  }, []);

  const dismissCelebration = useCallback(() => setCelebration(null), []);

  return {
    progress,
    run,
    errand: run ? getErrand(run.errandId) : null,
    now,
    lastPick,
    celebration,
    start,
    cancel,
    pick,
    dismissCelebration,
  };
}

export type Errands = ReturnType<typeof useErrands>;
