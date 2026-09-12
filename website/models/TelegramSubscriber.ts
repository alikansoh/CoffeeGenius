import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITelegramSubscriber extends Document {
  chatId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramSubscriberSchema = new Schema<ITelegramSubscriber>(
  {
    chatId: { type: String, required: true, unique: true },
    firstName: { type: String },
    lastName: { type: String },
    username: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const TelegramSubscriber: Model<ITelegramSubscriber> =
  mongoose.models.TelegramSubscriber ||
  mongoose.model<ITelegramSubscriber>("TelegramSubscriber", TelegramSubscriberSchema);

export default TelegramSubscriber;
