import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cold Call Trainer",
  description: "Practise cold calls against AI prospects and get coached on every one.",
};

const NAV = [
  { href: "/", label: "Practise" },
  { href: "/personas", label: "Prospects" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Your pitch" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-edge py-5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-base text-ink">
                ☎
              </span>
              <span className="text-base font-semibold tracking-tight">Cold Call Trainer</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-edge hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-edge py-5 text-xs text-muted">
            Internal sales enablement tool. Practice calls only — no real prospects are dialled.
          </footer>
        </div>
      </body>
    </html>
  );
}
