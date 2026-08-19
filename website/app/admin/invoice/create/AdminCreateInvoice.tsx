"use client";

import { useState, useEffect, useMemo } from "react";
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
  Search,
  ChevronDown,
} from "lucide-react";

interface Address {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface InvoiceItem {
  name: string;
  qty: number | "";
  unitPrice: number | "";
  totalPrice: number;
}

interface ClientInfo {
  name: string;
  email?: string;
  phone?: string;
}

interface FormData {
  client: ClientInfo;
  billingAddress?: Address | null;
  items: InvoiceItem[];
  shipping: number | "";
  notes: string;
  dueDate: string;
  invoiceDate: string;
  currency: string;
}

interface ApiInvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface ApiClient {
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
}

interface ApiInvoice {
  _id: string;
  orderNumber: string;
  client?: ApiClient;
  billingAddress?: Address | null;
  items?: ApiInvoiceItem[];
  shipping?: number;
  notes?: string;
  dueDate?: string;
  createdAt?: string;
  currency?: string;
}

interface ClientSearchResult {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
}

interface CreateInvoiceFormProps {
  invoice?: ApiInvoice;
  isEditing?: boolean;
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

function emptyItem(): InvoiceItem {
  return { name: "", qty: "", unitPrice: "", totalPrice: 0 };
}

function getNumberValue(value: number | ""): number {
  return value === "" ? 0 : value;
}

function formatDateInput(dateValue?: string): string {
  if (!dateValue) return "";
  try {
    return new Date(dateValue).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export default function CreateInvoiceForm({ invoice, isEditing = false }: CreateInvoiceFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showMissingEmailModal, setShowMissingEmailModal] = useState(false);

  const [clients, setClients] = useState<ClientSearchResult[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);

  const [formData, setFormData] = useState<FormData>(() => {
    if (invoice) {
      const billing = invoice.billingAddress || {};
      const clientAddress = invoice.client?.address || {};
      return {
        client: {
          name: invoice.client?.name || "",
          email: invoice.client?.email || "",
          phone: invoice.client?.phone || "",
        },
        billingAddress: {
          firstName: billing.firstName || clientAddress.firstName || "",
          lastName: billing.lastName || clientAddress.lastName || "",
          line1: billing.line1 || clientAddress.line1 || "",
          unit: billing.unit || clientAddress.unit || "",
          city: billing.city || clientAddress.city || "",
          postcode: billing.postcode || clientAddress.postcode || "",
          country: billing.country || clientAddress.country || "United Kingdom",
        },
        items: invoice.items?.map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })) || [emptyItem()],
        shipping: invoice.shipping ?? "",
        notes: invoice.notes || "",
        dueDate: formatDateInput(invoice.dueDate),
        invoiceDate: formatDateInput(invoice.createdAt),
        currency: invoice.currency || "gbp",
      };
    }

    return {
      client: {
        name: "",
        email: "",
        phone: "",
      },
      billingAddress: {
        firstName: "",
        lastName: "",
        line1: "",
        unit: "",
        city: "",
        postcode: "",
        country: "United Kingdom",
      },
      items: [emptyItem()],
      shipping: "",
      notes: "",
      dueDate: "",
      invoiceDate: "",
      currency: "gbp",
    };
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        const qty = getNumberValue(it.qty);
        const unitPrice = getNumberValue(it.unitPrice);
        return { ...it, totalPrice: Number((qty * unitPrice).toFixed(2)) };
      }),
    }));
  }, []);

  useEffect(() => {
    async function fetchClients() {
      setLoadingClients(true);
      try {
        const res = await fetch("/api/clients?limit=200");
        if (!res.ok) throw new Error("Failed to fetch clients");
        const json = await res.json();
        const data: ClientSearchResult[] = json.data || [];
        setClients(data);
      } catch (err) {
        console.error("Failed to load clients:", err);
      } finally {
        setLoadingClients(false);
      }
    }
    fetchClients();
  }, []);

  useEffect(() => {
    if (invoice && invoice.client?.name) {
      setClientSearch(invoice.client.name);
    }
  }, [invoice]);

  const subtotal = useMemo(() => {
    return formData.items.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [formData.items]);

  const total = useMemo(() => {
    return subtotal + getNumberValue(formData.shipping);
  }, [subtotal, formData.shipping]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const handleSelectClient = (client: ClientSearchResult) => {
    const nameParts = (client.name || "").trim().split(/\s+/);

    setFormData((prev) => ({
      ...prev,
      client: {
        name: client.name || "",
        email: client.email || "",
        phone: client.phone || "",
      },
      billingAddress: {
        firstName: client.address?.firstName || nameParts[0] || "",
        lastName:
          client.address?.lastName ||
          (nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""),
        line1: client.address?.line1 || "",
        unit: client.address?.unit || "",
        city: client.address?.city || "",
        postcode: client.address?.postcode || "",
        country: client.address?.country || "United Kingdom",
      },
    }));
    setClientSearch(client.name || "");
    setShowClientDropdown(false);
    setErrors((prev) => ({ ...prev, "client.name": "", "client.email": "" }));
  };

  const handleClearClient = () => {
    setClientSearch("");
    setFormData((prev) => ({
      ...prev,
      client: { name: "", email: "", phone: "" },
      billingAddress: {
        firstName: "",
        lastName: "",
        line1: "",
        unit: "",
        city: "",
        postcode: "",
        country: "United Kingdom",
      },
    }));
  };

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

  const handleBillingAddressChange = (field: keyof Address, value: string) => {
    setFormData((prev) => ({
      ...prev,
      billingAddress: { ...(prev.billingAddress || {}), [field]: value },
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    setFormData((prev) => {
      const newItems = [...prev.items];

      if (field === "qty" || field === "unitPrice") {
        const parsed = value === "" ? "" : Number(value);
        newItems[index] = { ...newItems[index], [field]: parsed };

        const qty = getNumberValue(newItems[index].qty);
        const unitPrice = getNumberValue(newItems[index].unitPrice);
        newItems[index].totalPrice = Number((qty * unitPrice).toFixed(2));
      } else {
        newItems[index] = { ...newItems[index], [field]: value } as InvoiceItem;
      }

      return { ...prev, items: newItems };
    });
    setErrors((prev) => ({ ...prev, [`item.${index}.${field}`]: "" }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, emptyItem()],
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

  const validateForm = (requireEmail = false) => {
    const newErrors: Record<string, string> = {};

    if (!formData.client.name.trim()) newErrors["client.name"] = "Client name is required";
    if (requireEmail) {
      if (!formData.client.email?.trim()) newErrors["client.email"] = "Email is required to send invoice";
      else if (!isValidEmail(formData.client.email)) newErrors["client.email"] = "Invalid email address";
    } else {
      if (formData.client.email && !isValidEmail(formData.client.email)) {
        newErrors["client.email"] = "Invalid email address";
      }
    }

    formData.items.forEach((item, i) => {
      if (!item.name.trim()) newErrors[`item.${i}.name`] = "Item name is required";
      if (item.qty === "" || item.qty <= 0) newErrors[`item.${i}.qty`] = "Quantity must be greater than 0";
      if (item.unitPrice === "" || item.unitPrice <= 0)
        newErrors[`item.${i}.unitPrice`] = "Unit price must be greater than 0";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const attemptSend = () => {
    if (!validateForm(true)) {
      setToast({ type: "error", message: "Please fix form errors (email is required to send)" });
      return;
    }
    handleSubmit(true);
  };

  const buildPayload = () => {
    return {
      client: formData.client,
      items: formData.items.map((it) => ({
        name: it.name,
        qty: getNumberValue(it.qty),
        unitPrice: getNumberValue(it.unitPrice),
        totalPrice: it.totalPrice,
      })),
      shipping: getNumberValue(formData.shipping),
      notes: formData.notes || undefined,
      dueDate: formData.dueDate || undefined,
      currency: formData.currency,
      billingAddress: formData.billingAddress || null,
      createdAt: formData.invoiceDate || undefined,
      sendEmail: false,
      subtotal,
      total,
    };
  };

  const handleSubmit = async (shouldSendEmail: boolean) => {
    setToast(null);

    if (!validateForm(shouldSendEmail)) {
      setToast({ type: "error", message: "Please fix the errors in the form" });
      return;
    }

    setIsSaving(true);
    setSendEmail(shouldSendEmail);

    try {
      const payload = buildPayload();
      payload.sendEmail = shouldSendEmail;

      const url = isEditing ? `/api/invoices/${invoice?._id}` : "/api/invoices";
      const method = isEditing ? "PUT" : "POST";
      const query = !shouldSendEmail ? "?pdf=true" : "";

      if (!shouldSendEmail) {
        const res = await fetch(`${url}${query}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errText = `Failed to ${isEditing ? "update" : "create"} invoice (${res.status})`;
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
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

        const ct = res.headers.get("content-type") || "";
        const cd = res.headers.get("content-disposition") || "";

        if (ct.includes("application/pdf") || /filename=.*\.pdf/i.test(cd)) {
          const arrayBuffer = await res.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: "application/pdf" });

          let filename = `invoice-${Date.now()}.pdf`;
          const m = cd.match(/filename="?([^"]+)"?/);
          if (m && m[1]) filename = m[1];

          const urlBlob = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = urlBlob;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(urlBlob);

          setToast({
            type: "success",
            message: isEditing ? "Invoice updated and PDF downloaded" : "Invoice saved and PDF downloaded",
          });
          setTimeout(() => (window.location.href = "/admin/invoice"), 1200);
          return;
        } else {
          await res.json();
          setToast({
            type: "success",
            message: isEditing ? "Invoice updated" : "Invoice created",
          });
          setTimeout(() => (window.location.href = "/admin/invoice"), 1200);
          return;
        }
      }

      const res = await fetch(`${url}${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditing ? "update" : "create"} invoice (${res.status})`);
      }

      setToast({
        type: "success",
        message: isEditing
          ? shouldSendEmail
            ? "Invoice updated and sent successfully!"
            : "Invoice updated successfully!"
          : shouldSendEmail
            ? "Invoice created and sent successfully!"
            : "Invoice created successfully!",
      });

      setTimeout(() => {
        window.location.href = "/admin/invoice";
      }, 1500);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : `Failed to ${isEditing ? "update" : "create"} invoice`,
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
      formData.items.some((item) => item.name || item.qty !== "" || item.unitPrice !== "")
    ) {
      setShowCancelConfirm(true);
      return;
    }
    window.location.href = "/admin/invoice";
  };

  const formatCurrencyDisplay = (value: number | "") => {
    const num = getNumberValue(value);
    return `£${num.toFixed(2)}`;
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
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {isEditing ? `Edit Invoice ${invoice?.orderNumber || ""}` : "Create New Invoice"}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                  {isEditing ? "Update the invoice details below" : "Create a manual invoice for a client"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Client Information */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User size={20} className="text-gray-900" />
                  <h2 className="text-lg font-bold text-gray-900">Client information</h2>
                </div>
                {formData.client.name && (
                  <button
                    type="button"
                    onClick={handleClearClient}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Clear client
                  </button>
                )}
              </div>

              {/* Client search dropdown */}
              <div className="relative mb-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  <Search size={14} className="inline mr-1" />
                  Search existing client
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Type name, email or phone..."
                    className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                  <ChevronDown
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>

                {showClientDropdown && (
                  <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-64 overflow-auto">
                    {loadingClients ? (
                      <div className="px-4 py-3 text-sm text-gray-500">Loading clients...</div>
                    ) : filteredClients.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        {clientSearch ? "No clients found" : "Start typing to search"}
                      </div>
                    ) : (
                      filteredClients.map((client) => (
                        <button
                          key={client._id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                        >
                          <div className="font-semibold text-gray-900">{client.name}</div>
                          <div className="text-xs text-gray-500">
                            {client.email && <span className="mr-3">{client.email}</span>}
                            {client.phone && <span>{client.phone}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {showClientDropdown && (
                  <button
                    type="button"
                    className="fixed inset-0 z-10 bg-transparent"
                    onClick={() => setShowClientDropdown(false)}
                    aria-label="Close dropdown"
                  />
                )}
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
                      Email
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

                {/* Billing Address */}
                <div className="pt-2">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    <MapPin size={16} className="inline mr-1" />
                    Billing address
                  </label>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={formData.billingAddress?.firstName || ""}
                        onChange={(e) => handleBillingAddressChange("firstName", e.target.value)}
                        placeholder="First name"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <input
                        value={formData.billingAddress?.lastName || ""}
                        onChange={(e) => handleBillingAddressChange("lastName", e.target.value)}
                        placeholder="Last name"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                    </div>
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

            {/* Items */}
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
                      {errors[`item.${index}.name`] && (
                        <p className="text-xs text-red-600 mt-1">{errors[`item.${index}.name`]}</p>
                      )}
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
                          onChange={(e) => handleItemChange(index, "qty", e.target.value)}
                          className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm ${
                            errors[`item.${index}.qty`] ? "border-red-400" : "border-gray-300"
                          }`}
                        />
                        {errors[`item.${index}.qty`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`item.${index}.qty`]}</p>
                        )}
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
                          onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                          className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm ${
                            errors[`item.${index}.unitPrice`] ? "border-red-400" : "border-gray-300"
                          }`}
                        />
                        {errors[`item.${index}.unitPrice`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`item.${index}.unitPrice`]}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Total (£)</label>
                        <input
                          type="text"
                          value={formatCurrencyDisplay(item.totalPrice)}
                          readOnly
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Additional Details */}
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
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          shipping: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
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
                    <p className="text-xs text-gray-500 mt-1">
                      If provided, this will be used as the invoice date in the PDF/email. Otherwise the PDF will show today&apos;s date.
                    </p>
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

          {/* Sidebar */}
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
                  <span className="font-bold text-gray-900">{formatCurrencyDisplay(formData.shipping)}</span>
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
                      {isEditing ? "Update and Send" : "Save and Send via Email"}
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
                      {isEditing ? "Update & Download PDF" : "Save only"}
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

        {/* Cancel confirmation modal */}
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
              <p className="text-sm text-gray-600 mt-2">You can either add an email now, or save the invoice without sending.</p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMissingEmailModal(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all"
                >
                  Add email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingEmailModal(false);
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