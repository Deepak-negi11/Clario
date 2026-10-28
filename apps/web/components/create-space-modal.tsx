"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, Copy, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@repo/ui/button";
import { MAP_TEMPLATES, type MapTemplateId } from "@repo/shared";
import { getAuthToken } from "../lib/auth-token";
import { createSpace, type SpaceSummary } from "../lib/space-api";
import { captureEvent } from "../lib/analytics";

type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (space: SpaceSummary) => void;
};

export function CreateSpaceModal({ open, onClose, onCreated }: CreateSpaceModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mapTemplate, setMapTemplate] = useState<MapTemplateId>("clario-hq");
  const [createdSpaceId, setCreatedSpaceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shareLink = typeof window !== "undefined" && createdSpaceId
    ? `${window.location.origin}/space/${createdSpaceId}`
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleDone = () => {
    setName("");
    setCreatedSpaceId(null);
    onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const token = getAuthToken();
    if (!token) {
      setError("You are not signed in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const template = MAP_TEMPLATES[mapTemplate];
      const dimensions = `${template.dimensions.width}x${template.dimensions.height}`;
      const { spaceId } = await createSpace(token, { name, dimensions, mapTemplate });

      onCreated({ id: spaceId, name, dimensions, thumbnail: template.thumbnail, mapTemplate });
      captureEvent("space_created");
      setCreatedSpaceId(spaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243a]/55 p-4 backdrop-blur-sm"
      onClick={handleDone}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border-2 border-[#111827] bg-[#f8fbff] p-5 shadow-[0_24px_60px_-28px_rgba(24,32,56,0.45)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        {createdSpaceId ? (

          <div>
            <div className="flex items-start justify-between border-b-2 border-[#111827] pb-5">
              <div>
                <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#1aa385]">SPACE CREATED</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111827]">Your space is ready!</h2>
                <p className="mt-2 text-sm leading-6 text-[#52627b]">Share this link with your team so they can join you in the virtual office.</p>
              </div>
              <button type="button" onClick={handleDone} className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#5e708a] transition-colors hover:bg-[#dbe8f8] hover:text-[#111827]" aria-label="Close dialog">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866]">
                  SHARE LINK
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="h-11 flex-1 border-2 border-[#9eafc6] bg-white px-3 text-sm text-[#111827] outline-none"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex h-11 items-center justify-center gap-2 border-2 border-[#111827] bg-white px-4 text-sm font-bold text-[#111827] transition"
                  >
                    {copied ? (
                      <>
                        <Check size={16} className="text-[#1aa385]" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#b9c7d9] pt-5">
                <Button type="button" variant="ghost" onClick={handleDone} className="rounded-sm text-[#4b5a70] hover:bg-[#dbe8f8] hover:text-[#111827]">
                  Done
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => router.push(`/space/${createdSpaceId}`)}
                  className="gap-2 rounded-sm bg-[#183a8f] hover:bg-[#2451b2]"
                >
                  Enter Room
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ) : (

          <div>
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#111827] pb-5">
              <div>
                <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#183a8f]">NEW TEAM SPACE</p>
                <h2 id="create-space-title" className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111827]">Start with a floor plan.</h2>
                <p className="mt-2 text-sm leading-6 text-[#52627b]">Give your new office room a name. It will be pre-configured with a premium layout.</p>
              </div>
              <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#5e708a] transition-colors hover:bg-[#dbe8f8] hover:text-[#111827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#183a8f]" aria-label="Close create space dialog">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1">
                <label htmlFor="space-name" className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866]">
                  ROOM NAME
                </label>
                <input
                  id="space-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Design studio"
                  required
                  className="h-11 border-2 border-[#9eafc6] bg-white px-3 text-sm text-[#111827] outline-none placeholder:text-[#718198] transition-colors focus:border-[#183a8f] focus:ring-2 focus:ring-[#183a8f]/20"
                />
              </div>

              <fieldset>
                <legend className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866]">CHOOSE A MAP</legend>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  {/* Clario HQ first, as the featured map. */}
                  {(Object.values(MAP_TEMPLATES) as (typeof MAP_TEMPLATES)[MapTemplateId][])
                    .sort((a, b) => Number(b.id === "clario-hq") - Number(a.id === "clario-hq"))
                    .map((template) => {
                    const selected = template.id === mapTemplate;
                    return (
                      <label
                        key={template.id}
                        className={`group cursor-pointer border-2 bg-white p-2 transition-[transform,box-shadow,border-color] ${template.id === "clario-hq" ? "sm:col-span-2" : ""} ${selected ? "-translate-y-0.5 border-[#183a8f]" : "border-[#9eafc6] hover:border-[#526f99]"}`}
                      >
                        <input
                          type="radio"
                          name="map-template"
                          value={template.id}
                          checked={selected}
                          onChange={() => setMapTemplate(template.id)}
                          className="sr-only"
                        />
                        <div className="relative aspect-[16/9] overflow-hidden border border-[#c1ccdb] bg-[#dcebd8]">
                          <Image src={template.thumbnail} alt="" fill sizes="(max-width: 640px) 100vw, 340px" className="object-cover [image-rendering:pixelated]" />
                          {template.id === "clario-hq" && (
                            <span className="absolute left-2 top-2 bg-[#79e1ca] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.08em] text-[#111827]">NEW · 3D VIEW</span>
                          )}
                        </div>
                        <div className="p-2 pb-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-[#111827]">{template.name}</span>
                            <span className="font-mono text-[10px] font-bold text-[#60718c]">{template.dimensions.width} × {template.dimensions.height}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[#52627b]">{template.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {error && <p className="border border-[#b7483d] bg-[#fff4f2] px-3 py-2 text-sm text-[#8b2f29]">{error}</p>}

              <div className="mt-1 flex flex-wrap items-center justify-end gap-3 border-t border-[#b9c7d9] pt-5">
                <Button type="button" variant="ghost" onClick={onClose} className="rounded-sm text-[#4b5a70] hover:bg-[#dbe8f8] hover:text-[#111827]">
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting} className="gap-2 rounded-sm bg-[#183a8f] hover:bg-[#2451b2]">
                  {isSubmitting ? "Creating…" : "Create space"}
                  {!isSubmitting && <ArrowRight size={16} aria-hidden="true" />}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
