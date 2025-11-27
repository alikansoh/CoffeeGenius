"use client";
import Image from "next/image";
import { Star, ArrowRight } from "lucide-react";
import { JSX, useEffect, useState } from "react";

type Review = {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type ApiResponse = {
  reviews?: Review[];
  place_name?: string;
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

        // If the response isn't JSON, surface the body (usually HTML) for debugging
        if (!contentType.includes("application/json")) {
          const snippet = text.slice(0, 1000);
          throw new Error(
            `Expected JSON response but got content-type="${contentType || "unknown"}". Response preview: ${snippet}${
              text.length > snippet.length ? "..." : ""
            }`
          );
        }

        let json: ApiResponse;
        try {
          json = JSON.parse(text) as ApiResponse;
        } catch (parseErr) {
          const snippet = text.slice(0, 1000);
          throw new Error(`Failed to parse JSON response. Response preview: ${snippet}${text.length > snippet.length ? "..." : ""}`);
        }

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

  const placeId = process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID ?? "";
  const PLACE_LINK = (p?: string) =>
    p ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p)}` : "https://www.google.com/maps";

  function normalizePhotoUrl(url?: string): string | null {
    if (!url) return null;
    if (url.startsWith("//")) return `https:${url}`;
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  }

  function renderStars(rating?: number, size = 20) {
    const stars = [];
    const value = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
    for (let i = 0; i < 5; i++) {
      const fill = Math.max(0, Math.min(1, value - i));
      stars.push(
        <div key={i} className="relative inline-block" style={{ width: size, height: size }}>
          <Star className="text-slate-300" style={{ width: size, height: size }} />
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${fill * 100}%`,
              height: "100%",
              overflow: "hidden",
            }}
          >
            <Star className="text-amber-400" style={{ width: size, height: size }} />
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
                {renderStars(data?.rating, 20)}
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
                href={PLACE_LINK(placeId)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl border-2 border-slate-900"
              >
                See on Google
                <ArrowRight className="w-4 h-4" />
              </a>
              <a href={PLACE_LINK(placeId)} target="_blank" rel="noreferrer noopener" className="text-xs text-slate-500 underline">
                Write a review
              </a>
            </div>
          </div>
        </div>

        {/* Content */}
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
              {data.reviews.map((r, idx) => {
                const photoUrl = normalizePhotoUrl(r.profile_photo_url ?? undefined);
                return (
                  <article key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:shadow-xl transition-all duration-300">
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
                            {renderStars(r.rating, 16)}
                            <span className="text-sm text-slate-600">{typeof r.rating === "number" ? r.rating.toFixed(1) : "—"}</span>
                          </div>
                        </div>
                        {r.relative_time_description && <p className="text-xs text-slate-500 mt-1">{r.relative_time_description}</p>}
                      </div>
                    </div>

                    <p className="text-slate-600 text-sm mt-4 line-clamp-5">{r.text ?? ""}</p>

                    <div className="pt-4">
                      <a
                        target="_blank"
                        rel="noreferrer noopener"
                        href={PLACE_LINK(placeId)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl border-2 border-slate-900"
                      >
                        Read on Google
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
                href={PLACE_LINK(placeId)}
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

/* re-used helper inside the file to keep component self-contained */
function normalizePhotoUrl(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}