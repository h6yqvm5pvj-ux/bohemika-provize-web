import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { PwaBootstrap } from "@/components/PwaBootstrap";
import { ClientCardPrivacyCleanup } from "@/components/ClientCardPrivacyCleanup";
import { ContractTerminationPrivacyCleanup } from "@/components/ContractTerminationPrivacyCleanup";
import { MeetingRecordPrivacyCleanup } from "@/components/MeetingRecordPrivacyCleanup";

export const metadata: Metadata = {
  metadataBase: new URL("https://bohemka.app"),
  title: "Bohemika SmartApp",
  description: "Webová verze",
  manifest: "/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bohemika SmartApp",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonces are request-specific; never reuse statically generated HTML.
  await connection();
  return (
    <html lang="cs">
      <body className="antialiased">
        <ClientCardPrivacyCleanup />
        <ContractTerminationPrivacyCleanup />
        <MeetingRecordPrivacyCleanup />
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
