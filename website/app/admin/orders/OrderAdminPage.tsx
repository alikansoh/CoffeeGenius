'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  CheckCircle,
  Clock,
  Search,
  Eye,
  Trash2,
  AlertCircle,
  X,
  Calendar,
  Package,
  RefreshCw,
  Truck,
  DollarSign,
  ChevronDown,
  Filter,
  Download,
} from "lucide-react";
import Fuse, { FuseResult } from "fuse.js";

/**
 * Client-side searching approach
 *
 * Notes:
 * - This page fetches all orders from the server (paginated fetch loop)
 *   and performs search locally in the browser using Fuse.js for fuzzy search.
 *
 * Improvements:
 * - Better handling of refunds: compute refunded and refundable amounts from
 *   order.refund and order.metadata.refunds/refundedAmount. Prefill refund modal
 *   with remaining refundable amount. Prevent over-refunds.
 * - Revenue now accounts for refunds (net revenue).
 * - Partial refunds supported; status 'partially_refunded' used for partials.
 * - Added refund confirmation modal so user reviews before submitting.
 * - Added "Export orders" (CSV) button + API integration to download orders as CSV.
 */

/* -------------------------- Types -------------------------- */
type Address = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
};

type OrderItem = {
  id?: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  source?: string;
};

type ShipmentProvider =
  | "royal-mail"
  | "dpd"
  | "evri"
  | "ups"
  | "dhl"
  | "fedex"
  | "parcelforce"
  | "yodel";

type Shipment = {
  provider: ShipmentProvider;
  trackingCode?: string;
  shippedAt?: string;
  estimatedDelivery?: string;
};

type Refund = {
  amount: number;
  reason?: string;
  refundedAt: string;
  refundId?: string;
};

type Order = {
  _id: string;
  paymentIntentId?: string;
  createdAt?: string;
  updatedAt?: string;
  currency?: string;
  items: OrderItem[];
  metadata?: Record<string, unknown>;
  paidAt?: string | null;
  status?: "paid" | "pending" | "failed" | "refunded" | "partially_refunded" | "processing" | "shipped" | string;
  clientId?: string;
  billingAddress?: Address | null;
  shippingAddress?: Address | null;
  shipping?: number;
  subtotal?: number;
  total?: number;
  shipment?: Shipment | null;
  refund?: Refund | null;
};

type ApiError = { error: string };

/* ----------------------- Helpers / UI ----------------------- */
const SHIPMENT_PROVIDERS: { value: ShipmentProvider; label: string }[] = [
  { value: "royal-mail", label: "Royal Mail" },
  { value: "dpd", label: "DPD" },
  { value: "evri", label: "Evri (Hermes)" },
  { value: "ups", label: "UPS" },
  { value: "dhl", label: "DHL" },
  { value: "fedex", label: "FedEx" },
  { value: "parcelforce", label: "Parcelforce" },
  { value: "yodel", label: "Yodel" },
];

function formatCurrency(value = 0, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${(value || 0).toFixed(2)}`;
  }
}

function shortId(id?: string) {
  if (!id) return "—";
  return id.slice(-8);
}

function getStatusColor(status?: string) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800 border-green-200";
    case "shipped":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "refunded":
      return "bg-red-100 text-red-800 border-red-200";
    case "partially_refunded":
      return "bg-red-50 text-red-800 border-red-200";
    case "processing":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "pending":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function getStatusIcon(status?: string) {
  switch (status) {
    case "paid":
      return <CheckCircle size={14} />;
    case "shipped":
      return <Truck size={14} />;
    case "refunded":
      return <RefreshCw size={14} />;
    case "partially_refunded":
      return <RefreshCw size={14} />;
    case "processing":
      return <Clock size={14} />;
    default:
      return <Clock size={14} />;
  }
}

/* ---------------------- Refund helpers --------------------- */

function getRefundedAmount(order: Order): number {
  // Priority: metadata.refundedAmount -> metadata.refunds sum -> order.refund.amount -> 0
  const meta = order.metadata || {};
  if (typeof meta.refundedAmount === "number" && !Number.isNaN(meta.refundedAmount)) {
    return Number(meta.refundedAmount);
  }
  if (Array.isArray(meta.refunds)) {
    return meta.refunds.reduce((s: number, r: { amount?: number }) => s + (Number(r.amount) || 0), 0);
  }
  if (order.refund && typeof order.refund.amount === "number") {
    return Number(order.refund.amount);
  }
  return 0;
}

function getRefundableAmount(order: Order): number {
  const total = Number(order.total || 0);
  const refunded = getRefundedAmount(order);
  const remaining = Number((total - refunded).toFixed(2));
  return remaining > 0 ? remaining : 0;
}

/* ------------------------ Component ------------------------ */
export default function OrdersPage() {
  // full dataset stored in memory for client-side search
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const fuseRef = useRef<Fuse<Order> | null>(null);

  // UI & behavior
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingPageSample, setLoadingPageSample] = useState(false); // optional initial sample
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Controls
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<
    "auto" | "orderId" | "clientId" | "paymentIntent" | "emailName" | "item" | "tracking"
  >("auto");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Client-side pagination / view
  const [page, setPage] = useState(1);
  const perPage = 12;

  // Modals & action state (refund/ship/delete)
  const [selected, setSelected] = useState<Order | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null);
  const [refundModal, setRefundModal] = useState<Order | null>(null);
  const [shipmentModal, setShipmentModal] = useState<Order | null>(null);
  const [shipmentConfirmOpen, setShipmentConfirmOpen] = useState(false);

  // NEW: Refund confirmation modal open state
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [shipmentProvider, setShipmentProvider] = useState<ShipmentProvider>("royal-mail");
  const [trackingCode, setTrackingCode] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [exportLoading, setExportLoading] = useState(false);

  // debounce
  const debounceRef = useRef<number | null>(null);

  // Safety caps for fetching all records
  const BATCH_LIMIT = 200; // server-side limit per page (match API)
  const MAX_RECORDS_TO_FETCH = 5000; // safety cap:  abort if this many reached

  // Derived:  filtered and searched results (memoized)
  const filteredAndSearched = useMemo(() => {
    // start from allOrders and apply status filter
    let base = allOrders;
    if (statusFilter && statusFilter !== "all") {
      base = base.filter((o) => o.status === statusFilter);
    }

    const q = query.trim();
    if (!q) return base;

    // heuristic: if user typed a 24-hex id and searching orderId or auto, prefer exact match first
    const isHex24 = /^[0-9a-fA-F]{24}$/.test(q);
    if (isHex24 && (searchField === "orderId" || searchField === "auto")) {
      const exact = base.filter((o) => o._id.toLowerCase() === q.toLowerCase());
      if (exact.length > 0) return exact;
    }

    // If a Fuse index is available, use it for fuzzy search
    const fuse = fuseRef.current;
    if (fuse) {
      // map searchField to Fuse keys when field-specific search required
      const keysForField: Record<string, string[]> = {
        orderId: ["_id"],
        clientId: ["clientId"],
        paymentIntent: ["paymentIntentId"],
        emailName: [
          "shippingAddress.email",
          "billingAddress.email",
          "shippingAddress.firstName",
          "shippingAddress.lastName",
          "billingAddress.firstName",
          "billingAddress.lastName",
        ],
        item: ["items.name", "items.source"],
        tracking: ["shipment.trackingCode", "shipment.provider"],
        auto: [], // let Fuse use global keys defined at creation
      };

      if (searchField !== "auto") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results = fuse.search(q, { keys: keysForField[searchField] } as any).map((r: FuseResult<Order>) => r.item);
          return results;
        } catch {
          // fall through to global search
        }
      } else {
        const results = fuse.search(q).map((r: FuseResult<Order>) => r.item);
        return results;
      }
    }

    // fallback naive filtering (if Fuse not ready)
    const low = q.toLowerCase();
    const matchAddress = (addr: Address | null | undefined) =>
      !!addr &&
      (addr.firstName?.toLowerCase().includes(low) ||
        addr.lastName?.toLowerCase().includes(low) ||
        addr.email?.toLowerCase().includes(low) ||
        addr.phone?.toLowerCase().includes(low) ||
        addr.city?.toLowerCase().includes(low) ||
        addr.postcode?.toLowerCase().includes(low));
    return base.filter((o) => {
      // check multiple fields
      if (o._id?.toLowerCase().includes(low)) return true;
      if (o.clientId?.toLowerCase().includes(low)) return true;
      if (o.paymentIntentId?.toLowerCase().includes(low)) return true;
      if (String(o.total)?.toLowerCase().includes(low)) return true;
      if (matchAddress(o.shippingAddress) || matchAddress(o.billingAddress)) return true;
      if (o.items?.some((it) => it.name.toLowerCase().includes(low) || (it.source || "").toLowerCase().includes(low))) return true;
      if (o.shipment && ((o.shipment.trackingCode || "").toLowerCase().includes(low) || (o.shipment.provider || "").toLowerCase().includes(low))) return true;
      return false;
    });
  }, [allOrders, query, searchField, statusFilter]);

  // pagination of the filtered results
  const totalResults = filteredAndSearched.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
  const paginated = filteredAndSearched.slice((page - 1) * perPage, page * perPage);

  /* ------------------------ Effects ------------------------ */

  // On mount:  fetch all orders in the background
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoadingAll(true);
      setError(null);
      try {
        let pageNum = 1;
        const accumulated: Order[] = [];
        while (mounted) {
          const params = new URLSearchParams();
          params.set("page", String(pageNum));
          params.set("limit", String(BATCH_LIMIT));
          // we fetch "all" statuses here; later user's status filter will apply client-side
          const res = await fetch(`/api/orders?${params.toString()}`);
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json?.error || `Failed to fetch orders (${res.status})`);
          }
          const json = await res.json();
          const pageOrders: Order[] = json.data || [];
          accumulated.push(...pageOrders);

          // safety cap
          if (accumulated.length >= MAX_RECORDS_TO_FETCH) {
            console.warn(`Reached MAX_RECORDS_TO_FETCH=${MAX_RECORDS_TO_FETCH}, stopping fetch`);
            break;
          }

          // stop when last page reached
          const meta = json.meta || { page: pageNum, pages: pageNum };
          if (meta.page >= meta.pages) break;
          pageNum += 1;
        }

        if (!mounted) return;

        setAllOrders(accumulated);

        // build Fuse index for client-side fuzzy search
        // tuned weights to prioritize items. name, then ids and names/emails
        fuseRef.current = new Fuse(accumulated, {
          includeScore: true,
          threshold: 0.4,
          ignoreLocation: true,
          useExtendedSearch: true,
          keys: [
            { name: "items.name", weight: 5 },
            { name: "_id", weight: 4 },
            { name: "clientId", weight: 3 },
            { name: "paymentIntentId", weight: 3 },
            { name: "shippingAddress.firstName", weight: 2 },
            { name: "shippingAddress.lastName", weight: 2 },
            { name: "billingAddress.firstName", weight: 1.5 },
            { name: "billingAddress.lastName", weight: 1.5 },
            { name: "shippingAddress.email", weight: 2 },
            { name: "billingAddress.email", weight: 2 },
            { name: "shipment.trackingCode", weight: 2 },
            { name: "shipment.provider", weight: 1 },
            { name: "items.source", weight: 1 },
          ],
        });
      } catch (err: unknown) {
        console.error("Failed to load all orders", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoadingAll(false);
      }
    }

    loadAll();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounce the query for responsive UI
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPage(1); // reset page when query changes
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, searchField, statusFilter]);

  /* ---------------------- Action handlers --------------------- */

  const deleteOrder = async (id: string) => {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json: ApiError = await res.json().catch(() => ({ error: "" }));
        throw new Error(json.error || `Failed to delete order (${res.status})`);
      }
      showSuccess("Order deleted successfully");
      // remove from local store
      setAllOrders((arr) => arr.filter((o) => o._id !== id));
      setDeleteConfirm(null);
      setSelected(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to delete order");
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const refundOrder = async () => {
    if (!refundModal) return;
    const amount = parseFloat(refundAmount);
    const refundable = getRefundableAmount(refundModal);

    if (isNaN(amount) || amount <= 0 || amount > refundable + 0.0001) {
      setError("Invalid refund amount");
      return;
    }

    setActionLoading((s) => ({ ...s, [refundModal._id]: true }));
    try {
      const res = await fetch(`/api/orders/${refundModal._id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          reason: refundReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json: ApiError = await res.json().catch(() => ({ error: "" }));
        throw new Error(json.error || `Failed to refund order (${res.status})`);
      }

      const json = await res.json().catch(() => ({}));
      // server returns { data: { refund, order } } — prefer the updated order if present
      const returnedOrder: Order | undefined = json?.data?.order ?? json?.data;

      showSuccess(`Order refunded successfully (${formatCurrency(amount, (refundModal.currency || "GBP").toUpperCase())})`);

      if (returnedOrder) {
        setAllOrders((arr) => arr.map((o) => (o._id === returnedOrder._id ? returnedOrder : o)));
        // if the modal order is the same, refresh it
        if (refundModal._id === returnedOrder._id) {
          setRefundModal(null); // CLOSE refund modal after success
          setSelected(null); // CLOSE details modal too (user requested both closed)
          // set refund amount to remaining refundable amount for convenience (if user reopens)
          // ensure the amount input is reset
          setRefundAmount("");
        } else {
          setRefundModal(null);
        }
      } else {
        // best effort: mark refunded locally
        setAllOrders((arr) =>
          arr.map((o) =>
            o._id === refundModal._id
              ? {
                  ...o,
                  status: amount >= (o.total || 0) ? "refunded" : "partially_refunded",
                  refund: { amount: (o.refund?.amount || 0) + amount, refundedAt: new Date().toISOString(), refundId: undefined },
                  metadata: {
                    ...(o.metadata || {}),
                    refundedAmount: ((o.metadata?.refundedAmount as number ?? o.refund?.amount) || 0) + amount,
                  },
                }
              : o
          )
        );
        setRefundModal(null);
        setSelected(null);
        setRefundAmount("");
      }

      // close the confirmation modal (if open)
      setRefundConfirmOpen(false);
      setRefundReason("");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to refund order");
    } finally {
      if (refundModal) setActionLoading((s) => ({ ...s, [refundModal._id]: false }));
    }
  };

  const addShipment = async () => {
    if (!shipmentModal) return;
    setActionLoading((s) => ({ ...s, [shipmentModal._id]: true }));
    try {
      const res = await fetch(`/api/orders/${shipmentModal._id}/shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: shipmentProvider,
          trackingCode: trackingCode.trim() || undefined,
          estimatedDelivery: estimatedDelivery || undefined,
        }),
      });
      if (!res.ok) {
        const json: ApiError = await res.json().catch(() => ({ error: "" }));
        throw new Error(json.error || `Failed to add shipment (${res.status})`);
      }
      showSuccess("Shipment details added successfully");
      const json = await res.json().catch(() => ({}));
      const updated: Order | undefined = json.data;
      if (updated) {
        setAllOrders((arr) => arr.map((o) => (o._id === updated._id ? updated : o)));
      } else {
        setAllOrders((arr) => arr.map((o) => (o._id === shipmentModal._id ? { ...o, shipment: { provider: shipmentProvider, trackingCode, estimatedDelivery }, status: "shipped" } : o)));
      }
      setShipmentModal(null);
      setShipmentProvider("royal-mail");
      setTrackingCode("");
      setEstimatedDelivery("");
      setSelected(null);
      setShipmentConfirmOpen(false);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to add shipment");
    } finally {
      if (shipmentModal) setActionLoading((s) => ({ ...s, [shipmentModal._id]: false }));
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  /* ---------------------- Export handler --------------------- */

  async function exportOrdersCSV() {
    try {
      setExportLoading(true);
      setError(null);
      const res = await fetch(`/api/orders/export?format=csv`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `orders-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess("Export started — check your downloads");
    } catch (err: unknown) {
      console.error("Export failed", err);
      setError(err instanceof Error ? err.message : "Failed to export orders");
    } finally {
      setExportLoading(false);
    }
  }

  /* ------------------------ Render ------------------------ */

  const isEmpty = !loadingAll && allOrders.length === 0;

  // Stats: totalRevenue should subtract refunded amounts (net revenue)
  const stats = useMemo(() => {
    const orders = allOrders;
    // totalRevenue = sum of (order.total - refundedAmount) across orders
    const totalRevenue = orders.reduce((sum, o) => {
      const total = Number(o.total || 0);
      const refunded = getRefundedAmount(o);
      // don't let a single order push revenue below 0
      const net = Math.max(0, Number((total - refunded).toFixed(2)));
      return sum + net;
    }, 0);

    const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "shipped").length;
    const shippedOrders = orders.filter((o) => o.status === "shipped").length;
    const refundedOrders = orders.filter((o) => o.status === "refunded").length;

    return { totalRevenue, paidOrders, shippedOrders, refundedOrders };
  }, [allOrders]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-black">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-2">
                  Orders Management
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                  Manage and review customer orders placed through the e-commerce platform.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={exportOrdersCSV}
                  disabled={exportLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Orders</p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">{allOrders.length}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
                  <Package className="text-blue-600" size={20} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Net Revenue (after refunds)</p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">{formatCurrency(stats.totalRevenue)}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
                  <DollarSign className="text-green-600" size={20} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Shipped</p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">{stats.shippedOrders}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
                  <Truck className="text-purple-600" size={20} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Refunded</p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">{stats.refundedOrders}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
                  <RefreshCw className="text-red-600" size={20} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
          <div className="flex flex-col gap-4">
            {/* Search bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" size={18} />
              <input
                aria-label="Search orders"
                className="w-full pl-10 sm:pl-11 pr-10 sm:pr-32 py-3 sm:py-3.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                placeholder="Search orders..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                  className="absolute right-3 sm:right-32 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              )}

              {/* Desktop search field selector */}
              <div className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2">
                <div className="relative">
                  <select
                    value={searchField}
                    onChange={(e) =>
                      setSearchField(
                        e.target.value as "auto" | "orderId" | "clientId" | "paymentIntent" | "emailName" | "item" | "tracking"
                      )
                    }
                    className="appearance-none pl-3 pr-9 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition"
                    aria-label="Search scope"
                  >
                    <option value="auto">All Fields</option>
                    <option value="orderId">Order ID</option>
                    <option value="clientId">Client ID</option>
                    <option value="paymentIntent">Payment Intent</option>
                    <option value="emailName">Email / Name</option>
                    <option value="item">Item Name</option>
                    <option value="tracking">Tracking</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            {/* Mobile search field + status filter */}
            <div className="flex gap-3 sm:hidden">
              <div className="relative flex-1">
                <select
                  value={searchField}
                  onChange={(e) =>
                    setSearchField(
                      e.target.value as "auto" | "orderId" | "clientId" | "paymentIntent" | "emailName" | "item" | "tracking"
                    )
                  }
                  className="appearance-none w-full pl-3 pr-9 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-700"
                  aria-label="Search scope"
                >
                  <option value="auto">All Fields</option>
                  <option value="orderId">Order ID</option>
                  <option value="clientId">Client ID</option>
                  <option value="paymentIntent">Payment</option>
                  <option value="emailName">Email/Name</option>
                  <option value="item">Item</option>
                  <option value="tracking">Tracking</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>

              <div className="relative flex-1">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="appearance-none w-full pl-3 pr-9 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-700"
                  aria-label="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="refunded">Refunded</option>
                  <option value="pending">Pending</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Desktop status filter */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Filter size={16} className="text-gray-400" />
                <span>Status:</span>
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="appearance-none pl-3 pr-9 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition"
                  aria-label="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="refunded">Refunded</option>
                  <option value="pending">Pending</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>

              {(query || statusFilter !== "all") && (
                <button
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setSearchField("auto");
                    setPage(1);
                  }}
                  className="ml-auto text-sm font-medium text-blue-600 hover:text-blue-700 transition flex items-center gap-1.5"
                >
                  <X size={14} />
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Loading / messages */}
        {loadingAll && (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 text-yellow-900 px-4 py-4 rounded-xl mb-6 flex items-start gap-3 shadow-sm">
            <Clock size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Loading orders...</p>
              <p className="text-xs text-yellow-800">Fetched {allOrders.length} orders so far</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 text-green-900 px-4 py-4 rounded-xl mb-6 flex items-start gap-3 shadow-sm">
            <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-sm font-medium">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800 transition flex-shrink-0" aria-label="Dismiss">
              <X size={18} />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-900 px-4 py-4 rounded-xl mb-6 flex items-start gap-3 shadow-sm">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 transition flex-shrink-0" aria-label="Dismiss error">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Results */}
        {isEmpty ? (
          <div className="text-center py-16 sm:py-24 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Package size={32} className="text-gray-400" />
            </div>
            <p className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No orders found</p>
            <p className="text-sm text-gray-600">There are no orders in the system yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {paginated.map((o) => {
                const refunded = getRefundedAmount(o);
                const refundable = getRefundableAmount(o);
                return (
                  <article key={o._id} className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-gray-300 transition-all duration-200 overflow-hidden">
                    {/* Status indicator bar */}
                    <div className="relative h-1.5 bg-gray-100">
                      <div
                        className={`absolute inset-0 transition-all ${
                          o.status === "refunded"
                            ? "bg-gradient-to-r from-red-500 to-red-600"
                            : o.status === "shipped"
                            ? "bg-gradient-to-r from-blue-500 to-blue-600"
                            : o.status === "paid"
                            ? "bg-gradient-to-r from-green-500 to-green-600"
                            : "bg-gradient-to-r from-yellow-500 to-yellow-600"
                        }`}
                      />
                    </div>

                    <div className="p-5 sm:p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4 gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-gray-500 font-mono mb-2">#{shortId(o._id)}</div>
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate mb-1.5">
                            {[o.shippingAddress?.firstName, o.shippingAddress?.lastName].filter(Boolean).join(" ") || "Guest Order"}
                          </h3>
                          <div className="text-xs text-gray-600 truncate flex items-center gap-1.5">
                            <Mail size={12} className="flex-shrink-0" />
                            <span className="truncate">{o.shippingAddress?.email || o.billingAddress?.email || "No email"}</span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-gray-500 mb-1">Total</div>
                          <div className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(o.total, (o.currency || "GBP").toUpperCase())}</div>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                          <span>
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(o.status)}`}>
                            {getStatusIcon(o.status)}
                            <span className="capitalize">{o.status || "pending"}</span>
                          </span>

                          <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                            <Package size={12} /> {o.items?.length ?? 0}
                          </span>

                          {o.shipment && (
                            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                              <Truck size={12} /> {SHIPMENT_PROVIDERS.find((p) => p.value === o.shipment?.provider)?.label || "Shipped"}
                            </span>
                          )}

                          {refunded > 0 && (
                            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                              <RefreshCw size={12} /> Refunded {formatCurrency(refunded, (o.currency || "GBP").toUpperCase())}
                            </span>
                          )}

                          {refundable > 0 && refunded > 0 && (
                            <span className="inline-flex items-center gap-1.5 bg-yellow-50 text-yellow-800 border border-yellow-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                              Remaining {formatCurrency(refundable, (o.currency || "GBP").toUpperCase())}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => setSelected(o)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs sm:text-sm hover:bg-gray-50 transition font-medium"
                          title="View details"
                          aria-label={`View order ${shortId(o._id)}`}
                        >
                          <Eye size={14} />
                        </button>

                        {!o.shipment && o.status !== "refunded" && (
                          <button
                            onClick={() => {
                              setShipmentModal(o);
                              setShipmentProvider("royal-mail");
                              setTrackingCode("");
                              setEstimatedDelivery("");
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-xs sm:text-sm hover:bg-blue-100 transition font-medium"
                            title="Add shipment"
                            aria-label={`Add shipment for order ${shortId(o._id)}`}
                          >
                            <Truck size={14} />
                            <span className="hidden sm:inline">Ship</span>
                          </button>
                        )}

                        {getRefundableAmount(o) > 0 && o.status !== "refunded" ? (
                          <button
                            onClick={() => {
                              setRefundModal(o);
                              setRefundAmount(String(getRefundableAmount(o)));
                              setRefundReason("");
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-orange-200 bg-orange-50 text-orange-700 rounded-lg text-xs sm:text-sm hover:bg-orange-100 transition font-medium"
                            title="Refund order"
                            aria-label={`Refund order ${shortId(o._id)}`}
                          >
                            <RefreshCw size={14} />
                            <span className="hidden sm:inline">Refund</span>
                          </button>
                        ) : (
                          <button
                            disabled
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 bg-gray-50 text-gray-300 rounded-lg text-xs sm:text-sm transition font-medium cursor-not-allowed"
                            title="No refundable amount"
                            aria-label={`No refundable amount for order ${shortId(o._id)}`}
                          >
                            <RefreshCw size={14} />
                            <span className="hidden sm:inline">Refund</span>
                          </button>
                        )}

                        <button
                          onClick={() => setDeleteConfirm(o)}
                          className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm hover:bg-red-50 transition font-medium"
                          title="Delete order"
                          aria-label={`Delete order ${shortId(o._id)}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-sm text-gray-600 text-center sm:text-left">
                    Showing{" "}
                    <span className="font-semibold text-gray-900">{(page - 1) * perPage + (paginated.length > 0 ? 1 : 0)}</span>
                    {" "}-{" "}
                    <span className="font-semibold text-gray-900">{(page - 1) * perPage + paginated.length}</span>
                    {" "}of{" "}
                    <span className="font-semibold text-gray-900">{totalResults}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                    >
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sm:hidden">Prev</span>
                    </button>

                    <div className="px-3 sm:px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold min-w-[80px] text-center">
                      {page} / {totalPages}
                    </div>

                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Details modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-200 flex items-start justify-between rounded-t-2xl z-10">
              <div className="flex-1 min-w-0 mr-4">
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Order Details</div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">#{shortId(selected._id)}</h2>
                <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{selected.shippingAddress?.firstName || ""} {selected.shippingAddress?.lastName || ""}</span>
                  {(selected.shippingAddress?.email || selected.billingAddress?.email) && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="flex items-center gap-1.5">
                        <Mail size={14} />
                        {selected.shippingAddress?.email || selected.billingAddress?.email}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${getStatusColor(selected.status)}`}>
                  {getStatusIcon(selected.status)}
                  <span className="capitalize hidden sm:inline">{selected.status || "pending"}</span>
                </span>

                <button
                  onClick={() => setSelected(null)}
                  className="p-2 text-gray-600 hover:text-black rounded-lg hover:bg-gray-100 transition"
                  aria-label="Close details"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 lg:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                {/* Left column */}
                <div className="space-y-6">
                  {/* Shipping Address */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Package size={16} className="text-gray-600" />
                      Shipping Address
                    </h3>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 space-y-2 border border-gray-200">
                      <div className="text-sm font-semibold text-gray-900">
                        {[selected.shippingAddress?.firstName, selected.shippingAddress?.lastName].filter(Boolean).join(" ") || "—"}
                      </div>
                      {selected.shippingAddress?.email && (
                        <div className="text-sm text-gray-700 flex items-center gap-2">
                          <Mail size={14} className="text-gray-500" />
                          {selected.shippingAddress.email}
                        </div>
                      )}
                      {selected.shippingAddress?.phone && (
                        <div className="text-sm text-gray-700">{selected.shippingAddress.phone}</div>
                      )}
                      {selected.shippingAddress?.line1 && (
                        <div className="text-sm text-gray-700 pt-2 border-t border-gray-200">{selected.shippingAddress.line1}</div>
                      )}
                      {selected.shippingAddress?.unit && (
                        <div className="text-sm text-gray-700">{selected.shippingAddress.unit}</div>
                      )}
                      <div className="text-sm text-gray-700">
                        {[selected.shippingAddress?.city, selected.shippingAddress?.postcode].filter(Boolean).join(", ")}
                      </div>
                      {selected.shippingAddress?.country && (
                        <div className="text-sm text-gray-900 font-medium">{selected.shippingAddress.country}</div>
                      )}
                    </div>
                  </div>

                  {/* Billing Address */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Billing Address</h3>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 space-y-2 border border-gray-200">
                      <div className="text-sm font-semibold text-gray-900">
                        {[selected.billingAddress?.firstName, selected.billingAddress?.lastName].filter(Boolean).join(" ") || "—"}
                      </div>
                      {selected.billingAddress?.line1 && (
                        <div className="text-sm text-gray-700 pt-2 border-t border-gray-200">{selected.billingAddress.line1}</div>
                      )}
                      {selected.billingAddress?.unit && (
                        <div className="text-sm text-gray-700">{selected.billingAddress.unit}</div>
                      )}
                      <div className="text-sm text-gray-700">
                        {[selected.billingAddress?.city, selected.billingAddress?.postcode].filter(Boolean).join(", ")}
                      </div>
                      {selected.billingAddress?.country && (
                        <div className="text-sm text-gray-900 font-medium">{selected.billingAddress.country}</div>
                      )}
                    </div>
                  </div>

                  {/* Shipment Details */}
                  {selected.shipment && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Truck size={16} className="text-blue-600" />
                        Shipment Details
                      </h3>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-900 font-medium">Provider</span>
                          <span className="text-sm font-semibold text-blue-900">
                            {SHIPMENT_PROVIDERS.find((p) => p.value === selected.shipment?.provider)?.label || selected.shipment.provider}
                          </span>
                        </div>
                        {selected.shipment.trackingCode && (
                          <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                            <span className="text-sm text-blue-900 font-medium">Tracking Code</span>
                            <span className="text-sm font-mono font-semibold text-blue-700 break-all text-right max-w-[60%]">
                              {selected.shipment.trackingCode}
                            </span>
                          </div>
                        )}
                        {selected.shipment.shippedAt && (
                          <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                            <span className="text-sm text-blue-900 font-medium">Shipped At</span>
                            <span className="text-sm font-semibold text-blue-900">
                              {new Date(selected.shipment.shippedAt).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                        )}
                        {selected.shipment.estimatedDelivery && (
                          <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                            <span className="text-sm text-blue-900 font-medium">Est. Delivery</span>
                            <span className="text-sm font-semibold text-blue-900">
                              {new Date(selected.shipment.estimatedDelivery).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Refund Details */}
                  {(getRefundedAmount(selected) > 0 || selected.refund) && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <RefreshCw size={16} className="text-red-600" />
                        Refund Details
                      </h3>
                      <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-900 font-medium">Refunded Total</span>
                          <span className="text-lg font-bold text-red-700">
                            {formatCurrency(getRefundedAmount(selected), selected.currency || "GBP")}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-red-200">
                          <span className="text-sm text-red-900 font-medium">Remaining refundable</span>
                          <span className="text-sm font-semibold text-red-900">
                            {formatCurrency(getRefundableAmount(selected), selected.currency || "GBP")}
                          </span>
                        </div>

                        {selected.refund?.reason && (
                          <div className="pt-2 border-t border-red-200">
                            <span className="text-sm text-red-900 font-medium block mb-1">Last Reason</span>
                            <p className="text-sm text-red-800">{selected.refund.reason}</p>
                          </div>
                        )}

                        {selected.refund?.refundedAt && (
                          <div className="flex items-center justify-between pt-2 border-t border-red-200">
                            <span className="text-sm text-red-900 font-medium">Last refunded at</span>
                            <span className="text-sm font-semibold text-red-900">
                              {new Date(selected.refund.refundedAt).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-6">
                  {/* Order Summary */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Order Summary</h3>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-3 border border-gray-200">
                      <div className="flex justify-between text-sm text-gray-700">
                        <div className="font-medium">Subtotal</div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(selected.subtotal, (selected.currency || "GBP").toUpperCase())}
                        </div>
                      </div>
                      <div className="flex justify-between text-sm text-gray-700">
                        <div className="font-medium">Shipping</div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(selected.shipping || 0, (selected.currency || "GBP").toUpperCase())}
                        </div>
                      </div>
                      <div className="border-t border-gray-300 pt-3">
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-gray-900">Total</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {formatCurrency(selected.total, (selected.currency || "GBP").toUpperCase())}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">
                      Order Items ({selected.items?.length ?? 0})
                    </h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                      {selected.items?.map((it, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 mb-1.5">{it.name}</div>
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <div>Qty: <span className="font-semibold text-gray-900">{it.qty}</span></div>
                                <div>
                                  Unit Price: <span className="font-semibold text-gray-900">
                                    {formatCurrency(it.unitPrice, (selected.currency || "GBP").toUpperCase())}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="font-bold text-gray-900 flex-shrink-0">
                              {formatCurrency(it.totalPrice, (selected.currency || "GBP").toUpperCase())}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Metadata */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Order Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 font-medium mb-1">Payment Intent</div>
                        <div className="text-sm font-mono font-semibold text-gray-900 truncate" title={selected.paymentIntentId}>
                          {selected.paymentIntentId ? shortId(selected.paymentIntentId) : "—"}
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 font-medium mb-1">Currency</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {(selected.currency || "GBP").toUpperCase()}
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 font-medium mb-1">Created</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          }) : "—"}
                        </div>
                      </div>

                      {selected.paidAt && (
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 border border-green-200">
                          <div className="text-xs text-green-700 font-medium mb-1">Paid At</div>
                          <div className="text-sm font-semibold text-green-900">
                            {new Date(selected.paidAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric"
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Additional Metadata */}
                  {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">Additional Metadata</h3>
                      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs max-h-48 overflow-auto border border-gray-700 font-mono">
                        {JSON.stringify(selected.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                  {!selected.shipment && selected.status !== "refunded" && (
                    <button
                      onClick={() => {
                        setShipmentModal(selected);
                        setShipmentProvider("royal-mail");
                        setTrackingCode("");
                        setEstimatedDelivery("");
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border border-blue-300 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 hover:shadow-lg transition font-semibold"
                    >
                      <Truck size={16} /> Add Shipment
                    </button>
                  )}

                  {getRefundableAmount(selected) > 0 && selected.status !== "refunded" && (
                    <button
                      onClick={() => {
                        setRefundModal(selected);
                        setRefundAmount(String(getRefundableAmount(selected)));
                        setRefundReason("");
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border border-orange-300 bg-orange-600 text-white rounded-xl text-sm hover:bg-orange-700 hover:shadow-lg transition font-semibold"
                    >
                      <RefreshCw size={16} /> Process Refund
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteConfirm(selected)}
                    className="sm:w-auto px-4 py-3 border border-red-300 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 hover:shadow-lg transition font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Delete Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setRefundModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 sm:p-8">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-orange-200">
                <RefreshCw size={32} className="text-orange-600" />
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Process Refund</h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Refund order <span className="font-semibold text-gray-900">#{shortId(refundModal._id)}</span>
              </p>

              <div className="space-y-5">
                <div>
                  <label htmlFor="refundAmount" className="block text-sm font-semibold text-gray-800 mb-2">
                    Refund Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={refundModal ? getRefundableAmount(refundModal) : undefined}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition text-lg font-semibold"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Remaining refundable: <span className="font-semibold text-gray-700">{formatCurrency(refundModal ? getRefundableAmount(refundModal) : 0, refundModal?.currency)}</span>
                  </p>
                </div>

                <div>
                  <label htmlFor="refundReason" className="block text-sm font-semibold text-gray-800 mb-2">
                    Reason <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="refundReason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition resize-none"
                    placeholder="Enter refund reason..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => {
                    setRefundModal(null);
                    setRefundAmount("");
                    setRefundReason("");
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                >
                  Cancel
                </button>

                {/* Instead of calling refund immediately, open a confirmation modal */}
                <button
                  onClick={() => setRefundConfirmOpen(true)}
                  disabled={!!actionLoading[refundModal._id] || !refundAmount || parseFloat(refundAmount) <= 0 || parseFloat(refundAmount) > getRefundableAmount(refundModal)}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                >
                  Review & Process
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundModal && refundConfirmOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setRefundConfirmOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl flex items-center justify-center flex-shrink-0 border border-orange-200">
                  <RefreshCw size={26} className="text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Confirm refund</h3>
                  <p className="text-sm text-gray-600">Please review the refund details before processing.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium mb-1">Order</div>
                  <div className="font-semibold text-gray-900">#{shortId(refundModal._id)}</div>
                  <div className="text-sm text-gray-600">{refundModal.shippingAddress?.email || refundModal.billingAddress?.email || "No email"}</div>
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium mb-1">Refund amount</div>
                  <div className="font-semibold text-gray-900 text-lg">{formatCurrency(parseFloat(refundAmount || "0") || 0, (refundModal.currency || "GBP").toUpperCase())}</div>
                </div>

                {refundReason && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <div className="text-xs text-gray-500 font-medium mb-1">Reason</div>
                    <div className="text-sm text-gray-700">{refundReason}</div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setRefundConfirmOpen(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                >
                  Edit
                </button>
                <button
                  onClick={refundOrder}
                  disabled={!!actionLoading[refundModal._id]}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                >
                  {actionLoading[refundModal._id] ? "Processing..." : "Confirm and Refund"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Modal & Confirmation (unchanged) */}
      {shipmentModal && !shipmentConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setShipmentModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 sm:p-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-blue-200">
                <Truck size={32} className="text-blue-600" />
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Add Shipment Details</h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Track shipment for order <span className="font-semibold text-gray-900">#{shortId(shipmentModal._id)}</span>
              </p>

              <div className="space-y-5">
                <div>
                  <label htmlFor="shipmentProvider" className="block text-sm font-semibold text-gray-800 mb-2">
                    Shipment Provider <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="shipmentProvider"
                      value={shipmentProvider}
                      onChange={(e) => setShipmentProvider(e.target.value as ShipmentProvider)}
                      className="appearance-none w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white font-medium cursor-pointer"
                    >
                      {SHIPMENT_PROVIDERS.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                  </div>
                </div>

                <div>
                  <label htmlFor="trackingCode" className="block text-sm font-semibold text-gray-800 mb-2">
                    Tracking Code <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="trackingCode"
                    type="text"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-mono"
                    placeholder="Enter tracking code..."
                  />
                  <p className="text-xs text-gray-500 mt-2">You can add this later if not available yet. </p>
                </div>

                <div>
                  <label htmlFor="estimatedDelivery" className="block text-sm font-semibold text-gray-800 mb-2">
                    Estimated Delivery <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="estimatedDelivery"
                    type="date"
                    value={estimatedDelivery}
                    onChange={(e) => setEstimatedDelivery(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => {
                    setShipmentModal(null);
                    setShipmentProvider("royal-mail");
                    setTrackingCode("");
                    setEstimatedDelivery("");
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShipmentConfirmOpen(true)}
                  disabled={!!actionLoading[shipmentModal._id]}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                >
                  {actionLoading[shipmentModal._id] ? "Adding..." : "Review & Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shipmentModal && shipmentConfirmOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm shipment details" onClick={() => setShipmentConfirmOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0 border border-blue-200">
                  <Truck size={26} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Confirm Shipment</h3>
                  <p className="text-sm text-gray-600">Please review before submitting</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Order Details</div>
                  <div className="font-semibold text-gray-900 text-lg mb-1">#{shortId(shipmentModal._id)}</div>
                  <div className="text-sm text-gray-700 mb-1">
                    {[shipmentModal.shippingAddress?.firstName, shipmentModal.shippingAddress?.lastName].filter(Boolean).join(" ") || "Guest Order"}
                  </div>
                  <div className="text-sm text-gray-600 flex items-center gap-2">
                    <Mail size={14} />
                    {shipmentModal.shippingAddress?.email || shipmentModal.billingAddress?.email || "No email"}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                  <div className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-2">Shipment Provider</div>
                  <div className="font-semibold text-blue-900 text-lg">
                    {SHIPMENT_PROVIDERS.find((p) => p.value === shipmentProvider)?.label || shipmentProvider}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Tracking Code</div>
                  <div className="font-mono text-sm text-gray-900 break-all">
                    {trackingCode || <span className="text-gray-400 italic">Not provided</span>}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Estimated Delivery</div>
                  <div className="font-semibold text-gray-900">
                    {estimatedDelivery ? new Date(estimatedDelivery).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    }) : <span className="text-gray-400 italic">Not provided</span>}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setShipmentConfirmOpen(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => addShipment()}
                  disabled={!!actionLoading[shipmentModal._id]}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                  aria-label="Confirm and add shipment"
                >
                  {actionLoading[shipmentModal._id] ? "Adding..." : "Confirm & Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 sm:p-8">
              <div className="w-16 h-16 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-200">
                <Trash2 size={32} className="text-red-600" />
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Delete Order? </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to delete order <span className="font-semibold text-gray-900">#{shortId(deleteConfirm._id)}</span>?
                <span className="block mt-2 text-red-600 font-medium">This action cannot be undone.</span>
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteOrder(deleteConfirm._id)}
                  disabled={!!actionLoading[deleteConfirm._id]}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                >
                  {actionLoading[deleteConfirm._id] ? "Deleting..." : "Delete Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}