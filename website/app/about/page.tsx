import React from "react";
import type { Metadata } from "next";
import AboutClient from "./AboutClient";
import { notFound } from "next/navigation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
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

async function fetchReviews(): Promise<ReviewsPayload | null> {
  try {
    const res = await fetch(`${SITE_URL}/api/google-reviews`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    return json as ReviewsPayload;
  } catch (err) {
    // swallow errors server-side and continue without reviews
    // console.error("fetchReviews error", err);
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pageUrl = `${SITE_URL}/about`;
  const title = "About — Coffee Genius";
  const description =
    "Coffee Genius — a cosy coffee shop in Staines. Artisanal drinks, skilled baristas, training and community-focused service. Visit us at 173 High Street, TW18.";

  // attempt to fetch reviews to include rating for social previews (non-critical)
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
    // optional: include rating in metadata.description for richer preview (non-standard)
    // Note: Next Metadata type doesn't have a dedicated aggregateRating field; keep JSON-LD on the page.
    // We avoid adding arbitrary fields not supported by Next Metadata.
  };
}

export default async function Page() {
  const reviews = await fetchReviews();

  // If you want this page to always be available, don't fail on reviews fetch
  // but if you require some critical data, you can notFound() here.
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
    // include aggregateRating if available
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