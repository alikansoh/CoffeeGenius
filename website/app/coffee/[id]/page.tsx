import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { notFound } from "next/navigation";
import { getCoffeeById, getCoffees } from "@/lib/coffee";

const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

function toCloudinaryImageUrl(publicId: string): string {
  if (!publicId) return "";
  if (/^https?:\/\//i.test(publicId)) return publicId;
  const encoded = publicId
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/w_1200,c_limit,q_auto:best,f_auto,fl_progressive/${encoded}`;
}

export async function generateStaticParams() {
  try {
    const coffees = await getCoffees();
    return coffees.map((coffee) => ({ id: coffee.slug || coffee._id }));
  } catch (error) {
    console.error("Error generating static params for coffee:", error);
    return [];
  }
}

export const dynamicParams = true;

// ── Per-product metadata ─────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id?: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";

  if (!id) {
    return {
      title: "Coffee Beans — Coffee Genius",
      description:
        "Browse freshly roasted specialty coffee beans at Coffee Genius, Staines.",
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

  // ── Dynamic title — includes roast type & origin when available ─────────
  const roastLabel = product.roastType
    ? product.roastType === "espresso"
      ? "Espresso Roast"
      : "Filter Roast"
    : "Specialty Coffee";

  const originLabel = product.origin ? ` from ${product.origin}` : "";

  const title = `${product.name}${originLabel} — ${roastLabel} | Coffee Genius`;

  // ── Rich description: pull flavour notes + origin + process ────────────
  const notesSnippet = product.notes ? ` Tasting notes: ${product.notes}.` : "";
  const originSnippet = product.origin
    ? ` Origin: ${product.origin}.`
    : "";
  const processSnippet = product.process
    ? ` Process: ${product.process}.`
    : "";

  const baseDesc =
    product.description ||
    `Buy ${product.name} — freshly roasted ${roastLabel.toLowerCase()} beans${originLabel}.`;

  const description = `${baseDesc}${notesSnippet}${originSnippet}${processSnippet} Roasted to order in Staines, Surrey. UK delivery.`.slice(
    0,
    160
  );

  // ── Keywords: product-specific + generic coffee terms ──────────────────
  const keywords = [
    product.name,
    product.origin && `${product.origin} coffee`,
    product.origin && `${product.origin} coffee beans`,
    product.process && `${product.process} process coffee`,
    product.roastType === "espresso" && "espresso beans",
    product.roastType === "filter" && "filter coffee beans",
    product.notes,
    "specialty coffee beans UK",
    "buy coffee beans online",
    "freshly roasted coffee",
    "single origin coffee",
    "small batch roastery",
    "coffee beans Staines",
    "coffee beans Surrey",
    "whole bean coffee UK",
    "ground coffee UK",
    "roasted to order coffee",
    "best coffee beans UK",
    "artisan coffee UK",
    "Coffee Genius",
  ]
    .filter(Boolean)
    .join(", ");

  const rawImages = Array.isArray(product.img)
    ? product.img
    : product.images ?? [String(product.img)];

  const ogImages = rawImages
    .filter(Boolean)
    .map((img: string) => toCloudinaryImageUrl(img));

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `${SITE_URL}/coffee/${encodeURIComponent(id)}` },

    // ── Open Graph ──────────────────────────────────────────────────────
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/coffee/${encodeURIComponent(id)}`,
      siteName: "Coffee Genius",
      type: "website",
      images: ogImages.slice(0, 5).map((url) => ({
        url,
        width: 1200,
        height: 1200,
        alt: `${product.name} — Coffee Genius`,
      })),
      locale: "en_GB",
    },

    // ── Twitter / X ──────────────────���──────────────────────────────────
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImages.length ? [ogImages[0]] : [],
    },

    // ── Robots ──────────────────────────────────────────────────────────
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

    // ── Other ───────────────────────────────────────────────────────────
    category: "coffee",
  };
}

// ── Page ────────────────────────────────────────────────────────────────────
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
  const currency = product.currency ?? "GBP";

  const rawImages = Array.isArray(product.img)
    ? product.img
    : product.images ?? [String(product.img)];

  const normalizedImages = rawImages
    .filter(Boolean)
    .map((img: string) => toCloudinaryImageUrl(img));

  // ── Offers ────────────────────────────────────────────────────────────────
  let offers: Record<string, unknown> | undefined;

  const validVariants = (product.variants ?? []).filter((v) => v.price > 0);

  if (validVariants.length > 0) {
    const low = Math.min(...validVariants.map((v) => v.price));
    const high = Math.max(...validVariants.map((v) => v.price));
    offers = {
      "@type": "AggregateOffer",
      lowPrice: parseFloat(low.toFixed(2)),
      highPrice: parseFloat(high.toFixed(2)),
      offerCount: validVariants.length,
      priceCurrency: currency,
      offers: validVariants.map((v) => ({
        "@type": "Offer",
        url: productUrl,
        price: parseFloat(v.price.toFixed(2)),
        priceCurrency: currency,
        availability: `https://schema.org/${v.stock > 0 ? "InStock" : "OutOfStock"}`,
        sku: v.sku,
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: "5.00",
            currency: "GBP",
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "GB",
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 1,
              maxValue: 3,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 2,
              maxValue: 4,
              unitCode: "DAY",
            },
          },
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "GB",
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 30,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/ReturnShippingFees",
        },
      })),
    };
  } else if (product.availableSizes && product.availableSizes.length > 0) {
    const sizePrices = product.availableSizes.filter((s) => s.price > 0);
    if (sizePrices.length > 0) {
      const low = Math.min(...sizePrices.map((s) => s.price));
      const high = Math.max(...sizePrices.map((s) => s.price));
      offers = {
        "@type": "AggregateOffer",
        lowPrice: parseFloat(low.toFixed(2)),
        highPrice: parseFloat(high.toFixed(2)),
        offerCount: sizePrices.length,
        priceCurrency: currency,
        offers: sizePrices.map((s) => ({
          "@type": "Offer",
          url: productUrl,
          price: parseFloat(s.price.toFixed(2)),
          priceCurrency: currency,
          availability: `https://schema.org/${(s.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"}`,
        })),
      };
    }
  } else if (product.minPrice && product.minPrice > 0) {
    offers = {
      "@type": "Offer",
      url: productUrl,
      price: parseFloat(product.minPrice.toFixed(2)),
      priceCurrency: currency,
      availability: `https://schema.org/${
        (product.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"
      }`,
      sku: product.sku ?? product.slug,
    };
  }

  // ── Product JSON-LD ──────────────────────────────────────────────────────���
  const hasOffers = Boolean(offers);
  const hasRating = Boolean(product.aggregateRating);
  const shouldRenderProductJsonLd = hasOffers || hasRating;

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: normalizedImages,
    description: product.description ?? product.notes ?? "",
    sku: product.sku ?? product.variants?.[0]?.sku,
    category: "Coffee Beans",
    ...(product.brand && { brand: { "@type": "Brand", name: product.brand } }),
    ...(product.origin && {
      countryOfOrigin: { "@type": "Country", name: product.origin },
    }),
    mainEntityOfPage: { "@type": "WebPage", "@id": productUrl },
    ...(offers && { offers }),
    ...(product.aggregateRating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: Number(product.aggregateRating.ratingValue),
        reviewCount: Number(product.aggregateRating.reviewCount),
      },
    }),
  };

  // ── Breadcrumb JSON-LD ────────────────────────────────────────────────────
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
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: { "@type": "WebPage", "@id": productUrl, name: product.name },
      },
    ],
  };

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

      <script
        id="initial-product"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />

      <CoffeeClient />
    </>
  );
}