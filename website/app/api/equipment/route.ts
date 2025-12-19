import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Equipment from "@/models/Equipment";
import { verifyAuthForApi } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

/**
 * Configure Cloudinary using environment variables.
 * Use empty string fallbacks to satisfy Cloudinary typings when env is undefined.
 */
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  api_key: process.env.CLOUDINARY_API_KEY ?? "",
  api_secret: process.env.CLOUDINARY_API_SECRET ?? "",
});

export const ALLOWED_CATEGORIES = [
  "Espresso Machines",
  "Coffee Grinders",
  "Coffee Brewers",
  "Barista Accessories",
  "Serving & Storage",
] as const;
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];
const isValidCategory = (v: unknown): v is AllowedCategory =>
  typeof v === "string" && (ALLOWED_CATEGORIES as readonly string[]).includes(v);

/**
 * Safely build a secure Cloudinary URL from a public ID.
 * If publicId is already an absolute URL return it unchanged.
 */
function cloudinaryUrl(publicId?: unknown) {
  if (typeof publicId !== "string" || publicId.trim() === "") return undefined;
  if (publicId.startsWith("http://") || publicId.startsWith("https://")) return publicId;
  try {
    return cloudinary.url(publicId, { secure: true });
  } catch {
    return undefined;
  }
}

/** Robust numeric parser: accepts numbers or numeric strings like "12.34", "1,234.56", "£12.34" */
const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return undefined;

    const cleaned = trimmed.replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "." || cleaned === "-") return undefined;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
};

const toString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;
const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Parse paging params with robust fallbacks and limits */
function parsePagingParams(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawPage = Number(searchParams.get("page") ?? 1);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
  const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  return { limit, page };
}

/**
 * Normalize a single equipment document for API response.
 * Ensures `price` is a decimal (pounds) and `pricePence` is integer.
 */
function normalizeEquipmentDoc(doc: unknown) {
  const rec = (doc as unknown) as Record<string, unknown> | undefined;

  // Prefer explicit decimal price (pounds), fallback to pence fields.
  const maybePrice = toNumber(rec?.price);
  const maybePricePence = toNumber(rec?.pricePence) ?? toNumber(rec?.minPricePence) ?? toNumber(rec?.minPrice);

  let pricePence: number;
  if (maybePrice !== undefined) {
    // price was given in pounds
    pricePence = Math.round(maybePrice * 100);
  } else if (maybePricePence !== undefined) {
    // pricePence or legacy minPrice provided
    // if the value seems like pence (large), use directly; otherwise assume it's decimal pounds and convert
    const candidate = maybePricePence;
    pricePence = candidate > 1000 ? Math.round(candidate) : Math.round(candidate * 100);
  } else {
    pricePence = 0;
  }

  const price = Number((pricePence / 100).toFixed(2));

  const imgPublicId = toString(rec?.img) ?? toString(rec?.imgPublicId) ?? null;
  const imagesPublicIds = toStringArray(rec?.images);

  const imgUrl = cloudinaryUrl(imgPublicId ?? undefined);
  const imagesUrls = imagesPublicIds.map((id) => cloudinaryUrl(id)).filter((u): u is string => typeof u === "string");

  const totalStock = toNumber(rec?.totalStock) ?? toNumber(rec?.stock) ?? 0;

  return {
    _id: toString(rec?._id) ?? String(rec?._id ?? ""),
    slug: toString(rec?.slug) ?? undefined,
    name: toString(rec?.name) ?? undefined,
    brand: toString(rec?.brand) ?? undefined,
    category: toString(rec?.category) ?? undefined,
    features: toStringArray(rec?.features),
    // price fields
    pricePence,
    price, // in pounds (decimal)
    minPricePence: pricePence,
    minPrice: price,
    // images - both public ids and full urls
    imgPublicId: imgPublicId ?? undefined,
    imgUrl: imgUrl ?? undefined,
    imagesPublicIds,
    imagesUrls,
    notes: toString(rec?.notes) ?? undefined,
    description: toString(rec?.description) ?? undefined,
    specs: typeof rec?.specs === "object" && rec?.specs !== null ? rec?.specs : undefined,
    createdAt: rec?.createdAt ? new Date(String(rec.createdAt)).toISOString() : undefined,
    updatedAt: rec?.updatedAt ? new Date(String(rec.updatedAt)).toISOString() : undefined,
    // derived
    variantCount: 0,
    availableOptions: [],
    totalStock,
  };
}

/**
 * GET /api/equipment
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const search = toString(searchParams.get("search")) ?? "";
    const bestSellerParam = searchParams.get("bestSeller");
    const categoryParam = toString(searchParams.get("category")) ?? undefined;
    const { limit, page } = parsePagingParams(searchParams);
    const skip = (page - 1) * limit;

    let findQuery = Equipment.find();
    let countQuery = Equipment.countDocuments();

    if (search) {
      const orClause = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
      findQuery = findQuery.or(orClause);
      countQuery = countQuery.or(orClause as unknown as Parameters<typeof countQuery.or>[0]);
    }

    if (bestSellerParam === "true") {
      findQuery = findQuery.where("bestSeller").equals(true);
      countQuery = countQuery.where("bestSeller").equals(true);
    } else if (bestSellerParam === "false") {
      findQuery = findQuery.where("bestSeller").equals(false);
      countQuery = countQuery.where("bestSeller").equals(false);
    }

    if (categoryParam) {
      if (!isValidCategory(categoryParam)) {
        return NextResponse.json(
          { success: false, message: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      findQuery = findQuery.where("category").equals(categoryParam);
      countQuery = countQuery.where("category").equals(categoryParam);
    }

    const docs = await findQuery.sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec();
    const total = await countQuery.exec();

    const data = Array.isArray(docs) ? docs.map((d) => normalizeEquipmentDoc(d as unknown)) : [];

    return NextResponse.json(
      {
        success: true,
        data,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching equipment list:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch equipment",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/equipment
 * Accepts price (pounds decimal) OR pricePence (integer). We normalize both when saving.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();
    const body = (await request.json()) as Record<string, unknown>;

    console.log("[DEBUG] POST /api/equipment incoming body:", JSON.stringify(body));

    const maybeCategory = toString(body.category);
    if (maybeCategory !== undefined && !isValidCategory(maybeCategory)) {
      return NextResponse.json(
        { success: false, message: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Accept price (decimal pounds) OR pricePence
    const parsedPrice = toNumber(body.price); // pounds
    const parsedPricePence = toNumber(body.pricePence);

    let pricePence: number | undefined;
    let price: number | undefined;

    if (parsedPrice !== undefined) {
      price = Number(parsedPrice.toFixed(2));
      pricePence = Math.round(price * 100);
    } else if (parsedPricePence !== undefined) {
      // if large number likely already pence
      pricePence = parsedPricePence > 1000 ? Math.round(parsedPricePence) : Math.round(parsedPricePence * 100);
      price = Number((pricePence / 100).toFixed(2));
    }

    console.log("[DEBUG] parsed price:", { rawPrice: body.price, price, pricePence });

    const doc = new Equipment({
      slug: (toString(body.slug) ?? "").toLowerCase(),
      name: toString(body.name) ?? undefined,
      brand: toString(body.brand) ?? undefined,
      category: maybeCategory ?? undefined,
      features: toStringArray(body.features),
      price: price ?? 0,
      pricePence: pricePence ?? 0,
      currency: toString(body.currency) ?? "GBP",
      img: toString(body.img) ?? undefined,
      images: toStringArray(body.images),
      stock: toNumber(body.stock) ?? toNumber(body.totalStock) ?? 0,
      notes: toString(body.notes) ?? undefined,
      description: toString(body.description) ?? undefined,
      specs: typeof body.specs === "object" && body.specs !== null ? body.specs : undefined,
      bestSeller: Boolean(body.bestSeller) || false,
    });

    await doc.save();

    const normalized = normalizeEquipmentDoc(doc.toObject());

    return NextResponse.json({ success: true, data: normalized }, { status: 201 });
  } catch (error) {
    console.error("Error creating equipment:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create equipment",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}