import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISettings extends Document {
  deliveryPricePence: number; // shipping cost in pence
  freeDeliveryThresholdPence: number; // free delivery threshold in pence
  freeDeliveryEnabled: boolean;
  // Separate delivery rules for subscription deliveries — independent of the one-off order
  // settings above. Checked against the per-delivery subscription price (not a cart subtotal,
  // since a subscription renewal has no cart). Baked into the subscription's Stripe Price at
  // signup/frequency-change time — it isn't re-evaluated for subscribers already on a price.
  subscriptionDeliveryPricePence: number;
  subscriptionFreeDeliveryThresholdPence: number;
  subscriptionFreeDeliveryEnabled: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    deliveryPricePence: { type: Number, required: true, default: 499 },
    freeDeliveryThresholdPence: { type: Number, required: true, default: 3000 },
    freeDeliveryEnabled: { type: Boolean, required: true, default: true },
    subscriptionDeliveryPricePence: { type: Number, required: true, default: 499 },
    subscriptionFreeDeliveryThresholdPence: { type: Number, required: true, default: 3000 },
    subscriptionFreeDeliveryEnabled: { type: Boolean, required: true, default: true },
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