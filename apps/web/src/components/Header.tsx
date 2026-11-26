"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/", label: "Verify" },
  { href: "/companies", label: "Promise Scores" },
  { href: "/me", label: "My offers" },
  { href: "/employer", label: "Employers" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Pakka home">
      <span
        aria-hidden
        className="grid place-items-center size-8 rounded-lg border-[3px] border-double border-accent text-accent font-display font-bold text-lg -rotate-6"
      >
        P
      </span>
      <span className="font-display font-bold text-xl tracking-tight">Pakka</span>
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-sunk text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
      <nav className="md:hidden flex gap-1 overflow-x-auto px-4 pb-2 -mt-1" aria-label="Main">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${active ? "bg-sunk text-ink" : "text-muted"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
