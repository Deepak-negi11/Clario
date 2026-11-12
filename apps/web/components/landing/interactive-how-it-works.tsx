"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { PixelRoomScene } from "./pixel-room-scene";
import styles from "../../app/landing.module.css";

const steps = [
  {
    id: "meet",
    number: "01",
    title: "Walk over to talk",
    body: "Move with the arrow keys, or click a spot to walk there. Within six tiles of someone in the same room, you're in range to talk. Your mic and camera stay off until you turn them on, and the browser only asks for permission then. Step away and the call ends.",
  },
  {
    id: "create",
    number: "02",
    title: "Create a persistent room",
    body: "Choose a layout for your team. The space, its context, and recent conversation stay ready between visits.",
  },
  {
    id: "share",
    number: "03",
    title: "Invite with one link",
    body: "Share the room's link. Teammates can join as a guest with just a name, or sign in, and land straight in the room. No setup, scheduling, or another meeting app.",
  },
] as const;

type StepId = (typeof steps)[number]["id"];

export function InteractiveHowItWorks() {
  const [active, setActive] = useState<StepId>("meet");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeStep = steps.find((step) => step.id === active)!;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % steps.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + steps.length) % steps.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = steps.length - 1;
    else return;

    event.preventDefault();
    const nextStep = steps[nextIndex];
    if (!nextStep) return;

    setActive(nextStep.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={styles.howInteractive}>
      <div className={styles.stepTabs} role="tablist" aria-label="How it works steps">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            ref={(node) => { tabRefs.current[index] = node; }}
            id={`step-tab-${step.id}`}
            role="tab"
            tabIndex={active === step.id ? 0 : -1}
            aria-selected={active === step.id}
            aria-controls="step-panel"
            className={active === step.id ? styles.activeStep : ""}
            onClick={() => setActive(step.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <span>{step.number}</span>
            {step.title}
          </button>
        ))}
      </div>

      <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className={styles.stepPanel}>
        <div className={styles.stepCopy}>
          <h3>{activeStep.title}</h3>
          <p>{activeStep.body}</p>
        </div>
        <div className={styles.stepDemo} aria-hidden={active === "meet" ? undefined : true}>
          {active === "create" && (
            <div className={styles.templateDemo}>
              <div><span /><span /><span /><span /></div>
              <div><span /><span /><span /></div>
              <b><Check size={14} /> Coworking campus</b>
            </div>
          )}
          {active === "share" && (
            <div className={styles.shareDemo}>
              <span>clario.space/team-hq</span>
              <b><Copy size={15} /> Copy link</b>
            </div>
          )}
          {active === "meet" && <PixelRoomScene embedded />}
        </div>
      </div>
    </div>
  );
}
