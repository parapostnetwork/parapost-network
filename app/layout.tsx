import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ParapostPreferencesProvider from "@/components/ParapostPreferencesProvider";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Parapost Network",
  description:
    "Parapost Network is a paranormal-friendly social platform for posts, profiles, friends, Parapost Reels, Showcases, Parachat, and community connection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-parapost-accent="parapost-purple"
      data-parapost-font="parapost-default"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased parapost-font-default`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <ParapostPreferencesProvider>{children}</ParapostPreferencesProvider>
      </body>
    </html>
  );
}