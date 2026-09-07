import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Subscription from "@/models/Subscription";
import { getStripe } from "@/lib/stripeClient";

/**
 * POST /api/subscriptions/save-shipping
 * Attaches the shipping address / contact details to a subscription record,
 * matched by the PaymentIntent id from its first invoice — mirrors
 * /api/save-shipping for one-off orders, but for subscriptions.
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const { paymentIntentId, shippingAddress, client } = body as {
      paymentIntentId?: string;
      shippingAddress?: Record<string, unknown>;
      client?: { name?: string | null; email?: string | null; phone?: string | null };
    };

    if (!paymentIntentId) {
      return NextResponse.json({ message: "paymentIntentId is required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (shippingAddress) {
      update.shippingAddress = {
        firstName: shippingAddress.firstName,
        lastName: shippingAddress.lastName,
        line1: shippingAddress.line1 ?? shippingAddress.address,
        unit: shippingAddress.unit,
        city: shippingAddress.city,
        postcode: shippingAddress.postcode,
        country: shippingAddress.country,
        phone: shippingAddress.phone ?? client?.phone,
      };
    }
    if (client?.name) update.name = client.name;
    if (client?.phone) update.phone = client.phone;
    if (client?.email) update.email = client.email.toLowerCase().trim();

    const subscription = await Subscription.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { $set: update },
      { new: true }
    ).exec();

    if (!subscription) {
      return NextResponse.json({ message: "Subscription not found for that payment" }, { status: 404 });
    }

    // The Stripe Customer was created without an email (see /api/subscriptions/create) —
    // attach the real one now so Stripe's receipts/dunning emails reach the customer.
    if (client?.email && subscription.stripeCustomerId) {
      try {
        const stripe = getStripe();
        await stripe.customers.update(subscription.stripeCustomerId, {
          email: client.email,
          name: client.name || undefined,
          phone: client.phone || undefined,
        });
      } catch (err) {
        console.error("⚠️ Failed to update Stripe customer email:", err);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("❌ Error saving subscription shipping details:", error);
    return NextResponse.json({ message: "Failed to save shipping details" }, { status: 500 });
  }
}
