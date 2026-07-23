import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

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
            <Link href="/support" className="font-medium text-zinc-700 hover:underline">
              Support
            </Link>{" "}
            ·{" "}
            <Link href="/faq" className="font-medium text-zinc-700 hover:underline">
              FAQ
            </Link>
          </p>
        </div>
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Product</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/scan" className="font-medium text-zinc-900 hover:underline">
                Free scan
              </Link>
              <Link href="/pricing" className="hover:underline">
                Pricing
              </Link>
              <Link href="/blog" className="hover:underline">
                Blog
              </Link>
              <Link href="/glossary" className="hover:underline">
                SEO glossary
              </Link>
              <Link href="/faq" className="hover:underline">
                FAQ
              </Link>
              <Link href="/support" className="hover:underline">
                Support
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
              <Link href="/guides/google-3-pack" className="hover:underline">
                What is the Google 3-Pack?
              </Link>
              <Link href="/guides/local-citation-sites-usa" className="hover:underline">
                Local citation sites USA
              </Link>
              <Link href="/guides/how-to-rank-higher-in-google-maps" className="hover:underline">
                Maps ranking guide
              </Link>
              <Link href="/guides/ai-search-local-businesses" className="hover:underline">
                AI search visibility
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
              <Link href="/local-seo/new-york-ny" className="hover:text-zinc-900 hover:underline">
                Local SEO New York
              </Link>
              <Link href="/local-seo/philadelphia-pa" className="hover:text-zinc-900 hover:underline">
                Local SEO Philadelphia
              </Link>
              <Link href="/local-seo/denver-co" className="hover:text-zinc-900 hover:underline">
                Local SEO Denver
              </Link>
              <Link href="/local-seo/los-angeles-ca" className="hover:text-zinc-900 hover:underline">
                Local SEO Los Angeles
              </Link>
              <Link href="/local-seo/austin-tx/restaurant" className="hover:text-zinc-900 hover:underline">
                Restaurants in Austin
              </Link>
              <Link href="/local-seo/dallas-tx/dentist" className="hover:text-zinc-900 hover:underline">
                Dentists in Dallas
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
            <div className="mt-2 flex flex-col gap-1.5 text-zinc-600">
              <Link href="/compare/gravyblock-vs-brightlocal" className="hover:text-zinc-900 hover:underline">vs BrightLocal</Link>
              <Link href="/compare/gravyblock-vs-whitespark" className="hover:text-zinc-900 hover:underline">vs Whitespark</Link>
              <Link href="/compare/gravyblock-vs-gmb-everywhere" className="hover:text-zinc-900 hover:underline">vs GMB Everywhere</Link>
              <Link href="/compare/gravyblock-vs-yext" className="hover:text-zinc-900 hover:underline">vs Yext</Link>
              <Link href="/compare/gravyblock-vs-semrush-local" className="hover:text-zinc-900 hover:underline">vs Semrush</Link>
              <Link href="/compare/gravyblock-vs-searchatlas" className="hover:text-zinc-900 hover:underline">vs Search Atlas</Link>
              <Link href="/compare/gravyblock-vs-reputation" className="hover:text-zinc-900 hover:underline">vs Reputation.com</Link>
              <Link href="/compare/gravyblock-vs-soro" className="hover:text-zinc-900 hover:underline">vs Soro</Link>
              <Link href="/compare/gravyblock-vs-rankscore" className="hover:text-zinc-900 hover:underline">vs RankScore</Link>
              <Link href="/compare/gravyblock-vs-adaptify" className="hover:text-zinc-900 hover:underline">vs Adaptify</Link>
              <Link href="/compare" className="font-medium text-zinc-900 hover:underline">All comparisons</Link>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400 sm:px-6">
        <Link href="/admin/login" className="hover:text-zinc-600 hover:underline">
          Staff
        </Link>
      </div>
    </footer>
  );
}
