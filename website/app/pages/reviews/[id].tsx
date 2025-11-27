import { GetServerSideProps } from "next";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

type Review = {
  id?: string;
  author_name?: string;
  author_url?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
  time?: number;
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

function normalizePhotoUrl(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function renderStars(rating?: number, size = 28) {
  const value = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  const starPath = "M12 .587l3.668 7.431 8.2 1.192-5.934 5.788 1.402 8.174L12 18.896l-7.336 3.876 1.402-8.174L.132 9.21l8.2-1.192z";
  const stars = [];
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
  return <div className="flex items-center gap-2">{stars}</div>;
}

export default function ReviewPage({
  review,
  place_name,
  place_url,
  rating,
  user_ratings_total,
}: {
  review: Review | null;
  place_name?: string;
  place_url?: string;
  rating?: number;
  user_ratings_total?: number;
}) {
  if (!review) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-xl mx-auto p-8 bg-white rounded-2xl border border-slate-200">
          <h2 className="text-xl font-semibold">Review not found</h2>
          <p className="text-sm text-slate-600 mt-2">The requested review could not be located. It may be older than your configured max or the cache needs refreshing.</p>
        </div>
      </div>
    );
  }

  const photo = normalizePhotoUrl(review.profile_photo_url ?? undefined);
  const openOnGoogle = review.author_url ?? place_url ?? `/api/google-reviews`;

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-100">
              {photo ? <Image src={photo} alt={review.author_name ?? "author"} width={80} height={80} className="object-cover" unoptimized /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium">{review.author_name?.charAt(0) ?? "?"}</div>}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-slate-900">{review.author_name ?? "Anonymous"}</h1>
              <div className="flex items-center gap-3 mt-2">
                {renderStars(review.rating, 28)}
                <div className="text-lg font-semibold text-slate-800">{typeof review.rating === "number" ? review.rating.toFixed(1) : "—"}/5</div>
                <div className="text-sm text-slate-500">{review.relative_time_description ?? ""}</div>
              </div>
              <div className="text-sm text-slate-500 mt-2">{place_name ?? ""} — {typeof user_ratings_total === "number" ? `${user_ratings_total.toLocaleString()} reviews` : ""}</div>
            </div>
          </div>

          <article className="mt-6 text-slate-700 text-base leading-relaxed">
            <p>{review.text ?? ""}</p>
          </article>

          <div className="mt-6 flex gap-3">
            <a href={openOnGoogle} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition">
              Open on Google
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href={place_url ?? "/"} className="inline-flex items-center gap-2 px-5 py-3 bg-white text-slate-900 rounded-xl font-semibold border border-slate-200 hover:shadow transition">
              See all reviews
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params ?? {};
  const host = context.req.headers.host;
  const protocol = context.req.headers["x-forwarded-proto"] ? String(context.req.headers["x-forwarded-proto"]) : "http";
  const origin = `${protocol}://${host}`;

  try {
    const res = await fetch(`${origin}/api/google-reviews`);
    const json = (await res.json()) as ApiResponse;

    if (!res.ok) {
      return { props: { review: null, error: json?.error ?? "Failed to fetch reviews" } };
    }

    const reviews = json.reviews ?? [];
    const review = reviews.find((r) => r.id === id) ?? null;

    return {
      props: {
        review,
        place_name: json.place_name ?? null,
        place_url: json.place_url ?? null,
        rating: json.rating ?? null,
        user_ratings_total: json.user_ratings_total ?? null,
      },
    };
  } catch (err) {
    console.error("Server-side fetch failed:", err);
    return { props: { review: null } };
  }
};