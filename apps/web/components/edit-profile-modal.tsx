"use client";

import { type FormEvent, useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@repo/ui/button";
import { getAuthToken, saveAuthEmail, getAuthEmail } from "../lib/auth-token";
import { updateProfile } from "../lib/auth-api";

type EditProfileModalProps = {
  open: boolean;
  onClose: () => void;
  onUpdated: (newUsername: string, newEmail: string) => void;
};

export function EditProfileModal({ open, onClose, onUpdated }: EditProfileModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(false);
      setEmail(getAuthEmail() || "");

      const savedUsername = localStorage.getItem("metaverse:username") || "";
      setUsername(savedUsername);
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const token = getAuthToken();
    if (!token) {
      setError("You are not signed in.");
      return;
    }

    if (!username.trim()) {
      setError("Username cannot be empty.");
      return;
    }

    if (!email.trim()) {
      setError("Email cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProfile(token, { username, email });
      saveAuthEmail(email);
      localStorage.setItem("metaverse:username", username);
      onUpdated(username, email);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243a]/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        className="w-full max-w-md border-2 border-[#111827]  bg-[#f8fbff]  p-5 shadow-[0_24px_60px_-28px_rgba(24,32,56,0.45)]  sm:p-7 text-[#111827] "
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b-2 border-[#111827]  pb-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#183a8f] ">ACCOUNT SETTINGS</p>
            <h2 id="edit-profile-title" className="mt-2 text-2xl font-bold tracking-[-0.04em]">Edit Profile</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#5e708a]  transition-colors hover:bg-gray-100  rounded-sm" aria-label="Close dialog">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-username" className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866] ">
              USERNAME / NAME
            </label>
            <input
              id="edit-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              className="h-11 border-2 border-[#9eafc6]  bg-white  px-3 text-sm text-[#111827]  outline-none focus:border-[#183a8f]  transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-email" className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866] ">
              EMAIL ADDRESS
            </label>
            <input
              id="edit-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="h-11 border-2 border-[#9eafc6]  bg-white  px-3 text-sm text-[#111827]  outline-none focus:border-[#183a8f]  transition-colors"
            />
          </div>

          {error && (
            <p className="border border-[#b7483d] bg-[#fff5f3]  px-3 py-2 text-xs text-[#8b2f29]  font-semibold">
              {error}
            </p>
          )}

          {success && (
            <p className="flex items-center gap-1.5 border border-[#1aa385] bg-[#f0fdfa]  px-3 py-2 text-xs text-[#1aa385] font-semibold">
              <Check size={14} />
              Profile updated successfully!
            </p>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-sm border border-[#9eafc6] bg-white  px-4 text-sm font-semibold text-[#4b5a70]  transition hover:bg-gray-50 "
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-sm bg-[#183a8f]  px-5 text-sm font-bold text-white   transition hover:bg-[#2451b2]  disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
