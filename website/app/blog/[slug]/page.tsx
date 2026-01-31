import React from "react";
import type { Metadata } from "next";
import BlogPostClient from "./BlogPostClient";
import { notFound } from "next/navigation";
import { getPostBySlug, getPosts, type BlogPost } from "@/lib/posts";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

/* -------------------- Fetch helpers -------------------- */
async function fetchRecentPostsServer(limit = 4, excludeSlug?: string): Promise<BlogPost[]> {
  try {
    const allPosts = await getPosts(limit + 4);
    return allPosts
      .filter((p: BlogPost) => p.slug !== excludeSlug)
      .slice(0, limit);
  } catch (err) {
    console.error("fetchRecentPostsServer error", err);
    return [];
  }
}

/* -------------------- Metadata -------------------- */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  
  if (!post) {
    return {
      title: "Post not found",
      description: "Post not found",
    };
  }

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
      title,
      description,
      url: pageUrl,
      siteName: "Coffee Genius",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
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

/* -------------------- Page (server) -------------------- */
export default async function Page({ params }: { params: Promise<{ slug?: string }> }) {
  const { slug } = await params;
  if (!slug) return notFound();

  const post = await getPostBySlug(slug);
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