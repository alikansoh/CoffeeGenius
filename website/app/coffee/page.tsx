import React from "react";
import type { Metadata } from "next";
import CoffeeClient from "./CoffeeClient";
import type { Product } from "../Components/ProductCard";

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
  _id: string;
  slug: string;
  name: string;
  origin: string;
  notes?: string;
  img: string;
  roastLevel: "light" | "medium" | "dark";
  createdAt: string;
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  availableSizes: ApiSizePrice[];
  totalStock: number;
  variants: ApiVariant[];
  bestSeller?: boolean;
}

async function fetchProductsFromApi(slug?: string): Promise<ApiCoffee[]> {
  const base = SITE_URL.replace(/\/$/, "");
  const searchParam = slug ? `?search=${encodeURIComponent(slug)}` : "";
  const url = `${base}/api/coffee${searchParam}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.error("fetchProducts: non-OK response", res.status, url);
      return [];
    }
    const json = (await res.json()) as { data?: ApiCoffee[] };
    return json.data ?? [];
  } catch (err) {
    console.error("fetchProducts: fetch failed", err, "url:", url);
    return [];
  }
}

async function fetchProducts(slug?: string): Promise<Product[]> {
  const apiCoffees = await fetchProductsFromApi(slug);

  return apiCoffees.map((coffee) => {
    const prices: Record<string, number> = {};
    if (coffee.availableSizes && coffee.availableSizes.length > 0) {
      coffee.availableSizes.forEach((s) => {
        prices[s.size] = s.price;
      });
    } else {
      prices["250g"] = coffee.minPrice;
    }

    return {
      id: coffee._id || coffee.slug,
      name: coffee.name,
      slug: coffee.slug,
      origin: coffee.origin,
      notes: coffee.notes ?? "",
      price: coffee.minPrice,
      prices,
      img: coffee.img,
      roastLevel: coffee.roastLevel,
      grinds: coffee.availableGrinds,
      availableSizes: coffee.availableSizes,
      minPrice: coffee.minPrice,
      variants: coffee.variants,
      bestSeller: coffee.bestSeller,
    } as Product;
  });
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
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        // <-- use /coffee/[slug] for product URLs (your example: /coffee/volcano)
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