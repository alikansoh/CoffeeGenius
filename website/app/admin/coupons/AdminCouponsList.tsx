"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  AlertCircle,
  X,
  Tag,
  Calendar,
  Users,
  ShoppingBag,
  Pencil,
} from "lucide-react";

type Coupon = {
  _id: string;
  code?: string;
  name: string;
  description?: string;
  type:
    | "NTH_ITEM"
    | "SPEND_THRESHOLD"
    | "BUY_X_GET_Y_FREE"
    | "PERCENT_OFF_PRODUCT";
  isActive: boolean;
  isAutomatic: boolean;
  usageCount: number;
  usageLimit?: number;
  maxUsagePerUser?: number;
  startsAt?: string;
  expiresAt?: string;
};

const TYPE_LABELS: Record<string, string> = {
  NTH_ITEM: "Nth Item Discount",
  SPEND_THRESHOLD: "Spend Threshold",
  BUY_X_GET_Y_FREE: "Buy X Get Y Free",
  PERCENT_OFF_PRODUCT: "Percent Off Product",
};

type ToastType = "error" | "success";

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: ToastType;
  onClose: () => void;
}) {
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
      {type === "error" ? <AlertCircle size={20} /> : <Tag size={20} />}
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 hover:bg-white/20 rounded-lg transition"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function AdminCouponsList() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coupons");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setCoupons(json.coupons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (id: string) => {
    try {
      const res = await fetch(`/api/coupons/${id}/toggle`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to toggle");

      setCoupons((prev) =>
        prev.map((c) => (c._id === id ? { ...c, isActive: json.isActive } : c))
      );
      setSuccess(json.isActive ? "Coupon activated" : "Coupon deactivated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle coupon");
    }
  };

  const deleteCoupon = async (id: string, name: string) => {
    if (!confirm(`Delete coupon "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/coupons/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");

      setCoupons((prev) => prev.filter((c) => c._id !== id));
      setSuccess("Coupon deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete coupon");
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Coupons & Discounts
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                Create and manage coupon codes and automatic discounts
              </p>
            </div>
            <button
              onClick={() => router.push("/admin/coupons/create")}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md font-medium text-sm"
            >
              <Plus size={18} />
              Create Coupon
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-600 mt-4">Loading coupons...</p>
          </div>
        ) : coupons.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
            <Tag size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-4">No coupons found</p>
            <button
              onClick={() => router.push("/admin/coupons/create")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium text-sm"
            >
              <Plus size={16} />
              Create Your First Coupon
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.map((coupon) => (
              <div
                key={coupon._id}
                className={`bg-white rounded-2xl border-2 ${
                  coupon.isActive ? "border-gray-200" : "border-gray-100"
                } overflow-hidden shadow-sm hover:shadow-md transition-all`}
              >
                <div
                  className={`h-1 ${
                    coupon.isActive ? "bg-green-500" : "bg-gray-300"
                  }`}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">
                        {coupon.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {TYPE_LABELS[coupon.type]}
                      </p>
                    </div>
                    {coupon.isAutomatic && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                        Auto
                      </span>
                    )}
                  </div>

                  {coupon.code && (
                    <div className="mb-4">
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-900 font-mono text-sm rounded-lg">
                        <Tag size={12} />
                        {coupon.code}
                      </span>
                    </div>
                  )}

                  {coupon.description && (
                    <p className="text-sm text-gray-600 mb-4">
                      {coupon.description}
                    </p>
                  )}

                  <div className="space-y-2 text-sm mb-5">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={14} />
                      <span>
                        {coupon.usageCount} / {coupon.usageLimit ?? "∞"} uses
                      </span>
                    </div>
                    {coupon.maxUsagePerUser && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <ShoppingBag size={14} />
                        <span>Max {coupon.maxUsagePerUser} per email</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={14} />
                      <span>Valid until {formatDate(coupon.expiresAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/admin/coupons/${coupon._id}`)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs sm:text-sm hover:bg-gray-50 transition font-medium"
                    >
                      <Pencil size={14} /> Edit
                    </button>

                    <button
                      onClick={() => toggleActive(coupon._id)}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                        coupon.isActive
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}
                    >
                      {coupon.isActive ? (
                        <>
                          <PowerOff size={14} /> Deactivate
                        </>
                      ) : (
                        <>
                          <Power size={14} /> Activate
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => deleteCoupon(coupon._id, coupon.name)}
                      className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm hover:bg-red-50 transition font-medium"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}
    </main>
  );
}