"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  Check,
  Trash2,
  Search,
  X,
  Tag,
  Percent,
  ShoppingCart,
} from "lucide-react";
import Image from "next/image";
import { getCloudinaryThumbnail } from "@/app/utils/cloudinary";

type CouponType =
  | "NTH_ITEM"
  | "SPEND_THRESHOLD"
  | "BUY_X_GET_Y_FREE"
  | "PERCENT_OFF_PRODUCT"
  | "SUBSCRIPTION_INTRO";

type AppliesTo = "all" | "coffee" | "equipment" | "specific_products";

interface PickerProduct {
  _id: string;
  name: string;
  type: "coffee" | "equipment";
  img?: string;
  origin?: string;
  slug: string;
}

interface PickerVariant {
  _id: string;
  size: string;
  grind: string;
  roastType: string;
  price: number;
}

const VARIANT_PREFIX = "variant:";

function variantLabel(v: PickerVariant): string {
  return `${v.size} · ${v.grind}`;
}

interface FormData {
  code: string;
  name: string;
  description: string;
  type: CouponType;
  isActive: boolean;
  isAutomatic: boolean;

  nthItem: { nth: string; percentOff: string };
  spendThreshold: { threshold: string; percentOff: string };
  buyXGetY: { x: string; y: string; productIds: string };
  productDiscount: { productIds: string; percentOff: string };
  subscriptionIntro: { cycles: string; percentOff: string; productIds: string };
  /** Subscription intro offers can apply to every subscribable coffee, or be scoped to
   *  specific ones — kept separate from the generic `appliesTo` select since that one is
   *  disabled/hijacked for types with their own product picker. */
  subscriptionIntroScopeAll: boolean;

  minimumOrderAmount: string;
  usageLimit: string;
  maxUsagePerUser: string;
  startsAt: string;
  expiresAt: string;
  appliesTo: AppliesTo;
  productIds: string;
}

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
      {type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
      <span className="text-sm font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/20 rounded-lg transition">
        <X size={16} />
      </button>
    </div>
  );
}

const TYPE_OPTIONS: { value: CouponType; label: string }[] = [
  { value: "NTH_ITEM", label: "Nth Item Discount — every Nth item discounted" },
  { value: "SPEND_THRESHOLD", label: "Spend Threshold — discount when subtotal reaches amount" },
  { value: "BUY_X_GET_Y_FREE", label: "Buy X Get Y Free — e.g. buy 2 get 1 free" },
  { value: "PERCENT_OFF_PRODUCT", label: "Percent Off Product — discount on selected products" },
  {
    value: "SUBSCRIPTION_INTRO",
    label: "Subscription Intro Offer — extra discount for a customer's first N deliveries",
  },
];

const TYPE_EXPLAINERS: Record<CouponType, string> = {
  NTH_ITEM:
    "Discounts one item out of every group of N in the cart — the cheapest one in each group. Good for \"every 3rd bag half price\" style deals.",
  SPEND_THRESHOLD:
    "Gives a percentage off the whole order, but only once the cart subtotal reaches the amount you set. Good for \"spend £50, get 10% off\" deals.",
  BUY_X_GET_Y_FREE:
    "Customer pays for X items and gets Y more free, from the products you pick below (or any product if left empty). The cheapest items are the ones made free.",
  PERCENT_OFF_PRODUCT:
    "A straight percentage discount, but only on the specific products (or variants) you pick below — everything else in the cart stays full price.",
  SUBSCRIPTION_INTRO:
    "Applies automatically (no code) to a new subscription on the coffee/variant you pick below — replaces the normal subscribe price for the customer's first N deliveries, then reverts to the normal subscribe price for every delivery after that.",
};

function nthItemExample(nth: string, percentOff: string): string {
  const n = parseInt(nth, 10) || 3;
  const p = parseFloat(percentOff) || 50;
  return `Example: the ${n === 1 ? "" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"} `}cheapest item in every group of ${n} gets ${p}% off.`;
}

function spendThresholdExample(threshold: string, percentOff: string): string {
  const t = parseFloat(threshold) || 50;
  const p = parseFloat(percentOff) || 10;
  return `Example: a customer spending £${t.toFixed(2)} or more gets ${p}% off their entire order.`;
}

function buyXGetYExample(x: string, y: string): string {
  const xNum = parseInt(x, 10) || 2;
  const yNum = parseInt(y, 10) || 1;
  return `Example: for every ${xNum + yNum} eligible items in the cart, the customer pays for ${xNum} and the cheapest ${yNum} are free.`;
}

function percentOffProductExample(percentOff: string): string {
  const p = parseFloat(percentOff) || 20;
  return `Example: every selected product/variant in the cart is discounted by ${p}%.`;
}

function subscriptionIntroExample(cycles: string, percentOff: string): string {
  const c = parseInt(cycles, 10) || 1;
  const p = parseFloat(percentOff) || 20;
  return `Example: a new subscriber pays ${p}% off for their first ${c} deliver${c === 1 ? "y" : "ies"}, then the normal subscribe price from delivery ${c + 1} onward.`;
}

const APPLIES_TO_OPTIONS: { value: AppliesTo; label: string }[] = [
  { value: "all", label: "All products" },
  { value: "coffee", label: "Coffee only" },
  { value: "equipment", label: "Equipment only" },
  { value: "specific_products", label: "Specific products" },
];

function parsePositiveInt(value: string): number | undefined {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 1) return undefined;
  return num;
}

function parsePositiveFloat(value: string): number | undefined {
  const num = parseFloat(value);
  if (Number.isNaN(num) || num < 0) return undefined;
  return num;
}

function parsePercent(value: string): number | undefined {
  const num = parseFloat(value);
  if (Number.isNaN(num) || num < 0 || num > 100) return undefined;
  return num;
}

function parseProductIds(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function formatSelectedIds(ids: string[]): string {
  return ids.join(", ");
}

function formatDateForInput(date?: string | Date): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

const TYPES_WITH_OWN_PICKER = new Set<CouponType>([
  "BUY_X_GET_Y_FREE",
  "PERCENT_OFF_PRODUCT",
  "SUBSCRIPTION_INTRO",
]);

type ProductPickerFieldPath =
  | "productIds"
  | "buyXGetY.productIds"
  | "productDiscount.productIds"
  | "subscriptionIntro.productIds";

export default function AdminEditCouponForm() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const couponId = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState<"all" | "coffee" | "equipment">("all");
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [expandedCoffeeId, setExpandedCoffeeId] = useState<string | null>(null);
  const [variantsByCoffee, setVariantsByCoffee] = useState<Record<string, PickerVariant[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<string | null>(null);

  const toggleVariantPanel = async (coffeeId: string) => {
    if (expandedCoffeeId === coffeeId) {
      setExpandedCoffeeId(null);
      return;
    }
    setExpandedCoffeeId(coffeeId);
    if (variantsByCoffee[coffeeId]) return;

    setLoadingVariants(coffeeId);
    try {
      const res = await fetch(`/api/variants?coffeeId=${coffeeId}`);
      const json = await res.json();
      if (res.ok) {
        setVariantsByCoffee((prev) => ({ ...prev, [coffeeId]: json.data || [] }));
      }
    } catch (err) {
      console.error("Failed to load variants:", err);
    } finally {
      setLoadingVariants(null);
    }
  };

  const [formData, setFormData] = useState<FormData>({
    code: "",
    name: "",
    description: "",
    type: "SPEND_THRESHOLD",
    isActive: true,
    isAutomatic: false,
    nthItem: { nth: "", percentOff: "" },
    spendThreshold: { threshold: "50", percentOff: "10" },
    buyXGetY: { x: "2", y: "1", productIds: "" },
    productDiscount: { productIds: "", percentOff: "20" },
    subscriptionIntro: { cycles: "1", percentOff: "20", productIds: "" },
    subscriptionIntroScopeAll: false,
    minimumOrderAmount: "",
    usageLimit: "",
    maxUsagePerUser: "",
    startsAt: "",
    expiresAt: "",
    appliesTo: "all",
    productIds: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/products/for-picker");
        const json = await res.json();
        if (res.ok) setProducts(json.products || []);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoadingProducts(false);
      }
    }
    fetchProducts();
  }, []);

  useEffect(() => {
    async function fetchCoupon() {
      try {
        const res = await fetch(`/api/coupons/${couponId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load coupon");

        const c = json.coupon;

        const type: CouponType = c.type || "SPEND_THRESHOLD";
        const appliesTo: AppliesTo = c.appliesTo || "all";

        setFormData({
          code: c.code || "",
          name: c.name || "",
          description: c.description || "",
          type,
          isActive: !!c.isActive,
          isAutomatic: !!c.isAutomatic,
          nthItem: {
            nth: c.nthItem?.nth?.toString() || "",
            percentOff: c.nthItem?.percentOff?.toString() || "",
          },
          spendThreshold: {
            threshold: c.spendThreshold?.threshold?.toString() || "50",
            percentOff: c.spendThreshold?.percentOff?.toString() || "10",
          },
          buyXGetY: {
            x: c.buyXGetY?.x?.toString() || "2",
            y: c.buyXGetY?.y?.toString() || "1",
            productIds: Array.isArray(c.buyXGetY?.productIds) ? c.buyXGetY.productIds.join(", ") : "",
          },
          productDiscount: {
            productIds: Array.isArray(c.productDiscount?.productIds) ? c.productDiscount.productIds.join(", ") : "",
            percentOff: c.productDiscount?.percentOff?.toString() || "20",
          },
          subscriptionIntro: {
            cycles: c.subscriptionIntro?.cycles?.toString() || "1",
            percentOff: c.subscriptionIntro?.percentOff?.toString() || "20",
            productIds:
              type === "SUBSCRIPTION_INTRO" && Array.isArray(c.productIds)
                ? c.productIds.join(", ")
                : "",
          },
          subscriptionIntroScopeAll: type === "SUBSCRIPTION_INTRO" && appliesTo === "all",
          minimumOrderAmount: c.minimumOrderAmount?.toString() || "",
          usageLimit: c.usageLimit?.toString() || "",
          maxUsagePerUser: c.maxUsagePerUser?.toString() || "",
          startsAt: formatDateForInput(c.startsAt),
          expiresAt: formatDateForInput(c.expiresAt),
          appliesTo,
          productIds: Array.isArray(c.productIds) ? c.productIds.join(", ") : "",
        });
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : "Failed to load coupon",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchCoupon();
  }, [couponId]);

  useEffect(() => {
    if (TYPES_WITH_OWN_PICKER.has(formData.type) && formData.appliesTo !== "all") {
      setFormData((prev) => ({ ...prev, appliesTo: "all", productIds: "" }));
      setErrors((prev) => ({ ...prev, productIds: "" }));
    }
  }, [formData.type, formData.appliesTo]);

  const setField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const setNested = (group: keyof FormData, field: string, value: string) => {
    setFormData((prev) => {
      const current = prev[group] as Record<string, string>;
      return { ...prev, [group]: { ...current, [field]: value } };
    });
  };

  const toggleProductId = (
    id: string,
    fieldPath: ProductPickerFieldPath
  ) => {
    const getCurrent = (): string[] => {
      if (fieldPath === "productIds") return parseProductIds(formData.productIds);
      if (fieldPath === "buyXGetY.productIds") return parseProductIds(formData.buyXGetY.productIds);
      if (fieldPath === "subscriptionIntro.productIds")
        return parseProductIds(formData.subscriptionIntro.productIds);
      return parseProductIds(formData.productDiscount.productIds);
    };

    const setValue = (value: string) => {
      if (fieldPath === "productIds") setField("productIds", value);
      else if (fieldPath === "buyXGetY.productIds") setNested("buyXGetY", "productIds", value);
      else if (fieldPath === "subscriptionIntro.productIds")
        setNested("subscriptionIntro", "productIds", value);
      else setNested("productDiscount", "productIds", value);
    };

    const current = getCurrent();
    const updated = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setValue(formatSelectedIds(updated));
  };

  const getSelectedIdsForField = (
    fieldPath: ProductPickerFieldPath
  ): string[] => {
    if (fieldPath === "productIds") return parseProductIds(formData.productIds);
    if (fieldPath === "buyXGetY.productIds") return parseProductIds(formData.buyXGetY.productIds);
    if (fieldPath === "subscriptionIntro.productIds")
      return parseProductIds(formData.subscriptionIntro.productIds);
    return parseProductIds(formData.productDiscount.productIds);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.origin || "").toLowerCase().includes(productSearch.toLowerCase());
    const matchesFilter = productFilter === "all" || p.type === productFilter;
    return matchesSearch && matchesFilter;
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (formData.type !== "SUBSCRIPTION_INTRO" && !formData.isAutomatic && !formData.code.trim()) {
      newErrors.code = "Code is required for manual coupons";
    }

    switch (formData.type) {
      case "NTH_ITEM": {
        if (!parsePositiveInt(formData.nthItem.nth)) newErrors["nthItem.nth"] = "Enter a valid number";
        if (parsePercent(formData.nthItem.percentOff) === undefined) {
          newErrors["nthItem.percentOff"] = "Enter 0-100";
        }
        break;
      }
      case "SPEND_THRESHOLD": {
        if (parsePositiveFloat(formData.spendThreshold.threshold) === undefined) {
          newErrors["spendThreshold.threshold"] = "Enter valid amount";
        }
        if (parsePercent(formData.spendThreshold.percentOff) === undefined) {
          newErrors["spendThreshold.percentOff"] = "Enter 0-100";
        }
        break;
      }
      case "BUY_X_GET_Y_FREE": {
        if (!parsePositiveInt(formData.buyXGetY.x)) newErrors["buyXGetY.x"] = "Enter valid number";
        if (!parsePositiveInt(formData.buyXGetY.y)) newErrors["buyXGetY.y"] = "Enter valid number";
        break;
      }
      case "PERCENT_OFF_PRODUCT": {
        if (parseProductIds(formData.productDiscount.productIds).length === 0) {
          newErrors["productDiscount.productIds"] = "Select at least one product";
        }
        if (parsePercent(formData.productDiscount.percentOff) === undefined) {
          newErrors["productDiscount.percentOff"] = "Enter 0-100";
        }
        break;
      }
      case "SUBSCRIPTION_INTRO": {
        if (
          !formData.subscriptionIntroScopeAll &&
          parseProductIds(formData.subscriptionIntro.productIds).length === 0
        ) {
          newErrors["subscriptionIntro.productIds"] = "Select at least one coffee/variant";
        }
        const cycles = parsePositiveInt(formData.subscriptionIntro.cycles);
        if (!cycles || cycles < 1 || cycles > 4) {
          newErrors["subscriptionIntro.cycles"] = "Enter 1-4";
        }
        if (parsePercent(formData.subscriptionIntro.percentOff) === undefined) {
          newErrors["subscriptionIntro.percentOff"] = "Enter 0-100";
        }
        break;
      }
    }

    if (formData.appliesTo === "specific_products" && !formData.productIds.trim()) {
      newErrors.productIds = "Select at least one product";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      code: formData.code.trim() || undefined,
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      type: formData.type,
      isActive: formData.isActive,
      isAutomatic: formData.isAutomatic,
      minimumOrderAmount: parsePositiveFloat(formData.minimumOrderAmount),
      usageLimit: parsePositiveInt(formData.usageLimit),
      maxUsagePerUser: parsePositiveInt(formData.maxUsagePerUser),
      startsAt: formData.startsAt || undefined,
      expiresAt: formData.expiresAt || undefined,
      appliesTo: formData.appliesTo,
      productIds: formData.appliesTo === "specific_products" ? parseProductIds(formData.productIds) : [],
    };

    switch (formData.type) {
      case "NTH_ITEM":
        payload.nthItem = {
          nth: parsePositiveInt(formData.nthItem.nth),
          percentOff: parsePercent(formData.nthItem.percentOff),
        };
        break;
      case "SPEND_THRESHOLD":
        payload.spendThreshold = {
          threshold: parsePositiveFloat(formData.spendThreshold.threshold),
          percentOff: parsePercent(formData.spendThreshold.percentOff),
        };
        break;
      case "BUY_X_GET_Y_FREE":
        payload.buyXGetY = {
          x: parsePositiveInt(formData.buyXGetY.x),
          y: parsePositiveInt(formData.buyXGetY.y),
          productIds: parseProductIds(formData.buyXGetY.productIds),
        };
        break;
      case "PERCENT_OFF_PRODUCT":
        payload.productDiscount = {
          productIds: parseProductIds(formData.productDiscount.productIds),
          percentOff: parsePercent(formData.productDiscount.percentOff),
        };
        break;
      case "SUBSCRIPTION_INTRO":
        payload.subscriptionIntro = {
          cycles: parsePositiveInt(formData.subscriptionIntro.cycles),
          percentOff: parsePercent(formData.subscriptionIntro.percentOff),
        };
        payload.appliesTo = formData.subscriptionIntroScopeAll ? "all" : "specific_products";
        payload.productIds = formData.subscriptionIntroScopeAll
          ? []
          : parseProductIds(formData.subscriptionIntro.productIds);
        payload.isAutomatic = true;
        break;
    }

    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!validate()) {
      setToast({ message: "Please fix the errors", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/coupons/${couponId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update coupon");

      setToast({ message: "Coupon updated successfully", type: "success" });
      setTimeout(() => router.push("/admin/coupons"), 1200);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to update coupon",
        type: "error",
      });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this coupon? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/coupons/${couponId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");

      setToast({ message: "Coupon deleted", type: "success" });
      setTimeout(() => router.push("/admin/coupons"), 1200);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to delete coupon",
        type: "error",
      });
    }
  };

  const ProductPicker = ({
    fieldPath,
    label,
    allowEmpty = false,
  }: {
    fieldPath: ProductPickerFieldPath;
    label: string;
    allowEmpty?: boolean;
  }) => {
    const selectedIds = getSelectedIdsForField(fieldPath);

    return (
      <div className="mt-4">
        <label className="block text-sm font-bold text-gray-900 mb-2">{label}</label>

        {selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedIds.map((id) => {
              let label = id;
              if (id.startsWith(VARIANT_PREFIX)) {
                const variantId = id.slice(VARIANT_PREFIX.length);
                const owningCoffeeId = Object.keys(variantsByCoffee).find((cid) =>
                  variantsByCoffee[cid].some((v) => v._id === variantId)
                );
                const variant = owningCoffeeId
                  ? variantsByCoffee[owningCoffeeId].find((v) => v._id === variantId)
                  : undefined;
                const coffeeName = owningCoffeeId
                  ? products.find((x) => x._id === owningCoffeeId)?.name
                  : undefined;
                label = variant
                  ? `${coffeeName ? coffeeName + " — " : ""}${variantLabel(variant)}`
                  : `Variant ${variantId}`;
              } else {
                const p = products.find((x) => x._id === id);
                label = p?.name || id;
              }
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg"
                >
                  {label}
                  <button type="button" onClick={() => toggleProductId(id, fieldPath)} className="hover:text-red-300">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="border-2 border-gray-200 rounded-xl p-3">
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => setProductSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value as "all" | "coffee" | "equipment")}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All</option>
              <option value="coffee">Coffee</option>
              <option value="equipment">Equipment</option>
            </select>
          </div>

          {loadingProducts ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-72 overflow-y-auto p-1">
              {filteredProducts.map((product) => {
                const selected = selectedIds.includes(product._id);
                return (
                  <button
                    key={product._id}
                    type="button"
                    onClick={() => toggleProductId(product._id, fieldPath)}
                    className={`relative flex flex-col items-center text-center p-2 rounded-xl border-2 transition-all ${
                      selected ? "border-gray-900 bg-gray-50" : "border-gray-100 hover:border-gray-300"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 mb-2">
                      {product.img ? (
                        <Image
                          src={getCloudinaryThumbnail(product.img, 200)}
                          alt={product.name}
                          width={64}
                          height={64}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No img</div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-900 line-clamp-2">{product.name}</span>
                    {product.origin && <span className="text-[10px] text-gray-500">{product.origin}</span>}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full mt-1 ${
                        product.type === "coffee" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {product.type}
                    </span>

                    {product.type === "coffee" && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVariantPanel(product._id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleVariantPanel(product._id);
                          }
                        }}
                        className="text-[10px] text-blue-600 underline mt-1 cursor-pointer"
                      >
                        {loadingVariants === product._id
                          ? "Loading…"
                          : expandedCoffeeId === product._id
                          ? "Hide variants"
                          : "Pick variant"}
                      </span>
                    )}

                    {selected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {expandedCoffeeId && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Target a specific variant of &ldquo;
                {products.find((p) => p._id === expandedCoffeeId)?.name}&rdquo; instead of the
                whole coffee:
              </p>
              {loadingVariants === expandedCoffeeId ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(variantsByCoffee[expandedCoffeeId] || []).map((v) => {
                    const vid = `${VARIANT_PREFIX}${v._id}`;
                    const vSelected = selectedIds.includes(vid);
                    return (
                      <button
                        key={v._id}
                        type="button"
                        onClick={() => toggleProductId(vid, fieldPath)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition ${
                          vSelected
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {variantLabel(v)} — £{v.price.toFixed(2)}
                      </button>
                    );
                  })}
                  {(variantsByCoffee[expandedCoffeeId] || []).length === 0 && (
                    <p className="text-xs text-gray-500">No variants found for this coffee.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!loadingProducts && filteredProducts.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-6">No products found</p>
          )}

          {selectedIds.length === 0 && !allowEmpty && (
            <p className="text-xs text-gray-500 mt-2">Select at least one product</p>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        <p className="text-sm text-gray-600 mt-4">Loading coupon...</p>
      </main>
    );
  }

  const showScopeProductPicker =
    formData.appliesTo === "specific_products" && !TYPES_WITH_OWN_PICKER.has(formData.type);
  const appliesToDisabled = TYPES_WITH_OWN_PICKER.has(formData.type);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }
      `}</style>

      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <button
            onClick={() => router.push("/admin/coupons")}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={18} /> Back to coupons
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Coupon</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                Update the discount code or automatic promotion. Every field below has a short explanation under it.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-medium text-sm"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Tag size={20} /> Basic Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Coupon Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={formData.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Summer Sale 20% Off"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Shown to the customer on their receipt/invoice when the discount is applied — keep it clear and short.
                  </p>
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-gray-900 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="Optional description for admin reference"
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Internal notes only — customers never see this.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Coupon Code</label>
                  <input
                    value={formData.code}
                    onChange={(e) => setField("code", e.target.value.toUpperCase())}
                    placeholder="SUMMER20"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                  />
                  {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    What the customer types at checkout. Leave it blank only if you tick &ldquo;Automatic&rdquo; below.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Discount Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setField("type", e.target.value as CouponType)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                <span className="text-blue-500 mt-0.5">ℹ️</span>
                <p className="text-xs text-blue-900 leading-relaxed">{TYPE_EXPLAINERS[formData.type]}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-4">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setField("isActive", e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span>
                    Active
                    <span className="block text-xs text-gray-500">Untick to pause this coupon without deleting it</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isAutomatic}
                    onChange={(e) => setField("isAutomatic", e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span>
                    Automatic (no code needed)
                    <span className="block text-xs text-gray-500">
                      Applies itself at checkout when the conditions below are met — customers don&apos;t enter anything
                    </span>
                  </span>
                </label>
              </div>
            </section>

            {/* Type-specific config */}
            <section className="border-t-2 border-gray-100 pt-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Percent size={20} /> Discount Configuration
              </h2>

              {formData.type === "NTH_ITEM" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Every Nth Item <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={formData.nthItem.nth}
                        onChange={(e) => setNested("nthItem", "nth", e.target.value)}
                        placeholder="3"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">3 = discount kicks in on every 3rd item.</p>
                      {errors["nthItem.nth"] && <p className="text-xs text-red-600 mt-1">{errors["nthItem.nth"]}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Percent Off (%) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.nthItem.percentOff}
                        onChange={(e) => setNested("nthItem", "percentOff", e.target.value)}
                        placeholder="50"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">100 = that item is completely free.</p>
                      {errors["nthItem.percentOff"] && (
                        <p className="text-xs text-red-600 mt-1">{errors["nthItem.percentOff"]}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    {nthItemExample(formData.nthItem.nth, formData.nthItem.percentOff)}
                  </p>
                </div>
              )}

              {formData.type === "SPEND_THRESHOLD" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Spend Threshold (£) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.spendThreshold.threshold}
                        onChange={(e) => setNested("spendThreshold", "threshold", e.target.value)}
                        placeholder="50"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">Minimum cart subtotal, before discount, to unlock this.</p>
                      {errors["spendThreshold.threshold"] && (
                        <p className="text-xs text-red-600 mt-1">{errors["spendThreshold.threshold"]}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Percent Off (%) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.spendThreshold.percentOff}
                        onChange={(e) => setNested("spendThreshold", "percentOff", e.target.value)}
                        placeholder="10"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">Applied to the whole order, not just one item.</p>
                      {errors["spendThreshold.percentOff"] && (
                        <p className="text-xs text-red-600 mt-1">{errors["spendThreshold.percentOff"]}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    {spendThresholdExample(formData.spendThreshold.threshold, formData.spendThreshold.percentOff)}
                  </p>
                </div>
              )}

              {formData.type === "BUY_X_GET_Y_FREE" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Buy X <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={formData.buyXGetY.x}
                        onChange={(e) => setNested("buyXGetY", "x", e.target.value)}
                        placeholder="2"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">Items the customer pays full price for.</p>
                      {errors["buyXGetY.x"] && <p className="text-xs text-red-600 mt-1">{errors["buyXGetY.x"]}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Get Y Free <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={formData.buyXGetY.y}
                        onChange={(e) => setNested("buyXGetY", "y", e.target.value)}
                        placeholder="1"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">Extra items added on top, for free.</p>
                      {errors["buyXGetY.y"] && <p className="text-xs text-red-600 mt-1">{errors["buyXGetY.y"]}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    {buyXGetYExample(formData.buyXGetY.x, formData.buyXGetY.y)}
                  </p>

                  <ProductPicker
                    fieldPath="buyXGetY.productIds"
                    label="Select products for Buy X Get Y Free"
                    allowEmpty
                  />
                  <p className="text-xs text-gray-500 -mt-2">
                    Leave empty to let this apply to any product. Use &ldquo;Pick variant&rdquo; on a coffee to target one
                    specific size/grind instead of the whole coffee.
                  </p>
                </div>
              )}

              {formData.type === "PERCENT_OFF_PRODUCT" && (
                <div className="space-y-4">
                  <ProductPicker fieldPath="productDiscount.productIds" label="Select products" />
                  <p className="text-xs text-gray-500 -mt-2">
                    Only products/variants picked here get discounted — everything else in the cart stays full price. Use
                    &ldquo;Pick variant&rdquo; on a coffee to target one specific size/grind instead of the whole coffee.
                  </p>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Percent Off (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.productDiscount.percentOff}
                      onChange={(e) => setNested("productDiscount", "percentOff", e.target.value)}
                      placeholder="20"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    {errors["productDiscount.percentOff"] && (
                      <p className="text-xs text-red-600 mt-1">{errors["productDiscount.percentOff"]}</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    {percentOffProductExample(formData.productDiscount.percentOff)}
                  </p>
                </div>
              )}

              {formData.type === "SUBSCRIPTION_INTRO" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Applies to</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setField("subscriptionIntroScopeAll", true)}
                        className={`px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                          formData.subscriptionIntroScopeAll
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <p className="text-sm font-bold">All subscriptions</p>
                        <p className={`text-xs mt-0.5 ${formData.subscriptionIntroScopeAll ? "text-gray-300" : "text-gray-500"}`}>
                          Every coffee with subscriptions enabled
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setField("subscriptionIntroScopeAll", false)}
                        className={`px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                          !formData.subscriptionIntroScopeAll
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        <p className="text-sm font-bold">Specific products</p>
                        <p className={`text-xs mt-0.5 ${!formData.subscriptionIntroScopeAll ? "text-gray-300" : "text-gray-500"}`}>
                          Choose which coffees/variants
                        </p>
                      </button>
                    </div>
                  </div>

                  {!formData.subscriptionIntroScopeAll && (
                    <>
                      <ProductPicker
                        fieldPath="subscriptionIntro.productIds"
                        label="Select the coffee/variant this intro offer applies to"
                      />
                      {errors["subscriptionIntro.productIds"] && (
                        <p className="text-xs text-red-600 -mt-2">{errors["subscriptionIntro.productIds"]}</p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-gray-500 -mt-2">
                    Only variants with &ldquo;Available as a subscription&rdquo; turned on (in Coffee-Variants) can
                    actually be subscribed to — this just decides which of those get the intro pricing.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Applies to first N deliveries <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.subscriptionIntro.cycles}
                        onChange={(e) => setNested("subscriptionIntro", "cycles", e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n} {n > 1 ? "deliveries" : "delivery"}
                          </option>
                        ))}
                      </select>
                      {errors["subscriptionIntro.cycles"] && (
                        <p className="text-xs text-red-600 mt-1">{errors["subscriptionIntro.cycles"]}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Intro Discount (%) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.subscriptionIntro.percentOff}
                        onChange={(e) => setNested("subscriptionIntro", "percentOff", e.target.value)}
                        placeholder="20"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Replaces the normal subscribe discount during the intro period.
                      </p>
                      {errors["subscriptionIntro.percentOff"] && (
                        <p className="text-xs text-red-600 mt-1">{errors["subscriptionIntro.percentOff"]}</p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 italic">
                    {subscriptionIntroExample(formData.subscriptionIntro.cycles, formData.subscriptionIntro.percentOff)}
                  </p>
                </div>
              )}
            </section>

            {/* Scope */}
            <section className="border-t-2 border-gray-100 pt-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingCart size={20} /> Scope & Limits
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Optional guardrails — leave any of these blank/default to leave that limit off entirely.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Applies To</label>
                  <select
                    value={formData.appliesTo}
                    disabled={appliesToDisabled}
                    onChange={(e) => setField("appliesTo", e.target.value as AppliesTo)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    {APPLIES_TO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {appliesToDisabled ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Product scope is controlled by the{" "}
                      {formData.type === "BUY_X_GET_Y_FREE"
                        ? "Buy X Get Y"
                        : formData.type === "SUBSCRIPTION_INTRO"
                        ? "Subscription Intro Offer"
                        : "Percent Off"}{" "}
                      picker above
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      Which cart items count toward this coupon at all. Pick &ldquo;Specific products&rdquo; to hand-pick
                      coffees, equipment, or individual variants below.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Minimum Order Amount (£)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.minimumOrderAmount}
                    onChange={(e) => setField("minimumOrderAmount", e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Cart subtotal must reach this before the coupon works. Blank = no minimum.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Total Usage Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.usageLimit}
                    onChange={(e) => setField("usageLimit", e.target.value)}
                    placeholder="Unlimited"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">How many times this coupon can be redeemed in total, across every customer.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Max Uses Per Email</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.maxUsagePerUser}
                    onChange={(e) => setField("maxUsagePerUser", e.target.value)}
                    placeholder="Unlimited"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">How many times the same customer email can use this coupon.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={formData.startsAt}
                    onChange={(e) => setField("startsAt", e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Blank = active immediately.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setField("expiresAt", e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Blank = never expires.</p>
                </div>
              </div>

              {showScopeProductPicker && (
                <ProductPicker fieldPath="productIds" label="Select products this coupon applies to" />
              )}
              {errors.productIds && <p className="text-xs text-red-600 mt-1">{errors.productIds}</p>}
            </section>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t-2 border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/admin/coupons")}
              className="px-5 py-2.5 border-2 border-gray-300 text-gray-900 rounded-xl hover:bg-gray-100 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}