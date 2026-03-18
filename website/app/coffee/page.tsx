import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { getCoffees, mapApiCoffeesToProducts, type Product } from "@/lib/coffee";

const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

async function fetchProducts(slug?: string): Promise<Product[]> {
  const apiCoffees = await getCoffees(slug);
  return mapApiCoffeesToProducts(apiCoffees);
}

// ── SEO keywords used across title / description / schema ──────────────────
const KEYWORDS = [
  "specialty coffee beans",
  "buy coffee beans online UK",
  "freshly roasted coffee",
  "single origin coffee",
  "coffee beans Staines",
  "coffee beans Surrey",
  "espresso beans UK",
  "filter coffee beans",
  "small batch roastery",
  "whole bean coffee",
  "ground coffee UK",
  "light roast coffee",
  "medium roast coffee",
  "dark roast coffee",
  "Ethiopian coffee beans",
  "Colombian coffee beans",
  "Brazilian coffee beans",
  "Kenyan coffee beans",
  "pour over coffee",
  "cafetiere coffee",
  "aeropress coffee",
  "specialty coffee shop",
  "artisan coffee roaster",
  "craft coffee UK",
  "award winning coffee beans",
  "coffee subscription UK",
  "best coffee beans UK",
  "freshly roasted coffee UK",
  "online coffee shop UK",
  "roasted to order coffee",
].join(", ");

// ── Metadata ────────────────────────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  const products = await fetchProducts();
  const count = products.length;

  const title =
    count > 0
      ? `Buy ${count} Specialty Coffee Beans Online — Freshly Roasted | Coffee Genius`
      : "Buy Specialty Coffee Beans Online — Freshly Roasted | Coffee Genius";

  const description =
    "Shop freshly roasted specialty coffee beans online. Single origins, blends, espresso & filter roasts — roasted to order in Staines, Surrey. Free UK delivery on orders over £30. Whole bean or ground.";

  return {
    title,
    description,
    keywords: KEYWORDS,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `${SITE_URL}/coffee` },

    // ── Open Graph ────────────────────────────────────────────────────────
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/coffee`,
      siteName: "Coffee Genius",
      images: products[0]?.img
        ? [
            {
              url: products[0]!.img.startsWith("http")
                ? products[0]!.img
                : `${SITE_URL}${products[0]!.img}`,
              width: 1200,
              height: 630,
              alt: "Specialty coffee beans — Coffee Genius",
            },
          ]
        : [],
      type: "website",
      locale: "en_GB",
    },

    // ── Twitter / X ───────────────────────────────────────────────────────
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: products[0]?.img
        ? [
            products[0]!.img.startsWith("http")
              ? products[0]!.img
              : `${SITE_URL}${products[0]!.img}`,
          ]
        : [],
    },

    // ── Robots ────────────────────────────────────────────────────────────
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },

    // ── Other ──���──────────────────────────────────────────────────────────
    category: "coffee",
  };
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function Page({
  params,
}: {
  params?: { slug?: string };
}) {
  const slug = params?.slug;
  const products = await fetchProducts(slug);
  const items = products.slice(0, 50);

  // ── ItemList JSON-LD (Google Shopping / Search) ──────────────────────────
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Specialty Coffee Beans — Coffee Genius",
    description:
      "Freshly roasted specialty coffee beans. Single origins, blends, espresso and filter roasts. Roasted to order in Staines, Surrey, UK.",
    url: `${SITE_URL}/coffee`,
    numberOfItems: items.length,
    itemListElement: items.map((p: Product, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/coffee/${encodeURIComponent(String(p.slug))}`,
      name: p.name,
    })),
  };

  // ── BreadcrumbList JSON-LD ────────────────────────────────────────────────
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: { "@type": "WebPage", "@id": SITE_URL, name: "Home" },
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Coffee Beans",
        item: {
          "@type": "WebPage",
          "@id": `${SITE_URL}/coffee`,
          name: "Coffee Beans",
        },
      },
    ],
  };

  // ── LocalBusiness JSON-LD (boosts local "near me" searches) ──────────────
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "CoffeeShop"],
    name: "Coffee Genius",
    url: SITE_URL,
    image: products[0]?.img ?? "",
    description:
      "Small-batch specialty coffee roaster in Staines, Surrey. Buy freshly roasted coffee beans online with UK delivery.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "173 High Street",
      addressLocality: "Staines",
      addressRegion: "Surrey",
      postalCode: "TW18 4PA",
      addressCountry: "GB",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 51.4327,
      longitude: -0.5074,
    },
    telephone: "+44-7444-724389",
    email: "info@coffeegenius.co.uk",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "17:00",
      },
    ],
    priceRange: "££",
    servesCuisine: "Coffee",
    hasMap: `https://maps.google.com/?q=173+High+Street+Staines+TW18+4PA`,
    sameAs: ["https://www.instagram.com/coffeegeniuscg"],
  };

  return (
    <>
      {/* ItemList schema — helps Google show products in search results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      {/* Breadcrumb schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* LocalBusiness schema — boosts "coffee near me" / local SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }}
      />

      {/* Hydration data for CoffeeClient */}
      <script
        id="initial-products"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(products) }}
      />

      <CoffeeClient params={params ?? {}} />
    </>
  );
}