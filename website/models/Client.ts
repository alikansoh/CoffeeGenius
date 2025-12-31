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
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    phone: { type: String, trim: true, index: true, sparse: true },
    address: {
      firstName: String,
      lastName: String,
      unit: String,
      line1: String,
      city: String,
      postcode: String,
      country: String,
    },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation in serverless environments
const Client: Model<IClient> = (mongoose.models.Client as Model<IClient>) || mongoose.model<IClient>('Client', ClientSchema);
export default Client;