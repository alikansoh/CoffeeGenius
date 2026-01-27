import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISettings extends Document {
  deliveryPricePence: number; // shipping cost in pence
  freeDeliveryThresholdPence: number; // free delivery threshold in pence
  freeDeliveryEnabled: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    deliveryPricePence: { type: Number, required: true, default: 499 },
    freeDeliveryThresholdPence: { type: Number, required: true, default: 3000 },
    freeDeliveryEnabled: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation
const Settings: Model<ISettings> =
  (mongoose.models.Settings as Model<ISettings>) ||
  mongoose.model<ISettings>('Settings', SettingsSchema);

export default Settings;