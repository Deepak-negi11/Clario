"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ChartColumn, Check, Megaphone, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { clockTime, pollOpen, voteShares, type NoticePost } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import type { BadgeAndNotices } from "../../hooks/use-badge-and-notices";
import { NoticeComposer, type ComposerResult } from "./notice-composer";

// The cork notice board. The scene calls bridge.openNoticeBoard when the player presses E at the
// board (the rail's Board button does too). Posts and votes come live from the server; all text is
// shown as plain text. While it is open the game keyboard is off; Escape or X closes it.

function when(ms: number, now: number) {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (new Date(ms).toDateString() === new Date(now).toDateString()) return `at ${clockTime(ms)}`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function closesLabel(closesAt: number, now: number) {
  const sameDay = new Date(closesAt).toDateString() === new Date(now).toDateString();
  return sameDay ? clockTime(closesAt) : `${new Date(closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clockTime(closesAt)}`;
}

// Cork: two offset layers of tiny dark and light flecks on a warm brown.
const CORK = {
  backgroundColor: "#c39a6b",
  backgroundImage:
    "radial-gradient(rgba(92,58,26,0.35) 0.8px, transparent 1.1px), radial-gradient(rgba(255,240,220,0.28) 0.8px, transparent 1.1px)",
  backgroundSize: "7px 7px, 11px 11px",
  backgroundPosition: "0 0, 3px 4px",
} as const;

export function NoticeBoardOnMap({
  bridgeRef,
  office,
  selfId,
}: {
  bridgeRef: RefObject<SceneBridge>;
  office: BadgeAndNotices;
  selfId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.openNoticeBoard = () => setOpen(true);
    return () => {
      bridge.openNoticeBoard = undefined;
      bridge.noticeUnread = undefined;
    };
  }, [bridgeRef]);

  useEffect(() => {
    bridgeRef.current.noticeUnread = office.unread;
  }, [bridgeRef, office.unread]);

  // Only on open and close, so mounting this doesn't override other panels.
  useEffect(() => {
    if (open === wasOpenRef.current) return;
    wasOpenRef.current = open;
    bridgeRef.current.setKeyboardEnabled?.(!open);
  }, [open, bridgeRef]);

  // Everything on the board while it is open counts as read, new posts included.
  const { markSeen, posts } = office;
  useEffect(() => {
    if (open) markSeen();
  }, [open, posts, markSeen]);

  const close = useCallback(() => setOpen(false), []);
  if (!open) return null;
  return <NoticeBoardPanel office={office} selfId={selfId} onClose={close} />;
}

function NoticeBoardPanel({ office, selfId, onClose }: { office: BadgeAndNotices; selfId: string | null; onClose: () => void }) {
  const { posts, myVotes, refusal, clearRefusal } = office;
  const [composing, setComposing] = useState(false);
  // While a new post is on its way: your post ids before sending, and when you sent it.
  const [pending, setPending] = useState<{ before: Set<string>; at: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sectionRef.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The composer closes once your new post is on the board; a refusal keeps it open with your text.
  useEffect(() => {
    if (!pending) return;
    if (posts.some((post) => post.authorId === selfId && !pending.before.has(post.id))) {
      setPending(null);
      setComposing(false);
    } else if (refusal && refusal.at >= pending.at) {
      setPending(null);
    }
  }, [posts, refusal, pending, selfId]);

  const submitNew = (result: ComposerResult) => {
    if (result.action === "edit") return;
    clearRefusal();
    const before = new Set(posts.filter((post) => post.authorId === selfId).map((post) => post.id));
    if (office.post(result)) setPending({ before, at: Date.now() });
  };

  const pinnedCount = posts.filter((post) => post.pinned).length;

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Notice board"
      className="pointer-events-auto absolute bottom-3 right-3 top-3 z-[66] flex w-[min(24rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-[#8a6338]/30 bg-[#f7f3ec] text-[#12151c] shadow-[0_22px_50px_-20px_rgba(40,24,8,0.55)] outline-none"
    >
      <header className="relative flex items-center justify-between gap-2 border-b border-[#8a6338]/35 px-3 py-3" style={CORK}>
        <div className="relative rounded-md bg-[#fffdf8] px-3 py-1.5 shadow-[0_2px_6px_rgba(60,35,10,0.35)]">
          <span aria-hidden="true" className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#d94a3a] shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_-1px_1px_rgba(0,0,0,0.25)]" />
          <h2 className="text-[14px] font-bold leading-tight tracking-tight">Notice board</h2>
          <p className="text-[11px] font-medium text-[#7a6f60] tabular-nums">
            {posts.length === 1 ? "1 post" : `${posts.length} posts`}{pinnedCount ? ` · ${pinnedCount} pinned` : ""}
          </p>
        </div>
        <span className="flex items-center gap-1.5">
          {!composing && (
            <button
              type="button"
              onClick={() => { clearRefusal(); setComposing(true); }}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg bg-[#12151c] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition hover:bg-[#2a2f3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
            >
              <Plus size={14} aria-hidden="true" /> New post
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notice board"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-[#fffdf8]/85 text-[#5c5346] shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition hover:bg-white hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3">
        {refusal && (
          <p role="alert" className="flex items-start justify-between gap-2 rounded-lg bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#9a2d1f]">
            {refusal.reason}
            <button type="button" onClick={clearRefusal} aria-label="Dismiss" className="cursor-pointer text-[#9a2d1f]/70 hover:text-[#9a2d1f]">
              <X size={13} aria-hidden="true" />
            </button>
          </p>
        )}
        {composing && (
          <NoticeComposer sending={!!pending} onSubmit={submitNew} onCancel={() => { setComposing(false); setPending(null); }} />
        )}
        {!office.boardLoaded ? (
          <p className="py-8 text-center text-[12px] text-[#8a909b]">Loading the board…</p>
        ) : posts.length === 0 && !composing ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-semibold text-[#3b3226]">Nothing pinned up yet</p>
            <p className="mt-1 text-[12px] leading-5 text-[#8a7f70]">Post an announcement for the team, or ask everyone a quick question with a poll.</p>
          </div>
        ) : (
          <ol className="space-y-2.5" aria-label="Posts">
            {posts.map((post) => (
              <li key={post.id}>
                {editingId === post.id ? (
                  <NoticeComposer
                    editing={{ kind: post.kind, title: post.title, body: post.body, pinned: post.pinned }}
                    onSubmit={(result) => {
                      if (result.action !== "edit") return;
                      clearRefusal();
                      office.edit({ postId: post.id, title: result.title, body: result.body, pinned: result.pinned, closesAt: result.closesAt });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <PostCard
                    post={post}
                    mine={post.authorId === selfId}
                    myVote={myVotes[post.id]}
                    now={now}
                    confirmingDelete={confirmDelete === post.id}
                    onVote={(option) => { clearRefusal(); office.vote(post.id, option); }}
                    onEdit={() => { setConfirmDelete(null); setEditingId(post.id); }}
                    onAskDelete={() => setConfirmDelete(post.id)}
                    onDelete={() => { setConfirmDelete(null); office.remove(post.id); }}
                    onKeep={() => setConfirmDelete(null)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function PostCard({
  post,
  mine,
  myVote,
  now,
  confirmingDelete,
  onVote,
  onEdit,
  onAskDelete,
  onDelete,
  onKeep,
}: {
  post: NoticePost;
  mine: boolean;
  myVote: number | undefined;
  now: number;
  confirmingDelete: boolean;
  onVote: (option: number) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onKeep: () => void;
}) {
  const isPoll = post.kind === "poll";
  const open = pollOpen(post, now);
  const shares = voteShares(post.votes);
  const total = post.votes.reduce((sum, count) => sum + count, 0);

  return (
    <article
      className={`relative rounded-xl border bg-white px-3.5 pb-3 pt-3 shadow-[0_4px_14px_-10px_rgba(60,40,20,0.45)] ${post.pinned ? "border-[#e8b4a8]" : "border-[#ebe5da]"}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7f70]">
          {isPoll ? <ChartColumn size={12} aria-hidden="true" /> : <Megaphone size={12} aria-hidden="true" />}
          {isPoll ? "Poll" : "Announcement"}
          {post.pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fdecea] px-1.5 py-px normal-case tracking-normal text-[#b4361f]">
              <Pin size={10} aria-hidden="true" /> Pinned
            </span>
          )}
        </span>
        {mine && !confirmingDelete && (
          <span className="flex shrink-0 gap-0.5">
            <button type="button" onClick={onEdit} aria-label={`Edit “${post.title}”`} title="Edit" className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-[#8a909b] hover:bg-[#f4f1ea] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              <Pencil size={13} aria-hidden="true" />
            </button>
            <button type="button" onClick={onAskDelete} aria-label={`Delete “${post.title}”`} title="Delete" className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-[#8a909b] hover:bg-[#fdecea] hover:text-[#b4361f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      <h3 className="break-words text-[14px] font-semibold leading-snug">{post.title}</h3>
      {post.body && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#3d4350]">{post.body}</p>}

      {isPoll && (
        <div className="mt-2.5 space-y-1.5">
          {post.options.map((option, index) => {
            const chosen = myVote === index;
            return (
              <button
                key={index}
                type="button"
                disabled={!open}
                aria-pressed={chosen}
                onClick={() => onVote(index)}
                className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] enabled:cursor-pointer disabled:cursor-default ${
                  chosen ? "border-[#12151c] font-semibold" : "border-[#e6e1d7] enabled:hover:border-[#b9b0a1]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out motion-reduce:transition-none ${chosen ? "bg-[#dfe9ff]" : "bg-[#f1ede5]"}`}
                  style={{ width: `${shares[index] ?? 0}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {chosen && <Check size={13} aria-hidden="true" className="shrink-0" />}
                    <span className="break-words">{option}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5c6371]">
                    {post.votes[index] ?? 0} · {shares[index] ?? 0}%
                  </span>
                </span>
              </button>
            );
          })}
          <p className="text-[11px] text-[#8a7f70] tabular-nums">
            {total === 1 ? "1 vote" : `${total} votes`}
            {" · "}
            {post.closesAt === null ? "Open" : open ? `Closes ${closesLabel(post.closesAt, now)}` : "Closed"}
            {open && myVote === undefined ? " · Tap an option to vote" : ""}
          </p>
        </div>
      )}

      <p className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[#8a909b]">
        <span className="min-w-0 truncate">
          {mine ? "You" : post.authorName} · {when(post.createdAt, now)}{post.editedAt ? " · edited" : ""}
        </span>
        {confirmingDelete && (
          <span className="flex shrink-0 items-center gap-1">
            <span className="font-semibold text-[#b4361f]">Delete?</span>
            <button type="button" onClick={onDelete} className="cursor-pointer rounded-md bg-[#b4361f] px-2 py-0.5 font-semibold text-white hover:bg-[#962c18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">Delete</button>
            <button type="button" onClick={onKeep} className="cursor-pointer rounded-md px-2 py-0.5 font-semibold text-[#5c6371] hover:bg-[#f4f1ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">Keep</button>
          </span>
        )}
      </p>
    </article>
  );
}
