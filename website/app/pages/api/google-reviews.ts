import type { NextApiRequest, NextApiResponse } from "next";

/**
 * pages/api/google-reviews.ts
 *
 * Fixed TypeScript types and stricter error handling.
 *
 * Environment vars:
 * - GOOGLE_PLACES_API_KEY (required)
 * - GOOGLE_PLACE_ID (required)
 * - GOOGLE_REVIEWS_CACHE_HOURS (optional, default 24)
 * - GOOGLE_REVIEWS_MAX_REVIEWS (optional, default 9)
 */

type GoogleReview = {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type ResponseData = {
  reviews?: GoogleReview[];
  place_name?: string;
  fetched_at?: string; // ISO
  cached_until?: string; // ISO
  error?: string;
};

const DEFAULT_CACHE_HOURS = 24;
const DEFAULT_MAX_REVIEWS = 9;

let cache: { expiry: number; data?: ResponseData } = { expiry: 0 };

/**
 * Helper: parse TTL hours from env and return ms
 */
function getTtlMs(): number {
  const raw = process.env.GOOGLE_REVIEWS_CACHE_HOURS;
  const hours = raw ? parseFloat(raw) : DEFAULT_CACHE_HOURS;
  const safeHours = Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_CACHE_HOURS;
  return Math.max(0, safeHours) * 60 * 60 * 1000;
}

/**
 * Partial typings for the Google Places Details response that we care about.
 */
type PlacesReview = {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  profile_photo_url?: string;
};

type PlacesResult = {
  name?: string;
  reviews?: PlacesReview[];
};

type PlacesResponse = {
  status?: string;
  result?: PlacesResult;
  error_message?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  const maxReviewsEnv = process.env.GOOGLE_REVIEWS_MAX_REVIEWS;
  const maxReviews =
    maxReviewsEnv && !Number.isNaN(Number(maxReviewsEnv))
      ? Math.max(1, Math.floor(Number(maxReviewsEnv)))
      : DEFAULT_MAX_REVIEWS;

  if (!apiKey || !placeId) {
    res.status(500).json({ error: "Server misconfigured: missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID" });
    return;
  }

  const ttlMs = getTtlMs();

  // Serve fresh cache if still valid
  if (cache.data && Date.now() < cache.expiry) {
    res.setHeader("x-cache", "HIT");
    res.status(200).json(cache.data);
    return;
  }

  // Otherwise attempt to fetch from Google
  try {
    const fields = encodeURIComponent("name,rating,reviews");
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId
    )}&fields=${fields}&key=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Google API responded with ${r.status}: ${text}`);
    }

    const json = (await r.json()) as PlacesResponse;

    if (json.status !== "OK") {
      throw new Error(`Google Places error: ${json.status || "UNKNOWN"} - ${json.error_message || "no message"}`);
    }

    const place_name = json.result?.name;
    const rawReviews: PlacesReview[] = Array.isArray(json.result?.reviews) ? json.result!.reviews! : [];

    const reviews: GoogleReview[] = rawReviews
      .slice(0, maxReviews)
      .map((rv) => ({
        author_name: rv.author_name,
        rating: rv.rating,
        text: rv.text,
        relative_time_description: rv.relative_time_description,
        profile_photo_url: rv.profile_photo_url,
      }));

    const now = new Date();
    const data: ResponseData = {
      reviews,
      place_name,
      fetched_at: now.toISOString(),
      cached_until: new Date(Date.now() + ttlMs).toISOString(),
    };

    // Update cache
    cache = { expiry: Date.now() + ttlMs, data };

    res.setHeader("x-cache", "MISS");
    res.status(200).json(data);
    return;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error fetching Google Reviews:", message);

    // If we have stale cache, return it rather than failing completely
    if (cache.data) {
      res.setHeader("x-cache", "STALE");
      const stale: ResponseData = {
        ...cache.data,
        error: `Failed to refresh from Google: ${message}. Returning stale cached data.`,
      };
      res.status(200).json(stale);
      return;
    }

    // No cache available -> return error
    res.status(500).json({ error: message || "Unknown error" });
  }
}