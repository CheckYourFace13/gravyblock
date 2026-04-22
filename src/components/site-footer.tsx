import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 text-sm text-zinc-600 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <BrandMark compact />
          <p className="mt-2 max-w-md">
            Autopilot growth for local businesses, multi-location brands, service-area operators, and online businesses
            building local trust — scans, roadmaps, monitoring hooks, and recurring execution queues.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/scan" className="font-medium text-zinc-900 hover:underline">
            Free scan
          </Link>
          <Link href="/#plans" className="hover:underline">
            Plans
          </Link>
          <Link href="/#how-it-works" className="hover:underline">
            How it works
          </Link>
          <Link href="/for-bars" className="hover:underline">
            Bars
          </Link>
          <Link href="/for-restaurants" className="hover:underline">
            Restaurants
          </Link>
          <Link href="/for-breweries" className="hover:underline">
            Breweries
          </Link>
        </div>
      </div>
    </footer>
  );
}
