import React from "react";
import type { Metadata } from "next";
import AllPostsClient from "./BlogClient";
import { notFound } from "next/navigation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

/** Server mapping similar to client mapping */
type RawPost = {
  _id?: string;
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  content?: string;
  date?: string;
  imagePublicId?: string;
  imageFormat?: string;
  tags?: unknown;
  updatedAt?: string;
  createdAt?: string;
};

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  image?: string;
  tags?: string[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => toString(x)).filter(Boolean);
  return [];
}

function getCloudinaryUrl(publicId?: string, format?: string) {
  if (!publicId || !format) return undefined;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "drjpzgjn7";
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_1200,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
}

async function fetchPostsServer(limit = 50): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/posts?limit=${limit}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json: unknown = await res.json().catch(() => null);
    const arr: unknown[] = Array.isArray(json)
      ? json
      : isObject(json) && Array.isArray(json.data)
      ? (json.data as unknown[])
      : [];

    return arr.map((post, idx) => {
      const rec = isObject(post) ? post : ({} as Record<string, unknown>);
      const id = toString(rec._id ?? rec.id ?? `anon-${idx}`);
      const title = toString(rec.title ?? "Untitled post");
      const slug = toString(rec.slug ?? id);
      const description = toString(rec.description ?? rec.content ?? "");
      const date = toString(rec.date ?? rec.updatedAt ?? rec.createdAt ?? new Date().toISOString());
      const image = getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat)) ?? undefined;
      const tags = toStringArray(rec.tags);
      return { id, title, slug, description, date, image, tags } as BlogPost;
    });
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const posts = await fetchPostsServer(10); // fetch a few to populate OG, description
  const title = "Blog — Coffee Genius";
  const description = posts.length
    ? `Latest posts: ${posts.slice(0, 3).map((p) => p.title).join(" • ")}`
    : "Discover insights, stories, and updates from Coffee Genius.";

  const ogImage = posts.find((p) => p.image)?.image ?? `${SITE_URL}/og-image.JPG`;

  const alternates: Metadata["alternates"] = { canonical: `${SITE_URL}/blog` };

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/blog`,
      siteName: "Coffee Genius",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Page() {
  const posts = await fetchPostsServer(100); // fetch posts server-side to include in JSON-LD and hydrate client
  if (!posts) return notFound();

  const pageUrl = `${SITE_URL}/blog`;
  const ogImage = posts.find((p) => p.image)?.image ?? `${SITE_URL}/og-image.JPG`;

  // Build ItemList JSON-LD for posts
  const items = posts.slice(0, 100).map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: `${pageUrl}/${encodeURIComponent(p.slug)}`,
      datePublished: p.date,
      image: p.image ? p.image : undefined,
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
      { "@type": "ListItem", position: 2, name: "Blog", item: pageUrl },
    ],
  } as Record<string, unknown>;

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Blog — Coffee Genius",
    description: "Discover insights, stories, and updates from Coffee Genius.",
    url: pageUrl,
    image: [ogImage],
  } as Record<string, unknown>;

  return (
    <>
      {/* JSON-LD structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />

      {/* Hydration payload: client will use this if available to avoid extra fetch */}
      <script id="initial-blog-posts" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(posts) }} />

      {/* Client rendering */}
      <AllPostsClient initialPosts={posts} />
    </>
  );
}