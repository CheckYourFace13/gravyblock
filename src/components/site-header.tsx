"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { AdminShellNav } from "@/components/admin-shell-nav";
import { adminLogoutAction } from "@/app/actions/admin-login";

const links = [
  { href: "/pricing", label: "Pricing" },
  { href: "/compare", label: "Compare" },
  { href: "/industries", label: "Industries" },
  { href: "/guides", label: "Guides" },
];

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Announcement bar — replaced with an admin session indicator when logged in as admin */}
      {isAdmin ? (
        <div className="flex items-center justify-center gap-2 bg-zinc-900 px-4 py-2 text-center text-xs font-semibold text-white">
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
            Admin
          </span>
          <span className="text-zinc-300">Browsing with an admin session — customer promos are hidden.</span>
        </div>
      ) : (
        <div className="bg-zinc-900 px-4 py-2 text-center text-xs font-semibold text-white">
          <span className="text-red-400">Introductory pricing:</span>{" "}
          Use code <span className="font-bold text-white">INTRO50</span> at checkout for{" "}
          <span className="text-emerald-400">50% off your first month</span> — limited time.{" "}
          <Link href="/scan" className="underline underline-offset-2 hover:text-red-300">
            Start free →
          </Link>
        </div>
      )}
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
          <BrandMark compact />
          {/* Desktop nav — admin quick links when logged in as admin, marketing nav otherwise */}
          {isAdmin ? (
            <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:overflow-x-auto">
              <AdminShellNav variant="topbar" />
            </div>
          ) : (
            <nav className="hidden flex-wrap items-center justify-end gap-5 text-sm font-medium text-zinc-600 lg:flex">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="transition hover:text-zinc-900">
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin ? (
              <form action={adminLogoutAction}>
                <button
                  type="submit"
                  className="hidden rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 sm:inline"
                >
                  Log out
                </button>
              </form>
            ) : (
              <>
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
              </>
            )}
            {/* Mobile hamburger */}
            <button
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
              )}
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        {menuOpen && (
          <nav className="border-t border-zinc-100 bg-white px-4 pb-4 pt-2 lg:hidden">
            {isAdmin ? (
              <>
                <AdminShellNav variant="mobile" />
                <form action={adminLogoutAction}>
                  <button
                    type="submit"
                    className="mt-1 block py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
                  >
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2.5 text-sm font-medium text-zinc-700 hover:text-zinc-900"
                  >
                    {l.label}
                  </Link>
                ))}
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Log in
                </Link>
              </>
            )}
          </nav>
        )}
      </header>
    </>
  );
}
