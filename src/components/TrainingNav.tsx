"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/training", label: "Library" },
  { href: "/training/practice", label: "Practice call" },
  { href: "/training/personas", label: "Prospects" },
  { href: "/training/history", label: "Call history" },
];

export default function TrainingNav() {
  const pathname = usePathname();

  return (
    <div className="scroll-x border-b border-edge">
      <nav className="flex gap-1 pb-px">
        {TABS.map((tab) => {
          const active =
            tab.href === "/training" ? pathname === "/training" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-accent font-medium text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
