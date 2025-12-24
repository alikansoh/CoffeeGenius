import mongoose, { Schema, Document, Model } from 'mongoose';

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'failed' | 'cancelled';

export interface IOrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number; // GBP
  totalPrice: number; // GBP
  source?: string;
}

export interface IOrder extends Document {
  items: IOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentIntentId?: string | null;
  client?: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    unit?: string;
    line1?: string;
    city?: string;
    postcode?: string;
    country?: string;
  } | null;
  metadata?: Record<string, unknown>;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    id: { type: String, required: true },
    name: { type: String },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    source: { type: String },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    shipping: { type: Number, required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'gbp' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'shipped', 'failed', 'cancelled'],
      default: 'pending',
    },
    paymentIntentId: { type: String, index: true, sparse: true },
    client: {
      name: String,
      email: String,
      phone: String,
    },
    shippingAddress: {
      firstName: String,
      lastName: String,
      email: String,
      phone: String,
      unit: String,
      line1: String,
      city: String,
      postcode: String,
      country: String,
    },
    metadata: { type: Schema.Types.Mixed },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Order: Model<IOrder> = (mongoose.models.Order as Model<IOrder>) || mongoose.model<IOrder>('Order', OrderSchema);
export default Order;