"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/autopilot", label: "Autopilot" },
];

function linkClass(href: string, pathname: string | null) {
  const active = href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href) ?? false;
  return active
    ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-900"
    : "rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900";
}

export function AdminShellNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const listClass = variant === "sidebar" ? "flex flex-col gap-0.5" : "flex flex-col gap-0.5 pb-2";

  return (
    <nav aria-label="Admin" className={listClass}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass(item.href, pathname)}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
