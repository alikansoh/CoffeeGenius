import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------- Types ------------------- */
export interface ISession {
  id?: string;
  start?: Date;
  end?: Date;
}

export interface IInstructor {
  name: string;
  avatar?: string;
  bio?: string;
}

export interface ICourse extends Document {
  slug: string;
  title: string;
  subtitle?: string;
  price: number;
  summary?: string;
  description?: string;
  durationMinutes: number;
  capacity: number;
  minPeople?: number;
  maxPeople?: number;
  instructor?: IInstructor;
  image?: string;
  images?: string[];
  featured?: boolean;
  sessions: ISession[];
  thingsToNote?: string[];
  furtherInformation?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------- Model Interface ------------------- */
interface CourseModel extends Model<ICourse> {
  cleanupExpiredSessions(): Promise<{ matchedCount: number; modifiedCount: number }>;
  migrateSessionStringsToDates?(): Promise<void>;
  attachLazyCleanup?(rateMs?: number): void;
}

/* ------------------- Schemas ------------------- */
const SessionSchema = new Schema<ISession>(
  {
    id: { type: String },
    start: { type: Date },
    end: { type: Date },
  },
  { _id: false }
);

const InstructorSchema = new Schema<IInstructor>(
  {
    name: { type: String, required: true, trim: true },
    avatar: { type: String },
    bio: { type: String, trim: true },
  },
  { _id: false }
);

const CourseSchema = new Schema<ICourse>(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    title: { type: String, required: true, index: true, trim: true },
    subtitle: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    summary: { type: String, trim: true },
    description: { type: String, trim: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    capacity: { type: Number, required: true, min: 1 },
    minPeople: { type: Number, min: 1 },
    maxPeople: { type: Number, min: 1 },
    instructor: { type: InstructorSchema, default: undefined },
    image: { type: String },
    images: [{ type: String }],
    featured: { type: Boolean, default: false, index: true },
    sessions: { type: [SessionSchema], default: [] },
    thingsToNote: { type: [String], default: [] },
    furtherInformation: { type: String, trim: true },
    location: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

/* Indexes */
CourseSchema.index({ title: "text", summary: "text", description: "text", "instructor.name": "text", location: "text" });
CourseSchema.index({ featured: 1, createdAt: -1 });
// index sessions.end for performance (not a TTL index)
CourseSchema.index({ "sessions.end": 1 });

/* ------------------- Statics ------------------- */

/**
 * Remove sessions with end <= now across all Course documents.
 * Uses updateMany + $pull so only array elements are removed.
 */
CourseSchema.statics.cleanupExpiredSessions = async function cleanupExpiredSessions() {
  const now = new Date();
  const res = await this.updateMany(
    { "sessions.end": { $lte: now } },
    { $pull: { sessions: { end: { $lte: now } } } }
  );
  return { matchedCount: res.matchedCount ?? 0, modifiedCount: res.modifiedCount ?? 0 };
};

/**
 * Optional one-off migration: convert string session start/end values into Date objects.
 * Run once if you previously stored session end/start as strings.
 */
CourseSchema.statics.migrateSessionStringsToDates = async function migrateSessionStringsToDates() {
  const cursor = this.find({ "sessions.end": { $exists: true } }).cursor();
  for await (const doc of cursor) {
    let changed = false;
    const newSessions = (doc.sessions || []).map((s: any) => {
      const out: any = { ...s };
      if (typeof out.start === "string") {
        const d = new Date(out.start);
        if (!Number.isNaN(d.getTime())) {
          out.start = d;
          changed = true;
        }
      }
      if (typeof out.end === "string") {
        const d = new Date(out.end);
        if (!Number.isNaN(d.getTime())) {
          out.end = d;
          changed = true;
        }
      }
      return out;
    });
    if (changed) {
      doc.sessions = newSessions;
      try {
        doc.markModified("sessions");
        await doc.save();
      } catch (err) {
        console.warn("Failed migrating sessions for doc", doc._id, err);
      }
    }
  }
};

/**
 * Optional lazy cleanup attachment: installs model pre-hooks that trigger cleanup
 * rateMs: minimal milliseconds between runs per process.
 */
CourseSchema.statics.attachLazyCleanup = function attachLazyCleanup(rateMs = 5 * 60 * 1000) {
  let lastRun = 0;
  const model = this as CourseModel;

  async function maybeRun() {
    const now = Date.now();
    if (now - lastRun < rateMs) return;
    lastRun = now;
    try {
      const res = await model.cleanupExpiredSessions();
      if (res.modifiedCount > 0) {
        console.info(`[Course.cleanup] removed expired sessions — matched=${res.matchedCount} modified=${res.modifiedCount}`);
      }
    } catch (err) {
      console.warn("[Course.cleanup] error:", err);
    }
  }

  async function preHook(this: any) {
    if (typeof window !== "undefined") return;
    await maybeRun();
  }

  const flag = "__course_lazy_cleanup_attached__";
  if (!(CourseSchema as any)[flag]) {
    CourseSchema.pre("find", preHook);
    CourseSchema.pre("findOne", preHook);
    CourseSchema.pre("aggregate", preHook);
    CourseSchema.pre("findOneAndUpdate", preHook);
    (CourseSchema as any)[flag] = true;
  }
};

/* ------------------- Export ------------------- */
const CourseModel = (mongoose.models.Course as CourseModel) || (mongoose.model<ICourse, CourseModel>("Course", CourseSchema) as CourseModel);
export default CourseModel;