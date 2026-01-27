import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import WholesaleEnquiry from '@/models/WholeSaleEnquiry';
import mongoose from 'mongoose';

/**
 * DELETE /api/enquiry/:id
 *
 * Note: some Next.js runtimes / versions may not pass a second `context` argument
 * with `params` reliably in all setups. To be robust we parse the id from the request URL
 * instead of relying on the handler `params` argument.
 */

export async function DELETE(req: Request) {
  try {
    // Parse id from URL path to be robust across Next.js versions/environments
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean); // ['api','enquiry','<id>']
    const id = pathParts[pathParts.length - 1];

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, message: 'Invalid id' }, { status: 400 });
    }

    await dbConnect();

    const doc = await WholesaleEnquiry.findByIdAndDelete(id).exec();
    if (!doc) {
      return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete enquiry:', err);
    return NextResponse.json({ ok: false, message: 'Delete failed' }, { status: 500 });
  }
}