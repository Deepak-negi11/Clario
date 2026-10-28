"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { PixelRoomScene } from "./pixel-room-scene";
import styles from "../../app/landing.module.css";

const steps = [
  {
    id: "create",
    number: "01",
    title: "Create a persistent room",
    body: "Choose a layout for your team. The space, its context, and recent conversation stay ready between visits.",
  },
  {
    id: "share",
    number: "02",
    title: "Invite with one link",
    body: "Share a direct room link so teammates can enter the same workspace without setup, scheduling, or another meeting app.",
  },
  {
    id: "meet",
    number: "03",
    title: "Walk over to talk",
    body: "Move near a teammate to start voice and video naturally. Step away when the conversation is done.",
  },
] as const;

type StepId = (typeof steps)[number]["id"];

export function InteractiveHowItWorks() {
  const [active, setActive] = useState<StepId>("create");
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
          <span>{activeStep.number} / 03</span>
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
