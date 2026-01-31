import React from "react";
import type { Metadata } from "next";
import CoffeeClassesClient from "./ClassesClient";
import { notFound } from "next/navigation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

type CourseSummary = {
  id: string;
  title: string;
  subtitle?: string;
  price: number;
  summary: string;
  description: string;
  durationMinutes: number;
  capacity: number;
  instructor: { name: string; avatar?: string };
  image?: string;
  featured?: boolean;
  sessions?: { id: string; start: string; end: string }[];
  thingsToNote?: string[];
  location?: string;
  level?: string;
};

/* Helper type guards and normalizers */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function toString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}
function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => toString(x, "")).filter(Boolean);
  return [];
}

async function fetchCoursesFromApi(q?: string): Promise<CourseSummary[]> {
  try {
    const url = q ? `${SITE_URL}/api/classes?q=${encodeURIComponent(q)}` : `${SITE_URL}/api/classes`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];

    const json: unknown = await res.json().catch(() => null);
    if (!json) return [];

    // normalize possible shapes: array | { data: [...] } | { result: [...] }
    const maybeArray =
      Array.isArray(json)
        ? (json as unknown[])
        : isObject(json) && Array.isArray(json.data)
        ? (json.data as unknown[])
        : isObject(json) && Array.isArray(json.result)
        ? (json.result as unknown[])
        : [];

    const mapped: CourseSummary[] = maybeArray.map((c, idx) => {
      const rec = isObject(c) ? c : {};

      const rawSessions = Array.isArray(rec.sessions) ? (rec.sessions as unknown[]) : [];
      const sessions = rawSessions.map((s, si) => {
        const sRec = isObject(s) ? s : {};
        const id = toString(sRec.id) || toString(sRec._id) || `s-${idx}-${si}`;
        const start = toString(sRec.start) || toString(sRec.startDate) || toString(sRec.startTime) || "";
        const end = toString(sRec.end) || toString(sRec.endDate) || toString(sRec.endTime) || "";
        return { id, start, end };
      });

      const instructorObj = (() => {
        const ins = rec.instructor;
        if (isObject(ins)) {
          return {
            name: toString(ins.name, toString(rec.instructorName) || "Instructor"),
            avatar: toString(ins.avatar),
          };
        }
        return { name: toString(rec.instructorName) || toString(rec.instructor) || "Instructor" };
      })();

      const images = Array.isArray(rec.images) ? rec.images : undefined;
      const image = images && images.length > 0 ? toString(images[0]) : toString(rec.image ?? rec.photo ?? "");

      const courseId =
        toString(rec._id) || toString(rec.id) || toString(rec.slug) || `anon-${Math.random().toString(36).slice(2)}`;

      return {
        id: courseId,
        title: toString(rec.title) || toString(rec.name) || "Untitled class",
        subtitle: typeof rec.subtitle === "string" ? rec.subtitle : typeof rec.location === "string" ? rec.location : undefined,
        price: toNumber(rec.price ?? rec.cost ?? 0, 0),
        summary: toString(rec.summary ?? rec.excerpt ?? ""),
        description: toString(rec.description ?? rec.details ?? ""),
        durationMinutes: toNumber(rec.durationMinutes ?? rec.duration ?? 0, 0),
        capacity: toNumber(rec.capacity ?? rec.maxCapacity ?? 0, 0),
        instructor: instructorObj,
        image: image || undefined,
        featured: Boolean(rec.featured),
        sessions,
        thingsToNote: toStringArray(rec.thingsToNote ?? rec.notes ?? rec.note ?? rec.noteList),
        location: toString(rec.location ?? rec.venue ?? ""),
        level: toString(rec.level ?? ""),
      } as CourseSummary;
    });

    return mapped;
  } catch (err) {
    console.error("fetchCoursesFromApi error", err);
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const courses = await fetchCoursesFromApi();
  const title = "Coffee Classes — Coffee Genius";
  const description =
    "Hands-on coffee classes and workshops — brewing, latte art and barista training at Coffee Genius. Book online.";

  const ogImage = courses.find((c) => c.image && c.image.length > 0)?.image ?? "";

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
  const courses = await fetchCoursesFromApi();

  if (!courses) return notFound();

  const items = courses.slice(0, 50).map((c, i) => ({
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