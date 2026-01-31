import dbConnect from "./dbConnect";
import mongoose from "mongoose";

export type CourseSummary = {
  id: string;
  title: string;
  subtitle?: string;
  price: number;
  summary: string;
  description: string;
  durationMinutes: number;
  capacity: number;
  instructor: { name: string; avatar?: string };
  image?: string;
  featured?: boolean;
  sessions?: { id: string; start: string; end: string }[];
  thingsToNote?: string[];
  location?: string;
  level?: string;
};

type RawCourse = {
  _id?: unknown;
  id?: unknown;
  title?: unknown;
  name?: unknown;
  subtitle?: unknown;
  location?: unknown;
  price?: unknown;
  cost?: unknown;
  summary?: unknown;
  excerpt?: unknown;
  description?: unknown;
  details?: unknown;
  durationMinutes?: unknown;
  duration?: unknown;
  capacity?: unknown;
  maxCapacity?: unknown;
  instructor?: unknown;
  instructorName?: unknown;
  image?: unknown;
  photo?: unknown;
  images?: unknown;
  featured?: unknown;
  sessions?: unknown;
  thingsToNote?: unknown;
  notes?: unknown;
  note?: unknown;
  noteList?: unknown;
  venue?: unknown;
  level?: unknown;
  slug?: unknown;
};

const ClassSchema = new mongoose.Schema({
  title: String,
  name: String,
  subtitle: String,
  location: String,
  price: Number,
  cost: Number,
  summary: String,
  excerpt: String,
  description: String,
  details: String,
  durationMinutes: Number,
  duration: Number,
  capacity: Number,
  maxCapacity: Number,
  instructor: mongoose.Schema.Types.Mixed,
  instructorName: String,
  image: String,
  photo: String,
  images: [String],
  featured: Boolean,
  sessions: [mongoose.Schema.Types.Mixed],
  thingsToNote: [String],
  notes: [String],
  note: String,
  noteList: [String],
  venue: String,
  level: String,
  slug: String,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'classes' }); // Change to your collection name: 'classes', 'courses', 'Class', etc.

const Class = mongoose.models.Class || mongoose.model('Class', ClassSchema);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => toString(x, "")).filter(Boolean);
  return [];
}

export async function getClasses(query?: string): Promise<CourseSummary[]> {
  try {
    await dbConnect();
    
    const filter = query 
      ? { 
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { summary: { $regex: query, $options: 'i' } },
          ]
        }
      : {};
    
    const rawClasses = await Class
      .find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .lean()
      .exec();

    return rawClasses.map((c: RawCourse, idx: number) => {
      const rec = isObject(c) ? c : {};

      const rawSessions = Array.isArray(rec.sessions) ? (rec.sessions as unknown[]) : [];
      const sessions = rawSessions.map((s, si) => {
        const sRec = isObject(s) ? s : {};
        const id = toString(sRec.id) || toString(sRec._id) || `s-${idx}-${si}`;
        const start = toString(sRec.start) || toString(sRec.startDate) || toString(sRec.startTime) || "";
        const end = toString(sRec.end) || toString(sRec.endDate) || toString(sRec.endTime) || "";
        return { id, start, end };
      });

      const instructorObj = (() => {
        const ins = rec.instructor;
        if (isObject(ins)) {
          return {
            name: toString(ins.name, toString(rec.instructorName) || "Instructor"),
            avatar: toString(ins.avatar),
          };
        }
        return { name: toString(rec.instructorName) || toString(rec.instructor) || "Instructor" };
      })();

      const images = Array.isArray(rec.images) ? rec.images : undefined;
      const image = images && images.length > 0 ? toString(images[0]) : toString(rec.image ?? rec.photo ?? "");

      const courseId =
        toString(rec._id) || toString(rec.id) || toString(rec.slug) || `anon-${Math.random().toString(36).slice(2)}`;

      return {
        id: courseId,
        title: toString(rec.title) || toString(rec.name) || "Untitled class",
        subtitle: typeof rec.subtitle === "string" ? rec.subtitle : typeof rec.location === "string" ? rec.location : undefined,
        price: toNumber(rec.price ?? rec.cost ?? 0, 0),
        summary: toString(rec.summary ?? rec.excerpt ?? ""),
        description: toString(rec.description ?? rec.details ?? ""),
        durationMinutes: toNumber(rec.durationMinutes ?? rec.duration ?? 0, 0),
        capacity: toNumber(rec.capacity ?? rec.maxCapacity ?? 0, 0),
        instructor: instructorObj,
        image: image || undefined,
        featured: Boolean(rec.featured),
        sessions,
        thingsToNote: toStringArray(rec.thingsToNote ?? rec.notes ?? rec.note ?? rec.noteList),
        location: toString(rec.location ?? rec.venue ?? ""),
        level: toString(rec.level ?? ""),
      } as CourseSummary;
    });
  } catch (error) {
    console.error("Error fetching classes:", error);
    return [];
  }
}

export async function getClassById(id: string): Promise<CourseSummary | null> {
  try {
    await dbConnect();
    
    const rawClass = await Class
      .findById(id)
      .lean()
      .exec();

    if (!rawClass) return null;

    const rec = isObject(rawClass) ? rawClass : {};

    const rawSessions = Array.isArray(rec.sessions) ? (rec.sessions as unknown[]) : [];
    const sessions = rawSessions.map((s, si) => {
      const sRec = isObject(s) ? s : {};
      const sessionId = toString(sRec.id) || toString(sRec._id) || `s-${si}`;
      const start = toString(sRec.start) || toString(sRec.startDate) || toString(sRec.startTime) || "";
      const end = toString(sRec.end) || toString(sRec.endDate) || toString(sRec.endTime) || "";
      return { id: sessionId, start, end };
    });

    const instructorObj = (() => {
      const ins = rec.instructor;
      if (isObject(ins)) {
        return {
          name: toString(ins.name, toString(rec.instructorName) || "Instructor"),
          avatar: toString(ins.avatar),
        };
      }
      return { name: toString(rec.instructorName) || toString(rec.instructor) || "Instructor" };
    })();

    const images = Array.isArray(rec.images) ? rec.images : undefined;
    const image = images && images.length > 0 ? toString(images[0]) : toString(rec.image ?? rec.photo ?? "");

    return {
      id: toString(rec._id) || id,
      title: toString(rec.title) || toString(rec.name) || "Untitled class",
      subtitle: typeof rec.subtitle === "string" ? rec.subtitle : typeof rec.location === "string" ? rec.location : undefined,
      price: toNumber(rec.price ?? rec.cost ?? 0, 0),
      summary: toString(rec.summary ?? rec.excerpt ?? ""),
      description: toString(rec.description ?? rec.details ?? ""),
      durationMinutes: toNumber(rec.durationMinutes ?? rec.duration ?? 0, 0),
      capacity: toNumber(rec.capacity ?? rec.maxCapacity ?? 0, 0),
      instructor: instructorObj,
      image: image || undefined,
      featured: Boolean(rec.featured),
      sessions,
      thingsToNote: toStringArray(rec.thingsToNote ?? rec.notes ?? rec.note ?? rec.noteList),
      location: toString(rec.location ?? rec.venue ?? ""),
      level: toString(rec.level ?? ""),
    };
  } catch (error) {
    console.error("Error fetching class by id:", error);
    return null;
  }
}