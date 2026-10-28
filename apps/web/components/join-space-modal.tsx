"use client";

import { type FormEvent, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";

type JoinSpaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export function JoinSpaceModal({ open, onClose }: JoinSpaceModalProps) {
  const router = useRouter();
  const [spaceInput, setSpaceInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const extractSpaceId = (input: string) => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/space\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return match[1];
    }
    return trimmed;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const spaceId = extractSpaceId(spaceInput);
    if (!spaceId) {
      setError("Please enter a space ID or invitation link.");
      return;
    }

    router.push(`/space/${spaceId}`);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243a]/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-space-title"
        className="w-full max-w-md border-2 border-[#111827] bg-[#f8fbff] p-5 shadow-[0_24px_60px_-28px_rgba(24,32,56,0.45)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b-2 border-[#111827] pb-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#183a8f]">JOIN ROOM</p>
            <h2 id="join-space-title" className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111827]">
              Enter a space
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#5e708a] transition-colors hover:bg-[#dbe8f8] hover:text-[#111827]"
            aria-label="Close dialog"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="space-id" className="text-sm font-semibold text-[#111827]">
                Space ID or invitation link
              </label>
              <input
                id="space-id"
                type="text"
                placeholder="e.g. workspace-name or URL link"
                value={spaceInput}
                onChange={(e) => setSpaceInput(e.target.value)}
                className="mt-2 h-11 w-full border-2 border-[#9eafc6] bg-white px-3.5 text-sm text-[#111827] outline-none transition-colors placeholder:text-[#718198] focus:border-[#183a8f] focus:ring-2 focus:ring-[#183a8f]/20"
                autoFocus
              />
              {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="mt-2 w-full gap-2 rounded-sm bg-[#183a8f] hover:bg-[#2451b2] text-white font-bold"
            >
              Enter space
              <ArrowRight size={17} strokeWidth={2.5} aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
