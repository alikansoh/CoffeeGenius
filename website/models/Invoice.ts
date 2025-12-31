import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema(
    {
      // ✅ الحقول الموجودة (لا تغيّرها)
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
      orderNumber: { type: String, index: true },
      items: { type: Array, default: [] },
      subtotal: { type: Number },
      shipping: { type: Number },
      total: { type: Number },
      currency: { type: String, default: 'gbp' },
      client: { type: Object },
      shippingAddress: { type: Object },
      billingAddress: { type: Object },
      paidAt: { type: Date },
      paymentIntentId: { type: String, index: true, sparse: true }, // ⚠️ أضف sparse: true
      
      sent: { type: Boolean, default: false },
      sentAt: { type: Date },
      sendError: { type: String },
      sender: { type: Object, default: null },
      recipientEmail: { type: String, default: '' },
      metadata: { type: Object, default: {} },
  
      // 🆕 الحقول الجديدة للفواتير اليدوية
      source: {
        type: String,
        enum: ['stripe', 'manual'],
        default: 'stripe',
        index: true,
      },
      
      paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid', 'partial'],
        default: function() {
          return this.source === 'stripe' ? 'paid' : 'unpaid';
        },
      },
      
      dueDate: { type: Date }, // تاريخ الاستحقاق للفواتير اليدوية
      
      notes: { type: String }, // ملاحظات (مثل: "تحويل بنكي", "نقدي")
    },
    { timestamps: true }
  );

export default mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);