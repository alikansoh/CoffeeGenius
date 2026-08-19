import dbConnect from '@/lib/dbConnect';
import Counter from '@/models/Counter';

export async function getNextInvoiceNumber(prefix = 'INV'): Promise<string> {
  await dbConnect();

  const counter = await Counter.findOneAndUpdate(
    { name: 'invoice' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const number = counter.seq;
  return `${prefix}-${String(number).padStart(4, '0')}`;
}