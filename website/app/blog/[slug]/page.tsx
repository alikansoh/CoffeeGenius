import React from "react";
import type { Metadata } from "next";
import BlogPostClient from "./BlogPostClient";
import { notFound } from "next/navigation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "drjpzgjn7";

/* -------------------- Types & helpers -------------------- */
type RawPost = Record<string, unknown>;

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content?: string;
  description?: string;
  date: string;
  tags?: string[];
  image?: string;
  author?: string;
  updatedAt?: string;
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
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/w_2000,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
}

/* -------------------- Fetch helpers -------------------- */
async function fetchPostBySlugServer(slug: string | undefined): Promise<BlogPost | null> {
  if (!slug) return null;
  try {
    const res = await fetch(`${SITE_URL}/api/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    const rec = isObject(json) && (isObject((json as Record<string, unknown>).data) || Array.isArray((json as Record<string, unknown>).data))
      ? (json as Record<string, unknown>).data
      : json;
    const postRec = isObject(rec) ? rec : ({} as RawPost);

    const id = toString(postRec._id ?? postRec.id ?? slug);
    const postSlug = toString(postRec.slug ?? slug);
    const title = toString(postRec.title ?? postSlug); // fallback to slug when title absent
    const content = toString(postRec.content ?? "");
    const description = toString(postRec.description ?? "");
    const date = toString(postRec.date ?? postRec.publishedAt ?? postRec.createdAt ?? new Date().toISOString());
    const image = getCloudinaryUrl(toString(postRec.imagePublicId), toString(postRec.imageFormat));
    const tags = toStringArray(postRec.tags);
    const author = toString(postRec.author ?? postRec.authorName ?? "Coffee Genius");
    const updatedAt = toString(postRec.updatedAt ?? "");

    return { id, slug: postSlug, title, content, description, date, tags, image, author, updatedAt };
  } catch (err) {
    console.error("fetchPostBySlugServer error", err);
    return null;
  }
}

async function fetchRecentPostsServer(limit = 4, excludeSlug?: string): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/posts?limit=${limit + 4}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json: unknown = await res.json().catch(() => null);
    const arr: unknown[] = Array.isArray(json)
      ? json
      : (isObject(json) && Array.isArray((json as Record<string, unknown>).data))
      ? ((json as Record<string, unknown>).data as unknown[])
      : [];
    const mapped = (arr || [])
      .map((post, idx) => {
        const rec = isObject(post) ? post : {};
        const id = toString(rec._id ?? rec.id ?? `anon-${idx}`);
        const slug = toString(rec.slug ?? id);
        const title = toString(rec.title ?? slug);
        const description = toString(rec.description ?? rec.content ?? "");
        const date = toString(rec.date ?? rec.updatedAt ?? rec.createdAt ?? new Date().toISOString());
        const image = getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat));
        const tags = toStringArray(rec.tags);
        return { id, slug, title, description, date, image, tags } as BlogPost;
      })
      .filter((p) => p.slug !== excludeSlug)
      .slice(0, limit);
    return mapped;
  } catch (err) {
    console.error("fetchRecentPostsServer error", err);
    return [];
  }
}

/* -------------------- Metadata -------------------- */
/**
 * params is a Promise in Next.js 16's app router runtime for dynamic routes.
 * Await it before accessing properties to avoid the "params is a Promise" error.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPostBySlugServer(slug);
  if (!post) {
    return {
      title: "Post not found",
      description: "Post not found",
    };
  }

  // Use slug as the metadata title (exactly as requested)
  const title = post.slug;
  const description = post.description || (post.content ? `${post.content.slice(0, 160)}` : "Read our latest blog post at Coffee Genius.");
  const ogImage = post.image ?? `${SITE_URL}/og-image.JPG`;
  const pageUrl = `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`;

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: pageUrl },
    openGraph: {
      title, // equals slug
      description,
      url: pageUrl,
      siteName: "Coffee Genius",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title, // equals slug
      description,
      images: [ogImage],
    },
  };
}

/* -------------------- Page (server) -------------------- */
export default async function Page({ params }: { params: Promise<{ slug?: string }> }) {
  const { slug } = await params;
  if (!slug) return notFound();

  const post = await fetchPostBySlugServer(slug);
  if (!post) return notFound();

  const recent = await fetchRecentPostsServer(4, post.slug);

  const pageUrl = `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`;
  const ogImage = post.image ?? `${SITE_URL}/og-image.JPG`;

  // Build BlogPosting JSON-LD
  const blogPosting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.description || (post.content ? post.content.slice(0, 160) : ""),
    "datePublished": post.date,
    ...(post.updatedAt ? { "dateModified": post.updatedAt } : {}),
    "url": pageUrl,
    "publisher": {
      "@type": "Organization",
      "name": "Coffee Genius",
      "url": SITE_URL,
    },
    ...(post.author ? { "author": { "@type": "Person", "name": post.author } } : {}),
    ...(post.image ? { "image": post.image } : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: pageUrl },
    ],
  } as Record<string, unknown>;

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: post.title,
    description: post.description || "",
    url: pageUrl,
    image: post.image ? [post.image] : undefined,
  } as Record<string, unknown>;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPosting) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />

      {/* Hydration payloads so client can avoid re-fetch */}
      <script id="initial-post" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(post) }} />
      <script id="initial-recent-posts" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(recent) }} />

      <BlogPostClient initialPost={post} initialRecent={recent} />
    </>
  );
}