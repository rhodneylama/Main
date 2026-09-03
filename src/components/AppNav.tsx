"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Floor" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/competitions", label: "Competitions" },
  { href: "/training", label: "Training" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-edge font-medium text-white"
                : "text-slate-400 hover:bg-edge hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
