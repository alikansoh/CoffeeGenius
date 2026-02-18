import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { notFound } from "next/navigation";
import { getCoffeeById, getCoffees } from "@/lib/coffee";

const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

// ─── Static params ────────────────────────────────────────────────────────────

export async function generateStaticParams() {
  try {
    const coffees = await getCoffees();
    return coffees.map((coffee) => ({
      id: coffee.slug || coffee._id,
    }));
  } catch (error) {
    console.error("Error generating static params for coffee:", error);
    return [];
  }
}

export const dynamicParams = true;

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id?: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";

  if (!id) {
    return {
      title: "Coffee — Coffee Genius",
      description: "Explore our coffees at Coffee Genius.",
      metadataBase: new URL(SITE_URL),
    };
  }

  const product = await getCoffeeById(id);

  if (!product) {
    return {
      title: "Product not found — Coffee Genius",
      description: "Product not found.",
      metadataBase: new URL(SITE_URL),
    };
  }

  const title = `${product.name} — Specialty Coffee in Staines | Coffee Genius`;
  const description = (
    product.description ||
    product.notes ||
    `Buy ${product.name} — freshly roasted specialty coffee.`
  ).slice(0, 160);

  const images = Array.isArray(product.img)
    ? product.img
    : product.images ?? [String(product.img)];

  const normalizedImages = images
    .filter(Boolean)
    .map((img: string) =>
      img.startsWith("http")
        ? img
        : `${SITE_URL}${img.startsWith("/") ? img : `/${img}`}`
    );

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
      type: "website",
      images: normalizedImages.slice(0, 5).map((url) => ({
        url,
        width: 1200,
        height: 1200,
      })),
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: normalizedImages.length ? [normalizedImages[0]] : [],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Page({
  params,
}: {
  params: Promise<{ id?: string }>;
}) {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";

  if (!id) return notFound();

  const product = await getCoffeeById(id);
  if (!product) return notFound();

  const productUrl = `${SITE_URL}/coffee/${encodeURIComponent(id)}`;

  // ── Normalise images ──────────────────────────────────────────────────────

  const rawImages = Array.isArray(product.img)
    ? product.img
    : product.images ?? [String(product.img)];

  const normalizedImages = rawImages
    .filter(Boolean)
    .map((img: string) =>
      img.startsWith("http")
        ? img
        : `${SITE_URL}${img.startsWith("/") ? img : `/${img}`}`
    );

  // ── Offers ────────────────────────────────────────────────────────────────

  let offers: Record<string, unknown> | undefined;

  if (product.variants && product.variants.length > 0) {
    const validVariants = product.variants.filter((v) => v.price > 0);

    if (validVariants.length > 0) {
      const low = Math.min(...validVariants.map((v) => v.price));
      const high = Math.max(...validVariants.map((v) => v.price));

      offers = {
        "@type": "AggregateOffer",
        lowPrice: parseFloat(low.toFixed(2)),
        highPrice: parseFloat(high.toFixed(2)),
        offerCount: validVariants.length,
        priceCurrency: product.currency ?? "GBP",
        offers: validVariants.map((v) => ({
          "@type": "Offer",
          url: productUrl,
          price: parseFloat(v.price.toFixed(2)),
          priceCurrency: product.currency ?? "GBP",
          availability: `https://schema.org/${v.stock > 0 ? "InStock" : "OutOfStock"}`,
          sku: v.sku,
        })),
      };
    }
  } else if (product.minPrice && product.minPrice > 0) {
    offers = {
      "@type": "Offer",
      url: productUrl,
      price: parseFloat(product.minPrice.toFixed(2)),
      priceCurrency: product.currency ?? "GBP",
      availability: `https://schema.org/${
        (product.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"
      }`,
      sku: product.sku ?? product.slug,
    };
  }

  // ── Product JSON-LD ───────────────────────────────────────────────────────
  // Only emit if Google's minimum requirements are met (offers OR aggregateRating).

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: normalizedImages,
    description: product.description ?? product.notes ?? "",
    sku: product.sku ?? product.variants?.[0]?.sku,
    ...(product.brand && { brand: { "@type": "Brand", name: product.brand } }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": productUrl,
    },
    ...(offers && { offers }),
    ...(product.aggregateRating && {
      aggregateRating: {
        "@type": "AggregateRating",
        // Numeric values are required by Google's validator
        ratingValue: Number(product.aggregateRating.ratingValue),
        reviewCount: Number(product.aggregateRating.reviewCount),
      },
    }),
  };

  const shouldRenderProductJsonLd =
    Boolean(offers) || Boolean(product.aggregateRating);

  // ── Breadcrumb JSON-LD ────────────────────────────────────────────────────
  // FIX: each `item` must be a WebPage object with @type, @id AND name.
  // Using a plain URL string causes Google Search Console to show "Unnamed item"
  // because it parses the item as a generic Thing with no name property.

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: {
          "@type": "WebPage",
          "@id": SITE_URL,
          name: "Home",
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: {
          "@type": "WebPage",
          "@id": `${SITE_URL}/coffee`,
          name: "Shop",
        },
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: {
          "@type": "WebPage",
          "@id": productUrl,
          name: product.name,
        },
      },
    ],
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {shouldRenderProductJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* Hydration payload consumed by CoffeeClient */}
      <script
        id="initial-product"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />

      <CoffeeClient />
    </>
  );
}