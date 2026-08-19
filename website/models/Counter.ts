import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICounter extends Document {
  name: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { collection: 'counters' }
);

const Counter: Model<ICounter> =
  (mongoose.models.Counter as Model<ICounter>) ||
  mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;