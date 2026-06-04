import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-fom",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KI Seminararbeiten-Generator",
  description: "Generiere vollständige Seminararbeiten mit KI-Unterstützung",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={dmSans.variable}>
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
