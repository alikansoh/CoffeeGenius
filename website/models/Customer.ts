import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICustomer extends Document {
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String },
    email: { type: String, index: true, sparse: true },
    phone: { type: String },
    address: {
      line1: String,
      line2: String,
      city: String,
      postcode: String,
      country: String,
    },
    stripeCustomerId: { type: String },
  },
  { timestamps: true }
);

// Avoid model overwrite errors in dev / serverless environments
const Customer: Model<ICustomer> = (mongoose.models.Customer as Model<ICustomer>) || mongoose.model<ICustomer>('Customer', CustomerSchema);
export default Customer;