import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofTrace · Every verdict has a paper trail",
  description:
    "A glass-box AML investigator powered by NVIDIA Nemotron and Zetaris. Follow every tool call and verify every claim.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
