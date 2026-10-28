"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowUpRight, Plus, Search, Share2, Check, Trash2, X } from "lucide-react";
import { Navbar } from "../../components/navbar";
import { CreateSpaceModal } from "../../components/create-space-modal";
import { JoinSpaceModal } from "../../components/join-space-modal";
import { getAuthToken } from "../../lib/auth-token";
import { PixelGlyph } from "../../components/landing/pixel-glyph";
import { DitherWaveText } from "../../components/pixel/dither-wave-text";
import { listSpaces, deleteSpace, type SpaceSummary } from "../../lib/space-api";

type Status = "loading" | "ready" | "error";

export default function SpacePage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteSpaceId, setDeleteSpaceId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleShare = async (spaceId: string) => {
    try {
      const shareLink = `${window.location.origin}/space/${spaceId}`;
      await navigator.clipboard.writeText(shareLink);
      setCopiedId(spaceId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/signin");
      return;
    }

    listSpaces(token)
      .then((res) => {
        setSpaces(res.spaces);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load spaces");
        setStatus("error");
      });
  }, [router]);

  function handleEnter(spaceId: string) {
    router.push(`/space/${spaceId}`);
  }

  async function confirmDelete() {
    if (!deleteSpaceId) return;
    const token = getAuthToken();
    if (!token) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSpace(token, deleteSpaceId);
      setSpaces((current) => current.filter((space) => space.id !== deleteSpaceId));
      setDeleteSpaceId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete the space");
    } finally {
      setIsDeleting(false);
    }
  }

  const visibleSpaces = spaces.filter((space) =>
    space.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative min-h-screen bg-[#fbfbfa] text-[#12151c]">
      <div className="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(#dfe3ea_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,#000_0%,transparent_70%)]" />

      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
        <section className="border-b border-[#e6e7ea] pb-8 sm:pb-10">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.13em] text-[#1f4fc4]">
                <span className="h-2 w-2 bg-[#3a6ee8] shadow-[10px_0_0_rgba(58,110,232,0.35)]" aria-hidden="true" />
                <span className="ml-3">YOUR TEAM SPACES</span>
              </p>
              <h1 className="mt-4">
                <span className="sr-only">Find your space. Get to work.</span>
                <DitherWaveText
                  layout="auto"
                  lines={[
                    { text: "Find your space.", color: "#12151c" },
                    { text: "Get to work.", color: "#3a6ee8" },
                  ]}
                />
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-[#5c6371]">
                Every space has a purpose. Step into the one your team needs, or create a new place for what&apos;s next.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setIsJoinOpen(true)}
                className="inline-flex h-11 items-center rounded-xl border border-[#d4d7dd] bg-white px-4 text-sm font-semibold text-[#12151c] transition hover:-translate-y-px hover:border-[#b9bec8] active:translate-y-0 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]"
              >
                Join space
              </button>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#3a6ee8] px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-[#1f4fc4] active:translate-y-0 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]"
              >
                <Plus size={17} strokeWidth={2.5} aria-hidden="true" />
                New space
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#e6e7ea] bg-white p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a909b]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a room…"
              aria-label="Find a room"
              className="h-11 w-full rounded-xl border border-[#e6e7ea] bg-[#fbfbfa] py-2 pl-10 pr-10 text-sm text-[#12151c] outline-none transition placeholder:text-[#8a909b] focus:border-[#3a6ee8] focus:bg-white focus:ring-4 focus:ring-[#3a6ee8]/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#5c6371] transition-colors hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3a6ee8]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
          <p className="flex items-center gap-2 px-3 font-mono text-xs font-semibold tracking-[0.08em] text-[#5c6371]">
            <span className="text-[#3a6ee8]" aria-hidden="true"><PixelGlyph name="pin" size={14} shimmer={false} /></span>
            {status === "ready" ? `${spaces.length} ${spaces.length === 1 ? "ROOM" : "ROOMS"}` : "LOADING ROOMS"}
          </p>
        </section>

        <section className="mt-8">
          {status === "loading" && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading spaces">
              {[0, 1, 2].map((item) => (
                <div key={item} className="overflow-hidden rounded-2xl border border-[#e6e7ea] bg-white">
                  <div className="h-40 animate-pulse bg-[#f0f1f4] motion-reduce:animate-none" />
                  <div className="p-5">
                    <div className="h-5 w-3/5 animate-pulse rounded bg-[#f0f1f4] motion-reduce:animate-none" />
                    <div className="mt-3 h-3 w-2/5 animate-pulse rounded bg-[#f0f1f4] motion-reduce:animate-none" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="rounded-xl border border-[#f1c6c0] bg-[#fff6f4] p-5 text-sm text-[#8b2f29]">
              {error ?? "We could not load your spaces. Please refresh and try again."}
            </div>
          )}

          {status === "ready" && visibleSpaces.length === 0 && (
            <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-[#d4d7dd] bg-white p-8 text-center">
              <div className="max-w-md">
                <div className="mb-6 flex items-end justify-center gap-10" aria-hidden="true">
                  {["adam", "amelia", "bob", "alex"].map((name) => (
                    <span
                      key={name}
                      className="mt-12 block h-8 w-4 origin-bottom scale-[2.4] bg-no-repeat [background-position:-288px_0] [image-rendering:pixelated]"
                      style={{ backgroundImage: `url('/assets/${name}-run.png')` }}
                    />
                  ))}
                </div>
                <h2 className="font-[family-name:var(--font-pixel)] text-2xl font-medium text-[#12151c]">
                  {query ? "Nothing matches that search" : "A blank floor plan is a good start"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#5c6371]">
                  {query ? "Try another name, or clear the search to see every room." : "Create a space for focus, catch-ups, or the conversations that should not need a calendar invite."}
                </p>
                {!query && (
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#3a6ee8] px-4 text-sm font-semibold text-white transition hover:bg-[#1f4fc4] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]"
                  >
                    <Plus size={17} strokeWidth={2.5} aria-hidden="true" />
                    Create your first space
                  </button>
                )}
              </div>
            </div>
          )}

          {status === "ready" && visibleSpaces.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleSpaces.map((space) => (
                <article key={space.id} className="group overflow-hidden rounded-2xl border border-[#e6e7ea] bg-white transition duration-200 hover:-translate-y-0.5 hover:border-[#3a6ee8]/35 hover:shadow-[0_22px_40px_-30px_rgba(30,52,110,0.45)] motion-reduce:transition-none">
                  <div className="relative flex h-40 items-end overflow-hidden border-b border-[#e6e7ea] bg-[#f4f5f7] p-4">
                    {space.thumbnail ? (
                      <Image src={space.thumbnail} alt="" fill unoptimized sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover [image-rendering:pixelated] transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                    ) : (
                      <span className="relative grid h-12 w-12 place-items-center rounded-xl bg-[#3a6ee8] font-[family-name:var(--font-pixel)] text-xl text-white">
                        {space.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-[radial-gradient(circle,#ffffff_1.1px,transparent_1.4px)] [background-size:4px_4px] [mask-image:linear-gradient(to_bottom,transparent,#000)]"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col p-5">
                    <div className="min-w-0">
                      <h2 className="truncate font-[family-name:var(--font-pixel)] text-xl font-medium text-[#12151c]">{space.name}</h2>
                      <p className="mt-2 inline-flex rounded-md bg-[#f4f5f7] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[#5c6371]">{space.dimensions ?? "CUSTOM SIZE"}</p>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleEnter(space.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#12151c] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#3a6ee8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]"
                      >
                        Enter room
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleShare(space.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e6e7ea] bg-white px-2.5 text-xs font-semibold text-[#12151c] transition-colors hover:border-[#d4d7dd] hover:bg-[#fbfbfa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3a6ee8]"
                          title="Copy share link"
                        >
                          {copiedId === space.id ? (
                            <>
                              <Check size={14} className="text-[#1aa385]" aria-hidden="true" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Share2 size={14} aria-hidden="true" />
                              Share
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteSpaceId(space.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#8a909b] transition-colors hover:bg-[#fff4f2] hover:text-[#b7483d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b7483d]"
                          aria-label={`Delete ${space.name}`}
                          title="Delete space"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="sr-only" aria-live="polite">{copiedId ? "Share link copied" : ""}</p>
        </section>
      </main>

      <CreateSpaceModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(space) => setSpaces((previous) => [space, ...previous])}
      />

      <JoinSpaceModal
        open={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
      />

      <DeleteConfirmModal
        isOpen={deleteSpaceId !== null}
        spaceName={spaces.find((s) => s.id === deleteSpaceId)?.name ?? ""}
        isDeleting={isDeleting}
        error={deleteError}
        onCancel={() => {
          setDeleteSpaceId(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  spaceName: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ isOpen, spaceName, isDeleting, error, onCancel, onConfirm }: DeleteConfirmModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243a]/55 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-[#e6e7ea] bg-white p-5 shadow-[0_24px_60px_-28px_rgba(24,32,56,0.45)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#e6e7ea] pb-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#b7483d]">DANGER ZONE</p>
            <h2 className="mt-2 font-[family-name:var(--font-pixel)] text-xl font-medium text-[#12151c]">Delete space?</h2>
          </div>
          <button type="button" onClick={onCancel} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#5e708a] transition-colors hover:bg-[#fff4f2] hover:text-[#b7483d]" aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-sm leading-6 text-[#4b5a70]">
            Are you sure you want to delete <strong className="text-[#111827]">{spaceName}</strong>? This action is permanent and cannot be undone.
          </p>
          {error && (
            <p className="mt-4 rounded-lg border border-[#f1c6c0] bg-[#fff4f2] px-3 py-2 text-sm text-[#8b2f29]">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-[#e6e7ea] pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-10 rounded-lg border border-[#d4d7dd] bg-white px-4 text-sm font-semibold text-[#4b5a70] transition hover:bg-[#fbfbfa] hover:text-[#12151c] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#b7483d] px-4 text-sm font-semibold text-white transition hover:bg-[#a23c33] disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete space"}
          </button>
        </div>
      </div>
    </div>
  );
}
