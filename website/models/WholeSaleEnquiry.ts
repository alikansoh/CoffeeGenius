import mongoose from 'mongoose';

const WholesaleEnquirySchema = new mongoose.Schema(
  {
    business: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
    contactPref: { type: String, enum: ['email', 'phone'], default: 'email' },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    interest: { type: String, trim: true },
    message: { type: String, trim: true },
    status: {
      type: String,
      enum: ['new', 'processing', 'sent', 'failed'],
      default: 'new',
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.models.WholesaleEnquiry ||
  mongoose.model('WholesaleEnquiry', WholesaleEnquirySchema);