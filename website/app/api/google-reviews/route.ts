import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Place from "@/models/review";

export async function GET() {
  await dbConnect();

  try {
    const place = await Place.findOne({}, {}, { sort: { fetched_at: -1 } });

    if (!place) {
      return NextResponse.json({ error: "No cached reviews found. Please refresh." }, { status: 404 });
    }

    return NextResponse.json(place, { status: 200 });
  } catch (err) {
    console.error("Error fetching cached reviews:", err);
    return NextResponse.json({ error: "Failed to fetch cached reviews." }, { status: 500 });
  }
}