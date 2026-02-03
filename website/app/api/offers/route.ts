import { NextRequest, NextResponse } from "next/server";
import Offer from "@/models/Offer";
import dbConnect from "@/lib/dbConnect";
import { verifyAuthForApi } from "@/lib/auth";

export async function GET(req: Request) {
  await dbConnect();

  try {
    const url = new URL(req.url);
    const activeParam = url.searchParams.get("active");
    // Default sorting: newest first
    const sortParam = url.searchParams.get("sort") ?? "createdAt:desc";

    const filter: { active?: boolean } = {};
    if (activeParam === "true") filter.active = true;
    if (activeParam === "false") filter.active = false;

    // parse simple sort like "createdAt:desc,other:asc" into mongoose sort object
    const sortObj: Record<string, 1 | -1> = {};
    sortParam.split(",").forEach((s) => {
      const [k, dir] = s.split(":").map((t) => t.trim());
      if (k) sortObj[k] = dir === "desc" ? -1 : 1;
    });

    const offers = await Offer.find(filter).sort(sortObj).lean();
    return NextResponse.json({ ok: true, data: offers }, { status: 200 });
  } catch (err) {
    console.error("GET /api/offers error:", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch offers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(req);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for POST /api/offers", err);
    return NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 401 });
  }

  await dbConnect();

  try {
    const body = await req.json();

    if (!body?.text || typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ ok: false, error: "Missing or invalid `text` field" }, { status: 400 });
    }

    interface OfferData {
      text: string;
      active: boolean;
    }

    const data: OfferData = {
      text: body.text.trim(),
      active: typeof body.active === "boolean" ? body.active : true,
    };

    const created = await Offer.create(data);

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/offers error:", err);
    return NextResponse.json({ ok: false, error: "Failed to create offer" }, { status: 500 });
  }
}