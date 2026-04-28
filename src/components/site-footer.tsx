import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { CtaLeadForm } from "@/components/cta-lead-form";
import { getBuildVersion } from "@/lib/build-metadata";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 text-sm text-zinc-600 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <BrandMark compact />
          <p className="mt-2 max-w-md">
            Autopilot local SEO for <span className="font-medium text-zinc-800">small and local businesses</span>: single
            location, multi-location, service-area, and online brands that need to rank higher and convert better.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            <Link href="#contact" className="font-medium text-zinc-700 hover:underline">
              Support / contact
            </Link>{" "}
            — product help and access questions only.
          </p>
        </div>
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
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
              <Link href="/login" className="hover:underline">
                Customer login
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Guides</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/guides" className="hover:underline">
                All guides
              </Link>
              <Link href="/guides/multi-location-local-seo" className="hover:underline">
                Multi-location SEO
              </Link>
              <Link href="/guides/ai-search-local-businesses" className="hover:underline">
                AI search visibility
              </Link>
              <Link href="/guides/how-to-rank-higher-in-google-maps" className="hover:underline">
                Maps ranking guide
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">By industry</p>
            <div className="mt-2 flex flex-col gap-1.5 text-zinc-600">
              <Link href="/for-plumbers" className="hover:text-zinc-900 hover:underline">Plumbers</Link>
              <Link href="/for-dentists" className="hover:text-zinc-900 hover:underline">Dentists</Link>
              <Link href="/for-lawyers" className="hover:text-zinc-900 hover:underline">Law firms</Link>
              <Link href="/for-contractors" className="hover:text-zinc-900 hover:underline">Contractors</Link>
              <Link href="/for-real-estate-agents" className="hover:text-zinc-900 hover:underline">Real estate agents</Link>
              <Link href="/for-salons" className="hover:text-zinc-900 hover:underline">Salons and spas</Link>
              <Link href="/for-restaurants" className="hover:text-zinc-900 hover:underline">Restaurants</Link>
              <Link href="/for-chiropractors" className="hover:text-zinc-900 hover:underline">Chiropractors</Link>
              <Link href="/industries" className="font-medium text-zinc-900 hover:underline">All industries</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Local SEO</p>
            <div className="mt-2 flex flex-col gap-2 text-zinc-600">
              <Link href="/local-seo" className="font-medium text-zinc-900 hover:underline">
                All cities &amp; industries
              </Link>
              <Link href="/local-seo/austin-tx/restaurant" className="hover:text-zinc-900 hover:underline">
                Restaurants in Austin
              </Link>
              <Link href="/local-seo/dallas-tx/dentist" className="hover:text-zinc-900 hover:underline">
                Dentists in Dallas
              </Link>
              <Link href="/local-seo/miami-fl/attorney" className="hover:text-zinc-900 hover:underline">
                Attorneys in Miami
              </Link>
              <Link href="/local-seo/chicago-il/plumber" className="hover:text-zinc-900 hover:underline">
                Plumbers in Chicago
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Free tools</p>
            <div className="mt-2 flex flex-col gap-2 text-zinc-600">
              <Link href="/tools" className="font-medium text-zinc-900 hover:underline">
                All free tools
              </Link>
              <Link href="/tools/google-business-profile-checker" className="hover:text-zinc-900 hover:underline">
                GBP Checker
              </Link>
              <Link href="/tools/ai-visibility-test" className="hover:text-zinc-900 hover:underline">
                AI Visibility Test
              </Link>
              <Link href="/scan" className="hover:text-zinc-900 hover:underline">
                Full SEO scan
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Compare</p>
            <div className="mt-2 flex flex-col gap-2 text-zinc-600">
              <Link href="/compare/gravyblock-vs-brightlocal" className="hover:text-zinc-900 hover:underline">
                vs BrightLocal
              </Link>
              <Link href="/compare/gravyblock-vs-yext" className="hover:text-zinc-900 hover:underline">
                vs Yext
              </Link>
              <Link href="/compare/gravyblock-vs-semrush-local" className="hover:text-zinc-900 hover:underline">
                vs Semrush
              </Link>
              <Link href="/examples/sample-local-growth-report" className="hover:text-zinc-900 hover:underline">
                Sample report
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
      <div id="contact" className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <CtaLeadForm
            source="support_inquiry"
            title="Support"
            subtitle="Billing, access, or product questions. We reply by email. This is not a demo booking form."
            buttonLabel="Send message"
            className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm"
          />
        </div>
      </div>
      <p className="border-t border-zinc-100 bg-zinc-50 py-2 text-center text-[10px] leading-tight text-zinc-400">
        Build: {getBuildVersion()}
      </p>
    </footer>
  );
}
