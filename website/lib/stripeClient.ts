import Stripe from "stripe";

let cached: Stripe | null = null;

/** Shared Stripe client, lazily constructed so a missing key only breaks the routes that use it. */
export function getStripe(): Stripe {
  if (cached) return cached;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  cached = new Stripe(secret, { apiVersion: "2025-12-15.clover" });
  return cached;
}
