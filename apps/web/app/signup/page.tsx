"use client";

import Link from "next/link";
import { BrandLogo } from "../../components/brand-logo";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { TextField } from "../../components/TextField";
import { signinUser, signupUser } from "../../lib/auth-api";
import { getAuthToken, saveAuthToken, saveAuthEmail } from "../../lib/auth-token";
import { captureEvent } from "../../lib/analytics";
import { useEffect } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.replace("/spaces");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    captureEvent("signup_started");

    try {
      await signupUser({ username, email, password });
      captureEvent("signup_completed");
      const { token } = await signinUser({ email, password });
      saveAuthToken(token);
      saveAuthEmail(email);
      router.push("/spaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#dbe8f8] p-4 sm:p-7">
      <div className="w-full max-w-md border-2 border-[#111827] bg-[#f8fbff] p-6 shadow-[8px_8px_0_#183a8f] sm:p-8">
        <Link href="/" aria-label="Back to Clario home" className="inline-flex items-center gap-2 text-[#183a8f] transition-opacity hover:opacity-75">
          <span aria-hidden="true">←</span>
          <BrandLogo markSize={26} className="text-[1.35rem] text-[#111827]" />
        </Link>
        <p className="mt-8 font-mono text-xs font-bold tracking-[0.1em] text-[#183a8f]">MAKE A PLACE</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.05em] text-[#111827]">Start your space.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[#52627b]">Create an account, then give your team a room to walk into.</p>

        <form className="mt-7 flex flex-col gap-5" onSubmit={handleSubmit}>
          <TextField
            id="username"
            label="Username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={30}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <TextField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={30}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          {error ? <p className="border border-[#b7483d] bg-[#fff4f2] px-3 py-2 text-sm text-[#8b2f29]">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 bg-[#183a8f] px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_#111827] transition hover:translate-x-px hover:translate-y-px hover:bg-[#2451b2] hover:shadow-[2px_2px_0_#111827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#183a8f] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
            {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>

        <p className="mt-7 border-t border-[#b9c7d9] pt-5 text-sm text-[#52627b]">
          Already have an account?{" "}
          <Link href="/signin" className="font-bold text-[#183a8f] underline decoration-[#8da6c9] underline-offset-4 hover:text-[#111827]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
