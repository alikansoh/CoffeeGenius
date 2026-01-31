import React from "react";
import type { Metadata } from "next";
import EquipmentClient from "./EquipmentClient";
import { notFound } from "next/navigation";

const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

interface ApiEquipment {
  _id: string;
  slug: string;
  name: string;
  brand?: string;
  category?: string;
  features?: string[];
  notes?: string;
  description?: string;
  specs?: Record<string, unknown>;
  pricePence?: number;
  price?: number;
  minPrice?: number;
  minPricePence?: number;
  imgPublicId?: string;
  imgUrl?: string;
  imagesPublicIds?: string[];
  imagesUrls?: string[];
  totalStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Helper to map a Cloudinary public id to an absolute image URL */
function cloudinaryImageUrl(publicId: string): string {
  if (!publicId) return "";
  if (/^https?:\/\//i.test(publicId)) return publicId;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${publicId}`;
}

/** Helper to map a Cloudinary public id to an absolute video URL */
function cloudinaryVideoUrl(publicId: string): string {
  if (!publicId) return "";
  if (/^https?:\/\//i.test(publicId)) return publicId;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/video/upload/${publicId}`;
}

async function fetchEquipmentFromApi(slug: string): Promise<ApiEquipment | null> {
  const base = SITE_URL.replace(/\/$/, "");
  const url1 = `${base}/api/equipment/${encodeURIComponent(slug)}`;
  const url2 = `${base}/api/equipment?search=${encodeURIComponent(slug)}`;

  try {
    let res = await fetch(url1, { next: { revalidate: 60 } });
    if (!res.ok) {
      // fallback to search endpoint
      res = await fetch(url2, { next: { revalidate: 60 } });
      if (!res.ok) return null;
      const json = await res.json();
      const found = (json.data ?? [])[0];
      return (found as ApiEquipment) ?? null;
    }
    const json = await res.json();
    return (json.data as ApiEquipment) ?? (json as ApiEquipment) ?? null;
  } catch (err) {
    console.error("fetchEquipmentFromApi failed", err);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchEquipmentFromApi(slug);
  if (!product) {
    return {
      title: "Equipment not found — Coffee Genius",
      description: "Equipment not found.",
      metadataBase: new URL(SITE_URL),
    };
  }

  const title = `${product.name}${product.brand ? ` — ${product.brand}` : ""} | Equipment — Coffee Genius`;
  const description = (product.description || product.notes || `${product.name} — shop equipment at Coffee Genius.`).slice(0, 160);

  // images for OG
  const images: string[] = [];
  if (product.imagesUrls && product.imagesUrls.length > 0) {
    images.push(...product.imagesUrls.slice(0, 3));
  } else if (product.imagesPublicIds && product.imagesPublicIds.length > 0) {
    images.push(...product.imagesPublicIds.slice(0, 3).map(cloudinaryImageUrl));
  } else if (product.imgUrl) {
    images.push(product.imgUrl);
  } else if (product.imgPublicId) {
    images.push(cloudinaryImageUrl(product.imgPublicId));
  }

  const alternates: Metadata["alternates"] = { canonical: `${SITE_URL}/equipment/${encodeURIComponent(slug)}` };

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/equipment/${encodeURIComponent(slug)}`,
      siteName: "Coffee Genius",
      images: images.map((url) => ({ url, width: 1200, height: 630 })),
      // Next.js expects a supported OG type; "website" is safe.
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.length ? [images[0]] : [],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchEquipmentFromApi(slug);
  if (!product) return notFound();

  const productUrl = `${SITE_URL}/equipment/${encodeURIComponent(slug)}`;

  // build images array (absolute URLs) for JSON-LD
  const imagesRaw: string[] =
    product.imagesUrls && product.imagesUrls.length > 0
      ? product.imagesUrls
      : product.imagesPublicIds && product.imagesPublicIds.length > 0
      ? product.imagesPublicIds.map((id) => cloudinaryImageUrl(id))
      : product.imgUrl
      ? [product.imgUrl]
      : product.imgPublicId
      ? [cloudinaryImageUrl(product.imgPublicId)]
      : [];

  const priceValue = (() => {
    if (typeof product.price === "number" && product.price > 0) return product.price;
    if (typeof product.minPrice === "number" && product.minPrice > 0) return product.minPrice;
    if (typeof product.pricePence === "number") return product.pricePence / 100;
    if (typeof product.minPricePence === "number") return product.minPricePence / 100;
    return 0;
  })();

  const offers: Record<string, unknown> = {
    "@type": "Offer",
    url: productUrl,
    price: priceValue.toFixed(2),
    priceCurrency: "GBP",
    availability: `https://schema.org/${(product.totalStock ?? 0) > 0 ? "InStock" : "OutOfStock"}`,
  };

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: imagesRaw,
    description: product.description ?? product.notes ?? "",
    sku: product._id,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    offers,
    mainEntityOfPage: { "@type": "WebPage", "@id": productUrl },
  };

  const breadcrumb: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Equipment", item: `${SITE_URL}/equipment` },
      { "@type": "ListItem", position: 3, name: product.name, item: productUrl },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Hydration payload for the client */}
      <script id="initial-equipment" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }} />

      <EquipmentClient />
    </>
  );
}