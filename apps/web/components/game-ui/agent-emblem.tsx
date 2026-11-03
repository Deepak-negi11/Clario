"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import { AGENT_IDENTITY, type AgentIdentity } from "../../lib/agents/identity";
import { reducedAgentMotion } from "../../lib/agents/motion";
import { PixelPet } from "./pixel-pet";
import styles from "./agent-emblem.module.css";

const greetings = {
  "claude-code": "Hello, Claude!",
  codex: "Let's build.",
  "cursor-agent": "On point.",
  agent: "Ready when you are.",
};

/** A local, keyboard-accessible reaction. It never starts a task or sends a message. */
export function AgentEmblem({
  kind,
  working,
}: {
  kind: AgentIdentity;
  working: boolean;
}) {
  const [reaction, setReaction] = useState(0);
  const identity = AGENT_IDENTITY[kind];
  const tilt = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse" || reducedAgentMotion()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--tilt-x",
      `${(0.5 - (event.clientY - rect.top) / rect.height) * 12}deg`,
    );
    event.currentTarget.style.setProperty(
      "--tilt-y",
      `${((event.clientX - rect.left) / rect.width - 0.5) * 12}deg`,
    );
  };
  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        aria-label={`Animate ${identity.name}`}
        title={`Tap to animate ${identity.name}`}
        className={styles.emblem}
        data-agent={kind}
        style={
          {
            "--wash": identity.wash,
            "--edge": identity.border,
            "--accent": identity.color,
          } as CSSProperties
        }
        onPointerMove={tilt}
        onPointerLeave={(event) => {
          event.currentTarget.style.setProperty("--tilt-x", "0deg");
          event.currentTarget.style.setProperty("--tilt-y", "0deg");
        }}
        onClick={() => setReaction((value) => value + 1)}
      >
        <span className={styles.tilt}>
          <span
            key={reaction}
            className={reaction ? styles.reaction : styles.art}
          >
            <PixelPet agent={kind} running={working} size={72} />
          </span>
          <span className={styles.sheen} aria-hidden="true" />
        </span>
        {reaction > 0 && (
          <span
            key={`spark-${reaction}`}
            className={styles.sparks}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </button>
      <span
        key={`hint-${reaction}`}
        className={reaction ? styles.greeting : styles.hint}
        role="status"
      >
        {reaction ? greetings[kind] : "Tap to play"}
      </span>
    </div>
  );
}
