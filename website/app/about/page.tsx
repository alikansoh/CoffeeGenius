import React from "react";
import type { Metadata } from "next";
import AboutClient from "./AboutClient";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`)
  .replace(/\/$/, "");
const OG_IMAGE = "/og-image.JPG";

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
 * Fetch reviews - returns null during build to avoid blocking
 */
async function fetchReviews(): Promise<ReviewsPayload | null> {
  // Skip fetch during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    console.log('Skipping review fetch during build');
    return null;
  }

  try {
    const url = `${SITE_URL}/api/google-reviews`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(url, { 
      signal: controller.signal,
      next: { revalidate: 300 },
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.log('Reviews fetch failed:', res.status);
      return null;
    }
    
    const json: unknown = await res.json();
    if (!json || typeof json !== "object") return null;
    return json as ReviewsPayload;
  } catch (err) {
    console.log('Reviews fetch error (non-critical):', err);
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pageUrl = `${SITE_URL}/about`;
  const title = "About — Coffee Genius";
  const description =
    "Coffee Genius — a cosy coffee shop in Staines. Artisanal drinks, skilled baristas, training and community-focused service. Visit us at 173 High Street, TW18.";

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
  };
}

export default async function Page() {
  const reviews = await fetchReviews();

  const pageUrl = `${SITE_URL}/about`;
  const imageUrl = `${SITE_URL}${OG_IMAGE}`;

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />
      <script id="initial-reviews" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reviews ?? {}) }} />
      
      <AboutClient />
    </>
  );
}