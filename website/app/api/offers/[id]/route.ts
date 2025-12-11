import { NextRequest, NextResponse } from "next/server";
import Offer from "@/models/Offer";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";

function isValidObjectId(id?: string) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await context.params; // Correctly await the params promise
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid ID" }, { status: 400 });
  }

  try {
    const offer = await Offer.findById(id).lean();
    if (!offer) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, data: offer }, { status: 200 });
  } catch (err) {
    console.error("GET /api/offers/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch offer" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await context.params; // Correctly await the params promise
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    interface OfferUpdate {
      text?: string;
      active?: boolean;
    }

    const update: OfferUpdate = {};

    if (typeof body.text === "string") {
      if (!body.text.trim()) {
        return NextResponse.json({ ok: false, error: "`text` cannot be empty" }, { status: 400 });
      }
      update.text = body.text.trim();
    }
    if (typeof body.active === "boolean") update.active = body.active;

    const updated = await Offer.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/offers/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to update offer" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await context.params; // Correctly await the params promise
  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid ID" }, { status: 400 });
  }

  try {
    const deleted = await Offer.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, data: deleted }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/offers/[id] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to delete offer" }, { status: 500 });
  }
}