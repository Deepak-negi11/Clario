import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { DM_Serif_Display, IBM_Plex_Mono, Manrope, DM_Sans, Pixelify_Sans, Geist, Geist_Mono } from "next/font/google";
import { SITE_NAME, SITE_URL } from "../lib/site";
import "./globals.css";
import { ThemeProvider } from "../components/theme-provider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans-google",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "400",
});

const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const siteUrl = new URL(SITE_URL);
// The search-result title leads with what people search for ("virtual office"); the share
// cards keep the tagline.
const siteTitle = `${SITE_NAME}: free virtual office for remote teams`;
const shareTitle = `${SITE_NAME} — Work together like you’re in the same room`;
const siteDescription =
  "Clario is a free virtual office for remote teams: walk around a 2D or 3D office, talk to teammates nearby, chat, play games and ask AI coworkers for help.";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: SITE_NAME,
  title: {
    default: siteTitle,
    template: `%s · ${SITE_NAME}`,
  },
  description: siteDescription,
  keywords: ["virtual office", "online office", "remote teams", "spatial workspace", "proximity chat", "3D virtual office", "AI coworkers", "team collaboration"],
  authors: [{ name: SITE_NAME, url: siteUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "productivity",
  alternates: {
    canonical: "/",
  },
  // /favicon.ico comes from app/favicon.ico. iPhones ignore SVG touch icons, so apple is a PNG.
  icons: {
    icon: [
      { url: "/clario-mark.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: shareTitle,
    description: siteDescription,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-clario.png", width: 1200, height: 630, alt: `${SITE_NAME} spatial workspace for remote teams` }],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@depx___",
    title: shareTitle,
    description: siteDescription,
    images: ["/og-clario.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes sets data-theme on <html> before React loads, so the server's copy differs.
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${ibmPlexMono.variable} ${dmSerif.variable} ${dmSans.variable} ${pixelify.variable} ${geist.variable} ${geistMono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Vercel Web Analytics: page views, no cookies. Turn it on in the Vercel project (Analytics tab). */}
        <Analytics />
      </body>
    </html>
  );
}
