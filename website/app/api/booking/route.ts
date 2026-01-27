import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Booking from "@/models/Booking";
import Course from "@/models/Class";
import { verifyAuthForApi } from "@/lib/auth";
import mongoose, { PipelineStage } from "mongoose";
import { notifyBookingToCustomer } from "@/lib/notifyBooking";
import { notifyAdminBooking } from "@/lib/notifyAdminBooking";

/**
 * app/api/bookings/route.ts
 *
 * - GET: admin listing (requires auth)
 * - POST: create booking (public)
 *
 * After creating a booking we:
 *  - attempt to send a confirmation email to the customer (best-effort)
 *  - attempt to send a compact admin notification email (best-effort)
 *
 * Both email sends are fire-and-forget so booking creation isn't blocked by email issues.
 */

/* Helper to build a booking reference */
function makeBookingRef() {
  return `BK-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
}

/* ---------------------- GET (list bookings, admin) ---------------------- */
export async function GET(request: NextRequest) {
  // require auth for listing
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const courseId = searchParams.get("courseId") || "";
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = {};
    if (courseId) {
      if (mongoose.Types.ObjectId.isValid(courseId)) {
        match.courseId = new mongoose.Types.ObjectId(courseId);
      } else {
        // try slug -> _id
        const course = await Course.findOne({ slug: String(courseId).toLowerCase().trim() }).lean();
        if (course) match.courseId = course._id;
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          bookingRef: 1,
          courseId: 1,
          sessionId: 1,
          sessionStart: 1,
          sessionEnd: 1,
          name: 1,
          email: 1,
          phone: 1,
          attendees: 1,
          status: 1,
          createdAt: 1,
          courseTitle: "$course.title",
          courseSlug: "$course.slug",
        },
      },
    ];

    const [data, totalCount] = await Promise.all([Booking.aggregate(pipeline), Booking.countDocuments(match)]);

    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/bookings error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to list bookings", error: message }, { status: 500 });
  }
}

/* ---------------------- POST (create booking, public) ---------------------- */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });

    const { courseId, sessionId, name, email, phone, attendees } = body;

    if (!courseId) return NextResponse.json({ success: false, message: "courseId is required" }, { status: 400 });
    if (!name || !email || !phone) return NextResponse.json({ success: false, message: "name, email and phone are required" }, { status: 400 });
    const attendeesNum = Number(attendees || 1);
    if (Number.isNaN(attendeesNum) || attendeesNum < 1) return NextResponse.json({ success: false, message: "attendees must be >= 1" }, { status: 400 });

    // Resolve course by id or slug
    let course: unknown = null;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findById(courseId).lean();
    }
    if (!course) {
      course = await Course.findOne({ slug: String(courseId).toLowerCase().trim() }).lean();
    }
    if (!course) return NextResponse.json({ success: false, message: "Course not found" }, { status: 404 });

    const courseObj = course as { _id: mongoose.Types.ObjectId; title: string; sessions?: unknown[]; capacity?: number; slug?: string };

    // Resolve session
    let session: unknown = null;
    if (sessionId) {
      session = (courseObj.sessions || []).find((s: unknown) => {
        const sess = s as { id?: unknown; _id?: unknown };
        return String(sess.id) === String(sessionId) || String(sess._id) === String(sessionId);
      });
    }
    if (!session) {
      const now = Date.now();
      session = (courseObj.sessions || []).find((s: unknown) => {
        const sess = s as { end?: string };
        const endTs = sess.end ? new Date(sess.end).getTime() : NaN;
        return !Number.isNaN(endTs) && endTs > now;
      });
    }

    if (!session) {
      return NextResponse.json({ success: false, message: "No upcoming session found for this course" }, { status: 404 });
    }

    const sessionObj = session as { id?: unknown; _id?: unknown; start?: string; end?: string };

    const endTs = sessionObj.end ? new Date(sessionObj.end).getTime() : NaN;
    if (Number.isNaN(endTs) || endTs <= Date.now()) {
      return NextResponse.json({ success: false, message: "Selected session has already passed" }, { status: 400 });
    }

    // Capacity check: sum existing attendees for this course+session (excluding cancelled)
    const existingAgg = await Booking.aggregate([
      {
        $match: {
          courseId: courseObj._id,
          sessionId: String(sessionObj.id ?? sessionObj._id ?? ""),
          status: { $ne: "cancelled" },
        },
      },
      { $group: { _id: null, totalAttendees: { $sum: "$attendees" } } },
    ]);
    const alreadyBooked = existingAgg?.[0]?.totalAttendees ?? 0;
    const capacity = Number(courseObj.capacity ?? 0);
    const remaining = capacity - alreadyBooked;

    if (attendeesNum > remaining) {
      return NextResponse.json({ success: false, message: `Not enough space: ${remaining} spot(s) remaining` }, { status: 409 });
    }

    // Create booking
    const bookingRef = makeBookingRef();
    const bookingDoc = new Booking({
      bookingRef,
      courseId: courseObj._id,
      sessionId: String(sessionObj.id ?? sessionObj._id ?? ""),
      sessionStart: sessionObj.start ? new Date(sessionObj.start) : undefined,
      sessionEnd: sessionObj.end ? new Date(sessionObj.end) : undefined,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      attendees: attendeesNum,
      status: "confirmed",
    });

    await bookingDoc.save();

    // Best-effort: send confirmation email to customer (do not block booking creation)
    void (async () => {
      try {
        await notifyBookingToCustomer({
          booking: {
            _id: bookingDoc._id,
            bookingRef,
            courseId: bookingDoc.courseId?.toString(),
            courseTitle: courseObj.title,
            sessionStart: bookingDoc.sessionStart,
            sessionEnd: bookingDoc.sessionEnd,
            name: bookingDoc.name,
            email: bookingDoc.email,
            phone: bookingDoc.phone,
            attendees: bookingDoc.attendees,
            createdAt: bookingDoc.createdAt,
          },
          appBase: process.env.APP_BASE_URL || null,
        });
      } catch (emailErr) {
        console.warn("Booking confirmation email failed:", emailErr);
      }
    })();

    // Best-effort: send admin notification (do not block booking creation)
    void (async () => {
      try {
        const res = await notifyAdminBooking({
          booking: {
            _id: bookingDoc._id,
            bookingRef,
            courseTitle: courseObj.title,
            sessionStart: bookingDoc.sessionStart,
            sessionEnd: bookingDoc.sessionEnd,
            name: bookingDoc.name,
            email: bookingDoc.email,
            phone: bookingDoc.phone,
            attendees: bookingDoc.attendees,
            createdAt: bookingDoc.createdAt,
          },
        });
        if (!res.sent) console.warn("Admin notification failed:", res.error);
      } catch (adminErr) {
        console.warn("Admin notification error:", adminErr);
      }
    })();

    return NextResponse.json({ success: true, message: "Booking created", bookingRef, bookingId: bookingDoc._id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: "Failed to create booking", error: message }, { status: 500 });
  }
}