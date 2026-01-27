import { NextRequest, NextResponse } from "next/server";
import Course from "@/models/Class";
import dbConnect from "@/lib/dbConnect";
import { verifyAuthForApi } from "../../../lib/auth";
import { PipelineStage } from "mongoose";

/**
 * GET /api/classes
 * POST /api/classes
 *
 * This version runs Course.cleanupExpiredSessions() after connecting to the DB.
 * That removes any sessions whose end <= now before we read and return classes.
 *
 * Note: cleanupExpiredSessions must be defined on your Course model (see models/Class.ts).
 */

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Attempt to remove expired sessions server-side before returning results.
    // Guard if the static does not exist to avoid runtime errors.
    try {
      if (typeof Course.cleanupExpiredSessions === "function") {
        const cleanupResult = await Course.cleanupExpiredSessions();
        if (cleanupResult && cleanupResult.modifiedCount > 0) {
          console.info(
            `[classes cleanup] removed expired sessions — matched=${cleanupResult.matchedCount} modified=${cleanupResult.modifiedCount}`
          );
        }
      } else {
        // If your model doesn't have cleanupExpiredSessions, consider adding it as shown earlier.
        // console.debug("Course.cleanupExpiredSessions is not available on the model");
      }
    } catch (cleanupErr) {
      // Log but don't fail the whole request if cleanup fails
      console.warn("Failed to run cleanupExpiredSessions:", cleanupErr);
    }

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q") || searchParams.get("search") || "";
    const featured = searchParams.get("featured");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const sortParam = searchParams.get("sort") || "-createdAt";

    const match: Record<string, unknown> = {};

    if (q) {
      match.$text = { $search: q };
    }

    if (featured === "true") match.featured = true;
    if (featured === "false") match.featured = false;

    const skip = (page - 1) * limit;

    // build sort object
    const sort: Record<string, 1 | -1> = {};
    if (sortParam.startsWith("-")) sort[sortParam.slice(1)] = -1;
    else sort[sortParam] = 1;

    const pipeline: PipelineStage[] = [];
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }
    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });
    pipeline.push({
      $project: {
        _id: 1,
        slug: 1,
        title: 1,
        subtitle: 1,
        price: 1,
        summary: 1,
        description: 1,
        durationMinutes: 1,
        capacity: 1,
        minPeople: 1,
        maxPeople: 1,
        instructor: 1,
        image: 1,
        images: 1,
        featured: 1,
        sessions: 1,
        thingsToNote: 1,
        furtherInformation: 1,
        location: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });

    const data = await Course.aggregate(pipeline);

    const total = await Course.countDocuments(Object.keys(match).length > 0 ? match : {});

    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/classes error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to fetch classes", error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // require authentication (no admin restriction by default)
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();

    const body = await request.json();

    // Required fields
    const required = ["slug", "title", "price", "durationMinutes", "capacity", "sessions"];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        return NextResponse.json({ success: false, message: `${f} is required` }, { status: 400 });
      }
    }

    // Check slug uniqueness
    const existing = await Course.findOne({ slug: String(body.slug).toLowerCase().trim() });
    if (existing) {
      return NextResponse.json({ success: false, message: "Course with this slug already exists" }, { status: 409 });
    }

    const course = new Course({
      slug: String(body.slug).toLowerCase().trim(),
      title: body.title,
      subtitle: body.subtitle,
      price: Number(body.price || 0),
      summary: body.summary,
      description: body.description,
      durationMinutes: Number(body.durationMinutes || 0),
      capacity: Number(body.capacity || 0),
      minPeople: body.minPeople,
      maxPeople: body.maxPeople,
      instructor: body.instructor,
      image: body.image,
      images: body.images,
      featured: !!body.featured,
      // ensure sessions are stored as Date objects
      sessions: (body.sessions || []).map((s: unknown) => {
        const sess = s as { start: string | Date; end: string | Date };
        return { start: new Date(sess.start), end: new Date(sess.end) };
      }),
      thingsToNote: body.thingsToNote || [],
      furtherInformation: body.furtherInformation,
      location: body.location || "",
    });

    await course.save();

    return NextResponse.json({ success: true, message: "Course created", data: course }, { status: 201 });
  } catch (err) {
    console.error("POST /api/classes error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to create course", error: message }, { status: 500 });
  }
}