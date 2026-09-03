"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppNav from "./AppNav";
import RepPicker from "./RepPicker";

/**
 * The app chrome. TV mode renders bare — a wall display has no room for
 * navigation and nobody is going to click it — so the shell steps aside there
 * rather than the TV page fighting a layout it cannot remove.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/tv")) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-edge py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-base text-ink">
            ▲
          </span>
          <span className="text-base font-semibold tracking-tight">Sales Floor</span>
        </Link>
        <AppNav />
        <div className="flex items-center gap-2">
          <RepPicker />
          <Link
            href="/tv"
            className="btn-ghost !px-2.5 !py-1.5 text-xs"
            title="Full-screen board for the office display"
          >
            TV mode
          </Link>
        </div>
      </header>
      <main className="flex-1 py-8">{children}</main>
      <footer className="border-t border-edge py-5 text-xs text-muted">
        Internal sales enablement. Practice calls are simulations — no real prospects are dialled.
      </footer>
    </div>
  );
}
