import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-mono-latin.woff2",
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Code Golf Arena",
    template: "%s · Code Golf Arena",
  },
  description:
    "Race to write the shortest accepted solution in a realtime code golf room.",
  applicationName: "Code Golf Arena",
  openGraph: {
    title: "Code Golf Arena",
    description:
      "Realtime multiplayer and solo code golf with live judging and match replays.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
