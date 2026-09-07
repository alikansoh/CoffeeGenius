import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Subscription from "@/models/Subscription";
import { getStripe } from "@/lib/stripeClient";

/**
 * GET /api/subscriptions/[id]
 * Fetches one subscription by its Mongo _id, for the admin detail view.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid subscription id" }, { status: 400 });
    }

    const subscription = await Subscription.findById(id).lean();
    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, subscription }, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching subscription:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch subscription" }, { status: 500 });
  }
}

/**
 * PATCH /api/subscriptions/[id]
 * Admin actions on a subscription: cancel (immediately or at period end),
 * or resume a subscription that was set to cancel at period end.
 *
 * Body: { action: "cancel" | "cancel_at_period_end" | "resume" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid subscription id" }, { status: 400 });
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action }: { action?: "cancel" | "cancel_at_period_end" | "resume" } = body;

    const stripe = getStripe();

    if (action === "cancel") {
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

    return NextResponse.json({ success: true, subscription }, { status: 200 });
  } catch (error) {
    console.error("❌ Error updating subscription:", error);
    return NextResponse.json({ success: false, error: "Failed to update subscription" }, { status: 500 });
  }
}

/**
 * DELETE /api/subscriptions/[id]
 * Permanently removes a subscription record — for cleaning up test data. Best-effort cancels
 * the Stripe subscription first (so it stops billing/generating webhook events), but proceeds
 * with the DB delete even if that fails or it's already canceled — the point is to make the
 * record gone either way, not to block deletion on Stripe's state.
 *
 * Fulfilment Orders/Invoices already created from this subscription's past payments are left
 * untouched — deleting those would rewrite real order history, which isn't the intent here.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid subscription id" }, { status: 400 });
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 });
    }

    if (subscription.status !== "canceled") {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      } catch (err) {
        console.warn("⚠️ Could not cancel Stripe subscription before delete (continuing):", err);
      }
    }

    await Subscription.deleteOne({ _id: id });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("❌ Error deleting subscription:", error);
    return NextResponse.json({ success: false, error: "Failed to delete subscription" }, { status: 500 });
  }
}
