"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertCircle,
  Trash2,
  Send,
  Save,
  Calendar,
  DollarSign,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
} from "lucide-react";

interface Address {
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface ClientInfo {
  name: string;
  email?: string;
  phone?: string;
  address?: Address | null;
}

interface FormData {
  client: ClientInfo;
  billingAddress?: Address | null;
  items: InvoiceItem[];
  shipping: number;
  notes: string;
  dueDate: string;
  invoiceDate: string; // optional createdAt fallback
  currency: string;
}

function Toast({ message, type, onClose }: { message: string; type: "error" | "success"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 ${
        type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
      }`}
    >
      {type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 hover:bg-white/20 rounded-lg transition"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function CreateInvoiceForm() {
  const [isSaving, setIsSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showMissingEmailModal, setShowMissingEmailModal] = useState(false);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    client: {
      name: "",
      email: "",
      phone: "",
      address: {
        line1: "",
        unit: "",
        city: "",
        postcode: "",
        country: "United Kingdom",
      },
    },
    billingAddress: {
      line1: "",
      unit: "",
      city: "",
      postcode: "",
      country: "United Kingdom",
    },
    items: [{ name: "", qty: 1, unitPrice: 0, totalPrice: 0 }],
    shipping: 0,
    notes: "",
    dueDate: "",
    invoiceDate: "",
    currency: "gbp",
  });

  // keep totals in sync (initialize totals once)
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it) => ({ ...it, totalPrice: Number((it.qty * it.unitPrice).toFixed(2)) })),
    }));
  }, []); // only init; individual item changes handled in handler

  const subtotal = formData.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = subtotal + formData.shipping;

  const isValidEmail = (email?: string) => {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleClientChange = (field: keyof ClientInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      client: { ...prev.client, [field]: value },
    }));
    setErrors((prev) => ({ ...prev, [`client.${field}`]: "" }));
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    // Update client.address and, if billingSameAsShipping, update billingAddress with same values in a single state update
    setFormData((prev) => {
      const newClientAddress = { ...(prev.client.address || {}), [field]: value };
      return {
        ...prev,
        client: {
          ...prev.client,
          address: newClientAddress,
        },
        billingAddress: billingSameAsShipping ? newClientAddress : prev.billingAddress,
      };
    });
  };

  const handleBillingAddressChange = (field: keyof Address, value: string) => {
    setBillingSameAsShipping(false);
    setFormData((prev) => ({
      ...prev,
      billingAddress: { ...(prev.billingAddress || {}), [field]: value },
    }));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value } as InvoiceItem;

      if (field === "qty" || field === "unitPrice") {
        const qty = Number(newItems[index].qty || 0);
        const unitPrice = Number(newItems[index].unitPrice || 0);
        newItems[index].totalPrice = Number((qty * unitPrice).toFixed(2));
      }

      return { ...prev, items: newItems };
    });
    setErrors((prev) => ({ ...prev, [`item.${index}.${field}`]: "" }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", qty: 1, unitPrice: 0, totalPrice: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length === 1) {
      setToast({ type: "error", message: "Invoice must have at least one item" });
      return;
    }
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // validateForm: pass requireEmail=true when you require it (e.g., before sending)
  const validateForm = (requireEmail = false) => {
    const newErrors: Record<string, string> = {};

    if (!formData.client.name.trim()) newErrors["client.name"] = "Client name is required";
    if (requireEmail) {
      if (!formData.client.email?.trim()) newErrors["client.email"] = "Email is required to send invoice";
      else if (!isValidEmail(formData.client.email)) newErrors["client.email"] = "Invalid email address";
    } else {
      // if not required, but provided and invalid, still report error
      if (formData.client.email && !isValidEmail(formData.client.email)) {
        newErrors["client.email"] = "Invalid email address";
      }
    }

    formData.items.forEach((item, i) => {
      if (!item.name.trim()) newErrors[`item.${i}.name`] = "Item name is required";
      if (item.qty <= 0) newErrors[`item.${i}.qty`] = "Quantity must be greater than 0";
      if (item.unitPrice <= 0) newErrors[`item.${i}.unitPrice`] = "Unit price must be greater than 0";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // When user clicks Save & Send, check email first and show modal if missing/invalid
  const attemptSend = () => {
    // run quick validation requiring name and valid email
    if (!validateForm(true)) {
      setToast({ type: "error", message: "Please fix form errors (email is required to send)" });
      return;
    }
    // email exists and is valid -> proceed
    handleSubmit(true);
  };

  // UPDATED handleSubmit -> Save & Send vs Save-only with PDF download
  const handleSubmit = async (shouldSendEmail: boolean) => {
    setToast(null);

    // Only require email validation if sending; otherwise do not require email
    if (!validateForm(shouldSendEmail)) {
      setToast({ type: "error", message: "Please fix the errors in the form" });
      return;
    }

    setIsSaving(true);
    setSendEmail(shouldSendEmail);

    try {
      const payload = {
        client: formData.client,
        items: formData.items,
        shipping: formData.shipping,
        notes: formData.notes || undefined,
        dueDate: formData.dueDate || undefined,
        currency: formData.currency,
        billingAddress: formData.billingAddress || null,
        createdAt: formData.invoiceDate || undefined,
        sendEmail: shouldSendEmail,
        subtotal,
        total,
      };

      if (!shouldSendEmail) {
        // Request PDF and save record on server in one call
        const res = await fetch('/api/invoices?pdf=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errText = `Failed to create invoice (${res.status})`;
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const json = await res.json();
              errText = json?.error || JSON.stringify(json);
            } else {
              errText = await res.text();
            }
          } catch {
            /* ignore */
          }
          throw new Error(errText);
        }

        // detect PDF by content-type or content-disposition header
        const ct = res.headers.get('content-type') || '';
        const cd = res.headers.get('content-disposition') || '';

        if (ct.includes('application/pdf') || /filename=.*\.pdf/i.test(cd)) {
          const arrayBuffer = await res.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

          let filename = `invoice-${Date.now()}.pdf`;
          const m = cd.match(/filename="?([^"]+)"?/);
          if (m && m[1]) filename = m[1];

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          setToast({ type: 'success', message: 'Invoice saved and PDF downloaded' });
          setTimeout(() => (window.location.href = '/admin/invoice'), 1200);
          return;
        } else {
          // fallback: server returned JSON (saved but didn't return pdf)
          const json = await res.json();
          setToast({ type: 'success', message: 'Invoice created' });
          setTimeout(() => (window.location.href = '/admin/invoice'), 1200);
          return;
        }
      }

      // sendEmail === true: create and send (existing flow)
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to create invoice (${res.status})`);
      }

      setToast({
        type: 'success',
        message: shouldSendEmail ? 'Invoice created and sent successfully!' : 'Invoice created successfully!',
      });

      setTimeout(() => {
        window.location.href = '/admin/invoice';
      }, 1500);
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create invoice',
      });
    } finally {
      setIsSaving(false);
      setSendEmail(false);
    }
  };

  const handleCancel = () => {
    if (
      formData.client.name ||
      formData.client.email ||
      formData.items.some((item) => item.name || item.qty > 1 || item.unitPrice > 0)
    ) {
      setShowCancelConfirm(true);
      return;
    }
    window.location.href = "/admin/invoice";
  };

  const copyShippingToBilling = () => {
    setBillingSameAsShipping(true);
    setFormData((prev) => ({
      ...prev,
      billingAddress: { ...(prev.client.address || {}) },
    }));
  };

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create New Invoice</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Create a manual invoice for a client</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <User size={20} className="text-gray-900" />
                <h2 className="text-lg font-bold text-gray-900">Client information</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={formData.client.name}
                    onChange={(e) => handleClientChange("name", e.target.value)}
                    placeholder="Ali Kansoh"
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                      errors["client.name"] ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors["client.name"] && <p className="text-xs text-red-600 mt-1">{errors["client.name"]}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      <Mail size={16} className="inline mr-1" />
                      Email { /* not mandatory unless sending */ }
                    </label>
                    <input
                      type="email"
                      value={formData.client.email}
                      onChange={(e) => handleClientChange("email", e.target.value)}
                      placeholder="ali@example.com (required to send)"
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                        errors["client.email"] ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                    {errors["client.email"] && <p className="text-xs text-red-600 mt-1">{errors["client.email"]}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      <Phone size={16} className="inline mr-1" />
                      Phone number
                    </label>
                    <input
                      type="tel"
                      value={formData.client.phone}
                      onChange={(e) => handleClientChange("phone", e.target.value)}
                      placeholder="+447123456789"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    <MapPin size={16} className="inline mr-1" />
                    Shipping address (optional)
                  </label>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input
                        value={formData.client.address?.unit || ""}
                        onChange={(e) => handleAddressChange("unit", e.target.value)}
                        placeholder="Apt / Unit"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.client.address?.line1 || ""}
                        onChange={(e) => handleAddressChange("line1", e.target.value)}
                        placeholder="Street"
                        className="sm:col-span-3 w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        value={formData.client.address?.city || ""}
                        onChange={(e) => handleAddressChange("city", e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.client.address?.postcode || ""}
                        onChange={(e) => handleAddressChange("postcode", e.target.value)}
                        placeholder="Postal code"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.client.address?.country || ""}
                        onChange={(e) => handleAddressChange("country", e.target.value)}
                        placeholder="Country"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-gray-900 mb-3">Billing address</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="billingSame"
                        type="checkbox"
                        checked={billingSameAsShipping}
                        onChange={(e) => {
                          if (e.target.checked) {
                            copyShippingToBilling();
                          } else {
                            setBillingSameAsShipping(false);
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <label htmlFor="billingSame" className="text-sm text-gray-700">Same as shipping</label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input
                        value={formData.billingAddress?.unit || ""}
                        onChange={(e) => handleBillingAddressChange("unit", e.target.value)}
                        placeholder="Apt / Unit"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.billingAddress?.line1 || ""}
                        onChange={(e) => handleBillingAddressChange("line1", e.target.value)}
                        placeholder="Street"
                        className="sm:col-span-3 w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        value={formData.billingAddress?.city || ""}
                        onChange={(e) => handleBillingAddressChange("city", e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.billingAddress?.postcode || ""}
                        onChange={(e) => handleBillingAddressChange("postcode", e.target.value)}
                        placeholder="Postal code"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.billingAddress?.country || ""}
                        onChange={(e) => handleBillingAddressChange("country", e.target.value)}
                        placeholder="Country"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Items and additional sections (unchanged) */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={20} className="text-gray-900" />
                  <h2 className="text-lg font-bold text-gray-900">Items</h2>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium text-sm"
                >
                  <Plus size={16} />
                  Add item
                </button>
              </div>

              <div className="space-y-4">
                {formData.items.map((item, index) => (
                  <div key={index} className="border-2 border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900">Item #{index + 1}</span>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Item name <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={item.name}
                        onChange={(e) => handleItemChange(index, "name", e.target.value)}
                        placeholder="e.g. Ethiopian coffee beans - 1kg"
                        className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm ${
                          errors[`item.${index}.name`] ? "border-red-400" : "border-gray-300"
                        }`}
                      />
                      {errors[`item.${index}.name`] && <p className="text-xs text-red-600 mt-1">{errors[`item.${index}.name`]}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(index, "qty", parseFloat(e.target.value) || 1)}
                          className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm ${
                            errors[`item.${index}.qty`] ? "border-red-400" : "border-gray-300"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">
                          Unit price (£) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)}
                          className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm ${
                            errors[`item.${index}.unitPrice`] ? "border-red-400" : "border-gray-300"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Total (£)</label>
                        <input
                          type="text"
                          value={`£${item.totalPrice.toFixed(2)}`}
                          readOnly
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Additional details</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      <DollarSign size={16} className="inline mr-1" />
                      Shipping cost (£)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.shipping}
                      onChange={(e) => setFormData((prev) => ({ ...prev, shipping: parseFloat(e.target.value) || 0 }))}
                      placeholder="5.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      <Calendar size={16} className="inline mr-1" />
                      Due date
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Invoice date (optional)</label>
                    <input
                      type="date"
                      value={formData.invoiceDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, invoiceDate: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                    <p className="text-xs text-gray-500 mt-1">If provided, this will be used as the invoice date in the PDF/email. Otherwise the PDF will show date of today.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Currency</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    >
                      <option value="gbp">GBP (£)</option>
                      <option value="usd">USD ($)</option>
                      <option value="eur">EUR (€)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="e.g. Payment received via bank transfer"
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all"
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Invoice summary</h3>

              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-bold text-gray-900">£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shipping:</span>
                  <span className="font-bold text-gray-900">£{formData.shipping.toFixed(2)}</span>
                </div>
                <div className="h-px bg-gray-200"></div>
                <div className="flex justify-between text-lg">
                  <span className="font-bold text-gray-900">Total:</span>
                  <span className="font-bold text-gray-900">£{total.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t-2 border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    // check email; if missing/invalid show modal; otherwise proceed
                    if (!isValidEmail(formData.client.email)) {
                      setShowMissingEmailModal(true);
                      return;
                    }
                    attemptSend();
                  }}
                  disabled={isSaving}
                  className={`w-full px-4 py-3 rounded-xl font-bold transition-all text-white shadow-md flex items-center justify-center gap-2 ${
                    isSaving ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                  }`}
                >
                  {isSaving && sendEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Save and Send via Email
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isSaving}
                  className={`w-full px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    isSaving
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-gray-200"
                      : "bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {isSaving && !sendEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save only
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </section>
          </aside>
        </div>

        {showCancelConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Discard changes?</h3>
              <p className="text-sm text-gray-600 mt-2">You have unsaved changes. Are you sure you want to leave?</p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all"
                >
                  Continue editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/admin/invoice";
                  }}
                  className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Missing email modal */}
        {showMissingEmailModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Email is missing</h3>
              <p className="text-sm text-gray-600 mt-2">
                The client does not have an email address. To send the invoice by email you must enter a valid email.
              </p>
              <p className="text-sm text-gray-600 mt-2">
                You can either add an email now, or save the invoice without sending.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingEmailModal(false);
                    // focus the email input by ID if you add one (optional)
                  }}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all"
                >
                  Add email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingEmailModal(false);
                    // Save only (no send)
                    handleSubmit(false);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all"
                >
                  Save only
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}