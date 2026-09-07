import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Subscription from "@/models/Subscription";
import CoffeeVariant from "@/models/CoffeeVariant";
import Coffee from "@/models/Coffee";
import { getStripe } from "@/lib/stripeClient";
import {
  SUBSCRIPTION_FREQUENCIES_WEEKS,
  isValidFrequencyWeeks,
  ensureStripeSubscriptionPrices,
  createIntroStripePrice,
} from "@/lib/subscriptionPricing";

/**
 * GET /api/subscriptions/token/[token]
 * Customer self-service lookup by the manageToken emailed to them after every
 * payment — this token IS the access credential (there's no customer login
 * system), so it's treated like a password: never echoed back, and only the
 * fields a customer needs to manage their subscription are returned.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbConnect();
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 400 });
    }

    const subscription = await Subscription.findOne({
      manageToken: token,
      manageTokenExpiresAt: { $gt: new Date() },
    })
      .select(
        "_id variantId coffeeId variantLabel subscriptionPrice frequencyWeeks status cancelAtPeriodEnd introActive introDiscountPercent currentPeriodEnd createdAt shippingAddress"
      )
      .lean();

    if (!subscription) {
      return NextResponse.json({ success: false, error: "This link is invalid or has expired" }, { status: 404 });
    }

    // Bag image — best-effort only, never fails the whole lookup if the product moved/changed.
    let image: string | undefined;
    try {
      const variant = await CoffeeVariant.findById(subscription.variantId).select("img").lean();
      image = variant?.img;
      if (!image) {
        const coffee = await Coffee.findById(subscription.coffeeId).select("img images").lean();
        image = coffee?.img || coffee?.images?.[0];
      }
    } catch {
      // ignore — page renders a placeholder if no image comes back
    }

    return NextResponse.json(
      {
        success: true,
        subscription: { ...subscription, image },
        frequencyOptions: SUBSCRIPTION_FREQUENCIES_WEEKS,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error looking up subscription by token:", error);
    return NextResponse.json({ success: false, error: "Failed to load subscription" }, { status: 500 });
  }
}

/**
 * PATCH /api/subscriptions/token/[token]
 * Body: { action: "cancel" | "cancel_at_period_end" | "resume" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbConnect();
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 400 });
    }

    const subscription = await Subscription.findOne({
      manageToken: token,
      manageTokenExpiresAt: { $gt: new Date() },
    });
    if (!subscription) {
      return NextResponse.json({ success: false, error: "This link is invalid or has expired" }, { status: 404 });
    }

    const body = await req.json();
    const {
      action,
      frequencyWeeks,
    }: {
      action?: "cancel" | "cancel_at_period_end" | "resume" | "change_frequency";
      frequencyWeeks?: number;
    } = body;

    if (subscription.status === "canceled") {
      return NextResponse.json(
        {
          success: false,
          error:
            action === "resume"
              ? "This subscription was already canceled and can't be resumed. Please subscribe again."
              : "This subscription is already canceled",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    if (action === "change_frequency") {
      if (!frequencyWeeks || !isValidFrequencyWeeks(frequencyWeeks)) {
        return NextResponse.json({ success: false, error: "Invalid delivery frequency" }, { status: 400 });
      }
      if (frequencyWeeks === subscription.frequencyWeeks) {
        return NextResponse.json(
          { success: false, error: "That's already your current delivery frequency" },
          { status: 400 }
        );
      }
      if (!subscription.stripeSubscriptionItemId) {
        return NextResponse.json(
          { success: false, error: "Can't change frequency on this subscription — please contact support" },
          { status: 400 }
        );
      }

      const variant = await CoffeeVariant.findById(subscription.variantId);
      if (!variant) {
        return NextResponse.json({ success: false, error: "Product no longer available" }, { status: 404 });
      }

      let newPriceId: string;
      if (subscription.introActive && subscription.introDiscountPercent) {
        const created = await createIntroStripePrice(
          variant,
          frequencyWeeks,
          subscription.introDiscountPercent
        );
        newPriceId = created.stripePriceId;
      } else {
        const { prices } = await ensureStripeSubscriptionPrices(variant);
        const matching = prices.find((p) => p.frequencyWeeks === frequencyWeeks);
        if (!matching) {
          return NextResponse.json({ success: false, error: "Could not price that frequency" }, { status: 500 });
        }
        newPriceId = matching.stripePriceId;
        subscription.normalStripePriceId = matching.stripePriceId;
      }

      const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: subscription.stripeSubscriptionItemId, price: newPriceId }],
        proration_behavior: "none",
      });

      subscription.frequencyWeeks = frequencyWeeks;
      subscription.stripePriceId = newPriceId;
      // Changing the interval moves the next billing date — reflect that immediately rather
      // than waiting on the next webhook sync, so the UI's "next delivery" is never stale.
      const updatedItem = updated.items.data[0];
      if (updatedItem?.current_period_end) {
        subscription.currentPeriodEnd = new Date(updatedItem.current_period_end * 1000);
      }
      if (updatedItem?.current_period_start) {
        subscription.currentPeriodStart = new Date(updatedItem.current_period_start * 1000);
      }
      await subscription.save();
    } else if (action === "cancel") {
      const canceled = await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = canceled.canceled_at
        ? new Date(canceled.canceled_at * 1000)
        : new Date();
      await subscription.save();
    } else if (action === "cancel_at_period_end") {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      subscription.cancelAtPeriodEnd = true;
      await subscription.save();
    } else if (action === "resume") {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();
    } else {
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        subscription: {
          _id: subscription._id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          frequencyWeeks: subscription.frequencyWeeks,
          subscriptionPrice: subscription.subscriptionPrice,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error updating subscription by token:", error);
    return NextResponse.json({ success: false, error: "Failed to update subscription" }, { status: 500 });
  }
}
