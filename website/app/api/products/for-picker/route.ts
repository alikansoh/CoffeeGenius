import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Coffee from "@/models/Coffee";
import Equipment from "@/models/Equipment";

export interface PickerProduct {
  _id: string;
  name: string;
  type: "coffee" | "equipment";
  img?: string;
  origin?: string;
  slug: string;
}

export async function GET() {
  try {
    await dbConnect();

    const [coffees, equipments] = await Promise.all([
      Coffee.find({})
        .select("_id slug name origin img")
        .sort({ name: 1 })
        .lean(),
      Equipment.find({})
        .select("_id slug name img")
        .sort({ name: 1 })
        .lean(),
    ]);

    const products: PickerProduct[] = [
      ...(coffees || []).map((c) => ({
        _id: c._id.toString(),
        name: c.name,
        type: "coffee" as const,
        img: Array.isArray(c.img) ? c.img[0] : c.img,
        origin: c.origin,
        slug: c.slug,
      })),
      ...(equipments || []).map((e) => ({
        _id: e._id.toString(),
        name: e.name ?? "",
        type: "equipment" as const,
        img: Array.isArray(e.img) ? e.img[0] : e.img,
        slug: e.slug ?? "",
      })),
    ];

    products.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, products }, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching picker products:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}