import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#ai-search", label: "AI search" },
  { href: "/for-bars", label: "Bars" },
  { href: "/for-restaurants", label: "Restaurants" },
  { href: "/for-breweries", label: "Breweries" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandMark compact />
        <nav className="hidden flex-wrap items-center justify-end gap-4 text-sm font-medium text-zinc-600 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-zinc-900">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/#plans"
            className="hidden rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-800 hover:border-zinc-300 sm:inline"
          >
            Plans
          </Link>
          <Link
            href="/scan"
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-500 sm:px-4 sm:text-sm"
          >
            Free scan
          </Link>
        </div>
      </div>
    </header>
  );
}
