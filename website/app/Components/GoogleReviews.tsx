"use client";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { JSX, useEffect, useState } from "react";

type Review = {
  id?: string;
  author_name?: string;
  author_url?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type ApiResponse = {
  reviews?: Review[];
  place_name?: string;
  place_url?: string;
  rating?: number;
  user_ratings_total?: number;
  fetched_at?: string;
  cached_until?: string;
  error?: string;
};

export default function GoogleReviews(): JSX.Element {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchReviews() {
      try {
        setLoading(true);
        const res = await fetch("pages/api/google-reviews");
        const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
        const text = await res.text();

        if (!contentType.includes("application/json")) {
          const snippet = text.slice(0, 1000);
          throw new Error(
            `Expected JSON response but got content-type="${contentType || "unknown"}". Response preview: ${snippet}${
              text.length > snippet.length ? "..." : ""
            }`
          );
        }

        const json = JSON.parse(text) as ApiResponse;

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        if (!mounted) return;
        setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to load reviews:", msg);
        if (mounted) setError(msg || "Failed to load reviews");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchReviews();
    return () => {
      mounted = false;
    };
  }, []);

  function normalizePhotoUrl(url?: string): string | null {
    if (!url) return null;
    if (url.startsWith("//")) return `https:${url}`;
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  }

  function StarRow({ rating, size = 20 }: { rating?: number; size?: number }) {
    const value = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
    const stars = [];
    const starPath =
      "M12 .587l3.668 7.431 8.2 1.192-5.934 5.788 1.402 8.174L12 18.896l-7.336 3.876 1.402-8.174L.132 9.21l8.2-1.192z";
    for (let i = 0; i < 5; i++) {
      const fill = Math.max(0, Math.min(1, value - i));
      stars.push(
        <div key={i} style={{ width: size, height: size }} className="relative inline-block">
          <svg viewBox="0 0 24 24" width={size} height={size} className="text-slate-300">
            <path fill="currentColor" d={starPath} />
          </svg>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${Math.round(fill * 100)}%`,
              height: "100%",
              overflow: "hidden",
            }}
          >
            <svg viewBox="0 0 24 24" width={size} height={size} className="text-amber-400">
              <path fill="currentColor" d={starPath} />
            </svg>
          </div>
        </div>
      );
    }
    return <div className="flex items-center gap-1">{stars}</div>;
  }

  return (
    <section className="py-10 px-4 bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 space-y-3">
          <p className="text-slate-500 uppercase tracking-[0.2em] text-xs font-bold px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm inline-block">
            Reviews
          </p>
          <h2 className="text-3xl lg:text-4xl font-serif text-slate-900 leading-tight font-bold">What Customers Say</h2>
        </div>

        {/* Summary Card */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-100">
                <div className="text-3xl font-bold text-slate-900">{data?.rating ? data.rating.toFixed(1) : "—"}</div>
                <div className="text-xs text-slate-500 mt-1">Average rating</div>
              </div>
              <div className="hidden md:block h-12 w-px bg-slate-100" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center md:items-start justify-center md:justify-start gap-3">
                <StarRow rating={data?.rating} size={22} />
                <div className="text-sm text-slate-700 font-medium">{data?.rating ? data.rating.toFixed(1) : "—"} / 5</div>
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {typeof data?.user_ratings_total === "number" ? `${data.user_ratings_total.toLocaleString()} reviews` : "No reviews yet"}
              </div>
              <p className="text-slate-600 mt-3 text-sm max-w-xl">
                {data?.place_name ? `Latest feedback for ${data.place_name}.` : "Customer feedback collected from Google Reviews."}
              </p>
            </div>

            <div className="flex flex-col gap-3 items-center md:items-end">
              <a
                href={data?.place_url ?? `pages/api/google-reviews`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl border-2 border-slate-900"
              >
                See on Google
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Reviews Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white p-6 rounded-2xl border border-slate-100 h-44" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white p-6 rounded-2xl border border-rose-100 text-rose-700">
            <strong>Error:</strong> {error}
            <div className="text-xs text-slate-400 mt-2">Check your API route at /api/google-reviews and server logs.</div>
          </div>
        ) : !data?.reviews || data.reviews.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 text-slate-600">No reviews found.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.reviews.map((r) => {
                const photoUrl = normalizePhotoUrl(r.profile_photo_url ?? undefined);
                const internalReviewLink = r.id ? `/reviews/${encodeURIComponent(r.id)}` : data.place_url ?? "#";
                return (
                  <article key={r.id ?? Math.random()} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:shadow-xl transition-all duration-300">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-100 flex-shrink-0">
                        {photoUrl ? (
                          <Image src={photoUrl} alt={r.author_name ?? "author"} width={48} height={48} className="object-cover" unoptimized />
                        ) : (
                          <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium">
                            {r.author_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">{r.author_name ?? "Anonymous"}</h3>
                          <div className="flex items-center gap-2">
                            <StarRow rating={r.rating} size={16} />
                            <span className="text-sm text-slate-600">{typeof r.rating === "number" ? r.rating.toFixed(1) : "—"}</span>
                          </div>
                        </div>
                        {r.relative_time_description && <p className="text-xs text-slate-500 mt-1">{r.relative_time_description}</p>}
                      </div>
                    </div>

                    <p className="text-slate-600 text-sm mt-4 line-clamp-5">{r.text ?? ""}</p>

                    <div className="pt-4">
                      <a
                        href={internalReviewLink}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl border-2 border-slate-900"
                      >
                        Read this review
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 text-center">
              <a
                target="_blank"
                rel="noreferrer noopener"
                href={data?.place_url ?? `pages/api/google-reviews`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-semibold text-sm rounded-xl border border-slate-200 hover:shadow-md transition-all duration-300"
              >
                See all reviews on Google
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* helper */
function normalizePhotoUrl(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}