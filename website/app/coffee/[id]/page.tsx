import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { notFound } from "next/navigation";

const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

interface ApiSizePrice {
  size: string;
  price: number;
  availableGrinds?: string[];
  totalStock?: number;
}

interface ApiVariant {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  price: number;
  stock: number;
  img: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiCoffee {
  _1?: string;
  _id: string;
  slug: string;
  name: string;
  origin: string;
  description?: string;
  notes?: string;
  img: string | string[];
  images?: string[];
  roastLevel?: "light" | "medium" | "dark";
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt?: string;
  variantCount?: number;
  minPrice?: number;
  availableGrinds?: string[];
  availableSizes?: ApiSizePrice[];
  totalStock?: number;
  variants?: ApiVariant[];
  inStock?: boolean;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  story?: string;
  sku?: string;
  brand?: string;
  currency?: string;
  aggregateRating?: { ratingValue: number; reviewCount: number };
}

/**
 * Try to fetch a product by id (first /api/coffee/:id, fallback to /api/coffee?search=:id)
 */
async function fetchProductFromApi(id: string): Promise<ApiCoffee | null> {
  if (!id) return null;
  const base = SITE_URL.replace(/\/$/, "");
  const url1 = `${base}/api/coffee/${encodeURIComponent(id)}`;
  const url2 = `${base}/api/coffee?search=${encodeURIComponent(id)}`;

  try {
    let res = await fetch(url1, { next: { revalidate: 60 } });
    if (!res.ok) {
      res = await fetch(url2, { next: { revalidate: 60 } });
      if (!res.ok) return null;
      const json = await res.json();
      const found = (json.data ?? [])[0];
      return found ?? null;
    }
    const json = await res.json();
    return (json.data ?? json) ?? null;
  } catch (err) {
    console.error("fetchProductFromApi failed", err);
    return null;
  }
}

// IMPORTANT: params is a Promise here — await it before accessing .id
export async function generateMetadata({ params }: { params: Promise<{ id?: string }> }): Promise<Metadata> {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";
  if (!id) {
    return {
      title: "Coffee — Coffee Genius",
      description: "Explore our coffees at Coffee Genius.",
      metadataBase: new URL(SITE_URL),
    };
  }

  const product = await fetchProductFromApi(id);
  if (!product) {
    return {
      title: "Product not found — Coffee Genius",
      description: "Product not found.",
      metadataBase: new URL(SITE_URL),
    };
  }

  const title = `${product.name} — Specialty Coffee in Staines | Coffee Genius`;
  const description = (product.description || product.notes || `Buy ${product.name} — freshly roasted specialty coffee.`).slice(0, 160);

  const images = Array.isArray(product.img) ? product.img : product.images ?? [String(product.img)];

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `${SITE_URL}/coffee/${encodeURIComponent(id)}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/coffee/${encodeURIComponent(id)}`,
      siteName: "Coffee Genius",
      // use "website" (Next metadata validation doesn't accept "product")
      type: "website",
      images: images.slice(0, 5).map((img) => ({ url: img.startsWith("http") ? img : `${SITE_URL}${img}`, width: 1200, height: 1200 })),
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.length ? [images[0].startsWith("http") ? images[0] : `${SITE_URL}${images[0]}`] : [],
    },
  };
}

// Page must also await params if it's a Promise
export default async function Page({ params }: { params: Promise<{ id?: string }> }) {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";

  if (!id) return notFound();

  const product = await fetchProductFromApi(id);
  if (!product) return notFound();

  const productUrl = `${SITE_URL}/coffee/${encodeURIComponent(id)}`;
  const images = Array.isArray(product.img) ? product.img : product.images ?? [String(product.img)];

  // Build structured Offer / AggregateOffer — typed as Record<string, unknown> (no explicit any)
  let offers: Record<string, unknown>;
  if (product.variants && product.variants.length > 0) {
    const low = Math.min(...product.variants.map((v) => v.price));
    const high = Math.max(...product.variants.map((v) => v.price));
    offers = {
      "@type": "AggregateOffer",
      lowPrice: low.toFixed(2),
      highPrice: high.toFixed(2),
      offerCount: product.variants.length,
      priceCurrency: product.currency ?? "GBP",
      offers: product.variants.map((v) => ({
        "@type": "Offer",
        url: productUrl,
        price: v.price.toFixed(2),
        priceCurrency: product.currency ?? "GBP",
        availability: `https://schema.org/${v.stock > 0 ? "InStock" : "OutOfStock"}`,
        sku: v.sku,
      })),
    };
  } else {
    offers = {
      "@type": "Offer",
      url: productUrl,
      price: (product.minPrice ?? 0).toFixed(2),
      priceCurrency: product.currency ?? "GBP",
      availability: `https://schema.org/${(product.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"}`,
      sku: product.sku ?? product.slug,
    };
  }

  // Product JSON-LD typed as Record<string, unknown> to avoid `any`
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: images.map((i) => (i.startsWith("http") ? i : `${SITE_URL}${i}`)),
    description: product.description ?? product.notes ?? "",
    sku: product.sku ?? (product.variants && product.variants[0]?.sku) ?? undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": productUrl },
    offers,
  };

  if (product.aggregateRating) {
    (productJsonLd as Record<string, unknown>).aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.aggregateRating.ratingValue),
      reviewCount: String(product.aggregateRating.reviewCount),
    };
  }

  const breadcrumb: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/coffee` },
      { "@type": "ListItem", position: 3, name: product.name, item: productUrl },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Hydration payload so the client avoids an initial fetch */}
      <script id="initial-product" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }} />

      <CoffeeClient />
    </>
  );
}