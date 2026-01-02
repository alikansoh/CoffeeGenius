import mongoose from 'mongoose';

const StockChangeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    qty: { type: Number, required: true },
    source: { type: String, enum: ['variant', 'coffee', 'equipment'], required: true },
    before: { type: Number },
    after: { type: Number },
  },
  { _id: false }
);

const ItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    qty: { type: Number, required: true },
    source: { type: String, enum: ['variant', 'coffee', 'equipment'], required: true },
  },
  { _id: false }
);

const ReservationSchema = new mongoose.Schema({
  paymentIntentId: { type: String, index: true, sparse: true },
  items: { type: [ItemSchema], required: true },
  stockChanges: { type: [StockChangeSchema], default: [] },
  status: { type: String, enum: ['reserved', 'consumed', 'released'], default: 'reserved' },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }, // TTL
  createdAt: { type: Date, default: Date.now },
});

export default (mongoose.models.Reservation as mongoose.Model<unknown>) ||
  mongoose.model('Reservation', ReservationSchema);