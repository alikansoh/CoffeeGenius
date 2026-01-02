import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import CoffeeVariant from '@/models/CoffeeVariant';
import Coffee from '@/models/Coffee';
import Equipment from '@/models/Equipment';
import mongoose from 'mongoose';

type ProductSource = 'variant' | 'coffee' | 'equipment';

interface Item {
  id: string;
  qty: number;
  source?: ProductSource;
}

function validateItemsForStockCheck(parsed: unknown): Item[] {
  if (!Array.isArray(parsed)) {
    throw new Error('Items must be an array');
  }
  
  const out: Item[] = parsed.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid item at index ${idx}`);
    }
    
    const obj = raw as Record<string, unknown>;
    
    const idCandidate = typeof obj.id === 'string' 
      ? obj.id 
      : typeof obj._id === 'string' 
      ? obj._id 
      : undefined;
      
    const qtyCandidate = typeof obj.qty === 'number' 
      ? obj.qty 
      : typeof obj.qty === 'string' && obj.qty.trim() !== '' 
      ? Number(obj.qty) 
      : undefined;
      
    const sourceCandidate = typeof obj.source === 'string' && 
      (obj.source === 'variant' || obj.source === 'coffee' || obj.source === 'equipment')
      ? (obj.source as ProductSource)
      : undefined;
      
    if (!idCandidate) throw new Error(`Item at index ${idx} missing id`);
    if (!Number.isFinite(qtyCandidate as number) || (qtyCandidate as number) <= 0) {
      throw new Error(`Item at index ${idx} has invalid qty`);
    }
    
    const item: Item = {
      id: idCandidate,
      qty: Number(qtyCandidate),
    };
    
    if (sourceCandidate) item.source = sourceCandidate;
    
    return item;
  });
  
  return out;
}

async function validateStockAvailability(items: Item[]): Promise<void> {
  for (const item of items) {
    const { id, qty, source = 'variant' } = item;
    
    let available = 0;
    
    if (source === 'variant') {
      const variant = await CoffeeVariant.findById(id).select('stock').lean();
      available = variant?.stock || 0;
    } else if (source === 'coffee') {
      const coffee = await Coffee.findById(id).select('stock').lean();
      available = coffee?.stock || 0;
    } else if (source === 'equipment') {
      const equipment = mongoose.Types.ObjectId.isValid(id)
        ? await Equipment.findById(id).select('totalStock').lean()
        : await Equipment.findOne({ slug: id }).select('totalStock').lean();
      available = equipment?.totalStock || 0;
    }
    
    if (available < qty) {
      throw new Error(
        `Insufficient stock for item ${id}: available=${available}, requested=${qty}`
      );
    }
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    
    const body = await req.json();
    const itemsRaw = body.items;
    
    if (!Array.isArray(itemsRaw)) {
      return NextResponse.json(
        { error: 'Items must be an array' },
        { status: 400 }
      );
    }
    
    const items = validateItemsForStockCheck(itemsRaw);
    
    await validateStockAvailability(items);
    
    return NextResponse.json({
      valid: true,
      message: 'All items are in stock'
    });
    
  } catch (error) {
    console.error('Stock validation error:', error);
    
    return NextResponse.json(
      {
        valid: false,
        error: error instanceof Error ? error.message : 'Stock validation failed'
      },
      { status: 400 }
    );
  }
}