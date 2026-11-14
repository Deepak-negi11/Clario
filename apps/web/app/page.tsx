import type { CSSProperties } from "react";
import Image from "next/image";
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
  { index: "02", title: "Talk by proximity", body: "Walk up to a teammate and you're in range to talk; step away and the call ends. Your mic and camera stay off until you choose to turn them on.", glyph: "voice" },
  { index: "03", title: "Keep shared context", body: "Return through one link to the same persistent room, layout, and recent team conversation.", glyph: "clock" },
  { index: "04", title: "Collaborate without friction", body: "Use chat, reactions, and arrow-key movement without scheduling another call or opening another tool. Guests join from a link with just a name.", glyph: "chat" },
];

// Search-facing sections. The headings follow what people type into Google ("virtual office for
// remote teams", "virtual coworking space", "study with friends online", "gather alternative"),
// and every claim matches a feature in the app.
const offices: { name: string; body: string; image: string; alt: string; width: number; height: number; wide?: boolean }[] = [
  {
    name: "Clario HQ 3D",
    body: "Walk a whole office in 3D: meeting rooms, a kitchen, a demo stage, a game room and a hack space.",
    image: "/assets/maps/clario-hq-3d.png",
    alt: "Clario HQ 3D virtual office with meeting rooms, a lounge, a demo stage, a game room and a hack space",
    width: 1024,
    height: 576,
    wide: true,
  },
  {
    name: "Coworking Campus",
    body: "Team desk pods, lounges, meeting rooms, a café and a pond courtyard.",
    image: "/assets/maps/coworking-campus-v2.png",
    alt: "Pixel-art coworking campus with desk pods, a lounge, meeting rooms and a ping-pong table",
    width: 1024,
    height: 592,
  },
  {
    name: "Clario HQ",
    body: "The full 2D office: desks, a library, a tech wing, a coffee corner and cubicles.",
    image: "/assets/maps/clario-hq.png",
    alt: "Clario HQ 2D virtual office map with desks, meeting rooms, a kitchen and a tech wing",
    width: 1024,
    height: 594,
  },
  {
    name: "Classic Office",
    body: "Private offices, meeting rooms, a lounge, a café and a game corner.",
    image: "/assets/maps/classic-office-v2.png",
    alt: "Classic pixel-art office with private offices, meeting rooms and a lounge",
    width: 1024,
    height: 602,
  },
  {
    name: "Build your own",
    body: "Start from an empty plot and lay out walls, floors, rooms, furniture and outdoor buildings.",
    image: "/assets/maps/custom-office.png",
    alt: "Empty plot in the Clario office builder, ready for walls, rooms and furniture",
    width: 1024,
    height: 768,
  },
];

const useCases: { title: string; body: string }[] = [
  {
    title: "Virtual office for remote teams",
    body: "Give a distributed team one place to work. See who is at their desk, walk over to ask a quick question, and leave when you are done, without booking another meeting.",
  },
  {
    title: "Virtual coworking space",
    body: "Work next to friends or other freelancers with your mic off, then say hi when you take a break at the coffee machine.",
  },
  {
    title: "Team building games for remote teams",
    body: "The Game Room has Ping-pong, Breakout, Snake, Chair Sumo and Tetris. Use it for a Friday break or an onboarding icebreaker.",
  },
  {
    title: "Study with friends online",
    body: "Make a study room, share the link and keep the same desks every session. Talk to the friend beside you without disturbing everyone else.",
  },
  {
    title: "Hackathons and demo days",
    body: "Give each team its own room, then gather everyone at the demo stage, with a projector and a whiteboard in the room.",
  },
  {
    title: "A 3D office for AI agents",
    body: "AI coworkers live in the office and answer questions. Connect Claude Code, Codex or Cursor and teammates see what your coding agent is working on, right above your avatar.",
  },
];

const faqs: { question: string; answer: string }[] = [
  {
    question: "Is Clario free?",
    answer: "Yes. Creating a space, inviting your team, proximity voice and video, chat, screen sharing and the Game Room are free. AI coworkers give every account 20 free replies; after that you add your own key from NVIDIA, Google Gemini, Anthropic, OpenAI or OpenRouter.",
  },
  {
    question: "Do I need to download anything?",
    answer: "No. Clario runs in a desktop web browser. Open the link, pick an avatar and walk in.",
  },
  {
    question: "How does proximity voice chat work?",
    answer: "Walk your avatar up to a teammate and you can talk; step away and the call ends. Your mic and camera stay off until you choose to turn them on.",
  },
  {
    question: "Can guests join without an account?",
    answer: "Yes. Send them the space link and they join with just a name, no sign-up needed.",
  },
  {
    question: "Is Clario a Gather alternative?",
    answer: "Yes. Like Gather, Clario gives your team a shared map with avatars and proximity video. Clario also has a 3D office, AI coworkers, coding-agent status on avatars and a Game Room, and it is free.",
  },
  {
    question: "What are AI coworkers?",
    answer: "Characters in your office you can chat with. They answer questions, can read a GitHub link you share, and walk to a room when you ask them to.",
  },
  {
    question: "Can I design my own office?",
    answer: "Yes. Start from an empty plot and add walls, floors, rooms, furniture and outdoor buildings, or pick one of the ready-made 2D and 3D offices.",
  },
  {
    question: "Can my team see what my coding agent is doing?",
    answer: "Yes. Run one setup command and Claude Code, Codex or Cursor show a badge above your avatar while they work, with the project and branch.",
  },
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
      logo: `${SITE_URL}/icon-512.png`,
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: "A free virtual office for remote teams.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "A free virtual office for remote teams: walk around a 2D or 3D office, talk to teammates nearby, chat, play games and ask AI coworkers for help.",
      image: `${SITE_URL}/og-clario.png`,
      screenshot: `${SITE_URL}/og-clario.png`,
      featureList: [
        "Proximity voice and video",
        "Room chat and reactions",
        "Persistent 2D and 3D offices",
        "AI coworkers",
        "Office game room",
        "Guest links with just a name",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: faqs.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
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
              <h1 id="hero-title">
                <span>Work together like you’re</span>
                <em>in the same room.</em>
              </h1>
              <p className={styles.heroLead}>A free virtual office for remote teams. Move through a shared 2D or 3D space, talk when teammates are nearby, and return to the same room anytime.</p>
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
            <h2 id="how-title">One room.<br /><em>Three simple steps.</em></h2>
            <p>Walk up to teammates whenever a conversation needs to happen, in one persistent room you share with a link.</p>
          </div>
          <InteractiveHowItWorks />
        </section>

        <section id="features" className={styles.featureSection} aria-labelledby="feature-title">
          <div className={styles.featureIntro}>
            <h2 id="feature-title">Everything your team needs to feel <em>present.</em></h2>
          </div>
          <div className={styles.featureGrid}>
            {features.map(({ index, title, body, glyph }) => (
              <article key={index} className={styles.featureCard}>
                <div className={styles.featureCardTop}>
                  <PixelGlyph name={glyph} size={56} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="offices" className={styles.officeSection} aria-labelledby="offices-title">
          <div className={styles.sectionHeading}>
            <h2 id="offices-title">A 2D or 3D virtual office, <em>ready in a minute.</em></h2>
            <p>Pick a ready-made office or build your own. Every space keeps its layout, so your team comes back to the same desks each day.</p>
          </div>
          <div className={styles.officeGrid}>
            {offices.map(({ name, body, image, alt, width, height, wide }) => (
              <figure key={name} className={`${styles.officeCard} ${wide ? styles.officeWide : ""}`}>
                <div className={styles.officeShot}>
                  <Image src={image} alt={alt} width={width} height={height} sizes={wide ? "(max-width: 760px) 100vw, 60vw" : "(max-width: 760px) 100vw, 30vw"} />
                </div>
                <figcaption>
                  <h3>{name}</h3>
                  <p>{body}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="use-cases" className={styles.useSection} aria-labelledby="use-title">
          <div className={styles.useIntro}>
            <h2 id="use-title">One space, <em>many ways to use it.</em></h2>
            <p>Teams, friends, classes and clubs use Clario as their online office, coworking room or hangout.</p>
            <LandingPrimaryCta />
          </div>
          <ul className={styles.useList}>
            {useCases.map(({ title, body }) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.sectionHeading}>
            <h2 id="faq-title">Questions people <em>ask us.</em></h2>
            <p>Short answers about price, setup, guests and what is inside the office.</p>
          </div>
          <dl className={styles.faqList}>
            {faqs.map(({ question, answer }) => (
              <div key={question}>
                <dt>{question}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title">
          <div className={styles.finalInner}>
            <PixelGlyph name="avatar" size={44} className={styles.finalGlyph} />
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
            <a href="https://x.com/depx___" target="_blank" rel="noreferrer" aria-label="Deepak on X">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
              </svg>


            </a>
          </div>
        </div>
        <p className={styles.footerCredit}>
          Built with <span aria-hidden="true">❤️</span> by <a href="https://x.com/depx___" target="_blank" rel="noreferrer">Deepak</a>
        </p>
      </footer>
    </div>
  );
}
