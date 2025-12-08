"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

type BlogPost = {
  id: string;
  title: string;
  slug?: string;
  url?: string;
  date?: string;
  excerpt?: string;
  content?: string;
  image?: string;
  tags?: string[];
};

const samplePosts: BlogPost[] = [
  {
    id: "sample-1",
    title: "Roast Profiles: Finding the Sweet Spot",
    slug: "roast-profiles-finding-the-sweet-spot",
    date: "2025-09-10",
    excerpt:
      "Explore how roasting affects flavor and how to choose a roast profile that highlights tasting notes you love.",
    content:
      "Explore how roasting affects flavor and how to choose a roast profile that highlights tasting notes you love. In this post we deep-dive into time-temperature curves and sample cuppings to help you pick the roast profile that suits your palate. You'll also find practical tips for home roasters and what to look for when buying beans.",
    image: "/post1.jpg",
    tags: ["Roasting"],
  },
  {
    id: "sample-2",
    title: "Dialing in Espresso: Step-by-step",
    slug: "dialing-in-espresso-step-by-step",
    date: "2025-08-21",
    excerpt: "A practical guide to dialing espresso — yield, grind, time and how to taste for balance.",
    content:
      "A practical guide to dialing espresso — yield, grind, time and how to taste for balance. We'll walk through adjustments, recipes and troubleshooting tips to get consistently great shots at home.",
    image: "/post2.jpg",
    tags: ["Espresso"],
  },
  {
    id: "sample-3",
    title: "Milk Texture for Latte Art",
    slug: "milk-texture-for-latte-art",
    date: "2025-07-12",
    excerpt: "Master microfoam techniques and milk-handling tips for silky lattes and clean pours.",
    content:
      "Master microfoam techniques and milk-handling tips for silky lattes and clean pours. We cover positioning, steam wand technique, and how to practice patterns with minimal milk waste.",
    image: "/post3.jpg",
    tags: ["Milk"],
  },
];

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
        const data = Array.isArray(json) ? json : json.posts || json.data || [];
        if (mounted) setPosts((data as BlogPost[]).slice(0, 3));
      } catch (err) {
        if (mounted) setPosts(samplePosts);
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

  return (
    <section id="blog" className="py-12 px-4 bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
          <div>
            <p className="text-slate-500 uppercase tracking-[0.2em] text-xs font-bold px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm inline-block">
              Latest from the Blog
            </p>
            <h3 className="mt-4 text-3xl lg:text-4xl font-serif text-slate-900 leading-tight font-bold max-w-2xl">
              Stories and Guides to Elevate Your Coffee Ritual
            </h3>
            <p className="text-slate-600 mt-3 max-w-xl">
              Practical guides, behind-the-scenes stories, and tips from our roasters and baristas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-lg border-2 border-slate-900 hover:border-slate-800"
            >
              View all blogs
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {loading && (
            <>
              <div className="h-56 bg-linear-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
              <div className="h-56 bg-linear-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
              <div className="h-56 bg-linear-to-br from-slate-100 to-white rounded-2xl animate-pulse" />
            </>
          )}

          {!loading &&
            (posts || []).map((post) => {
              const postUrl = post.url || (post.slug ? `/blog/${post.slug}` : "/blog");
              const isExpanded = expandedId === post.id;
              return (
                <article
                  key={post.id}
                  className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <div className="relative h-44 w-full overflow-hidden">
                    {post.image ? (
                      <Image
                        src={post.image}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-44 w-full bg-gradient-to-br from-slate-100 to-white" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent" />
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">{post.date || ""}</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                        {(post.tags || []).slice(0, 1).join(", ") || "Blog"}
                      </div>
                    </div>

                    <h4 className="text-lg font-semibold text-slate-900">{post.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isExpanded ? post.content || post.excerpt : post.excerpt || (post.content ? `${post.content.slice(0, 140)}...` : "")}
                    </p>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleExpand(post.id)}
                          className="text-sm text-slate-700 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 hover:bg-slate-100 transition"
                        >
                          {isExpanded ? "Show less" : "Show full"}
                        </button>

                        <Link href={postUrl} className="text-sm text-slate-900 font-semibold inline-flex items-center">
                          Read full post <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>

                     
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