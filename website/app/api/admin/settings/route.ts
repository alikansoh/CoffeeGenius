import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Settings from '@/models/Settings';

/**
 * GET returns the singleton settings doc (or defaults)
 * PATCH updates the settings (incoming values expected in pence OR in pounds if you prefer).
 *
 * Example PATCH body:
 * { deliveryPricePence: 499, freeDeliveryThresholdPence: 3000, freeDeliveryEnabled: true }
 *
 * NOTE: This route is not protected. Add auth in production.
 */

async function getSingleton() {
  const doc = await Settings.findOne().lean().exec();
  if (doc) return doc;
  // If no doc exists, create defaults and return them
  const created = await new Settings({}).save();
  return created.toObject();
}

export async function GET() {
  try {
    await dbConnect();
    const doc = await getSingleton();
    return NextResponse.json(doc, { status: 200 });
  } catch (err) {
    console.error('GET /api/admin/settings failed', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));

    const updates: Partial<Record<string, unknown>> = {};
    if (typeof body.deliveryPricePence === 'number') updates.deliveryPricePence = body.deliveryPricePence;
    if (typeof body.freeDeliveryThresholdPence === 'number') updates.freeDeliveryThresholdPence = body.freeDeliveryThresholdPence;
    if (typeof body.freeDeliveryEnabled === 'boolean') updates.freeDeliveryEnabled = body.freeDeliveryEnabled;

    // Basic validation
    if (updates.deliveryPricePence !== undefined && (updates.deliveryPricePence as number) < 0) {
      return NextResponse.json({ error: 'deliveryPricePence must be >= 0' }, { status: 400 });
    }
    if (updates.freeDeliveryThresholdPence !== undefined && (updates.freeDeliveryThresholdPence as number) < 0) {
      return NextResponse.json({ error: 'freeDeliveryThresholdPence must be >= 0' }, { status: 400 });
    }

    // Upsert singleton
    const updated = await Settings.findOneAndUpdate({}, { $set: updates }, { new: true, upsert: true }).lean().exec();
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('PATCH /api/admin/settings failed', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}