import type { CSSProperties } from "react";
import { ArrowDown } from "lucide-react";
import { BrandLogo } from "../components/brand-logo";
import { LandingHeader, LandingPrimaryCta } from "../components/landing/landing-header";
import { GlobalCursorAvatar } from "../components/landing/global-cursor-avatar";
import { InteractiveHowItWorks } from "../components/landing/interactive-how-it-works";
import { PixelGlyph, type GlyphName } from "../components/landing/pixel-glyph";
import { GITHUB_URL, SITE_NAME, SITE_URL } from "../lib/site";
import styles from "./landing.module.css";

const crew = [
  { name: "adam", label: "Arjun" },
  { name: "amelia", label: "Priya" },
  { name: "bob", label: "Rahul" },
  { name: "alex", label: "Neha" },
] as const;

const features: { index: string; title: string; body: string; glyph: GlyphName }[] = [
  { index: "01", title: "See presence in real time", body: "Know who is available and where conversations are happening inside the shared 2D room.", glyph: "pin" },
  { index: "02", title: "Talk by proximity", body: "Voice and video begin when teammates move close, then disconnect naturally when they step away.", glyph: "voice" },
  { index: "03", title: "Keep shared context", body: "Return through one link to the same persistent room, layout, and recent team conversation.", glyph: "clock" },
  { index: "04", title: "Collaborate without friction", body: "Use chat, reactions, and keyboard controls without scheduling another call or opening another tool.", glyph: "chat" },
];

const heroTags: { label: string; glyph: GlyphName }[] = [
  { label: "Proximity voice", glyph: "voice" },
  { label: "Room chat", glyph: "chat" },
  { label: "Persistent rooms", glyph: "clock" },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/clario-mark.svg`,
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: "A shared 2D spatial workspace for remote teams.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "A shared 2D spatial workspace where remote teams move together, talk by proximity, chat, and return to the same persistent room.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function Home() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <a href="#main-content" className={styles.skipLink}>Skip to content</a>
      <LandingHeader />
      <GlobalCursorAvatar />

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGrid}>
            <div className={styles.heroContent}>
              <p className={styles.eyebrow}><i aria-hidden="true" /> Spatial workspace for remote teams</p>
              <h1 id="hero-title">
                <span>Work together like you’re</span>
                <em>in the same room.</em>
              </h1>
              <p className={styles.heroLead}>Move through a shared 2D space, talk when teammates are nearby, and return to the same room anytime.</p>
              <div className={styles.heroActions}>
                <LandingPrimaryCta />
                <a href="#how-it-works" className={styles.secondaryCta}>See how it works <ArrowDown size={16} aria-hidden="true" /></a>
              </div>
              <ul className={styles.heroTags} aria-label="What every room includes">
                {heroTags.map(({ label, glyph }) => (
                  <li key={label}><PixelGlyph name={glyph} size={15} shimmer={false} /> {label}</li>
                ))}
              </ul>
            </div>
            <ul className={styles.heroCrew} aria-hidden="true">
              {crew.map(({ name, label }, index) => (
                <li key={name} style={{ "--crew-delay": `${index * -0.35}s` } as CSSProperties}>
                  <b>{label}</b>
                  <span className={styles.crewSprite} style={{ backgroundImage: `url('/assets/${name}-run.png')` }} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className={styles.howSection} aria-labelledby="how-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-title">One room.<br /><em>Three simple steps.</em></h2>
            <p>Create one persistent workspace, share its link, and walk up to teammates whenever a conversation needs to happen.</p>
          </div>
          <InteractiveHowItWorks />
        </section>

        <section id="features" className={styles.featureSection} aria-labelledby="feature-title">
          <div className={styles.featureIntro}>
            <p className={styles.eyebrow}>Built for presence</p>
            <h2 id="feature-title">Everything your team needs to feel <em>present.</em></h2>
          </div>
          <div className={styles.featureGrid}>
            {features.map(({ index, title, body, glyph }) => (
              <article key={index} className={styles.featureCard}>
                <div className={styles.featureCardTop}>
                  <PixelGlyph name={glyph} size={56} />
                  <span>{index}</span>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title">
          <div className={styles.finalInner}>
            <PixelGlyph name="avatar" size={44} className={styles.finalGlyph} />
            <p className={styles.eyebrow}>Your team has enough tools</p>
            <h2 id="final-title">Now give them <em>a place.</em></h2>
            <p>Bring your team into one shared room where conversation feels visible, immediate, and human.</p>
            <LandingPrimaryCta />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerLeft}>
            <BrandLogo markSize={20} className={styles.footerLogo} />
            <span className={styles.footerDivider} aria-hidden="true" />
            <p className={styles.footerCopy}>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
          </div>
          <div className={styles.footerSocial}>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label={`${SITE_NAME} on GitHub`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.03 11.03 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
            <a href="https://x.com/depx_____" target="_blank" rel="noreferrer" aria-label="Deepak on X">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
              </svg>


            </a>
          </div>
        </div>
        <p className={styles.footerCredit}>
          Built with <span aria-hidden="true">❤️</span> by <a href="https://x.com/depx_____" target="_blank" rel="noreferrer">Deepak</a>
        </p>
      </footer>
    </div>
  );
}
