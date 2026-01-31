"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "drjpzgjn7";

const getCloudinaryUrl = (publicId?: string, format?: string) => {
  if (!publicId || !format) return undefined;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/w_1200,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
};

export type BlogPost = {
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
function extractDataArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObject(body) && Array.isArray((body as Record<string, unknown>).data)) return (body as Record<string, unknown>).data as unknown[];
  return [];
}

interface AllPostsClientProps {
  initialPosts?: BlogPost[];
}

/**
 * Explicitly typed React.FC ensures TypeScript recognizes the component props
 * when used from a server component (prevents the 'initialPosts does not exist on IntrinsicAttributes' error).
 */
const AllPostsClient: React.FC<AllPostsClientProps> = ({ initialPosts }) => {
  const [posts, setPosts] = useState<BlogPost[] | null>(initialPosts ?? null);
  const [loading, setLoading] = useState<boolean>(initialPosts ? false : true);

  useEffect(() => {
    // If server provided initial posts (hydration), use them
    if (initialPosts && Array.isArray(initialPosts) && initialPosts.length > 0) {
      setPosts(initialPosts);
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/posts");
        if (!res.ok) throw new Error("Failed to fetch posts");
        const json: unknown = await res.json().catch(() => null);
        const arr = extractDataArray(json);
        const mapped: BlogPost[] = arr.map((post, idx) => {
          const rec = isObject(post) ? post : {};
          const id = toString(rec._id ?? rec.id ?? `anon-${idx}`);
          const title = toString(rec.title ?? "Untitled");
          const slug = toString(rec.slug ?? id);
          const description = toString(rec.description ?? rec.content ?? "No description available.");
          const date = toString(rec.date ?? rec.updatedAt ?? rec.createdAt ?? new Date().toISOString());
          const image =
            isObject(rec) && toString(rec.imagePublicId) && toString(rec.imageFormat)
              ? getCloudinaryUrl(toString(rec.imagePublicId), toString(rec.imageFormat))
              : undefined;
          const tags = toStringArray(rec.tags);
          return { id, title, slug, description, date, image, tags };
        });
        if (!mounted) return;
        setPosts(mapped);
      } catch (err) {
        console.error("Error fetching posts:", err);
        if (mounted) setPosts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPosts();
    return () => {
      mounted = false;
    };
  }, [initialPosts]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-50">
        <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent mb-4" />
        <p className="text-lg font-medium text-gray-700">Loading posts...</p>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-2xl font-bold text-gray-900 mb-2">No posts yet</p>
          <p className="text-gray-600">Check back soon for new content!</p>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-4 tracking-tight">Our Blog</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">Discover insights, stories, and updates from our team</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {post.image && (
                <div className="relative w-full h-56 overflow-hidden">
                  <Image src={post.image} alt={post.title} fill className="object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              )}

              <div className="p-6 space-y-4">
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs font-semibold px-3 py-1 bg-gray-900 text-white rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <h3 className="text-2xl font-bold text-gray-900 group-hover:text-gray-700 transition-colors line-clamp-2">{post.title}</h3>

                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">{post.description}</p>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(post.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  <div className="flex items-center text-sm font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                    Read More
                    <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AllPostsClient;