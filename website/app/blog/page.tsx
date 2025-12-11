"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";

// Helper function to get the Cloudinary image URL
const getCloudinaryUrl = (publicId?: string, format?: string) => {
  if (!publicId || !format) return undefined;
  const cloudName = "drjpzgjn7";
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_1200,c_limit,q_auto:good,f_auto,dpr_auto/${publicId}.${format}`;
};

// BlogPost type
type BlogPost = {
  id: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  image?: string;
  tags?: string[];
};

export default function AllPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/posts");
        if (!response.ok) throw new Error("Failed to fetch posts");
        const data = await response.json();

        // Map the API response to the BlogPost type
        const fetchedPosts = data.data.map((post: { 
          _id: string; 
          title: string; 
          slug: string; 
          description?: string; 
          content?: string; 
          date: string; 
          imagePublicId: string; 
          imageFormat: string; 
          tags?: string[]; 
        }) => ({
          id: post._id,
          title: post.title,
          slug: post.slug,
          description: post.description || post.content || "No description available.",
          date: post.date,
          image: getCloudinaryUrl(post.imagePublicId, post.imageFormat),
          tags: post.tags || [],
        }));

        setPosts(fetchedPosts);
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  // If loading, show a spinner/loading indicator
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-50">
        <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent mb-4"></div>
        <p className="text-lg font-medium text-gray-700">Loading posts...</p>
      </div>
    );
  }

  // If no posts are found, show an empty state
  if (!posts.length) {
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
        {/* Page Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-4 tracking-tight">
            Our Blog
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover insights, stories, and updates from our team
          </p>
        </div>

        {/* Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {/* Post Image */}
              {post.image && (
                <div className="relative w-full h-56 overflow-hidden">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  {/* Dark overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
              )}

              {/* Post Content */}
              <div className="p-6 space-y-4">
                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-semibold px-3 py-1 bg-gray-900 text-white rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Title */}
                <h3 className="text-2xl font-bold text-gray-900 group-hover:text-gray-700 transition-colors line-clamp-2">
                  {post.title}
                </h3>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {post.description}
                </p>

                {/* Metadata and CTA */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(post.date).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Read More */}
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
}