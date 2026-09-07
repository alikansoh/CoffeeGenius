import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Coffee from '@/models/Coffee';
import { verifyAuthForApi } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  const auth = await verifyAuthForApi(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbConnect();

    const body = await request.json();
    const { ids } = body as { ids?: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'ids array is required' },
        { status: 400 }
      );
    }

    const bulkOps = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index + 1 } },
      },
    }));

    await Coffee.bulkWrite(bulkOps);

    return NextResponse.json(
      { success: true, message: 'Coffees reordered successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error reordering coffees:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to reorder coffees',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}