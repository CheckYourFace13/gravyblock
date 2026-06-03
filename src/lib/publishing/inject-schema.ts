/**
 * Injects LocalBusiness + Article JSON-LD schema into published HTML content.
 * Called by every publishing adapter (WordPress, Webflow, Shopify) before posting.
 *
 * Why: Schema markup tells Google and AI search engines exactly what this
 * content is about and who published it — required for AI visibility credit.
 */

import { generateLocalBusinessSchema } from "@/lib/schema-generator";

type BusinessData = {
  name: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  vertical?: string | null;
  primaryCategory?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
};

/** Builds a <script type="application/ld+json"> block to prepend to post HTML. */
export function buildSchemaScriptBlock(params: {
  business: BusinessData;
  articleTitle: string;
  articleUrl?: string;
  publishedAt?: Date;
}): string {
  const localBusiness = generateLocalBusinessSchema(params.business);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.articleTitle,
    ...(params.publishedAt ? { datePublished: params.publishedAt.toISOString() } : {}),
    ...(params.articleUrl ? { url: params.articleUrl } : {}),
    publisher: {
      "@type": "Organization",
      name: params.business.name,
      ...(params.business.website ? { url: params.business.website } : {}),
    },
    about: localBusiness,
  };

  const lines = [
    `<script type="application/ld+json">${JSON.stringify(localBusiness)}</script>`,
    `<script type="application/ld+json">${JSON.stringify(article)}</script>`,
  ];

  return lines.join("\n");
}

/** Prepends schema script blocks to HTML content. */
export function injectSchemaIntoHtml(html: string, schemaBlock: string): string {
  return `${schemaBlock}\n${html}`;
}
