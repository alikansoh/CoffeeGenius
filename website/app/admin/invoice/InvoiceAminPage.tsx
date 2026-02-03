"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Mail,
  CheckCircle,
  Clock,
  Search,
  Eye,
  Plus,
  MoreHorizontal,
  Trash2,
  AlertCircle,
  X,
  Calendar,
  Package,
  DollarSign,
} from "lucide-react";

/*
  Classic (black & white) Admin Invoices Page
  - Uses neutral black/white/grays for UI
  - Keeps red badge for unpaid invoices
  - Retains delete functionality and existing behavior
*/

type Address = {
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
};

type InvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
};

type Invoice = {
  _id: string;
  orderNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  client: { name: string; email?: string; phone?: string; address?: Address | null };
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  paidAt?: string | null;
  sent?: boolean;
  sender?: { email?: string; name?: string } | null;
  recipientEmail?: string;
  source?: "manual" | "stripe";
  paymentStatus?: "unpaid" | "paid" | "partial";
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ApiError = { error: string };

type InvoicesResponse = { invoices: Invoice[] };

function formatCurrency(value: number, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [selected, setSelected] = useState<Invoice | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error(`Failed to fetch invoices (${res.status})`);
      const json: InvoicesResponse = await res.json();
      setInvoices(json.invoices || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load invoices");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (sourceFilter !== "all" && inv.source !== sourceFilter) return false;
      if (statusFilter !== "all" && inv.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.client?.name?.toLowerCase().includes(q) ||
        inv.orderNumber?.toLowerCase().includes(q) ||
        (inv.client?.email || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, query, sourceFilter, statusFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const paid = invoices.filter((inv) => inv.paymentStatus === "paid").length;
    const unpaid = invoices.filter((inv) => inv.paymentStatus === "unpaid").length;
    const paidAmount = invoices
      .filter((inv) => inv.paymentStatus === "paid")
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    return { total, paid, unpaid, paidAmount, totalInvoices: invoices.length };
  }, [invoices]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const downloadInvoice = async (id: string, orderNumber?: string) => {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/invoices/${id}/download`, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to download (${res.status})`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const filename = `invoice-${orderNumber || id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const markPaid = async (id: string) => {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "PATCH" });
      if (!res.ok) {
        const json: ApiError = await res.json().catch(() => ({ error: "" }));
        throw new Error(json.error || `Failed to mark paid (${res.status})`);
      }
      setInvoices((prev) =>
        prev.map((p) => (p._id === id ? { ...p, paymentStatus: "paid", paidAt: new Date().toISOString() } : p))
      );
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to mark paid");
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const deleteInvoice = async (id: string) => {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json: ApiError = await res.json().catch(() => ({ error: "" }));
        throw new Error(json.error || `Failed to delete invoice (${res.status})`);
      }
      setInvoices((prev) => prev.filter((p) => p._id !== id));
      setDeleteConfirm(null);
      setSelected(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-1">Invoices</h1>
              <p className="text-sm text-gray-600">Overview of all invoices. Search, filter, download and manage.</p>
            </div>

            <a
              href="/admin/invoice/create"
              className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-black text-white rounded-md text-sm font-semibold shadow-sm hover:opacity-95 transition"
            >
              <Plus size={16} /> Create Invoice
            </a>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-white rounded-md p-4 border border-gray-100">
              <p className="text-xs text-gray-500">Total Invoices</p>
              <p className="text-2xl font-semibold mt-1">{stats.totalInvoices}</p>
            </div>

            <div className="bg-white rounded-md p-4 border border-gray-100">
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-2xl font-semibold mt-1">{formatCurrency(stats.total)}</p>
            </div>

            <div className="bg-white rounded-md p-4 border border-gray-100">
              <p className="text-xs text-gray-500">Paid Invoices</p>
              <p className="text-2xl font-semibold mt-1">
                {stats.paid} <span className="text-sm font-normal">({formatCurrency(stats.paidAmount)})</span>
              </p>
            </div>

            <div className="bg-white rounded-md p-4 border border-gray-100">
              <p className="text-xs text-gray-500">Unpaid Invoices</p>
              <p className="text-2xl font-semibold mt-1">{stats.unpaid}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Search and filters */}
        <div className="bg-white rounded-md shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-black transition"
                placeholder="Search client, order number or email"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-md bg-white text-sm outline-none"
                aria-label="Filter by source"
              >
                <option value="all">All sources</option>
                <option value="manual">Manual</option>
                <option value="stripe">Stripe</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-md bg-white text-sm outline-none"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-md mb-6 flex items-center gap-3">
            <AlertCircle size={20} />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-md border border-gray-100 p-6 h-56" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-md border border-gray-100">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Package size={36} className="text-gray-700" />
            </div>
            <p className="text-xl font-semibold text-gray-900 mb-2">No invoices found</p>
            <p className="text-sm text-gray-600 mb-6">
              {query || sourceFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters or search query"
                : "Get started by creating your first invoice"}
            </p>
            <a
              href="/admin/invoice/create"
              className="inline-flex items-center gap-2 px-5 py-2 border border-black text-black rounded-md text-sm font-medium hover:bg-black hover:text-white transition"
            >
              <Plus size={16} /> Create Invoice
            </a>
          </div>
        ) : (
          <>
            {/* Invoice cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {pageItems.map((inv) => (
                <article
                  key={inv._id}
                  className="group bg-white rounded-md border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  {/* Thin status stripe (keeps red for unpaid) */}
                  <div className="relative h-1 bg-gray-50">
                    {inv.paymentStatus === "unpaid" && (
                      <div className="absolute inset-0 bg-red-500" />
                    )}
                    {inv.paymentStatus === "paid" && <div className="absolute inset-0 bg-black/5" />}
                    {inv.paymentStatus === "partial" && <div className="absolute inset-0 bg-gray-200" />}
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500 mb-1">#{inv.orderNumber}</div>
                        <h3 className="text-lg font-semibold text-gray-900 truncate mb-1">
                          {inv.client?.name || "Unnamed client"}
                        </h3>
                        <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                          <Mail size={12} />
                          {inv.client?.email || "No email"}
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-xs text-gray-500 mb-1">Total</div>
                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(inv.total, inv.currency?.toUpperCase() ?? "GBP")}</div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{new Date(inv.createdAt || "").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {inv.paymentStatus === "paid" ? (
                          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            <CheckCircle size={14} /> Paid
                          </span>
                        ) : inv.paymentStatus === "partial" ? (
                          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            <Clock size={14} /> Partial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            <AlertCircle size={14} /> Unpaid
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          <Package size={12} /> {inv.items?.length ?? 0} items
                        </span>

                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          {inv.source === "stripe" ? "Stripe" : "Manual"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => setSelected(inv)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-800 rounded-md text-sm hover:bg-gray-50 transition"
                        title="View details"
                      >
                        <Eye size={14} /> View
                      </button>

                      <button
                        onClick={() => downloadInvoice(inv._id, inv.orderNumber)}
                        disabled={!!actionLoading[inv._id]}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-800 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50"
                        title="Download PDF"
                      >
                        <Download size={14} /> {actionLoading[inv._id] ? "..." : "PDF"}
                      </button>

                      {inv.paymentStatus !== "paid" ? (
                        <button
                          onClick={() => markPaid(inv._id)}
                          disabled={!!actionLoading[inv._id]}
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition disabled:opacity-50"
                          title="Mark as paid"
                        >
                          <CheckCircle size={14} />
                        </button>
                      ) : null}

                      <button
                        onClick={() => setDeleteConfirm(inv)}
                        className="px-3 py-2 border border-red-100 text-red-600 rounded-md text-sm hover:bg-red-50 transition"
                        title="Delete invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8 bg-white rounded-md shadow-sm border border-gray-100 p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{(page - 1) * pageSize + 1}</span> to{" "}
                  <span className="font-semibold text-gray-900">{Math.min(page * pageSize, filtered.length)}</span> of{" "}
                  <span className="font-semibold text-gray-900">{filtered.length}</span> results
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-200 rounded-md text-sm disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <div className="px-4 py-1 border border-gray-200 rounded-md text-sm font-medium">
                    {page} / {totalPages}
                  </div>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-200 rounded-md text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <div className="text-xs text-gray-500">Invoice Details</div>
                <h2 className="text-xl font-semibold">#{selected.orderNumber}</h2>
                <div className="text-sm text-gray-600 mt-1">{selected.client?.name} • {selected.client?.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    downloadInvoice(selected._id, selected.orderNumber);
                  }}
                  disabled={!!actionLoading[selected._id]}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-800 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download size={16} /> Download
                </button>

                {selected.paymentStatus !== "paid" && (
                  <button
                    onClick={() => {
                      markPaid(selected._id);
                      setSelected(null);
                    }}
                    disabled={!!actionLoading[selected._id]}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={16} /> Mark paid
                  </button>
                )}

                <button onClick={() => setSelected(null)} className="p-2 text-gray-600 hover:text-black">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Client</h3>
                  <div className="bg-gray-50 rounded-md p-4 space-y-2">
                    <div className="text-sm font-medium text-gray-900">{selected.client?.name}</div>
                    {selected.client?.email && <div className="text-sm text-gray-700">{selected.client.email}</div>}
                    {selected.client?.phone && <div className="text-sm text-gray-700">{selected.client.phone}</div>}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-800 mt-6 mb-3">Addresses</h3>
                  <div className="space-y-3">
                    {selected.shippingAddress && (
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="text-xs font-semibold text-gray-700">Shipping</div>
                        <div className="text-sm text-gray-800">
                          {selected.shippingAddress.line1 && <div>{selected.shippingAddress.line1}</div>}
                          {selected.shippingAddress.unit && <div>{selected.shippingAddress.unit}</div>}
                          <div>{[selected.shippingAddress.city, selected.shippingAddress.postcode].filter(Boolean).join(", ")}</div>
                          {selected.shippingAddress.country && <div>{selected.shippingAddress.country}</div>}
                        </div>
                      </div>
                    )}

                    {selected.billingAddress && (
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="text-xs font-semibold text-gray-700">Billing</div>
                        <div className="text-sm text-gray-800">
                          {selected.billingAddress.line1 && <div>{selected.billingAddress.line1}</div>}
                          {selected.billingAddress.unit && <div>{selected.billingAddress.unit}</div>}
                          <div>{[selected.billingAddress.city, selected.billingAddress.postcode].filter(Boolean).join(", ")}</div>
                          {selected.billingAddress.country && <div>{selected.billingAddress.country}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Summary</h3>
                  <div className="bg-gray-50 rounded-md p-4 space-y-3">
                    <div className="flex justify-between text-sm text-gray-700">
                      <div>Subtotal</div>
                      <div className="font-medium">{formatCurrency(selected.subtotal, selected.currency?.toUpperCase())}</div>
                    </div>
                    <div className="flex justify-between text-sm text-gray-700">
                      <div>Shipping</div>
                      <div className="font-medium">{formatCurrency(selected.shipping, selected.currency?.toUpperCase())}</div>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <div className="font-semibold text-gray-900">Total</div>
                        <div className="text-xl font-bold text-gray-900">{formatCurrency(selected.total, selected.currency?.toUpperCase())}</div>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-800 mt-6 mb-3">Items</h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {selected.items?.map((it, idx) => (
                      <div key={idx} className="bg-white border border-gray-100 rounded-md p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{it.name}</div>
                            <div className="text-xs text-gray-600">
                              Qty {it.qty} • Unit {formatCurrency(it.unitPrice, selected.currency?.toUpperCase())}
                            </div>
                          </div>
                          <div className="font-semibold text-gray-900">{formatCurrency(it.totalPrice, selected.currency?.toUpperCase())}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-md p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="text-sm font-semibold text-gray-900 capitalize">{selected.paymentStatus || "unpaid"}</div>
                </div>
                <div className="bg-gray-50 rounded-md p-3">
                  <div className="text-xs text-gray-500">Source</div>
                  <div className="text-sm font-semibold text-gray-900 capitalize">{selected.source || "manual"}</div>
                </div>
                <div className="bg-gray-50 rounded-md p-3">
                  <div className="text-xs text-gray-500">Created</div>
                  <div className="text-sm font-semibold text-gray-900">{new Date(selected.createdAt || "").toLocaleDateString()}</div>
                </div>
                {selected.paidAt && (
                  <div className="bg-green-50 rounded-md p-3">
                    <div className="text-xs text-green-700">Paid At</div>
                    <div className="text-sm font-semibold text-green-900">{new Date(selected.paidAt).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-xl w-full max-w-md p-6">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={26} className="text-red-600" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">Delete Invoice?</h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              Are you sure you want to delete invoice <span className="font-medium">#{deleteConfirm.orderNumber}</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteInvoice(deleteConfirm._id)}
                disabled={!!actionLoading[deleteConfirm._id]}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading[deleteConfirm._id] ? "Deleting..." : "Delete Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}