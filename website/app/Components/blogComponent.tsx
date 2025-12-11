"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

type BlogPost = {
  _id: string;
  title: string;
  slug?: string;
  url?: string;
  date?: string;
  excerpt?: string;
  content?: string;
  image?: string;
  tags?: string[];
  description?: string;
};

const getCloudinaryUrl = (publicId?: string) => {
  const cloudName = "drjpzgjn7";
  if (!publicId) return undefined;
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_1000,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}`;
};

export default function BlogSection() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchPosts() {
      setLoading(true);
      try {
        const res = await fetch("/api/posts?limit=3");
        if (!res.ok) throw new Error("Network response was not ok");
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data || json.posts || [];
        if (mounted) setPosts(data.slice(0, 3));
      } catch (err) {
        setPosts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchPosts();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleExpand = (id?: string) => {
    setExpandedId((prev) => (prev === id ? null : id || null));
  };

  const getDescription = (post: BlogPost, isExpanded: boolean) => {
    const content = post.content || post.description || post.excerpt || "";
    if (isExpanded) {
      return content; // Show full content when expanded
    } else {
      return content.length > 140 ? `${content.slice(0, 140)}...` : content; // Truncate to 140 when collapsed
    }
  };

  return (
    <section id="blog" className="py-14 px-4 lg:px-0 bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6">
          <div>
            <p className="text-slate-500 uppercase tracking-[0.25em] text-xs font-semibold px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm inline-block">
              Latest from the Blog
            </p>
            <h3 className="mt-5 text-3xl lg:text-4xl font-serif text-slate-900 leading-tight font-bold max-w-2xl">
              Stories and Guides to Elevate Your Coffee Ritual
            </h3>
            <p className="text-slate-600 mt-3 max-w-lg">
              Practical guides, behind-the-scenes stories, and tips from our roasters and baristas.
            </p>
          </div>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all hover:bg-slate-800 hover:shadow-lg border-2 border-slate-900 hover:border-slate-800"
          >
            View all blogs
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <>
              <div className="h-[330px] bg-gradient-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
              <div className="h-[330px] bg-gradient-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
              <div className="h-[330px] bg-gradient-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
            </>
          ) : (posts || []).map((post) => {
            const postUrl = post.url || (post.slug ? `/blog/${post.slug}` : `/blog/${post._id}`);
            const isExpanded = expandedId === post._id;
            const imageUrl = post.image ? getCloudinaryUrl(post.image) : undefined;
            return (
              <article
                key={post._id}
                className={`group h-full flex flex-col overflow-hidden rounded-2xl border border-slate-200 transition-all duration-300 shadow-xs
                bg-white hover:shadow-xl hover:border-slate-300`}
              >
                <div className="relative w-full aspect-[16/9] overflow-hidden">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={post.title}
                      fill
                      className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                      priority={true}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-white" />
                  )}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all duration-300" />
                </div>

                <div className="flex-1 flex flex-col px-6 pt-4 pb-6">
                  <div className="flex items-center gap-5 mb-1">
                    {post.date && (
                      <div className="text-xs text-slate-500">{new Date(post.date).toLocaleDateString()}</div>
                    )}
                  </div>

                  <h4 className="text-lg font-bold text-slate-900 mb-2">{post.title}</h4>

                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700 font-medium ring-1 ring-slate-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-sm text-slate-600 mb-4 flex-1">
                    {getDescription(post, isExpanded)}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <button
                      onClick={() => toggleExpand(post._id)}
                      className="text-xs text-slate-700 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200 hover:bg-slate-200 transition"
                    >
                      {isExpanded ? "Show less" : "Show full"}
                    </button>

                    <Link
                      href={postUrl}
                      className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white text-xs rounded-xl hover:bg-slate-800 transition border border-slate-900 hover:border-slate-800"
                      aria-label={`Read full post: ${post.title}`}
                    >
                      Read full post <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}