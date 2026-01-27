import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IClientAddress {
  firstName?: string;
  lastName?: string;
  unit?: string | null;
  line1?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
}

export interface IClient extends Document {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: IClientAddress | null;
  isSubscribed?: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Normalizers */
function normalizeEmail(email?: string | null) {
  if (!email) return undefined;
  const s = String(email).trim().toLowerCase();
  return s || undefined;
}

function normalizePhone(phone?: string | null) {
  if (!phone) return undefined;
  const s = String(phone).trim();
  const hasPlus = s.startsWith('+');
  const cleaned = s.replace(/[^\d+]/g, '');
  if (hasPlus) return cleaned;
  return cleaned.replace(/\+/g, '') || undefined;
}

const ClientSchema = new Schema<IClient>(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true, index: true },
    address: {
      firstName: String,
      lastName: String,
      unit: String,
      line1: String,
      city: String,
      postcode: String,
      country: String,
    },
    // New field for marketing/subscription status (default false)
    isSubscribed: { type: Boolean, default: false, index: true },

    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

// Normalize fields before validation/save so uniqueness is consistent
// Use a middleware without the `next` parameter so we don't need HookNextFunction
ClientSchema.pre('validate', function (this: IClient) {
  // normalizeEmail/normalizePhone return `string | undefined` which is assignable
  // to `email?: string | null` / `phone?: string | null` (optional includes undefined).
  this.email = normalizeEmail(this.email as string | null) ?? undefined;
  this.phone = normalizePhone(this.phone as string | null) ?? undefined;
});

// Explicit unique sparse indexes
ClientSchema.index({ email: 1 }, { unique: true, sparse: true, name: 'unique_email' });
ClientSchema.index({ phone: 1 }, { unique: true, sparse: true, name: 'unique_phone' });

// Prevent model recompilation in dev / serverless environments
const Client: Model<IClient> =
  (mongoose.models.Client as Model<IClient>) || mongoose.model<IClient>('Client', ClientSchema);

export default Client;