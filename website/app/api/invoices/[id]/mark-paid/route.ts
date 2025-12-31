import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Invoice from '@/models/Invoice';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();

    const invoice = await Invoice.findById(params.id);
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (invoice.source !== 'manual') {
      return NextResponse.json(
        { error: 'Cannot manually mark Stripe invoices as paid' },
        { status: 400 }
      );
    }

    invoice.paymentStatus = 'paid';
    invoice.paidAt = new Date();
    await invoice.save();

    console.log(`✅ Invoice ${params.id} marked as paid`);

    return NextResponse.json({ 
      success: true,
      invoice: {
        id: invoice._id.toString(),
        paymentStatus: invoice.paymentStatus,
        paidAt: invoice.paidAt,
      }
    });

  } catch (error) {
    console.error('❌ Error marking invoice as paid:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}