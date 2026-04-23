import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 text-sm text-zinc-600 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <BrandMark compact />
          <p className="mt-2 max-w-md">
            Autopilot growth for <span className="font-medium text-zinc-800">all local businesses</span> — single
            location, multi-location, service-area, and online brands that need to earn local trust and convert better.
          </p>
        </div>
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Product</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/scan" className="font-medium text-zinc-900 hover:underline">
                Free scan
              </Link>
              <Link href="/#plans" className="hover:underline">
                Plans
              </Link>
              <Link href="/#how-it-works" className="hover:underline">
                How it works
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Industry examples</p>
            <div className="mt-2 flex flex-col gap-2 text-zinc-600">
              <Link href="/for-restaurants" className="hover:text-zinc-900 hover:underline">
                Restaurants
              </Link>
              <Link href="/for-bars" className="hover:text-zinc-900 hover:underline">
                Bars
              </Link>
              <Link href="/for-breweries" className="hover:text-zinc-900 hover:underline">
                Breweries
              </Link>
            </div>
          </div>
          <div className="flex flex-col justify-end">
            <Link
              href="/admin/login"
              className="text-xs font-medium text-zinc-400 hover:text-zinc-600 hover:underline"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
