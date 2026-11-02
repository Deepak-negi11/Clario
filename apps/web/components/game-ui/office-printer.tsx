"use client";

/* eslint-disable @next/next/no-img-element -- Device-local blob images must stay local and retain their print dimensions. */

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Printer, Upload, X } from "lucide-react";
import { useMapOverlay } from "../../hooks/use-map-overlay";
import {
  PRINT_TEXT_LIMIT,
  printableFileError,
} from "../../lib/printing/document";
import type { SceneBridge } from "../phaser/scene-bridge";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a6ee8]";
export function OfficePrinter({
  bridgeRef,
}: {
  bridgeRef: RefObject<SceneBridge>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Meeting notes");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileVersion = useRef(0);
  useEffect(() => {
    const bridge = bridgeRef.current;
    const show = () => {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      setStatus("");
      setError("");
    };
    bridge.openPrinter = show;
    return () => {
      if (bridge.openPrinter === show) bridge.openPrinter = undefined;
    };
  }, [bridgeRef]);
  useMapOverlay(bridgeRef, "printer", open);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    return () => {
      triggerRef.current?.focus();
    };
  }, [open, bridgeRef]);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  const choose = async (file: File | undefined) => {
    if (!file) return;
    const version = ++fileVersion.current;
    setStatus("");
    const problem = printableFileError(file);
    setError(problem ?? "");
    if (problem) return;
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
    if (file.type === "text/plain") {
      const value = await file.text();
      if (version !== fileVersion.current) return;
      if (value.length > PRINT_TEXT_LIMIT) {
        setError("Choose a text file with fewer than 40,000 characters.");
        return;
      }
      setText(value);
      setImage(null);
    } else {
      setImage(URL.createObjectURL(file));
      setText("");
    }
    setTitle(name);
  };
  const ready = !!text.trim() || !!image;
  return (
    <>
      {open && (
        <div
          className="absolute inset-0 z-[100] grid place-items-center bg-[#12151c]/40 p-3 backdrop-blur-sm"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "Tab") {
              const fields = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled),input:not([type="file"]),textarea,a[href]',
                ),
              ];
              const first = fields[0],
                last = fields.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[calc(100dvh-2rem)] w-[min(52rem,100%)] flex-col overflow-hidden rounded-3xl bg-white text-[#12151c] shadow-2xl ring-1 ring-white/50"
          >
            <header className="flex items-center gap-3 border-b border-black/5 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8effd] text-[#3a6ee8]">
                <Printer size={20} />
              </span>
              <div className="flex-1">
                <h2 id={titleId} className="text-base font-semibold">
                  Office printer
                </h2>
                <p className="mt-0.5 text-xs text-[#5c6371]">
                  Your document stays on this device.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close printer"
                onClick={() => setOpen(false)}
                className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl hover:bg-black/5 ${focus}`}
              >
                <X size={18} />
              </button>
            </header>
            <div className="grid min-h-0 gap-5 overflow-y-auto p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <p className="text-[13px] leading-5 text-[#5c6371]">
                  Write a note or choose a text file or image. In the print
                  dialog, select the office printer connected to your computer,
                  or save a PDF.
                </p>
                <label className="text-xs font-semibold">
                  Document title
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`mt-1 block h-10 w-full rounded-xl border border-[#d5d8de] bg-white px-3 text-sm font-normal ${focus}`}
                  />
                </label>
                {!image && (
                  <label className="text-xs font-semibold">
                    Notes
                    <textarea
                      value={text}
                      maxLength={PRINT_TEXT_LIMIT}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Agenda, decisions, action items…"
                      rows={8}
                      className={`mt-1 block w-full resize-y rounded-xl border border-[#d5d8de] bg-white p-3 text-sm font-normal leading-6 ${focus}`}
                    />
                  </label>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="text/plain,image/png,image/jpeg,image/webp"
                  className="hidden"
                  aria-label="Document to print"
                  onChange={(e) => {
                    void choose(e.target.files?.[0]).catch(() =>
                      setError(
                        "Could not read this file. Please choose it again.",
                      ),
                    );
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d5d8de] px-3 text-xs font-semibold hover:bg-[#f4f5f7] ${focus}`}
                >
                  <Upload size={14} />
                  Choose a local file
                  <span className="font-normal opacity-60">up to 8 MB</span>
                </button>
                {image && (
                  <button
                    type="button"
                    className={`text-left text-xs underline ${focus}`}
                    onClick={() => {
                      fileVersion.current++;
                      setImage(null);
                    }}
                  >
                    Remove image and write notes
                  </button>
                )}
                {error && (
                  <p role="alert" className="text-xs text-[#a23c39]">
                    {error}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-[#f4f5f7] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#8a909b]">
                  <FileText size={12} />
                  Print preview
                </p>
                <article
                  aria-label="Document print preview"
                  className="min-h-64 overflow-hidden rounded-sm bg-white p-6 shadow-sm"
                >
                  <h3 className="break-words font-serif text-xl text-[#12151c]">
                    {title || "Untitled document"}
                  </h3>
                  {image ? (
                    <img
                      src={image}
                      alt="Selected print document"
                      className="mt-4 max-h-96 w-full object-contain"
                    />
                  ) : (
                    <p className="mt-4 whitespace-pre-wrap break-words text-[12px] leading-6 text-[#404040]">
                      {text || "Your notes will appear here."}
                    </p>
                  )}
                </article>
              </div>
            </div>
            <footer className="border-t border-black/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xs text-[11px] leading-4 text-[#5c6371]">
                  Add your printer in your computer’s printer settings first.
                  Printer choice and copies are handled in the print dialog.
                </p>
                <div className="flex gap-2">
                  {!image && ready && (
                    <a
                      download={`${(title || "notes").replace(/[^a-z0-9 -]/gi, "").slice(0, 80)}.txt`}
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${title}\n\n${text}`)}`}
                      className={`grid h-10 w-10 place-items-center rounded-xl border border-[#d5d8de] ${focus}`}
                      aria-label="Download notes"
                    >
                      <Download size={15} />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => {
                      setStatus(
                        "Choose your printer in the print dialog. Closing the dialog does not confirm that a document printed.",
                      );
                      try {
                        window.print();
                      } catch {
                        setError(
                          "Open this office in your normal browser to print, or download the notes.",
                        );
                      }
                    }}
                    className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#3a6ee8] px-4 text-xs font-semibold text-white hover:bg-[#2f5ed0] disabled:cursor-default disabled:opacity-40 ${focus}`}
                  >
                    <Printer size={14} />
                    Choose printer & print
                  </button>
                </div>
              </div>
              {status && (
                <p role="status" className="mt-2 text-xs text-[#5c6371]">
                  {status}
                </p>
              )}
            </footer>
          </section>
        </div>
      )}
      {open &&
        createPortal(
          <article id="clario-print-document" className="hidden">
            <h1>{title || "Untitled document"}</h1>
            {image ? <img src={image} alt="Print document" /> : <p>{text}</p>}
          </article>,
          document.body,
        )}
      <style>{`@media print { @page { margin: 18mm; } body:has(#clario-print-document) > *:not(#clario-print-document) { display: none !important; } #clario-print-document { display: block !important; color: #111; background: white; font: 12pt/1.6 Georgia,serif; } #clario-print-document h1 { font: bold 22pt/1.2 Georgia,serif; margin: 0 0 18pt; overflow-wrap: anywhere; } #clario-print-document p { white-space: pre-wrap; overflow-wrap: anywhere; } #clario-print-document img { max-width: 100%; max-height: 245mm; object-fit: contain; } }`}</style>
    </>
  );
}
