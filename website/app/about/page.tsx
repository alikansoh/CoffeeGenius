import React from "react";
import type { Metadata } from "next";
import AboutClient from "./AboutClient";
import { notFound } from "next/navigation";

/**
 * Make this page dynamic so Next.js does not attempt to statically
 * generate it at build time (which was hitting the 60s per-page timeout).
 *
 * This ensures any network/database calls happen at request time
 * (or you can implement caching / revalidation strategies).
 */
export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`)
  .replace(/\/$/, "");
const OG_IMAGE = "/og-image.JPG"; // make sure this file lives in /public

type Review = {
  author_name: string;
  author_url?: string;
  language?: string;
  profile_photo_url?: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
};

type ReviewsPayload = {
  reviews?: Review[];
  rating?: number;
  user_ratings_total?: number;
};

/**
 * Helper: fetch with a short timeout so builds / requests don't hang indefinitely.
 */
async function fetchWithTimeout(input: RequestInfo | URL, timeoutMs = 3000, init?: RequestInit) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { signal: controller.signal, ...init });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch reviews from the internal API. This function is resilient:
 * - Uses a short timeout (default 3s)
 * - Swallows errors and returns null if anything goes wrong (non-critical)
 *
 * Note: during builds the SITE_URL may not be reachable from the build worker,
 * so callers should treat missing reviews as non-fatal.
 */
async function fetchReviews(): Promise<ReviewsPayload | null> {
  // Avoid making requests to an env-derived SITE_URL if it is absent.
  // Still attempt fetch but with a short timeout to avoid long hangs.
  try {
    const url = `${SITE_URL}/api/google-reviews`;
    const res = await fetchWithTimeout(url, 3000, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    return json as ReviewsPayload;
  } catch (err) {
    // swallow errors server-side and continue without reviews
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pageUrl = `${SITE_URL}/about`;
  const title = "About �� Coffee Genius";
  const description =
    "Coffee Genius — a cosy coffee shop in Staines. Artisanal drinks, skilled baristas, training and community-focused service. Visit us at 173 High Street, TW18.";

  // Attempt to fetch reviews for richer metadata but don't block the build:
  // fetchReviews uses a short timeout and returns null on error.
  const reviews = await fetchReviews();
  const ratingValue = reviews?.rating ?? undefined;
  const reviewCount = reviews?.user_ratings_total ?? undefined;

  const ogUrl = `${SITE_URL}${OG_IMAGE}`;

  const alternates: Metadata["alternates"] = { canonical: pageUrl };

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Coffee Genius",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
    // If you want to place rating into JSON-LD for preview consumers,
    // you can render that in the page body rather than metadata here.
  };
}

export default async function Page() {
  // fetchReviews is resilient and fast (short timeout). If it's null we continue.
  const reviews = await fetchReviews();

  // If you require reviews to show the page, you could call notFound() here.
  // For now we continue even if reviews are unavailable.
  // if (!reviews) return notFound();

  const pageUrl = `${SITE_URL}/about`;
  const imageUrl = `${SITE_URL}${OG_IMAGE}`;

  // Opening hours in schema.org textual form (compact)
  const openingHours = ["Mo-Fr 07:00-16:00", "Sa 08:30-16:00", "Su CLOSED"];

  const localBusiness: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: "Coffee Genius",
    description:
      "Coffee Genius — a cosy coffee shop in Staines. Artisanal drinks, skilled baristas, training and community-focused service.",
    url: pageUrl,
    telephone: "+447444724389",
    image: [imageUrl],
    address: {
      "@type": "PostalAddress",
      streetAddress: "173 High Street",
      addressLocality: "Staines",
      postalCode: "TW18 4PA",
      addressCountry: "GB",
    },
    openingHours,
    ...(reviews && typeof reviews.rating === "number" && typeof reviews.user_ratings_total === "number"
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: String(reviews.rating),
            reviewCount: String(reviews.user_ratings_total),
          },
        }
      : {}),
  };

  const breadcrumb: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "About", item: pageUrl },
    ],
  };

  const webPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "About — Coffee Genius",
    description:
      "Coffee Genius — a cosy coffee shop in Staines. Artisanal drinks, skilled baristas, training and community-focused service. Visit us at 173 High Street, TW18.",
    url: pageUrl,
    image: [imageUrl],
  };

  return (
    <>
      {/* JSON-LD: LocalBusiness / CafeOrCoffeeShop */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      {/* Breadcrumbs */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {/* WebPage */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />

      {/* Hydration payload for reviews so client can avoid re-fetching if you adapt the client to read it */}
      <script id="initial-reviews" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reviews ?? {}) }} />

      {/* Client UI (your existing client component) */}
      <AboutClient />
    </>
  );
}