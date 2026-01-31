import React from "react";
import type { Metadata } from "next";
import CoffeeClassesClient from "./ClassesClient";
import { getClasses, type CourseSummary } from "@/lib/classes";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const courses = await getClasses();
  const title = "Coffee Classes — Coffee Genius";
  const description =
    "Hands-on coffee classes and workshops — brewing, latte art and barista training at Coffee Genius. Book online.";

  const ogImage = courses.find((c: CourseSummary) => c.image && c.image.length > 0)?.image ?? `${SITE_URL}/og-image.JPG`;

  const alternates: Metadata["alternates"] = { canonical: `${SITE_URL}/classes` };

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/classes`,
      siteName: "Coffee Genius",
      images: ogImage ? [{ url: ogImage.startsWith("http") ? ogImage : `${SITE_URL}${ogImage}`, width: 1200, height: 630 }] : [],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage.startsWith("http") ? ogImage : `${SITE_URL}${ogImage}`] : [],
    },
  };
}

export default async function Page() {
  const courses = await getClasses();

  const items = courses.slice(0, 50).map((c: CourseSummary, i: number) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "Course",
      name: c.title,
      description: c.summary || c.description,
      url: `${SITE_URL}/classes/${encodeURIComponent(c.id)}`,
      image: c.image ? (c.image.startsWith("http") ? c.image : `${SITE_URL}${c.image}`) : undefined,
    },
  }));

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items,
  } as Record<string, unknown>;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Coffee Classes", item: `${SITE_URL}/classes` },
    ],
  } as Record<string, unknown>;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <script id="initial-courses" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courses) }} />

      <CoffeeClassesClient />
    </>
  );
}