import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const links = [
  { href: "/#plans", label: "Pricing" },
  { href: "/compare", label: "Compare" },
  { href: "/industries", label: "Industries" },
  { href: "/guides", label: "Guides" },
];

export function SiteHeader() {
  return (
    <>
      {/* Announcement bar */}
      <div className="bg-zinc-900 px-4 py-2 text-center text-xs font-semibold text-white">
        <span className="text-red-400">Introductory pricing:</span>{" "}
        Use code <span className="font-bold text-white">INTRO50</span> at checkout for{" "}
        <span className="text-emerald-400">50% off your first month</span> — limited time.{" "}
        <Link href="/scan" className="underline underline-offset-2 hover:text-red-300">
          Start free →
        </Link>
      </div>
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
          <BrandMark compact />
          <nav className="hidden flex-wrap items-center justify-end gap-5 text-sm font-medium text-zinc-600 lg:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="transition hover:text-zinc-900">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 sm:inline"
            >
              Log in
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
    </>
  );
}
