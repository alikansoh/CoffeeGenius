"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar } from "lucide-react";

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "drjpzgjn7";

function getCloudinaryUrl(publicId?: string, format?: string) {
  if (!publicId || !format) return undefined;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/w_2000,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
}

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content?: string;
  description?: string;
  date: string; // ISO date
  tags?: string[];
  image?: string;
  author?: string;
};

type RecentPost = {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  date: string; // ISO date
  image?: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function toString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

/**
 * Use a fixed locale to avoid SSR/client hydration differences.
 * Use `en-GB` for day-month-year ordering (e.g. "11 December 2025").
 */
const DATE_LOCALE = "en-GB";
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

function formatDateIso(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(DATE_LOCALE, DATE_OPTIONS);
  } catch {
    return iso;
  }
}

/**
 * Client component receives initial data from server to avoid client fetch.
 * If initialPost is not provided (edge case), it will attempt to hydrate from DOM (#initial-post).
 */
export default function BlogPostClient({ initialPost, initialRecent }: { initialPost?: BlogPost | null; initialRecent?: RecentPost[] }) {
  const [post, setPost] = useState<BlogPost | null>(initialPost ?? null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>(initialRecent ?? []);
  const [loading, setLoading] = useState<boolean>(false);

  // fallback hydration from server-injected script (if server rendered but props lost)
  useEffect(() => {
    if (post) return;
    try {
      const el = typeof document !== "undefined" ? document.getElementById("initial-post") : null;
      const recentEl = typeof document !== "undefined" ? document.getElementById("initial-recent-posts") : null;
      if (el && el.textContent) {
        const parsed = JSON.parse(el.textContent) as BlogPost;
        setPost(parsed);
      }
      if (recentEl && recentEl.textContent) {
        const parsedRecent = JSON.parse(recentEl.textContent) as RecentPost[];
        setRecentPosts(parsedRecent ?? []);
      }
    } catch {
      // ignore parse errors — we can fall back to fetching if desired
    }
  }, [post]);

  // If still no post (rare), optionally fetch client-side (not required if server always provides initialPost)
  useEffect(() => {
    if (post) return;
    let mounted = true;
    async function fetchFromDomOrApi() {
      setLoading(true);
      try {
        // try to find slug in location path
        const parts = typeof window !== "undefined" ? window.location.pathname.split("/") : [];
        const slug = parts.length > 2 ? parts[parts.length - 1] : undefined;
        if (!slug) return;
        const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const json = await res.json();
        const rec = (isObject(json) && (isObject((json as Record<string, unknown>).data) ? (json as Record<string, unknown>).data : json)) as Record<string, unknown>;
        const built: BlogPost = {
          id: toString(rec._id ?? rec.id ?? slug),
          slug: toString(rec.slug ?? slug),
          title: toString(rec.title ?? "Untitled"),
          content: toString(rec.content ?? ""),
          description: toString(rec.description ?? ""),
          date: toString(rec.date ?? rec.updatedAt ?? rec.createdAt ?? new Date().toISOString()),
          image: (toString(rec.imagePublicId) && toString(rec.imageFormat)) ? getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat)) : undefined,
          tags: Array.isArray(rec.tags) ? (rec.tags as string[]) : undefined,
        };
        if (!mounted) return;
        setPost(built);
      } catch (err) {
        console.error("client fetch post error", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchFromDomOrApi();
    return () => { mounted = false; };
  }, [post]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Post not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-10">
      {/* Hero Section with Image */}
      {post.image && (
        <div className="relative w-full h-[70vh] max-h-[600px] overflow-hidden">
          <Image src={post.image} alt={post.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-gray-50" />
          <div className="relative h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16">
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {post.tags.map((tag, idx) => (
                  <span key={idx} className="bg-gray-900/90 text-white text-xs font-semibold px-4 py-2 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight drop-shadow-2xl">
              {post.title}
            </h1>

            <div className="flex items-center text-white/90 text-sm backdrop-blur-sm bg-white/10 rounded-full px-4 py-2 w-fit">
              <Calendar className="w-4 h-4 mr-2" />
              <span className="font-medium">
                {formatDateIso(post.date)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-12 mb-16">
          <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed">
            {post.content ? <div dangerouslySetInnerHTML={{ __html: post.content }} /> : <p>{post.description}</p>}
          </div>
        </div>

        {/* Recent Posts */}
        <div className="pb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Recent Posts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentPosts.map((r) => (
              <Link key={r.id} href={`/blog/${r.slug ?? r.id}`} className="group bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                {r.image && (
                  <div className="relative overflow-hidden h-48">
                    <Image src={r.image} alt={r.title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-gray-700 transition-colors line-clamp-2">{r.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{r.description}</p>
                  <div className="flex items-center text-gray-500 text-xs">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>{formatDateIso(r.date)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}