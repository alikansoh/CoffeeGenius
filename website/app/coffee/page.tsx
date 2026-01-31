import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import { getCoffees, mapApiCoffeesToProducts, type Product } from "@/lib/coffee";

const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

async function fetchProducts(slug?: string): Promise<Product[]> {
  const apiCoffees = await getCoffees(slug);
  return mapApiCoffeesToProducts(apiCoffees);
}

// SEO-optimized metadata for /coffee listing
export async function generateMetadata(): Promise<Metadata> {
  const products = await fetchProducts();
  const count = products.length;

  const title =
    count > 0
      ? `${count} Specialty Coffee Beans in Staines — Coffee Genius`
      : "Specialty Coffee Beans in Staines — Coffee Genius";

  const description =
    "Buy freshly roasted specialty coffee beans in Staines (TW18). Single origins, blends, espresso & filter roasts. Free local pickup & UK shipping — order online.";

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `${SITE_URL}/coffee` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/coffee`,
      siteName: "Coffee Genius",
      images:
        products[0]?.img
          ? [{ url: products[0]!.img.startsWith("http") ? products[0]!.img : `${SITE_URL}${products[0]!.img}`, width: 1200, height: 630 }]
          : [],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images:
        products[0]?.img
          ? [products[0]!.img.startsWith("http") ? products[0]!.img : `${SITE_URL}${products[0]!.img}`]
          : [],
    },
  };
}

export default async function Page({ params }: { params?: { slug?: string } }) {
  const slug = params?.slug;
  const products = await fetchProducts(slug);
  const items = products.slice(0, 50); // limit JSON-LD size

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p: Product, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        url: `${SITE_URL}/coffee/${encodeURIComponent(String(p.slug))}`,
        image: p.img ? (p.img.startsWith("http") ? p.img : `${SITE_URL}${p.img}`) : undefined,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script id="initial-products" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(products) }} />
      <CoffeeClient params={params ?? {}} />
    </>
  );
}