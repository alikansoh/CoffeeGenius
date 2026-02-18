import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { notFound } from "next/navigation";
import { getCoffeeById, getCoffees } from "@/lib/coffee";

const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

// Pre-generate static routes
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

  // Build offers safely (numeric prices)
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
      availability: `https://schema.org/${(product.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"}`,
      sku: product.sku ?? product.slug,
    };
  }

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: normalizedImages,
    description: product.description ?? product.notes ?? "",
    sku: product.sku ?? product.variants?.[0]?.sku,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand }
      : undefined,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": productUrl,
    },
  };

  if (offers) {
    productJsonLd.offers = offers;
  }

  if (product.aggregateRating) {
    productJsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.aggregateRating.ratingValue),
      reviewCount: String(product.aggregateRating.reviewCount),
    };
  }

  // Breadcrumb: include `name` inside each `item` object to avoid "Unnamed item" in validators
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "WebPage",
          "@id": SITE_URL,
          "name": "Home"
        }
      },
      {
        "@type": "ListItem",
        "position": 2,
        "item": {
          "@type": "WebPage",
          "@id": `${SITE_URL}/coffee`,
          "name": "Shop"
        }
      },
      {
        "@type": "ListItem",
        "position": 3,
        "item": {
          "@type": "WebPage",
          "@id": productUrl,
          "name": product.name
        }
      }
    ],
  };

  // Only render Product JSON-LD if it meets Google's requirement:
  // at least one of offers or aggregateRating must be present.
  const shouldRenderProductJsonLd = Boolean(offers) || Boolean(product.aggregateRating);

  return (
    <>
      {shouldRenderProductJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productJsonLd),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumb),
        }}
      />
      <script
        id="initial-product"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(product),
        }}
      />
      <CoffeeClient />
    </>
  );
}