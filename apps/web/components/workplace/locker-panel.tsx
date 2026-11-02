"use client";

import { useState, type RefObject } from "react";
import { ArrowLeft, Download, FileText, Inbox, Mail, Package, Send } from "lucide-react";
import {
  COWORKERS, COWORKER_ASK_MAX, LOCKER_BODY_MAX, LOCKER_TITLE_MAX, coworkerMission, getCoworker,
  type CoworkerDocResponse, type CoworkerId, type LockerItem, type LockerKind,
} from "@repo/shared";
import { aiRequestParts, readStoredAi } from "../../lib/ai/ai-settings";
import type { SceneBridge } from "../phaser/scene-bridge";
import { NoticeLine, WorkplaceDialog, field, focus, label, muted, primary, secondary, segment, whenOf } from "./panel-kit";
import type { Workplace, WorkplacePerson } from "./use-workplace";

// Your locker by reception: what people (and AI coworkers) have left you, waiting until you collect
// it. You can send a document or a parcel to anyone in the space, or ask a coworker to write you one.

type Tab = "waiting" | "send" | "ask";

const coworkerName = (id: CoworkerId) => coworkerMission(getCoworker(id)!).coworker.name;
const fromName = (item: LockerItem) => (item.from.kind === "person" ? item.from.name : coworkerName(item.from.id));

// What each coworker is usually asked for, as one-tap suggestions.
const SUGGESTIONS: Record<CoworkerId, string[]> = {
  arjun: ["What the staging logs say about the login bug", "Your deploy checklist"],
  priya: ["The plan for Friday's release", "This sprint's priorities"],
  rahul: ["Notes from this morning's team sync", "The roadmap for this quarter"],
};

function download(item: LockerItem) {
  const text = `${item.title}\nFrom ${fromName(item)}\n\n${item.body}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${item.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "document"}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function LockerPanel({
  bridgeRef,
  workplace,
  people,
  openedAt,
  onClose,
}: {
  bridgeRef: RefObject<SceneBridge>;
  workplace: Workplace;
  people: WorkplacePerson[];
  openedAt: number;
  onClose: () => void;
}) {
  const { locker, send, notice, clearNotice } = workplace;
  const [tab, setTab] = useState<Tab>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  // What a coworker said when they left a document (say, that the AI was off so it's a saved one).
  const [delivered, setDelivered] = useState<string | null>(null);
  const opened = locker?.find((item) => item.id === openId) ?? null;
  const count = locker?.length ?? 0;

  return (
    <WorkplaceDialog
      bridgeRef={bridgeRef}
      name="lockers"
      title="Mail and parcel lockers"
      subtitle={count ? `${count} ${count === 1 ? "thing" : "things"} waiting in your locker` : "Your locker is empty"}
      icon={Inbox}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 p-4">
        <div role="tablist" aria-label="Locker" className="inline-flex w-fit gap-1 rounded-xl bg-[#f1f2f4] p-1">
          {(
            [
              ["waiting", count ? `Waiting (${count})` : "Waiting"],
              ["send", "Send something"],
              ["ask", "Ask a coworker"],
            ] as const
          ).map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={segment}>
              {text}
            </button>
          ))}
        </div>

        {tab === "waiting" && delivered && !opened && (
          <p role="status" className="rounded-xl bg-[#e8effd] px-3 py-2 text-[13px] text-[#1f3f8a]">
            {delivered}
          </p>
        )}
        {tab === "waiting" &&
          (opened ? (
            <OpenedItem item={opened} onBack={() => setOpenId(null)} onCollect={() => {
              send?.({ action: "collect", id: opened.id });
              setOpenId(null);
            }} />
          ) : locker === null ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Opening your locker">
              {[0, 1].map((row) => <div key={row} className="h-14 animate-pulse rounded-2xl bg-[#f1f2f4] motion-reduce:animate-none" />)}
            </div>
          ) : locker.length === 0 ? (
            <div className="rounded-2xl bg-[#f4f5f7] px-4 py-8 text-center">
              <Mail size={22} className="mx-auto text-[#8a909b]" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">Nothing waiting</p>
              <p className={`mx-auto mt-1 max-w-[34ch] text-[13px] ${muted}`}>
                Documents and parcels people send you wait here until you collect them.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...locker].reverse().map((item) => {
                const Icon = item.kind === "parcel" ? Package : FileText;
                const coworker = item.from.kind === "coworker" ? getCoworker(item.from.id) : null;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => setOpenId(item.id)} className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#e6e8ec] p-3 text-left transition hover:border-[#c9ced6] hover:bg-[#fafbfc] motion-reduce:transition-none ${focus}`}>
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.kind === "parcel" ? "bg-[#f6ecdf] text-[#8a5a22]" : "bg-[#e8effd] text-[#3a6ee8]"}`}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.title}</span>
                        <span className={`mt-0.5 flex items-center gap-1.5 truncate text-xs ${muted}`}>
                          {coworker && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: coworker.color }} aria-hidden="true" />}
                          From {fromName(item)}
                          {coworker && " (AI coworker)"}, {whenOf(item.at)}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-[#2f5ed0]">Open</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "send" && <SendForm people={people} workplace={workplace} />}
        {tab === "ask" && (
          <AskCoworker
            workplace={workplace}
            onDelivered={(note) => {
              setDelivered(note);
              setTab("waiting");
            }}
          />
        )}

        <NoticeLine notice={notice} since={openedAt} onDone={clearNotice} />
      </div>
    </WorkplaceDialog>
  );
}

function OpenedItem({ item, onBack, onCollect }: { item: LockerItem; onBack: () => void; onCollect: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className={`inline-flex w-fit items-center gap-1.5 rounded-lg text-xs font-semibold text-[#2f5ed0] ${focus}`}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to your locker
      </button>
      <article className="rounded-2xl bg-[#f4f5f7] p-3">
        <div className="rounded-sm bg-white p-5 shadow-[0_1px_3px_rgba(18,21,28,0.12)]">
          <p className={`text-xs ${muted}`}>
            {item.kind === "parcel" ? "Parcel" : "Document"} from {fromName(item)}, {whenOf(item.at)}
          </p>
          <h3 className="mt-1 break-words text-lg font-semibold tracking-tight">{item.title}</h3>
          {item.body ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#2b2f38]">{item.body}</p>
          ) : (
            <p className={`mt-3 text-[13px] ${muted}`}>No note came with it.</p>
          )}
        </div>
      </article>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCollect} className={primary}>
          Collect {item.kind === "parcel" ? "parcel" : "document"}
        </button>
        {item.kind === "document" && (
          <button type="button" onClick={() => download(item)} className={secondary}>
            <Download size={15} aria-hidden="true" /> Save a copy
          </button>
        )}
      </div>
      <p className={`text-xs ${muted}`}>Collecting takes it out of your locker.</p>
    </div>
  );
}

function SendForm({ people, workplace }: { people: WorkplacePerson[]; workplace: Workplace }) {
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<LockerKind>("document");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const recipient = people.find((person) => person.id === to) ?? null;

  if (!people.length) {
    return (
      <div className="rounded-2xl bg-[#f4f5f7] px-4 py-8 text-center">
        <p className="text-sm font-semibold">No one else is here right now</p>
        <p className={`mx-auto mt-1 max-w-[36ch] text-[13px] ${muted}`}>You can send things to people while they&apos;re in the space. Ask a coworker for a document meanwhile.</p>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!recipient || !title.trim()) return;
        if (workplace.send?.({ action: "send", to: recipient.id, item: { kind, title: title.trim(), body } })) {
          setTitle("");
          setBody("");
        }
      }}
    >
      <label className={label}>
        Send to
        <select value={to} onChange={(event) => setTo(event.target.value)} name="locker-to" className={`${field} h-10`} required>
          <option value="">Choose someone…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className={label}>What it is</p>
        <div role="group" aria-label="What it is" className="mt-1 inline-flex gap-1 rounded-xl bg-[#f1f2f4] p-1">
          <button type="button" aria-pressed={kind === "document"} onClick={() => setKind("document")} className={segment}>
            <FileText size={14} aria-hidden="true" /> Document
          </button>
          <button type="button" aria-pressed={kind === "parcel"} onClick={() => setKind("parcel")} className={segment}>
            <Package size={14} aria-hidden="true" /> Parcel
          </button>
        </div>
      </div>
      <label className={label}>
        {kind === "parcel" ? "What's inside" : "Title"}
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={LOCKER_TITLE_MAX} required autoComplete="off" name="locker-title" placeholder={kind === "parcel" ? "Spare laptop charger…" : "Meeting notes…"} className={`${field} h-10`} />
      </label>
      <label className={label}>
        {kind === "parcel" ? "Note" : "Text"} <span className={`font-normal ${muted}`}>{kind === "parcel" ? "(optional)" : ""}</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={LOCKER_BODY_MAX} rows={kind === "parcel" ? 2 : 6} name="locker-body" placeholder={kind === "parcel" ? "Left at the front desk for you…" : "Write the document…"} className={`${field} resize-y py-2 leading-6`} />
      </label>
      <button type="submit" className={`${primary} w-fit`} disabled={!recipient || !title.trim()}>
        <Send size={15} aria-hidden="true" /> {recipient ? `Send to ${recipient.name}` : "Send"}
      </button>
    </form>
  );
}

function AskCoworker({ workplace, onDelivered }: { workplace: Workplace; onDelivered: (note: string) => void }) {
  const [coworker, setCoworker] = useState<CoworkerId>("priya");
  const [ask, setAsk] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const name = coworkerMission(getCoworker(coworker)!).coworker.name.split(" ")[0]!;

  const submit = async (text: string) => {
    if (state.busy || text.trim().length < 3) return;
    setState({ busy: true, error: null });
    try {
      const { headers, choice } = aiRequestParts(readStoredAi());
      const response = await fetch("/api/coworkers/document", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ coworkerId: coworker, ask: text.trim(), ...(choice ? { ai: choice } : {}) }),
      });
      const data = (await response.json()) as CoworkerDocResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "That didn't work. Please try again.");
      const sent = workplace.send?.({ action: "coworker-drop", coworker, item: { kind: "document", title: data.title, body: data.body } });
      if (!sent) throw new Error("You're offline for a moment. Try again when the map reconnects.");
      setState({ busy: false, error: null });
      setAsk("");
      onDelivered(data.notice ?? `${name} left “${data.title}” in your locker.`);
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : "That didn't work. Please try again." });
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(ask);
      }}
    >
      <div role="radiogroup" aria-label="Coworker" className="grid gap-2 sm:grid-cols-3">
        {COWORKERS.map((each) => {
          const person = coworkerMission(each).coworker;
          const chosen = coworker === each.id;
          return (
            <button
              key={each.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setCoworker(each.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-2xl border p-3 text-left transition motion-reduce:transition-none ${chosen ? "border-[#3a6ee8] bg-[#f3f6fe]" : "border-[#e6e8ec] hover:bg-[#fafbfc]"} ${focus}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: each.color }} aria-hidden="true">
                {person.name[0]}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{person.name}</span>
                <span className={`block truncate text-[11px] ${muted}`}>{person.role}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className={label}>
        What do you need from {name}?
        <textarea value={ask} onChange={(event) => setAsk(event.target.value)} maxLength={COWORKER_ASK_MAX} rows={2} name="coworker-ask" placeholder={`${SUGGESTIONS[coworker][0]}…`} className={`${field} resize-none py-2 leading-6`} />
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
        {SUGGESTIONS[coworker].map((suggestion) => (
          <button key={suggestion} type="button" disabled={state.busy} onClick={() => void submit(suggestion)} className={`rounded-full border border-[#d5d8de] px-3 py-1 text-xs text-[#3b4150] transition hover:bg-[#f4f5f7] disabled:opacity-50 motion-reduce:transition-none ${focus}`}>
            {suggestion}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primary} disabled={state.busy || ask.trim().length < 3}>
          {state.busy ? `${name} is writing it…` : `Ask ${name}`}
        </button>
        <p className={`text-xs ${muted}`}>It lands in your locker.</p>
      </div>
      {state.error && <p role="alert" className="text-[13px] text-[#a23c39]">{state.error}</p>}
    </form>
  );
}
