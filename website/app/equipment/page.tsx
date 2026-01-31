import React from "react";
import type { Metadata } from "next";
import EquipmentClient from "./EquipmentClient";
import { getEquipment, mapApiEquipmentToProducts, type EquipmentProduct } from "@/lib/equipment";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

async function fetchEquipmentFromDb(limit = 200): Promise<EquipmentProduct[]> {
  const raw = await getEquipment(limit);
  return mapApiEquipmentToProducts(raw);
}

export async function generateMetadata(): Promise<Metadata> {
  const products = await fetchEquipmentFromDb(12);
  const title = "Equipment — Coffee Genius";
  const description = "Shop espresso machines, grinders, brewers and accessories. Curated gear for home baristas and cafés — UK delivery and local pickup.";

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `${SITE_URL}/equipment` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/equipment`,
      siteName: "Coffee Genius",
      images: products[0]?.img ? [{ url: products[0]!.img!, width: 1200, height: 800 }] : [],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: products[0]?.img ? [products[0]!.img!] : [],
    },
  };
}

export default async function Page() {
  const products = await fetchEquipmentFromDb(200);
  const items = products.slice(0, 50);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p: EquipmentProduct, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        url: `${SITE_URL}/equipment/${encodeURIComponent(String(p.slug ?? p.id))}`,
        image: p.img,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script id="initial-products" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(products) }} />
      <EquipmentClient />
    </>
  );
}