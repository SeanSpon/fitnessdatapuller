import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeanOS Health Hub",
  description: "Read-only health data hub for Samsung Health, Cronometer, and Hevy.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
