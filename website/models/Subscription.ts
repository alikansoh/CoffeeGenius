import mongoose, { Schema, Document, Types, Model } from "mongoose";

export type SubscriptionStatus =
  | "incomplete" // Subscription created but first payment hasn't confirmed yet
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

export interface ISubscription extends Document {
  /** Empty until the checkout form submits — the subscription record is created before the
   *  email is known (see /api/subscriptions/create), then filled in via save-shipping. */
  email?: string;
  name?: string;
  phone?: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;
  /** The Price currently active on the subscription — the intro price while introActive, else normalStripePriceId */
  stripePriceId: string;
  /** The subscription item id, needed to swap the Price when the intro period ends */
  stripeSubscriptionItemId?: string;
  /** The Price to revert to once the intro period ends (== stripePriceId when there's no intro offer) */
  normalStripePriceId?: string;
  /** The PaymentIntent behind the first invoice — lets the checkout page save the
   *  shipping address (collected after this record is created) by matching on it. */
  stripePaymentIntentId?: string;

  /** Long random secret used as the customer's self-service "manage subscription" link
   *  (/manage-subscription/[token]) — there's no customer login system, so this token IS
   *  the access credential. Short-lived and rotated: a fresh token + expiry is generated
   *  every time it's emailed (initial payment + every renewal), so a stale forwarded/leaked
   *  email stops working once a newer one has been sent. Never expose stripeSubscriptionId
   *  or other internal ids alongside it. */
  manageToken?: string;
  manageTokenExpiresAt?: Date;

  /** Set when a "Subscription Intro Offer" coupon was active at signup */
  introCouponId?: Types.ObjectId;
  introDiscountPercent?: number;
  introCyclesLimit?: number;
  introCyclesCompleted: number;
  /** The last Stripe invoice id counted toward introCyclesCompleted — guards the atomic
   *  increment in handleSubscriptionIntroCycle against counting the same invoice.paid webhook
   *  delivery twice (Stripe redelivers on retry) and against a read-then-write race when two
   *  invoice.paid events for this subscription arrive close together (e.g. a test clock
   *  advancing across multiple billing periods at once). */
  introLastProcessedInvoiceId?: string;
  /** True while still within the intro window — flips to false once the price is swapped back */
  introActive: boolean;

  coffeeId: Types.ObjectId;
  variantId: Types.ObjectId;
  variantLabel: string; // e.g. "Ethiopia Yirgacheffe — 500g — Whole Bean" (snapshot, for display without a lookup)

  // Snapshot of pricing at the moment the customer subscribed — never
  // silently changed later even if the variant's price/discount changes.
  normalPrice: number;
  discountPercent: number;
  subscriptionPrice: number;

  /** Delivery cadence in weeks, e.g. 2/4/6 */
  frequencyWeeks: number;
  /** Per-cycle delivery fee, added as a second Stripe subscription item when the recurring
   *  amount doesn't clear the store's free-delivery threshold. 0 (or unset) means free delivery —
   *  decided once at signup and held stable for the life of the subscription. */
  shippingPencePerCycle?: number;
  stripeShippingPriceId?: string;
  stripeShippingItemId?: string;
  status: SubscriptionStatus;

  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;

  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    line1?: string;
    unit?: string;
    city?: string;
    postcode?: string;
    country?: string;
    phone?: string;
  };

  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ShippingAddressSchema = new Schema(
  {
    firstName: String,
    lastName: String,
    line1: String,
    unit: String,
    city: String,
    postcode: String,
    country: String,
    phone: String,
  },
  { _id: false }
);

const SubscriptionSchema = new Schema<ISubscription>(
  {
    email: { type: String, lowercase: true, trim: true, index: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },

    stripeCustomerId: { type: String, required: true, index: true },
    stripeSubscriptionId: { type: String, required: true, unique: true, index: true },
    stripePriceId: { type: String, required: true },
    stripeSubscriptionItemId: { type: String },
    normalStripePriceId: { type: String },
    stripePaymentIntentId: { type: String, index: true },
    // Not `required` at the schema level so pre-existing subscription docs (created before this
    // field existed) don't fail validation on unrelated saves — /api/subscriptions/create always
    // sets it for new subscriptions. `sparse` keeps the unique index from colliding on docs that
    // don't have it yet.
    manageToken: { type: String, unique: true, sparse: true, index: true },
    manageTokenExpiresAt: { type: Date },

    introCouponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
    introDiscountPercent: { type: Number, min: 0, max: 100 },
    introCyclesLimit: { type: Number, min: 1, max: 4 },
    introCyclesCompleted: { type: Number, default: 0 },
    introLastProcessedInvoiceId: { type: String },
    introActive: { type: Boolean, default: false },

    coffeeId: { type: Schema.Types.ObjectId, ref: "Coffee", required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, ref: "CoffeeVariant", required: true, index: true },
    variantLabel: { type: String, required: true },

    normalPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    subscriptionPrice: { type: Number, required: true, min: 0 },

    frequencyWeeks: { type: Number, required: true },
    shippingPencePerCycle: { type: Number, min: 0 },
    stripeShippingPriceId: { type: String },
    stripeShippingItemId: { type: String },
    status: {
      type: String,
      enum: ["incomplete", "active", "past_due", "canceled", "unpaid"],
      default: "incomplete",
      index: true,
    },

    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date },

    shippingAddress: { type: ShippingAddressSchema, default: undefined },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export default Subscription;
