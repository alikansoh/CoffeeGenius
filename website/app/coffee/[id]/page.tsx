import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { notFound } from "next/navigation";
import { getCoffeeById, getCoffees, type ApiCoffee } from "@/lib/coffee";

const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

// ✅ ADD THIS: Tell Next.js which routes to pre-generate
export async function generateStaticParams() {
  try {
    const coffees = await getCoffees();
    
    // Generate paths for all coffee products
    return coffees.map((coffee) => ({
      id: coffee.slug || coffee._id,
    }));
  } catch (error) {
    console.error("Error generating static params for coffee:", error);
    return []; // Return empty array if error
  }
}

// ✅ ADD THIS: Allow dynamic routes not in generateStaticParams
export const dynamicParams = true;

// ✅ ADD THIS: Force dynamic rendering if needed (optional)
// export const dynamic = 'force-dynamic';

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

  const product = await getCoffeeById(id);
  
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
      type: "website",
      images: images.slice(0, 5).map((img: string) => ({ 
        url: img.startsWith("http") ? img : `${SITE_URL}${img}`, 
        width: 1200, 
        height: 1200 
      })),
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

export default async function Page({ params }: { params: Promise<{ id?: string }> }) {
  const resolved = await params;
  const id = resolved?.id?.toString().trim() ?? "";

  if (!id) return notFound();

  const product = await getCoffeeById(id);
  if (!product) return notFound();

  const productUrl = `${SITE_URL}/coffee/${encodeURIComponent(id)}`;
  const images = Array.isArray(product.img) ? product.img : product.images ?? [String(product.img)];

  // Build structured Offer / AggregateOffer
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

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: images.map((i: string) => (i.startsWith("http") ? i : `${SITE_URL}${i}`)),
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
      <script id="initial-product" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }} />
      <CoffeeClient />
    </>
  );
}