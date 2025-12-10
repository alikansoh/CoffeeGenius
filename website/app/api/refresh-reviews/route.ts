import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Place from "@/models/review";

type PlacesResponse = {
  status?: string;
  result?: {
    name?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: {
      author_name?: string;
      author_url?: string;
      rating?: number;
      text?: string;
      relative_time_description?: string;
      profile_photo_url?: string;
      time?: number;
    }[];
  };
  error_message?: string;
};

export async function GET() {
  await dbConnect();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return NextResponse.json({ error: "Server misconfigured: missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID" }, { status: 500 });
  }

  try {
    const fields = encodeURIComponent("name,rating,user_ratings_total,reviews,url");
    const fetchUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId
    )}&fields=${fields}&key=${encodeURIComponent(apiKey)}`;

    const googleResponse = await fetch(fetchUrl);
    const data = (await googleResponse.json()) as PlacesResponse;

    if (data.status !== "OK") {
      throw new Error(data.error_message || "Unknown error");
    }

    const now = new Date();
    const placeData = new Place({
      place_name: data.result?.name,
      place_url: data.result?.url,
      rating: data.result?.rating,
      user_ratings_total: data.result?.user_ratings_total,
      reviews: data.result?.reviews?.map((review) => ({
        id: `${review.time}_${(review.author_name || "").slice(0, 50)}`, // Unique identifier
        author_name: review.author_name,
        author_url: review.author_url,
        rating: review.rating,
        text: review.text,
        relative_time_description: review.relative_time_description,
        profile_photo_url: review.profile_photo_url,
        time: review.time,
      })),
      fetched_at: now,
      cached_until: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours later
    });

    // Replace existing cached document
    await Place.deleteMany({});
    await placeData.save();

    return NextResponse.json({ success: true, message: "Reviews successfully fetched and cached." }, { status: 200 });
  } catch (err) {
    console.error("Failed to refresh reviews:", err);
    return NextResponse.json({ error: (err as Error).message || "Unknown error" }, { status: 500 });
  }
}