import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GlobalAppShell } from "../components/global-app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amber HQ",
  description: "Amber HQ Home Command Center",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body><GlobalAppShell>{children}</GlobalAppShell></body>
    </html>
  );
}
