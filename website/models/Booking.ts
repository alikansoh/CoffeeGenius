import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBooking extends Document {
  bookingRef: string;
  courseId: mongoose.Types.ObjectId;
  sessionId?: string;
  sessionStart?: Date;
  sessionEnd?: Date;
  name: string;
  email: string;
  phone: string;
  attendees: number;
  status: "confirmed" | "cancelled" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

type BookingModel = Model<IBooking>

const BookingSchema = new Schema<IBooking>(
  {
    bookingRef: { type: String, required: true, index: true, unique: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    sessionId: { type: String },
    sessionStart: { type: Date },
    sessionEnd: { type: Date },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    attendees: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["confirmed", "cancelled", "pending"], default: "confirmed" },
  },
  { timestamps: true }
);

// optional compound index for counting by course+session quickly
BookingSchema.index({ courseId: 1, sessionId: 1 });

const BookingModel = (mongoose.models.Booking as BookingModel) || mongoose.model<IBooking, BookingModel>("Booking", BookingSchema);
export default BookingModel;