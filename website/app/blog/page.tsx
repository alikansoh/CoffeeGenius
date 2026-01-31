import React from "react";
import type { Metadata } from "next";
import AllPostsClient from "./BlogClient";
import { getPosts } from "@/lib/posts";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getPosts(10);
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
  const posts = await getPosts(100);

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