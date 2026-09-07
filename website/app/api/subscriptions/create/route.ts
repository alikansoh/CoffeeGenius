import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import { mintManageToken } from "@/lib/subscriptionManageToken";
import CoffeeVariant from "@/models/CoffeeVariant";
import Coffee from "@/models/Coffee";
import SubscriptionModel from "@/models/Subscription";
import { getStripe } from "@/lib/stripeClient";
import {
  ensureStripeSubscriptionPrices,
  createIntroStripePrice,
  isValidFrequencyWeeks,
} from "@/lib/subscriptionPricing";
import { findActiveSubscriptionIntroCoupon, validateAndApplyCoupon } from "@/lib/couponService";
import Stripe from "stripe";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface ShippingAddressBody {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
}

/**
 * POST /api/subscriptions/create
 * Creates (or reuses) a Stripe Customer and a Stripe Subscription for one
 * coffee variant at a chosen delivery frequency, in "default_incomplete"
 * payment mode, and returns a PaymentIntent client_secret for the caller to
 * confirm inline with Stripe Elements — no redirect to Stripe's hosted page.
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const {
      variantId,
      frequencyWeeks,
      quantity,
      email,
      name,
      phone,
      shippingAddress,
      couponCode,
    }: {
      variantId?: string;
      frequencyWeeks?: number;
      quantity?: number;
      email?: string;
      name?: string;
      phone?: string;
      shippingAddress?: ShippingAddressBody;
      couponCode?: string;
    } = body;

    const itemQuantity = quantity && quantity > 0 ? Math.floor(quantity) : 1;

    if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
      return NextResponse.json({ error: "Valid variantId is required" }, { status: 400 });
    }
    if (!frequencyWeeks || !isValidFrequencyWeeks(frequencyWeeks)) {
      return NextResponse.json({ error: "Invalid delivery frequency" }, { status: 400 });
    }
    // Email is optional here: the checkout page creates this subscription (and its
    // client_secret) as soon as a frequency is picked, before the customer has typed
    // anything into the checkout form — the email field lives inside that form, which
    // only renders once it has a client_secret to mount Stripe Elements against. The
    // real email gets attached in /api/subscriptions/save-shipping once the customer
    // submits the form, right before payment confirms.
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Email address is not valid" }, { status: 400 });
    }

    const variant = await CoffeeVariant.findById(variantId);
    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }
    if (!variant.subscriptionEnabled) {
      return NextResponse.json(
        { error: "This product is not available as a subscription" },
        { status: 400 }
      );
    }

    const coffee = await Coffee.findById(variant.coffeeId).select("name").lean();
    const variantLabel = `${coffee?.name || "Coffee"} — ${variant.size} — ${variant.grind}`;

    // Ensure the Stripe prices reflect the variant's current subscription settings.
    const { prices, subscriptionPrice } = await ensureStripeSubscriptionPrices(variant);
    const matchingPrice = prices.find((p) => p.frequencyWeeks === frequencyWeeks);
    if (!matchingPrice) {
      return NextResponse.json({ error: "Could not price that delivery frequency" }, { status: 500 });
    }
    if (
      JSON.stringify(variant.subscriptionFrequencyPrices) !== JSON.stringify(prices) ||
      !variant.stripeProductId
    ) {
      variant.subscriptionFrequencyPrices = prices;
      await variant.save();
    }

    // Two ways a subscription can start at a discount:
    //  1. An automatic "Subscription Intro Offer" coupon scoped to this variant (admin-set
    //     cycles, e.g. "20% off first 2 deliveries").
    //  2. A code the customer typed in at checkout — treated as a one-time discount on just
    //     the first delivery (cycles: 1), same as how a coupon code discounts a one-off order
    //     without affecting anything after it. A typed code takes priority when both apply.
    let effectiveIntro: { percentOff: number; cycles: number; couponId?: string } | null = null;

    if (couponCode) {
      const codeResult = await validateAndApplyCoupon(
        [
          {
            id: String(variant._id),
            name: variantLabel,
            price: variant.price,
            quantity: 1,
            productType: "coffee",
            productId: String(variant.coffeeId),
            variantId: String(variant._id),
          },
        ],
        couponCode
      );
      if (codeResult?.valid && codeResult.discountAmount > 0) {
        const percentOff = Math.min(100, (codeResult.discountAmount / variant.price) * 100);
        effectiveIntro = {
          percentOff,
          cycles: 1,
          couponId: codeResult.couponId,
        };
      }
    }

    if (!effectiveIntro) {
      // Look for an active, automatic "Subscription Intro Offer" coupon for this variant.
      const introCoupon = await findActiveSubscriptionIntroCoupon(
        String(variant.coffeeId),
        String(variant._id)
      );
      if (introCoupon?.subscriptionIntro) {
        effectiveIntro = {
          percentOff: introCoupon.subscriptionIntro.percentOff,
          cycles: introCoupon.subscriptionIntro.cycles,
          couponId: String(introCoupon._id),
        };
      }
    }

    let startingPriceId = matchingPrice.stripePriceId;
    let introPrice: number | undefined;
    if (effectiveIntro) {
      const created = await createIntroStripePrice(variant, frequencyWeeks, effectiveIntro.percentOff);
      startingPriceId = created.stripePriceId;
      introPrice = created.introPrice;
    }

    // Subscriptions never carry a delivery charge — always free delivery, every cycle.
    const stripe = getStripe();

    // Reuse an existing Stripe Customer for this email if one exists (skip the lookup when
    // email isn't known yet — see the comment above on why this route allows that).
    const existingCustomers = email ? await stripe.customers.list({ email, limit: 1 }) : null;
    const customer =
      existingCustomers?.data[0] ||
      (await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        phone: phone || undefined,
      }));

    const stripeSubscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: startingPriceId, quantity: itemQuantity }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        variantId: String(variant._id),
        coffeeId: String(variant.coffeeId),
        variantLabel,
        normalPrice: String(variant.price),
        discountPercent: String(variant.subscriptionDiscountPercent || 0),
        frequencyWeeks: String(frequencyWeeks),
        ...(effectiveIntro
          ? {
              introCouponId: effectiveIntro.couponId ?? "",
              introDiscountPercent: String(effectiveIntro.percentOff),
              introCyclesLimit: String(effectiveIntro.cycles),
            }
          : {}),
      },
    });

    // Newer Stripe API versions expose the invoice's payment client_secret via
    // `confirmation_secret` instead of an expandable nested `payment_intent` object.
    const latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice | null;
    const clientSecret = latestInvoice?.confirmation_secret?.client_secret;
    // The PaymentIntent id isn't returned directly alongside confirmation_secret, but it's
    // embedded in the client_secret itself ("pi_xxx_secret_yyy") — same technique CheckoutForm
    // already uses to recover a PaymentIntent id from a raw client_secret.
    const paymentIntentId = clientSecret?.split("_secret_")[0];

    if (!clientSecret) {
      console.error("❌ No client_secret on subscription's first invoice", stripeSubscription.id);
      return NextResponse.json({ error: "Could not start subscription payment" }, { status: 500 });
    }

    const subscriptionItemId = stripeSubscription.items.data.find(
      (i) => i.price.id === startingPriceId
    )?.id;

    // Record the subscription immediately (status: incomplete) so it's visible in
    // admin even before payment confirms. The webhook flips it to active/past_due.
    await SubscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: stripeSubscription.id },
      {
        $set: {
          email,
          name: name || undefined,
          phone: phone || undefined,
          stripeCustomerId: customer.id,
          stripePriceId: startingPriceId,
          stripeSubscriptionItemId: subscriptionItemId,
          normalStripePriceId: matchingPrice.stripePriceId,
          stripePaymentIntentId: paymentIntentId,
          coffeeId: variant.coffeeId,
          variantId: variant._id,
          variantLabel,
          normalPrice: variant.price,
          discountPercent: variant.subscriptionDiscountPercent || 0,
          subscriptionPrice: introPrice ?? subscriptionPrice,
          frequencyWeeks,
          shippingPencePerCycle: 0,
          status: "incomplete",
          cancelAtPeriodEnd: false,
          introCouponId: effectiveIntro?.couponId,
          introDiscountPercent: effectiveIntro?.percentOff,
          introCyclesLimit: effectiveIntro?.cycles,
          introCyclesCompleted: 0,
          introActive: !!effectiveIntro,
          shippingAddress: shippingAddress
            ? {
                firstName: shippingAddress.firstName,
                lastName: shippingAddress.lastName,
                line1: shippingAddress.line1,
                unit: shippingAddress.unit,
                city: shippingAddress.city,
                postcode: shippingAddress.postcode,
                country: shippingAddress.country,
                phone: shippingAddress.phone,
              }
            : undefined,
        },
        // Only set on first creation — the webhook rotates it (and its expiry) to a fresh
        // value every time it actually emails the link, so this is just a fallback in case
        // that email never fires (e.g. local dev without webhook forwarding).
        $setOnInsert: (() => {
          const { token, expiresAt } = mintManageToken();
          return { manageToken: token, manageTokenExpiresAt: expiresAt };
        })(),
      },
      { upsert: true }
    ).exec();

    return NextResponse.json(
      {
        clientSecret,
        subscriptionId: stripeSubscription.id,
        subscriptionPrice: introPrice ?? subscriptionPrice,
        shippingPence: 0, // subscriptions never carry a delivery charge
        introOffer: effectiveIntro
          ? { percentOff: effectiveIntro.percentOff, cycles: effectiveIntro.cycles }
          : null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error creating subscription:", error);
    return NextResponse.json({ error: "Failed to start subscription" }, { status: 500 });
  }
}
