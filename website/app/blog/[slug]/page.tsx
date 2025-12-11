"use client";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Calendar } from "lucide-react";

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
  content?: string;
  description?: string;
  date: string;
  tags?: string[];
  image?: string;
};

// RecentPost type
type RecentPost = {
  id: string;
  title: string;
  description: string;
  date: string;
  image?: string;
};

export default function BlogPostPage() {
  // Fetch the slug from the URL
  const params = useParams<{ slug: string }>();
  // Get the dynamic slug
  const slug = params?.slug;

  // State to hold the blog post
  const [post, setPost] = useState<BlogPost | null>(null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPostBySlug() {
      setLoading(true);
      try {
        // Fetch the blog post based on the slug
        const res = await fetch(`/api/posts/${slug}`);
        if (!res.ok) throw new Error("Failed to fetch post");
        const data = await res.json();
        const fetchedPost = data.data;

        // Map API response to state
        const blogPost: BlogPost = {
          id: fetchedPost._id,
          title: fetchedPost.title,
          content: fetchedPost.content,
          description: fetchedPost.description,
          date: fetchedPost.date,
          tags: fetchedPost.tags,
          image: getCloudinaryUrl(fetchedPost.imagePublicId, fetchedPost.imageFormat),
        };

        setPost(blogPost);

        // Fetch recent posts (excluding the current one)
        const recentRes = await fetch("/api/posts");
        if (!recentRes.ok) throw new Error("Failed to fetch recent posts");
        const recentData = await recentRes.json();

        const recent = recentData.data
          .filter((item: { slug: string }) => item.slug !== slug) // Exclude the current post
          .slice(0, 4) // Get the last 4 posts
          .map((post: { _id: string; title: string; description?: string; content?: string; date: string; imagePublicId: string; imageFormat: string }) => ({
            id: post._id,
            title: post.title,
            description: post.description || post.content || "",
            date: post.date,
            image: getCloudinaryUrl(post.imagePublicId, post.imageFormat),
          }));

        setRecentPosts(recent);
      } catch (error) {
        console.error("Error fetching post:", error);
        setPost(null);
      } finally {
        setLoading(false);
      }
    }

    if (slug) fetchPostBySlug();
  }, [slug]);

  // If loading, show a loading state
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

  // If no post is found, show the 404 page
  if (!post) return notFound();

  return (
    <div className="min-h-screen bg-gray-50 pt-10">
      {/* Hero Section with Image */}
      {post.image && (
        <div className="relative w-full h-[70vh] max-h-[600px] overflow-hidden">
          {/* Background Image with Overlay */}
          <div className="absolute inset-0">
            <Image
              src={post.image}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-gray-50"></div>
          </div>
          
          {/* Content Overlay */}
          <div className="relative h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16">
            {/* Tags */}
            {post.tags?.length && (
              <div className="flex flex-wrap gap-2 mb-6">
                {post.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="bg-gray-900/90 backdrop-blur-sm text-white text-xs font-semibold px-4 py-2 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight drop-shadow-2xl">
              {post.title}
            </h1>
            
            {/* Date */}
            <div className="flex items-center text-white/90 text-sm backdrop-blur-sm bg-white/10 rounded-full px-4 py-2 w-fit">
              <Calendar className="w-4 h-4 mr-2" />
              <span className="font-medium">
                {new Date(post.date).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        {/* Blog Content Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-12 mb-16">
          <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed">
            {post.content || post.description}
          </div>
        </div>

        {/* Recent Posts Section */}
        <div className="pb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Recent Posts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentPosts.map((recentPost) => (
              <a
                key={recentPost.id}
                href={`/blog/${recentPost.id}`}
                className="group bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
              >
                {recentPost.image && (
                  <div className="relative overflow-hidden h-48">
                    <Image
                      src={recentPost.image}
                      alt={recentPost.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-gray-700 transition-colors line-clamp-2">
                    {recentPost.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {recentPost.description}
                  </p>
                  <div className="flex items-center text-gray-500 text-xs">
                    <Calendar className="w-4 h-4 mr-2" />
                    {new Date(recentPost.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}