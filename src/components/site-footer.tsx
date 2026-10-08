import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SUPPORT_EMAIL } from "@/lib/company";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 text-sm text-zinc-600 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xs">
          <BrandMark compact />
          <p className="mt-2">
            GravyBlock is software that learns a local business, decides what will help it get found on Google, and does
            that work automatically.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Questions?{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-zinc-700 hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Product</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/scan" className="font-medium text-zinc-900 hover:underline">
                Free scan
              </Link>
              <Link href="/how-it-works" className="hover:underline">
                How it works
              </Link>
              <Link href="/features" className="hover:underline">
                Features
              </Link>
              <Link href="/pricing" className="hover:underline">
                Pricing
              </Link>
              <Link href="/proof" className="hover:underline">
                Proof
              </Link>
              <Link href="/login" className="hover:underline">
                Customer login
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resources</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/blog" className="hover:underline">
                Blog
              </Link>
              <Link href="/guides" className="hover:underline">
                Guides
              </Link>
              <Link href="/glossary" className="hover:underline">
                SEO glossary
              </Link>
              <Link href="/tools" className="hover:underline">
                Free tools
              </Link>
              <Link href="/industries" className="hover:underline">
                By industry
              </Link>
              <Link href="/local-seo" className="hover:underline">
                By city
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Compare</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/compare/gravyblock-vs-local-seo-agencies" className="hover:underline">
                vs local SEO agencies
              </Link>
              <Link href="/compare/gravyblock-vs-brightlocal" className="hover:underline">
                vs BrightLocal
              </Link>
              <Link href="/compare/gravyblock-vs-semrush-local" className="hover:underline">
                vs Semrush Local
              </Link>
              <Link href="/compare/gravyblock-vs-yext" className="hover:underline">
                vs Yext
              </Link>
              <Link href="/compare" className="font-medium text-zinc-900 hover:underline">
                All comparisons
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Help</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/faq" className="hover:underline">
                FAQ
              </Link>
              <Link href="/support" className="hover:underline">
                Support
              </Link>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Company</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-500 sm:px-6">
        <span>© {new Date().getFullYear()} GravyBlock. All rights reserved.</span>
        <span className="mx-2 text-zinc-300">·</span>
        <Link href="/admin/login" className="text-zinc-400 hover:text-zinc-600 hover:underline">
          Staff
        </Link>
      </div>
    </footer>
  );
}
