"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  X,
  Calendar,
  Mail,
  Phone,
  Package,
  AlertCircle,
  CheckCircle,
  Clock,
  Ban,
  PlayCircle,
  Trash2,
} from "lucide-react";

type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "unpaid";

type ShippingAddress = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
};

type Subscription = {
  _id: string;
  email?: string;
  name?: string;
  phone?: string;
  stripeSubscriptionId: string;
  variantLabel: string;
  normalPrice: number;
  discountPercent: number;
  subscriptionPrice: number;
  frequencyWeeks: number;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  introActive?: boolean;
  introDiscountPercent?: number;
  introCyclesLimit?: number;
  introCyclesCompleted?: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  canceledAt?: string;
  shippingAddress?: ShippingAddress;
  createdAt: string;
};

function getStatusColor(status?: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "incomplete":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "past_due":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "unpaid":
      return "bg-red-50 text-red-700 border-red-200";
    case "canceled":
      return "bg-gray-100 text-gray-500 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "active":
      return <CheckCircle size={13} />;
    case "incomplete":
      return <Clock size={13} />;
    case "past_due":
    case "unpaid":
      return <AlertCircle size={13} />;
    case "canceled":
      return <Ban size={13} />;
    default:
      return null;
  }
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "incomplete", label: "Incomplete" },
  { value: "past_due", label: "Past due" },
  { value: "unpaid", label: "Unpaid" },
  { value: "canceled", label: "Canceled" },
];

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "cancel" | "cancel_at_period_end" | "resume" | "delete" | null
  >(null);

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/subscriptions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load subscriptions");
      }
      setSubscriptions(data.subscriptions || []);
      setPages(data.pages || 1);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchSubscriptions();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const totalActive = counts["active"] || 0;
  const totalRevenuePerCycle = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + (s.subscriptionPrice || 0), 0),
    [subscriptions]
  );

  const runAction = async (sub: Subscription, action: "cancel" | "cancel_at_period_end" | "resume") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${sub._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Action failed");
      }
      setSelected(data.subscription);
      setConfirmAction(null);
      await fetchSubscriptions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteSub = async (sub: Subscription) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${sub._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Delete failed");
      }
      setSelected(null);
      setConfirmAction(null);
      await fetchSubscriptions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalActive} active — £{totalRevenuePerCycle.toFixed(2)} recurring per cycle (this page)
          </p>
        </div>
        <button
          onClick={fetchSubscriptions}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, or product…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-300"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  status === f.value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {f.label}
                {f.value !== "all" && counts[f.value] ? ` (${counts[f.value]})` : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 sm:py-24 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-400 text-sm">
          Loading subscriptions…
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-16 sm:py-24 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Package size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No subscriptions found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {subscriptions.map((s) => (
            <article
              key={s._id}
              onClick={() => setSelected(s)}
              className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 p-4 sm:p-5 cursor-pointer"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm truncate">{s.variantLabel}</p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${getStatusColor(
                        s.status
                      )}`}
                    >
                      <StatusIcon status={s.status} />
                      {s.status.replace("_", " ")}
                    </span>
                    {s.cancelAtPeriodEnd && s.status !== "canceled" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                        Ending soon
                      </span>
                    )}
                    {s.introActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                        Intro {s.introDiscountPercent}% off
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                    {s.email && (
                      <span className="flex items-center gap-1">
                        <Mail size={11} /> {s.email}
                      </span>
                    )}
                    {s.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {s.phone}
                      </span>
                    )}
                    <span>Every {s.frequencyWeeks} wk{s.frequencyWeeks > 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-gray-900">£{s.subscriptionPrice.toFixed(2)}</p>
                  <p className="text-[11px] text-gray-400">per delivery</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 cursor-pointer"
          >
            Prev
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelected(null);
            setConfirmAction(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-gray-900">{selected.variantLabel}</h2>
                <span
                  className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(
                    selected.status
                  )}`}
                >
                  <StatusIcon status={selected.status} />
                  {selected.status.replace("_", " ")}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setConfirmAction(null);
                }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Price / delivery</p>
                  <p className="font-semibold text-gray-900">£{selected.subscriptionPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Frequency</p>
                  <p className="font-semibold text-gray-900">
                    Every {selected.frequencyWeeks} wk{selected.frequencyWeeks > 1 ? "s" : ""}
                  </p>
                </div>
                {selected.currentPeriodEnd && (
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide">Next delivery</p>
                    <p className="font-semibold text-gray-900 flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(selected.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Delivery</p>
                  <p className="font-semibold text-emerald-600">Free</p>
                </div>
              </div>

              {(selected.email || selected.phone) && (
                <div className="pt-3 border-t border-gray-100 space-y-1">
                  {selected.name && <p className="font-medium text-gray-900">{selected.name}</p>}
                  {selected.email && (
                    <p className="text-gray-500 flex items-center gap-1.5">
                      <Mail size={12} /> {selected.email}
                    </p>
                  )}
                  {selected.phone && (
                    <p className="text-gray-500 flex items-center gap-1.5">
                      <Phone size={12} /> {selected.phone}
                    </p>
                  )}
                </div>
              )}

              {selected.shippingAddress?.line1 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Shipping address</p>
                  <p className="text-gray-700">
                    {selected.shippingAddress.line1}
                    {selected.shippingAddress.unit ? `, ${selected.shippingAddress.unit}` : ""}
                    <br />
                    {selected.shippingAddress.city} {selected.shippingAddress.postcode}
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                Stripe subscription: <span className="font-mono">{selected.stripeSubscriptionId}</span>
              </p>
            </div>

            <div className="p-5 border-t border-gray-100 flex flex-wrap gap-2">
              {!confirmAction ? (
                <>
                  {selected.status !== "canceled" && (
                    <>
                      {selected.cancelAtPeriodEnd ? (
                        <button
                          onClick={() => setConfirmAction("resume")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 cursor-pointer"
                        >
                          <PlayCircle size={14} />
                          Resume subscription
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction("cancel_at_period_end")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                          <Clock size={14} />
                          Cancel at period end
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmAction("cancel")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 cursor-pointer"
                      >
                        <Ban size={14} />
                        Cancel immediately
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setConfirmAction("delete")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              ) : (
                <div className="w-full">
                  <p className="text-sm text-gray-700 mb-3">
                    {confirmAction === "resume"
                      ? "Resume this subscription so it keeps renewing?"
                      : confirmAction === "cancel"
                      ? "Cancel this subscription immediately in Stripe? This can't be undone."
                      : confirmAction === "delete"
                      ? "Permanently delete this subscription record? This cancels it in Stripe (if still active) and removes it from the admin list — its past orders/invoices are kept. This can't be undone."
                      : "Cancel this subscription at the end of the current period?"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        confirmAction === "delete" ? deleteSub(selected) : runAction(selected, confirmAction)
                      }
                      className={`px-3.5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 cursor-pointer ${
                        confirmAction === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"
                      }`}
                    >
                      {actionLoading ? "Working…" : confirmAction === "delete" ? "Delete permanently" : "Confirm"}
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => setConfirmAction(null)}
                      className="px-3.5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
