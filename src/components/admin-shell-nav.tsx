"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/outreach", label: "🎯 Outreach" },
  { href: "/admin/autopilot", label: "Autopilot" },
  { href: "/admin/mrr", label: "MRR" },
];

function linkClass(href: string, pathname: string | null, variant: "sidebar" | "mobile" | "topbar") {
  const active = href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href) ?? false;
  if (variant === "topbar") {
    return active
      ? "whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
      : "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900";
  }
  return active
    ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-900"
    : "rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900";
}

export function AdminShellNav({ variant }: { variant: "sidebar" | "mobile" | "topbar" }) {
  const pathname = usePathname();
  const listClass =
    variant === "topbar"
      ? "flex flex-wrap items-center gap-1"
      : variant === "sidebar"
      ? "flex flex-col gap-0.5"
      : "flex flex-col gap-0.5 pb-2";

  return (
    <nav aria-label="Admin" className={listClass}>
      {ADMIN_NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass(item.href, pathname, variant)}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
