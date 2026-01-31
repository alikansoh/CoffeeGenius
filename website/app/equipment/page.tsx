import React from "react";
import type { Metadata } from "next";
import EquipmentClient from "./EquipmentClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

interface ApiEquipment {
  _id?: string;
  id?: string;
  slug?: string;
  name?: string;
  brand?: string;
  category?: string;
  features?: string[];
  price?: number; // pounds
  pricePence?: number;
  pricePenceMin?: number;
  img?: string; // public id or url
  imgPublicId?: string;
  imgUrl?: string;
  totalStock?: number;
  stock?: number;
  notes?: string;
  description?: string;
}

/* canonical equipment product shape used by client */
export interface EquipmentProduct {
  id: string;
  slug?: string;
  name: string;
  brand?: string;
  category?: string;
  features?: string[];
  price?: number;
  img?: string;
  stock?: number;
  notes?: string;
  description?: string;
}

/* fetch list from internal API and normalise to EquipmentProduct[] */
async function fetchEquipmentFromApi(limit = 200): Promise<EquipmentProduct[]> {
  const base = SITE_URL.replace(/\/$/, "");
  const url = `${base}/api/equipment?limit=${encodeURIComponent(String(limit))}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.error("fetchEquipmentFromApi non-ok", res.status, url);
      return [];
    }
    const json = (await res.json()) as { data?: ApiEquipment[] } | ApiEquipment[];
    const raw: ApiEquipment[] = Array.isArray(json) ? json : (json.data ?? []);

    const products: EquipmentProduct[] = raw.map((r) => {
      // Resolve image url: prefer imgUrl, then imgPublicId/img
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
      let imgUrl: string | undefined = undefined;
      if (typeof r.imgUrl === "string" && r.imgUrl.trim()) imgUrl = r.imgUrl;
      else {
        const pid = (typeof r.imgPublicId === "string" && r.imgPublicId.trim()) ? r.imgPublicId : (typeof r.img === "string" && r.img.trim() ? r.img : undefined);
        if (pid) {
          if (pid.startsWith("http://") || pid.startsWith("https://")) imgUrl = pid;
          else if (cloudName) imgUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${pid}`;
        }
      }

      // Price resolution (pounds)
      let price = undefined as number | undefined;
      if (typeof r.price === "number" && Number.isFinite(r.price)) price = Number(r.price);
      else if (typeof r.pricePence === "number" && Number.isFinite(r.pricePence)) price = Number((r.pricePence) / 100);
      else if (typeof r.pricePenceMin === "number" && Number.isFinite(r.pricePenceMin)) price = Number((r.pricePenceMin) / 100);

      const idVal = (r._id ?? r.id ?? r.slug ?? "").toString() || Math.random().toString(36).slice(2, 9);

      return {
        id: String(idVal),
        slug: typeof r.slug === "string" ? r.slug : undefined,
        name: typeof r.name === "string" && r.name.trim() ? r.name : "Untitled product",
        brand: typeof r.brand === "string" ? r.brand : undefined,
        category: typeof r.category === "string" ? r.category : undefined,
        features: Array.isArray(r.features) ? r.features.filter((f): f is string => typeof f === "string") : undefined,
        price: price === undefined ? undefined : Number(price.toFixed(2)),
        img: imgUrl,
        stock: typeof r.totalStock === "number" ? r.totalStock : (typeof r.stock === "number" ? r.stock : undefined),
        notes: typeof r.notes === "string" ? r.notes : undefined,
        description: typeof r.description === "string" ? r.description : undefined,
      } as EquipmentProduct;
    });

    return products;
  } catch (err) {
    console.error("fetchEquipmentFromApi error", err);
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const products = await fetchEquipmentFromApi(12);
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
  const products = await fetchEquipmentFromApi(200);
  const items = products.slice(0, 50);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p, i) => ({
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