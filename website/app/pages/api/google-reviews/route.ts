import { NextResponse } from "next/server";

/**
 * app/api/google-reviews/route.ts
 *
 * App-router route that fetches Google Places reviews with in-memory caching.
 * Includes author_url for individual review links and place.url for the place page.
 *
 * Env:
 * - GOOGLE_PLACES_API_KEY (required)
 * - GOOGLE_PLACE_ID (required)
 * - GOOGLE_REVIEWS_CACHE_HOURS (optional, default 24)
 * - GOOGLE_REVIEWS_MAX_REVIEWS (optional, default 9)
 */

type GoogleReview = {
  author_name?: string;
  author_url?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type ResponseData = {
  reviews?: GoogleReview[];
  place_name?: string;
  place_url?: string;
  rating?: number;
  user_ratings_total?: number;
  fetched_at?: string;
  cached_until?: string;
  error?: string;
};

const DEFAULT_CACHE_HOURS = 24;
const DEFAULT_MAX_REVIEWS = 9;
let cache: { expiry: number; data?: ResponseData } = { expiry: 0 };

function getTtlMs(): number {
  const raw = process.env.GOOGLE_REVIEWS_CACHE_HOURS;
  const parsed = raw ? Number(raw) : DEFAULT_CACHE_HOURS;
  const hours = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CACHE_HOURS;
  return Math.max(0, hours) * 60 * 60 * 1000;
}

/** Partial typings for the Google Places Details response we expect */
type PlacesReview = {
  author_name?: string;
  author_url?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type PlacesResult = {
  name?: string;
  url?: string;
  reviews?: PlacesReview[];
  rating?: number;
  user_ratings_total?: number;
};

type PlacesResponse = {
  status?: string;
  result?: PlacesResult;
  error_message?: string;
};

export async function GET(_: Request) {
  const apiKey = typeof process.env.GOOGLE_PLACES_API_KEY === "string" ? process.env.GOOGLE_PLACES_API_KEY.trim() : "";
  const placeId = typeof process.env.GOOGLE_PLACE_ID === "string" ? process.env.GOOGLE_PLACE_ID.trim() : "";
  const maxReviewsEnv = process.env.GOOGLE_REVIEWS_MAX_REVIEWS;
  const maxReviews =
    maxReviewsEnv && !Number.isNaN(Number(maxReviewsEnv))
      ? Math.max(1, Math.floor(Number(maxReviewsEnv)))
      : DEFAULT_MAX_REVIEWS;

  if (!apiKey || !placeId) {
    return NextResponse.json({ error: "Server misconfigured: missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID" }, { status: 500 });
  }

  const ttlMs = getTtlMs();

  if (cache.data && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data, { status: 200, headers: { "x-cache": "HIT" } });
  }

  try {
    const fields = encodeURIComponent("name,rating,user_ratings_total,reviews,url");
    const fetchUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId
    )}&fields=${fields}&key=${encodeURIComponent(apiKey)}`;

    const r = await fetch(fetchUrl);
    const bodyText = await r.text();

    if (!r.ok) {
      const preview = bodyText.slice(0, 1000);
      throw new Error(`Google API responded with ${r.status}: ${preview}${bodyText.length > preview.length ? "..." : ""}`);
    }

    let json: PlacesResponse;
    try {
      json = JSON.parse(bodyText) as PlacesResponse;
    } catch (parseErr) {
      const preview = bodyText.slice(0, 1000);
      throw new Error(`Failed to parse Google response as JSON. Preview: ${preview}${bodyText.length > preview.length ? "..." : ""}`);
    }

    if (json.status !== "OK") {
      throw new Error(`Google Places error: ${json.status || "UNKNOWN"} - ${json.error_message || "no message"}`);
    }

    const place_name = json.result?.name;
    const place_url = json.result?.url;
    const overall_rating = typeof json.result?.rating === "number" ? json.result.rating : undefined;
    const total_ratings = typeof json.result?.user_ratings_total === "number" ? json.result.user_ratings_total : undefined;

    const rawReviews: PlacesReview[] = Array.isArray(json.result?.reviews) ? json.result!.reviews! : [];

    const reviews: GoogleReview[] = rawReviews.slice(0, maxReviews).map((rv) => ({
      author_name: rv.author_name,
      author_url: rv.author_url,
      rating: rv.rating,
      text: rv.text,
      relative_time_description: rv.relative_time_description,
      profile_photo_url: rv.profile_photo_url,
    }));

    const now = new Date();
    const data: ResponseData = {
      reviews,
      place_name,
      place_url,
      rating: overall_rating,
      user_ratings_total: total_ratings,
      fetched_at: now.toISOString(),
      cached_until: new Date(now.getTime() + ttlMs).toISOString(),
    };

    cache = { expiry: Date.now() + ttlMs, data };

    return NextResponse.json(data, { status: 200, headers: { "x-cache": "MISS" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error fetching Google Reviews:", message);

    if (cache.data) {
      const stale: ResponseData = {
        ...cache.data,
        error: `Failed to refresh from Google: ${message}. Returning stale cached data.`,
      };
      return NextResponse.json(stale, { status: 200, headers: { "x-cache": "STALE" } });
    }

    return NextResponse.json({ error: message || "Unknown error" }, { status: 500 });
  }
}