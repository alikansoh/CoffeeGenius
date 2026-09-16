import { getStripe } from "./stripeClient";
import CoffeeVariant, { ICoffeeVariant } from "@/models/CoffeeVariant";
import Coffee from "@/models/Coffee";
import Settings from "@/models/Settings";

/** The delivery frequencies offered for every subscribable variant. */
export const SUBSCRIPTION_FREQUENCIES_WEEKS = [1, 2, 3, 4] as const;
export type SubscriptionFrequencyWeeks = (typeof SUBSCRIPTION_FREQUENCIES_WEEKS)[number];

export function isValidFrequencyWeeks(value: number): value is SubscriptionFrequencyWeeks {
  return (SUBSCRIPTION_FREQUENCIES_WEEKS as readonly number[]).includes(value);
}

export function frequencyLabel(weeks: number): string {
  return `Every ${weeks} weeks`;
}

/** Rounds to 2dp like every other price in this codebase. */
export function computeSubscriptionPrice(normalPrice: number, discountPercent: number): number {
  const price = normalPrice * (1 - discountPercent / 100);
  return Number(Math.max(0, price).toFixed(2));
}

/**
 * Subscription delivery fee — a separate control from one-off order delivery (see
 * /admin/settings, "Subscription delivery" section). Checked against the per-delivery
 * subscription price itself (a renewal has no cart to sum), so this is a single deterministic
 * function of a variant + the current global settings, not something computed per-customer.
 */
async function getSubscriptionDeliveryFeePence(basePricePence: number): Promise<number> {
  const settings = await Settings.findOne().lean();
  const priceP = settings?.subscriptionDeliveryPricePence ?? 499;
  const thresholdP = settings?.subscriptionFreeDeliveryThresholdPence ?? 3000;
  const enabled = settings?.subscriptionFreeDeliveryEnabled ?? true;
  if (enabled && basePricePence >= thresholdP) return 0;
  return priceP;
}

/**
 * Pure DB-only computation of what a variant's subscription actually charges per delivery
 * (coffee price + delivery fee) — no Stripe calls, so it's cheap enough to call on every page
 * render/selection change for display purposes. This is the exact same math
 * ensureStripeSubscriptionPrices uses to set the real Stripe Price, so a displayed price here
 * never drifts from what actually gets charged at signup.
 */
export async function computeSubscriptionChargeWithDelivery(
  variant: Pick<ICoffeeVariant, "price" | "subscriptionDiscountPercent">
): Promise<{ subscriptionPrice: number; basePrice: number; shippingPencePerCycle: number }> {
  const basePrice = computeSubscriptionPrice(variant.price, variant.subscriptionDiscountPercent || 0);
  const basePricePence = Math.round(basePrice * 100);
  const shippingPencePerCycle = await getSubscriptionDeliveryFeePence(basePricePence);
  const subscriptionPrice = Number(((basePricePence + shippingPencePerCycle) / 100).toFixed(2));
  return { subscriptionPrice, basePrice, shippingPencePerCycle };
}

/**
 * Ensures a variant with subscriptions enabled has a live Stripe recurring
 * Price for every offered delivery frequency, creating the Stripe
 * Product/Prices as needed. The charge amount is the same across
 * frequencies (only the interval differs) — subscribers pay the same
 * per-delivery price whether it ships every 1, 2, 3, or 4 weeks.
 *
 * Stripe Prices are immutable, so a price-amount change always creates new
 * Price objects — existing subscribers already on an old Price are
 * untouched (price changes never affect subscribers already on a plan).
 */
export async function ensureStripeSubscriptionPrices(
  variant: ICoffeeVariant
): Promise<{
  stripeProductId: string;
  prices: { frequencyWeeks: number; stripePriceId: string }[];
  /** Total charged per delivery — coffee price plus any delivery fee, i.e. what the Stripe
   *  Price actually bills. Not just the coffee's own subscribe-and-save price. */
  subscriptionPrice: number;
  shippingPencePerCycle: number;
}> {
  const { subscriptionPrice, shippingPencePerCycle } = await computeSubscriptionChargeWithDelivery(variant);
  const unitAmountPence = Math.round(subscriptionPrice * 100);

  const stripe = getStripe();

  let productId = variant.stripeProductId;
  if (!productId) {
    const coffee = await Coffee.findById(variant.coffeeId).select("name").lean();
    const product = await stripe.products.create({
      name: `${coffee?.name || "Coffee"} — ${variant.size} — ${variant.grind} (Subscription)`,
      metadata: { variantId: String(variant._id), coffeeId: String(variant.coffeeId) },
    });
    productId = product.id;
  }

  const existingByFrequency = new Map(
    (variant.subscriptionFrequencyPrices || []).map((p) => [p.frequencyWeeks, p.stripePriceId])
  );

  const prices: { frequencyWeeks: number; stripePriceId: string }[] = [];

  for (const frequencyWeeks of SUBSCRIPTION_FREQUENCIES_WEEKS) {
    const existingPriceId = existingByFrequency.get(frequencyWeeks);

    if (existingPriceId) {
      const existing = await stripe.prices.retrieve(existingPriceId);
      if (existing.active && existing.unit_amount === unitAmountPence) {
        prices.push({ frequencyWeeks, stripePriceId: existing.id });
        continue;
      }
      // Amount changed — deactivate the old price for this frequency and create a new one.
      await stripe.prices.update(existingPriceId, { active: false }).catch(() => {});
    }

    const price = await stripe.prices.create({
      product: productId,
      currency: "gbp",
      unit_amount: unitAmountPence,
      recurring: { interval: "week", interval_count: frequencyWeeks },
      metadata: {
        variantId: String(variant._id),
        coffeeId: String(variant.coffeeId),
        frequencyWeeks: String(frequencyWeeks),
      },
    });

    prices.push({ frequencyWeeks, stripePriceId: price.id });
  }

  return { stripeProductId: productId, prices, subscriptionPrice, shippingPencePerCycle };
}

/**
 * Creates a one-off Stripe Price for a variant's intro-offer amount at a given delivery
 * frequency. Not cached/reused like the normal frequency prices — intro offers are
 * comparatively rare, so a fresh Price per subscribe is simpler than a cache that would need
 * its own invalidation whenever the coupon's discount or the variant's price changes.
 *
 * The intro discount stacks ON TOP OF the variant's normal subscribe-and-save price — it does
 * NOT replace it. E.g. a variant with 12% off for subscribing, plus a 20% intro offer, charges
 * 20% off the already-12%-off price (not just 20% off full retail, which could land *above*
 * the customer's normal ongoing price if introPercentOff < subscriptionDiscountPercent).
 */
export async function createIntroStripePrice(
  variant: ICoffeeVariant,
  frequencyWeeks: number,
  introPercentOff: number
): Promise<{ stripePriceId: string; introPrice: number; shippingPencePerCycle: number }> {
  const normalSubscribePrice = computeSubscriptionPrice(
    variant.price,
    variant.subscriptionDiscountPercent || 0
  );
  // The delivery fee is never discounted by the intro offer — only the coffee itself is.
  const introCoffeePrice = computeSubscriptionPrice(normalSubscribePrice, introPercentOff);
  const introCoffeePricePence = Math.round(introCoffeePrice * 100);
  const shippingPencePerCycle = await getSubscriptionDeliveryFeePence(introCoffeePricePence);
  const unitAmountPence = introCoffeePricePence + shippingPencePerCycle;
  const introPrice = Number((unitAmountPence / 100).toFixed(2));

  const stripe = getStripe();

  let productId = variant.stripeProductId;
  if (!productId) {
    const coffee = await Coffee.findById(variant.coffeeId).select("name").lean();
    const product = await stripe.products.create({
      name: `${coffee?.name || "Coffee"} — ${variant.size} — ${variant.grind} (Subscription)`,
      metadata: { variantId: String(variant._id), coffeeId: String(variant.coffeeId) },
    });
    productId = product.id;
    variant.stripeProductId = productId;
    await variant.save();
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: "gbp",
    unit_amount: unitAmountPence,
    recurring: { interval: "week", interval_count: frequencyWeeks },
    metadata: {
      variantId: String(variant._id),
      coffeeId: String(variant.coffeeId),
      frequencyWeeks: String(frequencyWeeks),
      introOffer: "true",
    },
  });

  return { stripePriceId: price.id, introPrice, shippingPencePerCycle };
}

/**
 * Call after saving a variant's subscription settings (enabled + discount).
 * No-ops if subscriptions are disabled for the variant.
 */
export async function syncVariantSubscriptionPrices(variantId: string): Promise<void> {
  const variant = await CoffeeVariant.findById(variantId);
  if (!variant) return;

  if (!variant.subscriptionEnabled) return;

  const { stripeProductId, prices } = await ensureStripeSubscriptionPrices(variant);

  variant.stripeProductId = stripeProductId;
  variant.subscriptionFrequencyPrices = prices;
  await variant.save();
}
