import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Subscription from "@/models/Subscription";
import { getStripe } from "@/lib/stripeClient";

/**
 * POST /api/subscriptions/token/[token]/portal
 * Creates a fresh Stripe Billing Portal session so the customer can update their card —
 * generated on demand rather than reused, since portal session URLs are meant to be
 * single-use. Same token-as-credential model as the rest of /api/subscriptions/token/*.
 */
export async function POST(
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
      .select("stripeCustomerId")
      .lean();

    if (!subscription) {
      return NextResponse.json({ success: false, error: "This link is invalid or has expired" }, { status: 404 });
    }
    if (!subscription.stripeCustomerId) {
      return NextResponse.json({ success: false, error: "Can't open payment settings — please contact support" }, { status: 400 });
    }

    const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appBase}/manage-subscription/${token}`,
    });

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error("❌ Error creating billing portal session:", error);
    return NextResponse.json({ success: false, error: "Could not open payment settings" }, { status: 500 });
  }
}
