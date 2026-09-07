import mongoose, { Schema, Document, Model } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'shipped'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface IOrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number; // GBP
  totalPrice: number; // GBP
  source?: string;
  roastType?: string;
  discountPerUnit?: number; // GBP, if you want per-line discount breakdown later
}

export type ShipmentProvider =
  | 'royal-mail'
  | 'dpd'
  | 'evri'
  | 'ups'
  | 'dhl'
  | 'fedex'
  | 'parcelforce'
  | 'yodel';

export interface IShipment {
  provider: ShipmentProvider;
  trackingCode?: string | null;
  shippedAt?: Date | null;
  estimatedDelivery?: Date | null;
}

export interface IOrder extends Document {
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentIntentId?: string | null;
  clientId?: mongoose.Types.ObjectId | string | null;
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
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    unit?: string;
    line1?: string;
    city?: string;
    postcode?: string;
    country?: string;
    sameAsShipping?: boolean;
  } | null;
  metadata?: Record<string, unknown>;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shipment?: IShipment | null;
  couponCode?: string | null;
  couponName?: string | null;
  couponId?: string | null;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    id: { type: String, required: true },
    name: { type: String },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    source: { type: String },
    roastType: { type: String },
    discountPerUnit: { type: Number, default: 0 },
  },
  { _id: false }
);

const ShipmentSchema = new Schema<IShipment>(
  {
    provider: {
      type: String,
      enum: ['royal-mail', 'dpd', 'evri', 'ups', 'dhl', 'fedex', 'parcelforce', 'yodel'],
      required: true,
    },
    trackingCode: { type: String, default: null },
    shippedAt: { type: Date, default: null },
    estimatedDelivery: { type: Date, default: null },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    items: { type: [OrderItemSchema], required: true, default: [] },

    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    shipping: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },

    currency: { type: String, default: 'gbp' },

    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'shipped', 'failed', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },

    paymentIntentId: { type: String, required: false },

    clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true, required: false },

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

    billingAddress: {
      firstName: String,
      lastName: String,
      unit: String,
      line1: String,
      city: String,
      postcode: String,
      country: String,
      sameAsShipping: Boolean,
    },

    metadata: { type: Schema.Types.Mixed },
    paidAt: { type: Date, default: null },

    shipment: { type: ShipmentSchema, default: null },

    couponCode: { type: String, default: null },
    couponName: { type: String, default: null },
    couponId: { type: String, default: null },
  },
  { timestamps: true }
);

OrderSchema.index({ paymentIntentId: 1 }, { unique: true, sparse: true });

OrderSchema.index({ 'metadata.webhookEventId': 1 }, { unique: true, sparse: true });

const Order: Model<IOrder> =
  (mongoose.models.Order as Model<IOrder>) ||
  mongoose.model<IOrder>('Order', OrderSchema);

export default Order;