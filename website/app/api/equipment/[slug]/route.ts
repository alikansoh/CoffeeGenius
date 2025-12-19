    import { NextRequest, NextResponse } from "next/server";
    import dbConnect from "@/lib/dbConnect";
    import Equipment, { IEquipment } from "@/models/Equipment";
    import { verifyAuthForApi } from "@/lib/auth";
    import mongoose from "mongoose";
    import { v2 as cloudinary } from "cloudinary";

    /**
     * Configure Cloudinary (provide safe fallbacks for typings)
     */
    cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
    api_key: process.env.CLOUDINARY_API_KEY ?? "",
    api_secret: process.env.CLOUDINARY_API_SECRET ?? "",
    });

    /**
     * Allowed categories for equipment (keep in sync with frontend)
     */
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
     * Heuristic to decide resource type for Cloudinary deletion.
     */
    function detectResourceType(publicId: string): "image" | "video" {
    const lower = publicId.toLowerCase();
    if (/\.(mp4|mov|webm|mkv|avi)$/.test(lower) || lower.includes("/video/") || lower.includes("video")) {
        return "video";
    }
    return "image";
    }

    /** Safe accessors for untyped data */
    const getString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
    const getNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const getStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

    /** Build normalized response object from a document or lean object */
    function normalizeForResponse(doc: unknown) {
    const r = doc as Record<string, unknown> | undefined;

    // pricePence fallback/derivation
    const pricePence =
        getNumber(r?.pricePence) ??
        (() => {
        const p = getNumber(r?.price);
        if (p !== undefined) return Math.round(p * 100);
        const mp = getNumber(r?.minPrice);
        if (mp !== undefined) return mp > 1000 ? Math.round(mp) : Math.round(mp * 100);
        return 0;
        })();

    const price = Number((pricePence / 100).toFixed(2));

    const imgPublicId = getString(r?.img) ?? getString(r?.imgPublicId) ?? undefined;
    const imagesPublicIds = getStringArray(r?.images);

    const totalStock = getNumber(r?.totalStock) ?? getNumber(r?.stock) ?? 0;

    return {
        _id: getString(r?._id) ?? String(r?._id ?? ""),
        slug: getString(r?.slug) ?? undefined,
        name: getString(r?.name) ?? undefined,
        brand: getString(r?.brand) ?? undefined,
        category: getString(r?.category) ?? undefined,
        features: getStringArray(r?.features),
        pricePence,
        price,
        minPricePence: pricePence,
        minPrice: price,
        imgPublicId,
        imagesPublicIds,
        stock: totalStock,
        notes: getString(r?.notes) ?? undefined,
        description: getString(r?.description) ?? undefined,
        specs: typeof r?.specs === "object" && r?.specs !== null ? r?.specs : undefined,
        createdAt: r?.createdAt ? new Date(String(r.createdAt)).toISOString() : undefined,
        updatedAt: r?.updatedAt ? new Date(String(r.updatedAt)).toISOString() : undefined,
    };
    }

    /**
     * GET /api/equipment/:slug
     */
    export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        await dbConnect();
        const { slug } = await params;
        if (!slug) return NextResponse.json({ success: false, message: "Missing slug" }, { status: 400 });

        // try find by slug, then by id (if it looks like an ObjectId)
        let product = await Equipment.findOne({ slug }).lean().exec();
        if (!product && mongoose.Types.ObjectId.isValid(slug)) {
        product = await Equipment.findById(slug).lean().exec();
        }

        if (!product) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

        // derive a few helper fields (use pricePence/minPricePence stored on the document)
        const variantCount = 0;

        // Use unknown-first cast to avoid structural typing complaints
        const productRec = product as unknown as Record<string, unknown>;
        const storedPricePence = getNumber(productRec.pricePence) ?? getNumber(productRec.minPricePence) ?? 0;
        const minPrice = Number((storedPricePence / 100).toFixed(2));

        const totalStock = getNumber(productRec.totalStock) ?? getNumber(productRec.stock) ?? 0;
        const availableOptions: string[] = [];

        return NextResponse.json(
        { success: true, data: { ...normalizeForResponse(product), variantCount, minPrice, totalStock, availableOptions } },
        { status: 200 }
        );
    } catch (err) {
        console.error("Error fetching equipment by slug:", err);
        return NextResponse.json({ success: false, message: "Server error", error: (err as Error).message }, { status: 500 });
    }
    }

    /**
     * PATCH /api/equipment/:slug
     *
     * - Validates `category` if provided.
     * - Updates the document with allowed fields.
     * - If `img`/`images` are replaced, deletes old Cloudinary public IDs no longer referenced.
     */
    export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;

    try {
        await dbConnect();
        const { slug } = await params;
        if (!slug) return NextResponse.json({ success: false, message: "Missing slug" }, { status: 400 });

        const rawBody = await request.json();
        const body = rawBody as Record<string, unknown>;

        let doc = await Equipment.findOne({ slug }).exec();
        if (!doc && mongoose.Types.ObjectId.isValid(slug)) {
        doc = await Equipment.findById(slug).exec();
        }
        if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

        // capture old public ids for potential deletion
        // use doc.toObject() to produce a plain object and avoid structural cast errors
        const docObj = doc.toObject() as unknown as Record<string, unknown>;
        const oldPublicIds = new Set<string>();
        const currentImg = getString(docObj.img);
        const currentImages = getStringArray(docObj.images);
        if (currentImg) oldPublicIds.add(currentImg);
        currentImages.forEach((id) => id && oldPublicIds.add(id));

        // determine new public ids (if present in body)
        const bodyImg = getString(body.img);
        const bodyImages = Array.isArray(body.images) ? (body.images as unknown[]).filter((i) => typeof i === "string").map(String) : undefined;
        const newPublicIds = new Set<string>();
        if (bodyImg) newPublicIds.add(bodyImg);
        if (Array.isArray(bodyImages)) bodyImages.forEach((id) => id && newPublicIds.add(id));

        // If neither img nor images provided in the body, we should not delete any old media.
        const shouldConsiderDeletion = bodyImg !== undefined || bodyImages !== undefined;

        // Validate category if provided
        if (Object.prototype.hasOwnProperty.call(body, "category")) {
        const maybeCategory = getString(body.category);
        if (maybeCategory !== undefined && !isValidCategory(maybeCategory)) {
            return NextResponse.json({ success: false, message: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}` }, { status: 400 });
        }
        }

        // Build updates only from allowed keys and with safe conversions
        const allowedKeys = [
        "slug",
        "name",
        "brand",
        "features",
        "price",
        "pricePence",
        "img",
        "images",
        "stock",
        "totalStock",
        "notes",
        "description",
        "specs",
        "bestSeller",
        "category",
        ] as const;

        const updates: Partial<Record<typeof allowedKeys[number], unknown>> = {};

        for (const k of allowedKeys) {
        if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
        const val = body[k as string];
        switch (k) {
            case "slug":
            case "name":
            case "brand":
            case "notes":
            case "description":
            case "category":
            updates[k] = getString(val);
            break;
            case "price":
            case "pricePence":
            case "stock":
            case "totalStock":
            updates[k] = getNumber(val);
            break;
            case "features":
            updates[k] = getStringArray(val);
            break;
            case "img":
            updates[k] = getString(val) ?? null;
            break;
            case "images":
            updates[k] = Array.isArray(val) ? (val as unknown[]).filter((i) => typeof i === "string").map(String) : [];
            break;
            case "specs":
            updates[k] = typeof val === "object" && val !== null ? val : undefined;
            break;
            case "bestSeller":
            updates[k] = typeof val === "boolean" ? val : undefined;
            break;
            default:
            // noop
            break;
        }
        }

        // Apply updates to doc (use mongoose document API)
        doc.set(updates);
        await doc.save();

        // After save, delete any old public ids that are no longer referenced (only if replace attempted)
        const cloudinaryDeleteResults = { images: 0, videos: 0, errors: 0 };
        if (shouldConsiderDeletion) {
        const toDelete: string[] = [];
        oldPublicIds.forEach((id) => {
            if (!newPublicIds.has(id)) toDelete.push(id);
        });

        if (toDelete.length > 0) {
            await Promise.all(
            toDelete.map(async (publicId) => {
                try {
                const resourceType = detectResourceType(publicId);
                await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
                if (resourceType === "video") cloudinaryDeleteResults.videos++;
                else cloudinaryDeleteResults.images++;
                } catch (err) {
                console.error(`Failed to delete ${publicId} from Cloudinary:`, err);
                cloudinaryDeleteResults.errors++;
                }
            })
            );
        }
        }

        // return the saved/updated document (lean form)
        const saved = await Equipment.findById(doc._id).lean().exec();
        return NextResponse.json({
        success: true,
        message: "Updated equipment",
        data: normalizeForResponse(saved),
        cloudinaryDeleted: cloudinaryDeleteResults,
        });
    } catch (err) {
        console.error("Error updating equipment:", err);
        return NextResponse.json({ success: false, message: "Failed to update", error: (err as Error).message }, { status: 500 });
    }
    }

    /**
     * DELETE /api/equipment/:slug
     */
    export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;

    try {
        await dbConnect();
        const { slug } = await params;
        if (!slug) return NextResponse.json({ success: false, message: "Missing slug" }, { status: 400 });

        let doc = await Equipment.findOne({ slug }).exec();
        if (!doc && mongoose.Types.ObjectId.isValid(slug)) {
        doc = await Equipment.findById(slug).exec();
        }
        if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

        // Collect public IDs to delete (use doc.toObject() to get plain data)
        const docObj = doc.toObject() as unknown as Record<string, unknown>;
        const publicIds = new Set<string>();
        const docImg = getString(docObj.img);
        const docImages = getStringArray(docObj.images);
        if (docImg) publicIds.add(docImg);
        docImages.forEach((id) => id && publicIds.add(id));

        const cloudinaryDeleteResults = { images: 0, videos: 0, errors: 0 };

        if (publicIds.size > 0) {
        await Promise.all(
            Array.from(publicIds).map(async (publicId) => {
            try {
                const resourceType = detectResourceType(publicId);
                await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
                if (resourceType === "video") cloudinaryDeleteResults.videos++;
                else cloudinaryDeleteResults.images++;
            } catch (err) {
                console.error(`Failed to delete ${publicId} from Cloudinary:`, err);
                cloudinaryDeleteResults.errors++;
            }
            })
        );
        }

        // Remove document
        await Equipment.findByIdAndDelete(doc._id).exec();

        return NextResponse.json({
        success: true,
        message: "Equipment deleted",
        data: {
            equipmentId: doc._id,
            equipmentName: getString(docObj.name),
            cloudinaryDeleted: {
            images: cloudinaryDeleteResults.images,
            videos: cloudinaryDeleteResults.videos,
            errors: cloudinaryDeleteResults.errors,
            total: cloudinaryDeleteResults.images + cloudinaryDeleteResults.videos,
            },
        },
        });
    } catch (err) {
        console.error("Error deleting equipment:", err);
        return NextResponse.json({ success: false, message: "Failed to delete", error: (err as Error).message }, { status: 500 });
    }
    }