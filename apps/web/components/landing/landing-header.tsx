"use client";

import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAuthToken } from "../../lib/auth-token";
import { BrandLogo } from "../brand-logo";
import { GITHUB_URL } from "../../lib/site";
import styles from "../../app/landing.module.css";

export function LandingHeader() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setIsLoggedIn(Boolean(getAuthToken()));
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const destination = isLoggedIn ? "/spaces" : "/signup";
  const label = isLoggedIn ? "Open your spaces" : "Create a space";

  return (
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Clario home">
          <BrandLogo className={styles.brandLogo} />
        </Link>
        <nav className={styles.desktopNav} aria-label="Landing page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className={styles.headerActions}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.githubLink}
            aria-label="Clario on GitHub"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
              <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
            </svg>
          </a>
          {!isLoggedIn && <Link href="/signin" className={styles.signInLink}>Sign in</Link>}
          <Link href={destination} className={styles.headerCta}>{label}<ArrowUpRight size={16} /></Link>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="landing-mobile-nav" className={styles.mobileNav} aria-label="Mobile navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          {!isLoggedIn && <Link href="/signin">Sign in</Link>}
          <Link href={destination} className={styles.mobileNavCta} onClick={() => setMenuOpen(false)}>{label}</Link>
        </nav>
      )}
    </header>
  );
}

export function LandingPrimaryCta({ className = "" }: { className?: string }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => setIsLoggedIn(Boolean(getAuthToken())), []);

  return (
    <Link href={isLoggedIn ? "/spaces" : "/signup"} className={`${styles.primaryCta} ${className}`}>
      {isLoggedIn ? "Open your spaces" : "Create a space"}
      <ArrowUpRight size={18} />
    </Link>
  );
}
