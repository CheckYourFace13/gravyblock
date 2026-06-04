/**
 * Static blog posts for GravyBlock's own marketing blog.
 * These target high-intent local SEO search terms and feed the /blog listing.
 *
 * To add more: append to the BLOG_POSTS array.
 * Slug must be URL-safe, lowercase, hyphens only.
 */

export type BlogPost = {
  slug: string;
  title: string;
  metaDescription: string;
  publishedAt: string; // ISO date string
  body: string;        // Markdown
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "google-business-profile-not-showing-up",
    title: "Google Business Profile Not Showing Up? Here's How to Fix It",
    metaDescription: "If your Google Business Profile isn't appearing in Maps or local search, these are the most common reasons and exactly how to fix each one.",
    publishedAt: "2026-05-01",
    body: `Your Google Business Profile isn't showing up in search, and you're losing customers to competitors who rank above you. Here's exactly why it happens and how to fix it.

## Why Is My Google Business Profile Not Showing Up?

The most common reasons a GBP listing disappears or doesn't rank are: the listing is unverified, suspended, or has inconsistent NAP (Name, Address, Phone) data across the web. Google prioritizes listings with consistent, complete information.

**The most common causes:**

1. **Unverified listing** — If you haven't completed Google's postcard or video verification, your profile won't rank. Check status at business.google.com.
2. **Suspended account** — Keyword stuffing in the business name, using a PO box as an address, or listing a service-area business with a virtual office can trigger suspension.
3. **Incomplete profile** — Missing business hours, categories, photos, or description signals low quality to Google's algorithm.
4. **NAP inconsistency** — If your name, address, or phone number is different on Yelp, Facebook, YellowPages, or your own website, Google loses confidence in your listing.
5. **Low review count** — Profiles with under 10 reviews rarely appear in the competitive top-3 Map Pack.
6. **No recent activity** — Google rewards active profiles. Listings with no posts, no new photos, and no Q&As in 90+ days get deprioritized.

## How to Fix a GBP That Isn't Ranking

> The single fastest fix most businesses can make is completing every field in their profile and posting an update at least once per week.

**Step-by-step:**

1. Log in to [business.google.com](https://business.google.com) and check your verification status.
2. Make sure your business name matches your signage exactly — no added keywords.
3. Fill out every section: description, services, products, hours, and at least 10 photos.
4. Post a Google Business Profile update this week (news, offer, or event).
5. Audit your listings on Yelp, Bing Places, Facebook, and Apple Maps — name, address, and phone must be identical everywhere.
6. Ask your last 10 customers to leave a Google review.

**Bottom line:** Most GBP visibility problems come down to three things — incomplete profiles, inconsistent citations, and low review velocity. Fix those three and your listing will start appearing within 30–60 days.

[Run a free GravyBlock scan to see exactly what's holding your listing back →](/scan)`,
  },
  {
    slug: "how-to-get-more-google-reviews",
    title: "How to Get More Google Reviews (Without Asking Awkwardly)",
    metaDescription: "More Google reviews directly improve your local search rankings. Here are 7 proven methods to get more reviews from real customers — without begging.",
    publishedAt: "2026-05-03",
    body: `More Google reviews aren't just social proof — they're one of the top three factors Google uses to rank local businesses. Here's how to get them consistently.

## Why Google Reviews Matter for Local Rankings

Google's local algorithm uses review count, review velocity (how often new reviews come in), and average rating together. A business with 50 reviews and 4.4 stars almost always outranks one with 200 reviews and 4.1 stars, because recency matters more than raw count.

> According to BrightLocal, 87% of consumers read online reviews for local businesses, and businesses in the Google top 3 have an average of 47+ reviews.

## 7 Ways to Get More Reviews

1. **Ask right after the best moment** — Request a review immediately after a customer expresses satisfaction, not days later. Timing is everything.
2. **Text a direct link** — Copy your Google review link from your GBP dashboard and text it directly. Removing friction increases completion rate by 4x.
3. **Add a QR code to receipts and invoices** — A QR code linking to your review page turns every transaction into a review opportunity.
4. **Send a follow-up email** — A simple "How did we do?" email 24 hours after service, with one button linking to your Google review page.
5. **Train your staff to ask** — If your team doesn't mention reviews, most customers who would leave one won't think to. One sentence at checkout makes a significant difference.
6. **Respond to every existing review** — Businesses that respond to reviews get 12% more reviews on average. It signals that reviews are read and valued.
7. **Put the link on your website** — Add a "Leave us a review" button to your homepage footer and contact page.

## What NOT to Do

- Never buy reviews — Google detects patterns and will suspend your listing.
- Don't incentivize reviews (discounts for reviews) — violates Google's terms and can get reviews removed.
- Don't ask in bulk via mass email — this triggers Google's spam filters.

**Bottom line:** The most reliable review strategy is a simple, consistent system: ask every happy customer, make it one tap, and respond to every review you receive.

[GravyBlock automates review request emails every Wednesday for all paid customers →](/scan)`,
  },
  {
    slug: "local-seo-checklist",
    title: "Local SEO Checklist 2026: Everything a Small Business Needs to Rank",
    metaDescription: "A complete local SEO checklist for small businesses in 2026. Covers Google Business Profile, citations, reviews, content, and technical SEO — in priority order.",
    publishedAt: "2026-05-05",
    body: `Local SEO in 2026 is more competitive than ever, but most small businesses are still missing the basics. This checklist covers everything — in the order that matters most.

## What Is Local SEO and Why Does It Matter?

Local SEO is the practice of optimizing your online presence so your business appears when people search for services near them. The top 3 results in Google Maps (the "Local Pack") capture over 70% of all clicks for local searches.

## The Complete Local SEO Checklist

### Google Business Profile (Highest Priority)
1. ☐ Claim and verify your listing at business.google.com
2. ☐ Business name matches your real-world signage exactly
3. ☐ Primary category is as specific as possible (e.g., "Emergency Plumber" not just "Plumber")
4. ☐ Add 3–5 secondary categories
5. ☐ Fill in every field: description, services, products, hours, website
6. ☐ Upload at least 10 photos (interior, exterior, team, work samples)
7. ☐ Post an update at least once per week
8. ☐ Enable messaging and respond within 24 hours
9. ☐ Answer every Q&A (or post your own Q&As)

### Reviews
10. ☐ Have a system to ask every happy customer for a review
11. ☐ Respond to every review — positive and negative
12. ☐ Aim for at least 2–3 new reviews per month

### Citations (NAP Consistency)
13. ☐ Verify your listing on Yelp, Bing Places, Apple Maps, Facebook, BBB
14. ☐ Name, Address, and Phone are identical everywhere — character for character
15. ☐ List on 10+ industry-specific directories

### Website
16. ☐ Add LocalBusiness JSON-LD schema markup to your homepage
17. ☐ Your city and service appear in the page title and first paragraph
18. ☐ Create a dedicated page for each service you offer
19. ☐ Create location pages if you serve multiple cities
20. ☐ Your website loads in under 3 seconds on mobile

### Content
21. ☐ Publish at least 2 blog posts per month targeting local keywords
22. ☐ Each post answers a real question your customers search for
23. ☐ Include your city name naturally 3–4 times per article

> The businesses that consistently dominate local search aren't doing anything magical — they're doing the basics better and more consistently than everyone else.

**Bottom line:** A complete GBP profile + consistent NAP + 20+ reviews + regular content will put you in the top 3 for most local markets. Most businesses are missing at least half of this list.

[See exactly which items you're missing with a free GravyBlock scan →](/scan)`,
  },
  {
    slug: "ai-search-optimization-local-business",
    title: "AI Search Optimization for Local Businesses: How to Show Up in ChatGPT and Perplexity",
    metaDescription: "ChatGPT and Perplexity are now answering 'best plumber near me' queries. Here's how local businesses can show up in AI search results.",
    publishedAt: "2026-05-07",
    body: `When someone asks ChatGPT "What's the best dentist in Austin?" your business might be the answer — or it might not be mentioned at all. Here's how to fix that.

## How AI Search Engines Find Local Businesses

ChatGPT, Perplexity, Google AI Overviews, and Microsoft Copilot all pull local business recommendations from the same sources: Google Business Profile data, review sites, local news, and structured data on your website. If you're not present and well-reviewed on those sources, AI search engines won't mention you.

> A BrightLocal study found that 58% of consumers have used AI to find a local business in the past year, and that number is growing by 40% annually.

## What AI Search Engines Look For

1. **Google Business Profile signals** — A complete, verified, frequently-updated profile is the single most important factor. ChatGPT's real-time search mode queries Google data directly.
2. **Review sentiment and volume** — AI systems parse review text, not just star ratings. They look for reviews that mention specific services, locations, and outcomes.
3. **Schema markup on your website** — LocalBusiness JSON-LD tells AI crawlers exactly who you are, what you do, and where you're located — in a machine-readable format.
4. **Citations across the web** — Being listed consistently on Yelp, BBB, Apple Maps, Bing, and directories signals to AI that your business is legitimate and established.
5. **Content that directly answers questions** — Articles that start with "What is the best X in Y?" and answer directly in the first paragraph are much more likely to be quoted by AI.

## How to Optimize for AI Search

1. Make your first website paragraph answer "What does [Business Name] do in [City]?" directly.
2. Add LocalBusiness schema markup to every page.
3. Write blog posts in Q&A format — each H2 heading as a question, each section as a direct answer.
4. Get to 25+ Google reviews with recent text that mentions your specific services.
5. Keep your GBP updated weekly with posts about current services, offers, and news.

**Bottom line:** AI search optimization isn't a new discipline — it's local SEO done properly. Businesses that rank in Google's top 3 today will be mentioned in AI search results tomorrow.

[GravyBlock scores your AI search visibility and automates the fixes →](/scan)`,
  },
  {
    slug: "google-maps-top-3-ranking",
    title: "How to Rank in the Google Maps Top 3 (The Local Pack)",
    metaDescription: "The Google Maps top 3 gets 70%+ of all local search clicks. Here's exactly how the ranking algorithm works and what you need to do to get there.",
    publishedAt: "2026-05-09",
    body: `The three businesses that appear in Google Maps when someone searches "plumber near me" capture most of the calls. Here's the algorithm behind those rankings and how to earn your spot.

## How Google Decides Who Gets in the Top 3

Google's local ranking algorithm uses three main factors:

**Relevance** — How well your Google Business Profile and website match what the searcher is looking for. Your business category, description, services list, and website content all contribute.

**Distance** — How close your business is to the searcher (or the location they specify). You can't change your address, but you can expand your service area and create location-specific content.

**Prominence** — How well-known and trusted your business is. This is the factor you can most directly influence through reviews, citations, links, and content.

> According to Moz's Local Search Ranking Factors survey, GBP signals (completeness, category, review count) account for over 36% of the local pack ranking algorithm.

## The 5 Highest-Impact Things You Can Do

1. **Complete your GBP to 100%** — Every empty field is a missed ranking signal. Add photos, services, products, description, and Q&As.
2. **Get to 25+ reviews with a 4.3+ average** — This is the threshold where businesses start appearing consistently in the top 3 for competitive keywords.
3. **Post to GBP every week** — Weekly posts signal to Google that your business is active. Businesses that post weekly rank 15% higher on average.
4. **Clean up citation inconsistencies** — Check your name, address, and phone on Yelp, Bing, Apple Maps, and Facebook. Any inconsistency reduces your prominence score.
5. **Build local content** — Create one article per month targeting "[your service] in [your city]". Internal links and local keyword signals help Google connect your website to your GBP.

## How Long Does It Take?

Most businesses see meaningful movement (moving from position 7–15 to position 3–6) within 60–90 days of consistent effort. Breaking into the top 3 for competitive keywords typically takes 3–6 months.

**Bottom line:** The businesses in the Google Maps top 3 aren't there by accident — they have complete profiles, strong review velocity, consistent citations, and regular content. Fix all four and you'll get there.

[GravyBlock automates all of this for under $80/month →](/scan)`,
  },
  {
    slug: "local-seo-vs-google-ads",
    title: "Local SEO vs Google Ads for Small Businesses: Which One Wins?",
    metaDescription: "Should a local business invest in local SEO or Google Ads? Here's a data-backed comparison with a clear answer for most small businesses.",
    publishedAt: "2026-05-11",
    body: `If you're trying to get more local customers, you're probably choosing between local SEO and Google Ads. Here's the honest comparison.

## The Core Difference

**Google Ads** gives you instant visibility — but only while you're paying. The moment you stop, you disappear. Cost per click for local service keywords averages $6–$50 depending on industry.

**Local SEO** takes 3–6 months to build, but the traffic is free and compounds over time. A top-3 Maps ranking keeps generating leads whether you're spending money or not.

## When Google Ads Makes Sense

1. You need leads immediately (new business, seasonal rush)
2. Your average customer value is very high (lawyers, home renovations, medical)
3. You have a tight geographic target and a clear offer
4. You've already done the SEO work and want to amplify it

## When Local SEO Is the Better Investment

1. You want leads that don't stop when your budget does
2. You're in a market where top-3 ranking is achievable
3. Your competitors aren't investing in SEO (most small businesses still aren't)
4. You want to appear in AI search results (Ads don't show in ChatGPT/Perplexity)

> WordStream data shows the average small business pays $9,000/year in Google Ads for local keywords. That same $9,000 invested in local SEO typically produces 3–5x more organic traffic by year two.

## The Answer for Most Small Businesses

If you have $500–$1,000/month for marketing and you're in a local service category (HVAC, plumbing, dental, legal, salon, etc.), local SEO delivers better long-term ROI. Google Ads is a great short-term bridge while your SEO builds momentum.

The businesses that win long-term do both — SEO for sustainable baseline traffic, Ads for campaigns and peak seasons.

**Bottom line:** For most small businesses, local SEO is the higher-ROI investment because the results compound and don't require ongoing ad spend. Start with SEO, layer Ads on top once you have the fundamentals.

[See where your business stands with a free visibility score →](/scan)`,
  },
  {
    slug: "google-business-profile-optimization-guide",
    title: "The Complete Google Business Profile Optimization Guide (2026)",
    metaDescription: "Everything you need to know to fully optimize your Google Business Profile and rank in the local pack in 2026.",
    publishedAt: "2026-05-13",
    body: `Google Business Profile is the single most important thing you control for local search. This guide covers every optimization in the order that produces results.

## Why GBP Optimization Matters More Than Ever

Google's local search results now show the GBP card before the website in most searches. For mobile users, 60% never scroll past the Local Pack. Your GBP is often the only chance you get to make an impression.

## The Complete Optimization Checklist

### Step 1: Verify and Claim
If you haven't verified your listing, do this first. Go to business.google.com, find your business, and request verification. Google typically sends a postcard or allows video verification for established businesses.

### Step 2: Choose the Right Categories
Your primary category is the most important ranking factor. Choose the most specific category available — "Emergency Plumber" ranks for more valuable searches than "Plumber." Add up to 9 secondary categories for all services you offer.

### Step 3: Write a Complete Description
Your description (750 character limit) should:
1. Start with what you do and where you operate
2. Mention your 3 most important services naturally
3. Include your city name at least twice
4. End with something that differentiates you (years in business, specialization, guarantee)

### Step 4: Add Every Service
Use the Services section to list every service you offer with a description. These become searchable keywords and help Google match you to more queries.

### Step 5: Upload at Least 10 Photos
Google's data shows listings with 10+ photos receive 35% more clicks. Include:
- Exterior (front and parking)
- Interior (reception, waiting area, workspace)
- Team photos
- Work samples or before/after
- Any signage or branding

### Step 6: Post Every Week
> Businesses that post to GBP weekly rank an average of 15% higher than those that don't post at all.

Posts can be updates, offers, events, or product announcements. Even a simple "What we're working on this week" post counts.

### Step 7: Manage Your Q&A Section
Post 10 questions and answers yourself — common customer questions about pricing, hours, services, and parking. This content is indexed by Google and appears in AI search results.

**Bottom line:** A fully optimized GBP takes about 2 hours to set up and 15 minutes per week to maintain. That investment puts you ahead of 80% of your local competitors.

[GravyBlock handles weekly GBP posting, Q&A, and photo uploads automatically →](/scan)`,
  },
  {
    slug: "what-is-nap-consistency-local-seo",
    title: "What Is NAP Consistency and Why Does It Matter for Local SEO?",
    metaDescription: "NAP stands for Name, Address, Phone. Inconsistent NAP data across the web is one of the most common reasons local businesses don't rank. Here's how to fix it.",
    publishedAt: "2026-05-15",
    body: `NAP consistency is one of the most overlooked local SEO factors — and one of the easiest to fix once you know what to look for.

## What Is NAP?

NAP stands for Name, Address, Phone. It refers to how your business is listed across every online directory, website, and social profile on the internet. Google cross-references these mentions to verify your business is legitimate and determine your prominence score.

## Why NAP Consistency Matters

When Google finds your business listed as "Mike's Plumbing" in one place and "Mike's Plumbing Co." in another, with the phone number listed as "(555) 123-4567" in one directory and "555.123.4567" in another — it loses confidence in your data.

> A Moz study found that NAP inconsistencies are the second most common reason businesses fail to rank in the local pack, affecting an estimated 68% of small business listings.

## The Most Common NAP Mistakes

1. **Abbreviating "Street" to "St" in some places but not others** — pick one and use it everywhere
2. **Using a different phone number on your website vs. GBP** — Google reconciles these and penalizes inconsistency
3. **Old address after a business move** — directories don't auto-update when you move
4. **Multiple listings for the same location** — happens when the same business is listed twice on Yelp or YellowPages

## How to Audit and Fix Your NAP

1. Decide on your canonical NAP — exactly how your name, address, and phone should appear
2. Check Google, Yelp, Facebook, Bing Places, Apple Maps, BBB, YellowPages, and Foursquare
3. Update any listing that doesn't match your canonical exactly
4. Check your own website — your footer, contact page, and About page must all match

**Bottom line:** NAP consistency is tedious to fix but permanently valuable once done. A single afternoon of auditing and updating your 10 most important directories can move your local ranking within 30 days.

[GravyBlock's citation audit identifies every inconsistency automatically →](/scan)`,
  },
  {
    slug: "local-seo-for-service-area-businesses",
    title: "Local SEO for Service Area Businesses: How to Rank Without a Storefront",
    metaDescription: "Plumbers, HVAC contractors, electricians, and other service area businesses face unique local SEO challenges. Here's how to rank when you don't have a customer-facing location.",
    publishedAt: "2026-05-17",
    body: `If you serve customers at their location instead of yours, local SEO works differently for you. Here's how to rank in every city you serve.

## What Makes Service Area Businesses Different

A restaurant can optimize for one location. A plumber who serves five cities needs to appear in Maps searches for all five — even though their business is registered at a single address (or has no public address at all).

Google allows service area businesses to hide their address and set a service area instead. But this comes with ranking tradeoffs you need to know.

## Why Service Area Businesses Struggle to Rank

1. **No storefront address** — Physical proximity is a major ranking factor. Hiding your address removes the distance signal Google uses to match you to searchers.
2. **Thin local signals** — Without a physical location in each city, you have fewer local citations and no physical presence signals.
3. **Competing with location-based businesses** — A plumbing company with a visible address in Houston will outrank a SAB with a hidden address, all else equal.

## How to Rank in Multiple Cities as a Service Area Business

**Strategy 1: Location pages on your website**
Create a dedicated page for each city you serve: "Plumber in [City]" with original content, local landmarks, testimonials from that city's customers, and a schema markup with the service area.

**Strategy 2: Optimize your GBP service area settings**
Set your service radius accurately in your GBP — don't claim you serve cities 3 hours away. Relevance suffers if your claimed area is too large.

**Strategy 3: Get reviews that mention specific cities**
Ask customers in each city to mention the neighborhood or city in their review. "They came to our home in Katy and fixed the HVAC in two hours" is worth more than a review with no location signal.

**Strategy 4: Build citations in each city**
Get listed in local chambers of commerce, city business directories, and local news sites for each city you target.

> Businesses with location pages for each service area rank in the local pack for those cities 3x more often than those without dedicated pages.

**Bottom line:** Service area businesses can absolutely rank in multiple cities — it just requires more deliberate content and citation building than single-location businesses.

[GravyBlock generates location pages for every city you serve automatically →](/scan)`,
  },
  {
    slug: "how-to-respond-to-negative-google-reviews",
    title: "How to Respond to Negative Google Reviews (and Actually Win Back Trust)",
    metaDescription: "A negative Google review isn't a crisis — it's an opportunity. Here's how to respond in a way that turns bad reviews into trust signals for future customers.",
    publishedAt: "2026-05-19",
    body: `A negative review sits on your Google Business Profile forever — unless you respond correctly. Here's the template that turns bad reviews into proof of great customer service.

## Why Your Response Matters More Than the Review

When a potential customer sees a negative review, they're not just reading the complaint — they're watching how you handle it. A professional, empathetic response signals that you're a business that takes problems seriously. A defensive or dismissive response confirms the original complaint.

> BrightLocal found that 89% of consumers read business responses to reviews, and 41% say a good response to a negative review makes them more likely to use the business.

## The 4-Part Response Framework

Every negative review response should follow this structure:

1. **Acknowledge without admitting fault** — "I'm sorry to hear this wasn't the experience you expected."
2. **Be specific** — Reference something from their review to show you actually read it.
3. **Take it offline** — "I'd love to make this right. Please call us at [phone] or email [email]."
4. **Keep it short** — 3–4 sentences maximum. Long responses read as defensive.

## Response Templates by Type

**For a service complaint:**
"[Name], I appreciate you sharing this feedback. This isn't the standard we hold ourselves to, and I'd like to understand what happened. Please reach out to us directly at [contact] so we can make this right."

**For a misunderstanding:**
"Thank you for the feedback. It sounds like there may have been a miscommunication — we'd like to address this directly. Please call us at [phone] so we can clarify and resolve this for you."

**For a fake or competitor review:**
Report it to Google (three dots → Flag as inappropriate) and do not respond publicly until you know Google's decision. If Google declines to remove it, respond professionally: "We can't find a record of this visit in our system. We take all feedback seriously — please contact us directly."

## What Never to Do

- Don't argue with the reviewer publicly
- Don't reveal personal information about the transaction
- Don't offer refunds or discounts publicly (takes the conversation private first)
- Don't ignore it — no response is worse than a bad response

**Bottom line:** Every negative review is a public audition of your customer service skills. Handle it professionally and many readers will trust you more, not less.

[GravyBlock monitors your reviews and drafts responses automatically →](/scan)`,
  },
  {
    slug: "local-seo-for-restaurants",
    title: "Local SEO for Restaurants: How to Show Up When People Search 'Best Restaurants Near Me'",
    metaDescription: "Restaurant local SEO is different from other industries. Here's exactly what drives rankings for restaurants in Google Maps and AI search.",
    publishedAt: "2026-05-21",
    body: `"Best restaurants near me" is searched millions of times per day. If your restaurant doesn't appear in the top 3 results, you're invisible to most of those searches. Here's how to fix that.

## How Restaurant Local SEO Works

Restaurants compete in one of the most competitive local SEO environments. The top-3 Maps Pack for restaurant searches is dominated by businesses with:
- 100+ Google reviews (with 4.4+ average)
- Weekly GBP posts with food photos
- Complete menu in GBP
- Multiple categories (e.g., "Italian Restaurant," "Pizza Restaurant," "Family Restaurant")
- Consistent citations on OpenTable, Yelp, TripAdvisor, and Zomato

## The Restaurant-Specific SEO Checklist

1. **Add your full menu to Google Business Profile** — Google shows menu items directly in search results. Missing this means competitors show up with more content.
2. **Upload 25+ photos** — Restaurants need more photos than other business types. Include food, ambiance, exterior, staff, and seasonal specials.
3. **Post weekly with food photos** — Restaurant GBP posts with food images get 3x more engagement than text-only posts.
4. **Get listed on OpenTable, Yelp, TripAdvisor** — These platforms feed data to Google and AI search engines. Consistent presence across all three amplifies your local authority.
5. **Add "reservations" and "ordering" links** — GBP supports direct integration with OpenTable and ordering platforms. Adding these increases conversion and signals to Google that you're an active business.
6. **Enable messaging** — Customers increasingly message before visiting. Responding quickly improves your GBP engagement score.

> According to Google, restaurants with full menus listed in GBP appear 45% more often in local searches compared to those without menus.

## The Review Strategy for Restaurants

Restaurants have an advantage: you interact with dozens of customers per day. A simple card at the register or a QR code on the receipt — "Loved your meal? Leave us a Google review" — can generate 5–10 new reviews per week if consistently executed.

**Bottom line:** Restaurant local SEO is won with photos, menu completeness, review velocity, and weekly posts. Businesses doing all four consistently dominate their local market.

[GravyBlock automates weekly GBP posts and review monitoring for restaurants →](/scan)`,
  },
  {
    slug: "local-seo-for-dentists",
    title: "Local SEO for Dentists: How to Fill Your Chair with Patients from Google",
    metaDescription: "Dental practices that rank in the Google Maps top 3 get 70% of new patient inquiries. Here's how to get there and stay there.",
    publishedAt: "2026-05-23",
    body: `A dental practice that ranks in Google's top 3 for "dentist near me" in its city can generate 20–40 new patient inquiries per month from search alone. Here's the system that gets you there.

## Why Dental Local SEO Is Different

Dental practices face unique local SEO challenges:
- High competition in most metro areas
- Review hesitation (patients worry about HIPAA implications)
- Multiple service keywords (general dentist, cosmetic dentist, emergency dentist, orthodontist)
- High LTV per patient — worth investing more in acquisition

## The Dental SEO Priority List

**1. Claim every service as a separate GBP category**
Add "Cosmetic Dentist," "Pediatric Dentist," "Emergency Dental Service," and "Orthodontist" as secondary categories (if applicable). Each category makes you eligible to appear for those specific searches.

**2. Build your review system around HIPAA-safe language**
You can't reveal that someone is a patient, but your patients can voluntarily share their experience. Ask them to describe their experience without mentioning treatments: "Dr. Smith and the team were amazing — I was so nervous but they made me feel completely comfortable." Encourage this type of review.

**3. Create service pages on your website**
A dedicated page for "Teeth Whitening in [City]," "Invisalign in [City]," and "Emergency Dentist in [City]" each targets high-value keywords with strong purchase intent.

**4. Get on Healthgrades, Zocdoc, and WebMD**
These health-specific directories are crawled by Google and AI search engines. Your profile on all three amplifies your local authority significantly.

**5. Post before/after photos (with consent) to GBP**
Visual results are the highest-converting content for dental practices. A weekly post with a smile transformation drives more GBP engagement than any other content type.

> Dental practices in the Google Maps top 3 for "dentist near me" in cities of 100K+ people generate an estimated $200K–$400K in annual recurring revenue from search alone.

**Bottom line:** Dental local SEO is a long-term investment with extremely high returns. The combination of complete GBP, health directory citations, service pages, and a consistent review system puts most practices in the top 3 within 6 months.

[GravyBlock manages dental practice SEO automatically for $80/month →](/scan)`,
  },
  {
    slug: "local-seo-for-plumbers",
    title: "Local SEO for Plumbers: How to Get More Calls from Google Maps",
    metaDescription: "Plumbing is one of the most lucrative local SEO categories. Here's the exact system plumbers use to dominate Google Maps in their market.",
    publishedAt: "2026-05-25",
    body: `Plumbing leads from Google are among the most valuable in any local category — emergency searches have near-100% intent and average job values of $500+. Here's how to capture them.

## The Plumbing SEO Landscape

Plumbers compete on two types of searches:
1. **Emergency searches** — "plumber near me," "emergency plumber," "pipe burst" — these are high urgency, high value, mobile-first
2. **Planned searches** — "water heater installation," "bathroom remodel plumber" — these are researched, higher project value

Your SEO strategy should target both, with different content and conversion approaches.

## The Top 5 Plumbing SEO Moves

**1. Emergency availability signals**
Set your GBP hours to include "24/7" or after-hours availability if you offer it. Add "Emergency Plumbing Service" as a GBP category. This directly increases your visibility for urgent searches.

**2. Service-specific pages**
Create individual pages for your top 10 services: water heater repair, drain cleaning, pipe burst, toilet repair, sewer line, etc. Each page targets a specific high-intent keyword and builds topical authority.

**3. Neighborhood content**
Create content for specific neighborhoods or suburbs in your service area: "Plumber in [Neighborhood/Suburb] — [Your Business Name]." These hyper-local pages rank easily and convert well.

**4. Before/after photo documentation**
Document every job with before-and-after photos. Post one per week to GBP with a description of the problem you solved and how. This builds visual trust and creates ongoing content.

**5. Response time emphasis in reviews**
Encourage customers to mention your response time in reviews: "They arrived in 45 minutes on a Sunday night." Response time is the #1 differentiator in emergency plumbing searches.

> Emergency plumbing searches convert at 30–50% higher rates than non-emergency searches. A top-3 Maps ranking for "emergency plumber [city]" is worth $10K–$30K/month in jobs for most markets.

**Bottom line:** Plumbing local SEO is won by speed and trust signals. Emergency availability in your GBP, service-specific pages, fast response testimonials, and weekly photo content will put you in the top 3 in most markets within 90 days.

[GravyBlock handles weekly posts, Q&A, and content for plumbing businesses automatically →](/scan)`,
  },
  {
    slug: "citation-building-local-seo",
    title: "What Are Local Citations and How Do You Build Them?",
    metaDescription: "Local citations are online mentions of your business name, address, and phone number. Here's why they matter for SEO and the exact directories to get listed on.",
    publishedAt: "2026-05-27",
    body: `Local citations are one of the oldest SEO tactics that still works — and most small businesses have messy, incomplete citation profiles. Here's how to fix yours.

## What Is a Local Citation?

A local citation is any online mention of your business's Name, Address, and Phone number (NAP). When Google sees your NAP mentioned consistently across authoritative websites, it increases your prominence score and local search rankings.

Citations come in two forms:
- **Structured citations** — Directory listings on Yelp, BBB, Yellow Pages, Foursquare
- **Unstructured citations** — Mentions in news articles, blog posts, local event listings

## The Core Directories Every Business Needs

These are the highest-authority citations that most directly affect your Google rankings:

1. **Google Business Profile** — The citation that matters most
2. **Yelp** — High domain authority, feeds Apple Maps and Siri
3. **Facebook Business** — Indexed by Google, social trust signal
4. **Apple Maps Connect** — All iPhone users, Siri queries
5. **Bing Places** — Microsoft ecosystem, powers ChatGPT search
6. **Better Business Bureau** — High trust signal, even free listings help
7. **Foursquare** — Powers Snapchat, Uber, and dozens of apps
8. **YellowPages (YP.com)** — Legacy authority, still crawled by Google
9. **Manta** — Strong DA, good for small business citations
10. **Nextdoor Business** — Hyperlocal, neighborhood-level authority

## Industry-Specific Citations

Beyond the core directories, add citations to the platforms your customers use:
- **Restaurants**: OpenTable, TripAdvisor, Zomato, Grubhub
- **Healthcare**: Healthgrades, Zocdoc, WebMD
- **Legal**: Avvo, Justia, FindLaw
- **Home Services**: Angi, HomeAdvisor, Thumbtack, Houzz

> According to Whitespark's annual citation survey, building 20+ high-quality citations moves most local businesses up 2–5 positions in Maps rankings within 60 days.

## The Citation Building Process

1. Set your canonical NAP (exactly how your name, address, and phone should appear everywhere)
2. Claim and verify Google, Yelp, Facebook, Apple Maps, and Bing first
3. Work through the core 10 directories listed above
4. Add industry-specific directories relevant to your category
5. Audit every 6 months for inconsistencies as your business information changes

**Bottom line:** Citation building is a one-time investment with lasting returns. Getting fully listed on 15–20 high-authority directories puts most businesses in the top 3 for their target keywords.

[GravyBlock generates your directory profile copy and creates your claim task list automatically →](/scan)`,
  },
  {
    slug: "content-marketing-local-business",
    title: "Content Marketing for Local Businesses: What Actually Works in 2026",
    metaDescription: "Most local business content marketing advice is wrong. Here's what actually drives local search rankings and customer acquisition in 2026.",
    publishedAt: "2026-05-29",
    body: `"Start a blog" is the most common content marketing advice given to local businesses. Most of them do it for three months and give up because it doesn't work. Here's why — and what does work.

## Why Most Local Business Content Fails

The typical local business blog post is either too generic ("5 Tips for a Clean Home") or too self-promotional ("Why We're the Best HVAC Company in Phoenix"). Neither drives rankings or customers.

Content that ranks locally has to pass a test: **would a potential customer search for exactly this information?**

## What Content Actually Works for Local Businesses

### 1. Service + City combination pages
"[Service] in [City]" pages are the highest-converting local content because they match exactly how customers search. "HVAC repair in Phoenix" has 1,200+ searches per month. A dedicated page targeting that exact phrase will rank and convert.

### 2. Problem-solution articles
Customers search when they have a problem: "water heater making noise," "hair falling out after bleaching," "tooth hurts when eating." Content that describes the problem in the customer's words, explains causes, and mentions your business as the solution captures this traffic.

### 3. Q&A content
Write articles that answer the top 10 questions your customers ask in the first phone call. "How much does it cost to replace a water heater in Houston?" is searched 500+ times per month. An article that answers it directly — and mentions your business at the end — converts.

### 4. Local comparison content
"[Your city] vs. [Nearby city]" or "[Type A service] vs. [Type B service] in [City]" captures consideration-phase searches and positions your business as the expert.

> Businesses that publish 2+ locally-targeted articles per month see 3.5x more organic leads than those that publish irregularly, according to HubSpot's local business data.

## The Right Publishing Frequency

For most local businesses:
- 1–2 articles per month is the minimum to see results
- 4 articles per month produces significantly faster results
- Quality matters more than quantity — one solid 600-word locally-targeted article beats four generic 200-word posts

**Bottom line:** Local content marketing works when it targets specific problems and search terms your customers actually use. Generic advice articles don't rank; specific, locally-relevant answers do.

[GravyBlock publishes 4+ locally-targeted articles per month automatically for every paid customer →](/scan)`,
  },
  {
    slug: "local-seo-tools-comparison",
    title: "Best Local SEO Tools for Small Businesses in 2026 (Honest Comparison)",
    metaDescription: "Comparing BrightLocal, Yext, Semrush Local, and GravyBlock for small business local SEO in 2026 — including price, features, and who each tool is best for.",
    publishedAt: "2026-05-31",
    body: `The local SEO tool market ranges from $30/month reporting dashboards to $500+/month agency platforms. Here's an honest comparison of the options for small businesses.

## What to Look for in a Local SEO Tool

The best local SEO tools for small businesses do three things:
1. **Show you where you stand** — rankings, scores, competitor comparison
2. **Tell you what to fix** — specific, prioritized action items
3. **Automate the work** — actually implement fixes without requiring agency fees

Most tools do the first two. Very few do the third.

## The Main Tools Compared

### BrightLocal ($29–$49/month)
**Best for:** Agencies managing multiple clients, businesses that want detailed reporting

BrightLocal is the most established local SEO reporting tool. Strong rank tracking, citation audit, and review monitoring. Weakness: it's a reporting dashboard, not an automation platform. Everything it tells you to fix still requires manual work or hiring an agency.

### Yext ($199–$449/month)
**Best for:** Enterprise brands, franchise networks, multi-location businesses

Yext pushes your business data to 70+ directories through their publisher network. High accuracy, but extremely expensive for small businesses. The monthly fee continues indefinitely — cancel and your listings revert. Also doesn't handle content, reviews, or GBP optimization.

### Semrush Local ($50/month add-on)
**Best for:** Businesses already using Semrush for broader SEO

Semrush's local features are solid for keyword research and rank tracking, but thin on local-specific features like GBP management, review monitoring, or citation building. Best as a supplement, not a standalone solution.

### GravyBlock ($79–$499/month)
**Best for:** Local service businesses that want automation, not just reporting

GravyBlock is built differently — instead of showing you what's wrong and leaving you to fix it, it fixes things automatically. Weekly SEO content published to your website, GBP posts published weekly, review replies written and posted, directory listings claimed, citations audited. The goal is replacing the work you'd otherwise pay an agency to do.

## Which Tool Should You Choose?

| If you want... | Use... |
|---|---|
| Detailed reporting and you have someone to act on it | BrightLocal |
| Automatic directory sync across 70+ listings | Yext |
| Keyword research alongside local SEO | Semrush |
| Everything done automatically without an agency | GravyBlock |

**Bottom line:** If you have an in-house marketing person or work with an agency, BrightLocal gives you the best reporting. If you're a small business owner who wants results without ongoing manual work, GravyBlock is built specifically for you.

[Start your free GravyBlock scan and see your visibility score in 60 seconds →](/scan)`,
  },
  {
    slug: "google-business-profile-posts",
    title: "Google Business Profile Posts: What to Post and How Often",
    metaDescription: "GBP posts are one of the most underused local SEO tools. Businesses that post weekly rank higher and get more clicks. Here's exactly what to post.",
    publishedAt: "2026-06-02",
    body: `Google Business Profile Posts are the closest thing local businesses have to a social media feed inside Google Search. Most businesses never use them. The ones that do consistently outrank those that don't.

## Do GBP Posts Actually Help Rankings?

Yes — according to a Whitespark study, businesses that post to GBP weekly rank on average 15% higher than those that don't post at all. Google interprets activity as a signal that a business is open, active, and engaged with customers.

Posts also appear in the knowledge panel when someone searches your business name, and sometimes appear in the Local Pack results for competitive searches.

## The 4 Types of GBP Posts

**Update Posts** — General announcements, news, or what's happening in your business. "New hours starting November 1st" or "We just added X service."

**Offer Posts** — Limited-time discounts or promotions. These show a "View offer" button and display an expiration date. High click rates.

**Event Posts** — For businesses hosting events, open houses, or seasonal promotions. Show a date and description.

**Product Posts** — Showcase specific products or services with a photo, description, and call-to-action button.

## What to Post Every Week (Content Ideas)

1. A recent job or project with a photo
2. A customer success story (get permission)
3. A seasonal tip relevant to your service
4. An FAQ answer from your most common customer questions
5. A "behind the scenes" glimpse of your team or process
6. A reminder about an upcoming seasonal service need
7. A new service or product you've added

> Businesses that post with a photo get 3x more views than text-only GBP posts. Always include an image.

## The Best Time to Post

Post Tuesday through Thursday between 9am–11am local time. These windows show the highest engagement for business profile content. Don't post on Sunday — it generates the least interaction.

## How Long Posts Last

GBP posts expire after 7 days unless they're Event or Offer posts (which run until their end date). This is why weekly posting is the minimum — old posts are replaced and your profile looks current.

**Bottom line:** GBP posts take 5 minutes per week and directly improve your search rankings. There is almost no other 5-minute weekly action with comparable ROI for local SEO.

[GravyBlock writes and publishes your weekly GBP posts automatically →](/scan)`,
  },
  {
    slug: "local-seo-mistakes-small-businesses",
    title: "10 Local SEO Mistakes Small Businesses Make (And How to Fix Them)",
    metaDescription: "Most small businesses make the same 10 local SEO mistakes. Here's each mistake, why it hurts your rankings, and exactly how to fix it.",
    publishedAt: "2026-06-04",
    body: `After analyzing thousands of local business profiles, the same mistakes come up over and over. Here are the top 10 — and how to fix each one.

## The 10 Most Common Local SEO Mistakes

**Mistake 1: Keyword stuffing in the GBP business name**
Adding keywords to your business name ("Joe's Plumbing | Best Plumber in Dallas") violates Google's guidelines and can get your listing suspended. Your business name should match your legal name or signage exactly.

**Mistake 2: Using a virtual office or PO box as your address**
Google can detect virtual office addresses and will suspend listings that use them. If you're a service-area business, hide your address and set a service area instead.

**Mistake 3: Inconsistent phone numbers across listings**
Your phone number must be identical on Google, Yelp, Facebook, your website, and every other directory. Even formatting differences (555-123-4567 vs (555) 123-4567) can create inconsistency signals.

**Mistake 4: Not responding to reviews**
Businesses that respond to all reviews get 12% more reviews on average. Not responding signals low engagement to Google and potential customers.

**Mistake 5: Single category on GBP**
Most businesses offer services that qualify for multiple GBP categories. A dental practice can add "Cosmetic Dentist," "Pediatric Dentist," and "Emergency Dental Service" as secondary categories — each one unlocks additional search queries.

**Mistake 6: No photos or outdated photos**
GBP profiles with fewer than 10 photos receive significantly fewer clicks. Upload photos that show your actual work, team, and location — not stock photos.

**Mistake 7: Website not optimized for local keywords**
Your website must mention your city and service prominently — in the page title, first paragraph, and headers. Without these signals, your GBP doesn't get the website authority boost it needs.

**Mistake 8: Ignoring the Q&A section**
The Q&A section is publicly visible and indexed by Google. Post 10 questions and answers yourself — competitors can (and sometimes do) answer your Q&As, and the results aren't always favorable.

**Mistake 9: No content strategy**
A GBP listing with zero linked website content misses the trust and keyword signals that content provides. Publishing even one article per month significantly improves GBP rankings.

**Mistake 10: Giving up after 60 days**
Local SEO takes 3–6 months to show significant results. Most businesses that try it and quit do so right before their efforts would have started to pay off.

**Bottom line:** Most of these mistakes are fixable in a single afternoon. Fixing all 10 consistently moves most local businesses from page 2 into the top 3 within 90 days.

[GravyBlock scans for all 10 of these mistakes and tracks your fix progress automatically →](/scan)`,
  },
  {
    slug: "schema-markup-local-business",
    title: "Schema Markup for Local Businesses: The Complete Guide",
    metaDescription: "Schema markup tells Google and AI search engines exactly what your business does. Here's what local business schema is, why it matters, and how to add it.",
    publishedAt: "2026-06-06",
    body: `Schema markup is the structured data language Google, Bing, and AI search engines use to understand your website. For local businesses, implementing it correctly is a significant ranking advantage.

## What Is Schema Markup?

Schema markup is code (JSON-LD format) that you add to your website to tell search engines exactly what your business does, where it's located, and what it offers. Unlike regular website text, schema is machine-readable — it's written for algorithms, not humans.

When Google sees LocalBusiness schema markup, it directly feeds your business data into the Knowledge Graph, the Local Pack, and AI search results.

## The Most Important Schema Types for Local Businesses

### 1. LocalBusiness Schema
The foundation for all local businesses. Includes:
- Business name, address, phone
- Business type (Plumber, Restaurant, Dentist, etc.)
- Website URL
- Geographic coordinates
- Aggregate rating and review count
- Business hours

### 2. Article Schema
For every blog post or local content page. Includes:
- Article headline and description
- Author and publisher
- Date published and modified
- About the business (links back to LocalBusiness schema)

### 3. FAQ Schema
Adds collapsible Q&A directly in search results. Google shows FAQ content as expandable results beneath your listing — dramatically increasing your search result footprint.

### 4. Service Schema
Describes specific services you offer with pricing ranges. Directly feeds Google's service-matching algorithm.

## How to Add Schema to Your Website

**Method 1: JSON-LD in the page head** (recommended)
Add a **script tag** with \`type="application/ld+json"\` to your homepage and every service page. This is the cleanest implementation.

**Method 2: Google Tag Manager**
If you don't have developer access, GTM can inject schema into your pages without code changes.

**Method 3: WordPress plugin**
Rank Math and Yoast SEO both generate LocalBusiness schema automatically from your business settings.

## What Your LocalBusiness Schema Should Look Like

\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "Plumber",
  "name": "Houston Plumbing Pros",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "Houston",
    "addressRegion": "TX",
    "postalCode": "77001"
  },
  "telephone": "+17135550123",
  "url": "https://houstonplumbingpros.com",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127"
  }
}
\`\`\`

> A Searchmetrics study found that pages with schema markup rank on average 4 positions higher than equivalent pages without it.

**Bottom line:** Schema markup takes about an hour to implement correctly and provides lasting ranking benefits. For AI search optimization specifically, LocalBusiness and Article schema are non-negotiable.

[GravyBlock automatically injects schema markup into every article it publishes to your website →](/scan)`,
  },
  {
    slug: "rank-google-maps-without-reviews",
    title: "Can You Rank on Google Maps Without Reviews?",
    metaDescription: "New businesses with zero reviews can still rank in local search. Here's what else matters — and how to build review velocity fast when you're starting from scratch.",
    publishedAt: "2026-06-08",
    body: `Starting a new business with zero Google reviews feels like a catch-22 — you need rankings to get customers, and you need customers to get reviews. Here's how to break the cycle.

## Can a Business Rank Without Reviews?

Yes — especially in low-competition markets, for specific service-area searches, or with a complete, well-optimized GBP. Reviews are one of three ranking factors (relevance, distance, prominence), and prominence includes more than just reviews.

However, in most competitive urban markets, 20+ reviews with a 4.3+ average is effectively the floor for consistent top-3 appearances.

## What You Can Compete On Without Reviews

**Relevance signals** — A new business with a perfectly categorized, fully described GBP can outrank an older business with an incomplete profile. Fill every field.

**Proximity** — Distance is always a factor. If you're geographically closest to the searcher, you'll appear even with few reviews.

**Website signals** — A new business with strong local SEO on its website (LocalBusiness schema, city + service in titles, location pages) can rank for specific keyword searches even with a thin GBP.

**Speed of activity** — New businesses that post immediately after launch and add content weekly are perceived by Google as actively serving customers.

## How to Build Reviews Fast as a New Business

1. **Ask every customer, every time, for the first 90 days** — Make it your absolute highest priority. Personally ask after every positive interaction.
2. **Text a direct link within 2 hours of service** — Immediacy dramatically increases completion rates.
3. **Ask your professional network first** — Former colleagues, vendors, and business associates who know your work can leave honest reviews based on your professional reputation.
4. **Run a 30-day "launch" review campaign** — Set a goal of 15 reviews in your first month. Tell your network you're launching and need community support.

> Businesses that reach 25 reviews within their first 6 months rank in the top 5 for their primary category 80% of the time, according to a Moz longitudinal study.

**Bottom line:** You can rank without reviews by maximizing every other factor. But 25+ reviews remains the fastest path to consistent top-3 appearances. Make review generation your primary activity in months 1–3.

[GravyBlock's review request system automates weekly review outreach to your customers →](/scan)`,
  },
];

/** Get a single post by slug */
export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Get all posts sorted by date descending */
export function getAllBlogPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
