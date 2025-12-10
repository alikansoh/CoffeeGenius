"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Plus,
  Check,
  AlertCircle,
  Coffee,
  Trash2,
  Save,
  Search,
  Package,
  X,
  ChevronDown,
  Edit3,
  Box,
} from "lucide-react";
import { getCloudinaryUrl } from "@/app/utils/cloudinary";

type SizeOption = "250g" | "1kg";
type GrindOption = "whole-bean" | "espresso" | "filter" | "cafetiere" | "aeropress";

interface CoffeeItem {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  img: string; // Cloudinary publicId or full URL
  images?: string[]; // optional gallery of publicIds
  roastLevel?: "light" | "medium" | "dark";
}

interface ServerVariant {
  id?: string;
  _id?: string;
  coffeeId?: string | { _id: string; [key: string]: unknown };
  sku?: string;
  size?: SizeOption;
  grind?: GrindOption;
  price?: number;
  stock?: number;
  img?: string;
}

interface VariantFormData {
  id?: string;
  tempId?: string; // client-only id for unsaved variants
  sku?: string;
  useAutoSku?: boolean; // whether SKU is auto-generated and should update when size/grind change
  size: SizeOption;
  grind: GrindOption;
  price: number;
  stock: number;
  error?: string | null;
  isDirty?: boolean;
}

const SIZES: SizeOption[] = ["250g", "1kg"];
const GRINDS: { value: GrindOption; label: string }[] = [
  { value: "whole-bean", label: "Whole Bean" },
  { value: "espresso", label: "Espresso" },
  { value: "filter", label: "Filter" },
  { value: "cafetiere", label: "Cafetière" },
  { value: "aeropress", label: "AeroPress" },
];

const DEFAULT_PRICES: Record<SizeOption, number> = {
  "250g": 14.99,
  "1kg": 48.99,
};

function Toast({ message, type, onClose }: { message: string; type: "error" | "success"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50 ${
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

/**
 * CreateVariantsPage (client)
 * - sendCookies prop controls whether browser includes HttpOnly cookies with fetch
 * - default: true (secure)
 */
export default function CreateVariantsPage({ sendCookies = true }: { sendCookies?: boolean }) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCoffees, setIsFetchingCoffees] = useState(true);
  const [isFetchingVariants, setIsFetchingVariants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCoffeeSelector, setShowCoffeeSelector] = useState(true);

  const [coffees, setCoffees] = useState<CoffeeItem[]>([]);
  const [selectedCoffeeId, setSelectedCoffeeId] = useState<string>("");
  const [variants, setVariants] = useState<VariantFormData[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set()); // prevent double delete clicks

  // Keep a ref to the latest variants so callbacks can access up-to-date state without stale closures
  const variantsRef = useRef<VariantFormData[]>(variants);
  useEffect(() => {
    variantsRef.current = variants;
  }, [variants]);

  const variantsEndRef = useRef<HTMLDivElement | null>(null);

  // Helper to normalize Cloudinary/publicId or URL for display
  const getDisplayImageSrc = (idOrUrl: string | undefined, preset: "thumbnail" | "medium" = "thumbnail") => {
    if (!idOrUrl) return "/test.webp";
    if (idOrUrl.startsWith("http://") || idOrUrl.startsWith("https://") || idOrUrl.startsWith("/")) {
      return idOrUrl;
    }
    return getCloudinaryUrl(idOrUrl, preset);
  };

  useEffect(() => {
    let mounted = true;
    const fetchCoffees = async () => {
      try {
        setIsFetchingCoffees(true);
        const res = await fetch("/api/coffee?limit=100", {
          method: "GET",
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) throw new Error("Failed to fetch coffees");
        const data = await res.json().catch(() => ({}));

        const rawList: CoffeeItem[] = (data?.data || data?.coffees || data || []) as CoffeeItem[];

        // Ensure each item has images array; prefer images if available
        const normalized = rawList.map((c) => ({
          ...c,
          images: Array.isArray(c.images) && c.images.length > 0 ? (c.images as string[]) : [c.img],
        }));

        if (mounted) {
          setCoffees(normalized);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch coffees");
        }
      } finally {
        if (mounted) setIsFetchingCoffees(false);
      }
    };

    fetchCoffees();
    return () => {
      mounted = false;
    };
  }, [sendCookies]);

  const selectedCoffee = useMemo(() => coffees.find((c) => c._id === selectedCoffeeId) ?? null, [
    selectedCoffeeId,
    coffees,
  ]);

  const filteredCoffees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return coffees;
    return coffees.filter((c) => c.name.toLowerCase().includes(q) || c.origin.toLowerCase().includes(q));
  }, [coffees, searchQuery]);

  /**
   * SKU helpers
   */
  const generateBaseSku = useCallback(
    (variant: { size: SizeOption; grind: GrindOption }) => {
      const coffeeCode = selectedCoffee ? selectedCoffee.name.split(" ")[0].toUpperCase().slice(0, 3) : "XXX";
      const sizeCode = variant.size === "250g" ? "250G" : "1KG";
      const grindCode = variant.grind.split("-").map((w) => w[0].toUpperCase()).join("");
      return `${coffeeCode}-${sizeCode}-${grindCode}`;
    },
    [selectedCoffee]
  );

  // existingSkus set should exclude the variant being generated (pass its tempId or id in exclude)
  const generateUniqueSku = useCallback(
    (variant: { size: SizeOption; grind: GrindOption }, existingSkus: Set<string>, exclude?: string) => {
      const base = generateBaseSku(variant);
      let idx = 1;
      let sku = "";
      do {
        sku = `${base}-${String(idx).padStart(3, "0")}`;
        idx += 1;
        if (idx > 9999) break;
      } while (existingSkus.has(sku));
      return sku;
    },
    [generateBaseSku]
  );

  // helper to compute existing SKUs in current variants excluding the given variant id/tempId
  const computeExistingSkus = useCallback((excludeVariant?: VariantFormData) => {
    const s = new Set<string>();
    for (const v of variantsRef.current) {
      const identifier = v.id ?? v.tempId;
      if (excludeVariant && (excludeVariant.id === v.id || excludeVariant.tempId === v.tempId)) continue;
      if (v.sku) s.add(v.sku);
    }
    return s;
  }, []);

  // Update SKU when size/grind changes if variant.useAutoSku is true
  const handleVariantChange = useCallback(
    (index: number, field: keyof VariantFormData, value: string | number) => {
      setVariants((prev) => {
        const copy = [...prev];
        const variant = { ...copy[index] };

        if (field === "size") {
          const newSize = value as SizeOption;
          const currentPrice = variant.price;

          if (Math.abs(currentPrice - DEFAULT_PRICES[variant.size]) < 0.01) {
            variant.price = DEFAULT_PRICES[newSize];
          }
          variant.size = newSize;

          if (variant.useAutoSku ?? true) {
            const existingSkus = computeExistingSkus(variant);
            variant.sku = generateUniqueSku({ size: variant.size, grind: variant.grind }, existingSkus, variant.id ?? variant.tempId);
          }
        } else if (field === "price") {
          variant.price = typeof value === "number" ? value : parseFloat(String(value || "0"));
        } else if (field === "stock") {
          variant.stock = typeof value === "number" ? value : parseInt(String(value || "0"), 10);
        } else if (field === "grind") {
          variant.grind = value as GrindOption;

          if (variant.useAutoSku ?? true) {
            const existingSkus = computeExistingSkus(variant);
            variant.sku = generateUniqueSku({ size: variant.size, grind: variant.grind }, existingSkus, variant.id ?? variant.tempId);
          }
        }

        variant.isDirty = true;
        copy[index] = variant;
        return copy;
      });
    },
    [computeExistingSkus, generateUniqueSku]
  );

  // Toggle whether a variant uses auto SKU or manual SKU
  const toggleUseAutoSku = useCallback((index: number, useAuto?: boolean) => {
    setVariants((prev) => {
      const copy = [...prev];
      const variant = { ...copy[index] };
      const newUseAuto = useAuto ?? !(variant.useAutoSku ?? true);
      variant.useAutoSku = newUseAuto;

      if (newUseAuto) {
        // regenerate SKU uniquely for this variant
        const existingSkus = computeExistingSkus(variant);
        variant.sku = generateUniqueSku({ size: variant.size, grind: variant.grind }, existingSkus, variant.id ?? variant.tempId);
        variant.isDirty = true;
      }
      copy[index] = variant;
      return copy;
    });
  }, [computeExistingSkus, generateUniqueSku]);

  // Allow manual SKU edit when useAutoSku is false
  const handleSkuEdit = useCallback((index: number, newSku: string) => {
    setVariants((prev) => {
      const copy = [...prev];
      const variant = { ...copy[index] };
      variant.sku = newSku.toUpperCase().replace(/\s+/g, "-");
      variant.useAutoSku = false;
      variant.isDirty = true;
      copy[index] = variant;
      return copy;
    });
  }, []);

  const addVariant = useCallback(() => {
    setVariants((prev) => {
      const newVariant: VariantFormData = {
        tempId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        size: "250g",
        grind: "whole-bean",
        price: DEFAULT_PRICES["250g"],
        stock: 0,
        error: null,
        isDirty: true,
        useAutoSku: true, // default to auto SKU
      };

      const existingSkus = new Set(prev.map((v) => v.sku).filter(Boolean) as string[]);
      newVariant.sku = generateUniqueSku({ size: newVariant.size, grind: newVariant.grind }, existingSkus);

      return [...prev, newVariant];
    });

    setTimeout(() => {
      variantsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  }, [generateUniqueSku]);

  // removeVariant accepts index or variant id/tempId string
  // Behavior:
  // - If there are unsaved new variants, save them first (so we don't end up deleting coffee by accident)
  // - Confirm before deleting the last variant (prevent accidental coffee deletion)
  // - Prevent double-deletes with deletingIds set
  const removeVariant = useCallback(
    async (indexOrId: number | string) => {
      setError(null);

      // get latest snapshot
      const current = variantsRef.current;
      const idx = typeof indexOrId === "number" ? indexOrId : current.findIndex((v) => v.id === indexOrId || v.tempId === indexOrId);
      if (idx < 0 || idx >= current.length) return;
      const variant = current[idx];

      // If variant is unsaved (no id), remove locally and return
      if (!variant.id) {
        setVariants((prev) => {
          const copy = prev.slice();
          copy.splice(idx, 1);
          return copy;
        });
        return;
      }

      // If there are unsaved (new) variants, persist them first to avoid leaving coffee without any variants
      const hasUnsaved = current.some((v) => !v.id);
      if (hasUnsaved) {
        const saved = await handleSaveAll();
        if (!saved) {
          setError("Please save new variants before deleting others.");
          return;
        }
      }

      // Re-evaluate current variants after potential save
      const latest = variantsRef.current;
      const variantIndex = latest.findIndex((v) => v.id === variant.id);
      if (variantIndex === -1) {
        // already removed by race or saved/changed, nothing to do
        return;
      }

      // If deleting this variant would result in zero variants for this coffee, confirm specially
      const remainingCountAfterDeletion = latest.filter((v) => v.id && v.id !== variant.id).length;
      if (remainingCountAfterDeletion === 0) {
        const ok = confirm(
          "Deleting this variant will remove the last variant for this coffee. If you proceed the coffee will have no variants. Do you want to continue?"
        );
        if (!ok) return;
      }

      // Prevent double delete clicks
      if (variant.id && deletingIds.has(variant.id)) return;
      if (variant.id) {
        setDeletingIds((s) => new Set(s).add(variant.id!));
      }

      // Optimistically remove from UI
      setVariants((prev) => prev.filter((v) => v.id !== variant.id));

      try {
        setIsLoading(true);
        const res = await fetch(`/api/variants/${variant.id}`, {
          method: "DELETE",
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || "Failed to delete variant");
        }

        setSuccess("Variant deleted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete variant");
        // restore the variant if it's no longer present (best-effort)
        setVariants((prev) => {
          if (prev.some((p) => p.id === variant.id)) return prev;
          const copy = prev.slice();
          const insertAt = Math.min(idx, copy.length);
          copy.splice(insertAt, 0, variant);
          return copy;
        });
      } finally {
        if (variant.id) {
          setDeletingIds((s) => {
            const next = new Set(s);
            next.delete(variant.id!);
            return next;
          });
        }
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendCookies, deletingIds]
  );

  const validateVariant = useCallback((variant: VariantFormData, idx: number): string | null => {
    if (!Number.isFinite(variant.price) || variant.price < 0) {
      return `Variant ${idx + 1}: Invalid price`;
    }
    if (!Number.isFinite(variant.stock) || variant.stock < 0) {
      return `Variant ${idx + 1}: Invalid stock`;
    }
    return null;
  }, []);

  // fetch variants for selected coffee (extracted so we can call it if desired)
  const fetchVariantsForCoffee = useCallback(
    async (coffeeId: string) => {
      setIsFetchingVariants(true);
      setError(null);
      try {
        const res = await fetch(`/api/variants?coffeeId=${encodeURIComponent(coffeeId)}`, {
          method: "GET",
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) throw new Error("Failed to fetch variants");
        const data = await res.json().catch(() => ({}));
        const serverVariants: ServerVariant[] = data?.data || data?.variants || [];

        const coffeeVariants = serverVariants.filter((sv) => {
          const variantCoffeeId =
            typeof sv.coffeeId === "object" && sv.coffeeId !== null ? (sv.coffeeId as { _id: string })._id : sv.coffeeId;
          return variantCoffeeId === coffeeId;
        });

        if (coffeeVariants.length === 0) {
          setVariants([
            {
              tempId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
              size: "250g",
              grind: "whole-bean",
              price: DEFAULT_PRICES["250g"],
              stock: 0,
              error: null,
              isDirty: false,
              useAutoSku: true,
              sku: generateUniqueSku({ size: "250g", grind: "whole-bean" }, new Set()),
            },
          ]);
        } else {
          const mapped = coffeeVariants.map((sv) => ({
            id: sv.id || sv._id,
            sku: sv.sku,
            useAutoSku: true, // default to auto for fetched variants as well
            size: (sv.size === "1kg" || sv.size === "250g" ? sv.size : "250g") as SizeOption,
            grind: (["espresso", "filter", "cafetiere", "aeropress", "whole-bean"].includes(sv.grind || "")
              ? (sv.grind as GrindOption)
              : "whole-bean"),
            price: sv.price ?? DEFAULT_PRICES[(sv.size === "1kg" ? "1kg" : "250g") as SizeOption],
            stock: sv.stock ?? 0,
            error: null,
            isDirty: false,
          }));

          setVariants(mapped);
        }
        setShowCoffeeSelector(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch variants");
        setVariants([
          {
            tempId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
            size: "250g",
            grind: "whole-bean",
            price: DEFAULT_PRICES["250g"],
            stock: 0,
            error: null,
            isDirty: false,
            useAutoSku: true,
            sku: generateUniqueSku({ size: "250g", grind: "whole-bean" }, new Set()),
          },
        ]);
      } finally {
        setIsFetchingVariants(false);
      }
    },
    [generateUniqueSku, sendCookies]
  );

  useEffect(() => {
    if (!selectedCoffeeId) {
      setVariants([]);
      return;
    }
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await fetchVariantsForCoffee(selectedCoffeeId);
    })();
    return () => {
      mounted = false;
    };
  }, [selectedCoffeeId, fetchVariantsForCoffee]);

  // handleSaveAll now returns boolean: true on success, false on failure (or cancel)
  const handleSaveAll = useCallback(async (): Promise<boolean> => {
    setError(null);
    setSuccess(null);

    if (!selectedCoffeeId) {
      setError("Please select a coffee first");
      return false;
    }

    // client-side duplicate detection for (size+grind) duplicates and SKU collisions
    {
      const seenCombos = new Set<string>();
      const seenSkus = new Set<string>();
      for (let i = 0; i < variantsRef.current.length; i++) {
        const v = variantsRef.current[i];
        const combo = `${v.size}:${v.grind}`;
        if (seenCombos.has(combo)) {
          setError(`Duplicate variant for ${v.size} / ${v.grind}. Remove duplicates before saving.`);
          return false;
        }
        seenCombos.add(combo);

        if (v.sku) {
          if (seenSkus.has(v.sku)) {
            setError(`Duplicate SKU ${v.sku} in the batch. Make SKUs unique before saving.`);
            return false;
          }
          seenSkus.add(v.sku);
        }
      }
    }

    for (let i = 0; i < variantsRef.current.length; i++) {
      const err = validateVariant(variantsRef.current[i], i);
      if (err) {
        setError(err);
        return false;
      }
    }

    setIsLoading(true);
    try {
      // ensure every variant has a SKU (generate unique client-side fallback)
      const existingSkus = new Set(variantsRef.current.map((v) => v.sku).filter(Boolean) as string[]);
      const requests = variantsRef.current.map((variant) => {
        // if useAutoSku is true or no sku provided, generate unique one
        const sku =
          variant.sku && !variant.useAutoSku ? variant.sku : generateUniqueSku({ size: variant.size, grind: variant.grind }, existingSkus);
        existingSkus.add(sku);

        const payload = {
          coffeeId: selectedCoffeeId,
          sku,
          size: variant.size,
          grind: variant.grind,
          price: variant.price,
          stock: variant.stock,
        };

        if (variant.id) {
          return fetch(`/api/variants/${variant.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
          });
        } else {
          return fetch("/api/variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
          });
        }
      });

      const responses = await Promise.all(requests);

      // parse results (we want to update local state with server-provided ids/skus)
      const parsed = await Promise.all(
        responses.map(async (r) => {
          const json = await r.json().catch(() => null);
          return { ok: r.ok, status: r.status, json };
        })
      );

      for (let i = 0; i < parsed.length; i++) {
        if (!parsed[i].ok) {
          const serverMsg = parsed[i].json?.message || parsed[i].json?.error || null;
          throw new Error(serverMsg || `Failed to save variant ${i + 1}`);
        }
      }

      // map updated server data back into local variants (same order)
      setVariants(() =>
        parsed.map((p, i) => {
          const serverVariant = p.json?.data || p.json?.variant || p.json || null;
          // fallback to previous variant data if server didn't return the entity
          const previous = variantsRef.current[i];
          if (!serverVariant) {
            return { ...previous, isDirty: false, useAutoSku: previous.useAutoSku ?? true };
          }
          const id = serverVariant._id || serverVariant.id || previous.id;
          const sku = serverVariant.sku || previous.sku;
          const size = (serverVariant.size === "1kg" || serverVariant.size === "250g" ? serverVariant.size : previous.size) as SizeOption;
          const grind = (["espresso", "filter", "cafetiere", "aeropress", "whole-bean"].includes(serverVariant.grind || "")
            ? (serverVariant.grind as GrindOption)
            : previous.grind);
          const price = serverVariant.price ?? previous.price;
          const stock = serverVariant.stock ?? previous.stock;
          // Keep auto by default after save
          return { id, sku, size, grind, price, stock, isDirty: false, error: null, useAutoSku: true };
        })
      );

      setSuccess("All variants saved successfully!");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save variants");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [generateUniqueSku, selectedCoffeeId, sendCookies, validateVariant]);

  const formatPrice = useCallback((p: number) => {
    return Number.isFinite(p) ? `£${p.toFixed(2)}` : "-";
  }, []);

  const totalStock = useMemo(() => variants.reduce((acc, v) => acc + (v.stock || 0), 0), [variants]);

  const totalValue = useMemo(() => {
    return variants.reduce((acc, v) => {
      return acc + (Number.isFinite(v.price) ? v.price * v.stock : 0);
    }, 0);
  }, [variants]);

  const hasUnsavedChanges = variants.some((v) => v.isDirty);

  const handleBackClick = () => {
    if (selectedCoffee && !showCoffeeSelector) {
      setShowCoffeeSelector(true);
      setSelectedCoffeeId("");
    } else {
      router.push("/admin");
    }
  };

  return (
    <>
      <style jsx global>{`
        input,
        select {
          font-size: 16px !important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackClick}
                  className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Variants</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                    {selectedCoffee ? `Editing ${selectedCoffee.name}` : "Select a coffee to manage variants"}
                  </p>
                </div>
              </div>
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-900 rounded-full text-xs sm:text-sm font-medium shadow-sm">
                  <div className="w-2 h-2 bg-yellow-600 rounded-full animate-pulse" />
                  Unsaved changes
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Coffee Selector */}
          {showCoffeeSelector && (
            <div className="mb-6 sm:mb-8">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-900 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <Coffee size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-white">Select Coffee</h2>
                      <p className="text-gray-300 text-xs sm:text-sm mt-0.5">Choose a coffee to manage its variants</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  <div className="relative mb-6">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by name or origin..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-lg transition"
                      >
                        <X size={16} className="text-gray-400" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 max-h-[400px] sm:max-h-[500px] overflow-y-auto pr-2">
                    {isFetchingCoffees ? (
                      <div className="col-span-full py-12 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                        <p className="text-sm text-gray-600 mt-3">Loading coffees...</p>
                      </div>
                    ) : filteredCoffees.length === 0 ? (
                      <div className="col-span-full py-12 text-center">
                        <Coffee size={48} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-900 font-medium">No coffees found</p>
                        <p className="text-sm text-gray-500 mt-1">Try adjusting your search</p>
                      </div>
                    ) : (
                      filteredCoffees.map((coffee) => {
                        const thumbSrc = getDisplayImageSrc(
                          Array.isArray(coffee.images) && coffee.images.length > 0 ? coffee.images[0] : coffee.img,
                          "thumbnail"
                        );
                        return (
                          <button
                            key={coffee._id}
                            onClick={() => {
                              setSelectedCoffeeId(coffee._id);
                              setSearchQuery("");
                            }}
                            className="group text-left p-3 sm:p-4 border-2 border-gray-200 rounded-xl hover:border-gray-900 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
                          >
                            <div className="flex flex-col gap-3">
                              <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 ring-gray-200 group-hover:ring-gray-900 transition-all">
                                <Image src={thumbSrc} alt={coffee.name} width={200} height={200} className="object-cover w-full h-full" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-gray-900 truncate group-hover:text-gray-800">{coffee.name}</div>
                                <div className="text-xs text-gray-600 truncate mt-1">{coffee.origin}</div>
                                {coffee.roastLevel && (
                                  <div className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-900 text-xs font-medium rounded-full capitalize">
                                    {coffee.roastLevel}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected Coffee Header */}
          {selectedCoffee && !showCoffeeSelector && (
            <div className="mb-6 bg-gray-900 rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white/10 ring-4 ring-white/20">
                    <Image
                      src={getDisplayImageSrc(
                        Array.isArray(selectedCoffee.images) && selectedCoffee.images.length > 0 ? selectedCoffee.images[0] : selectedCoffee.img,
                        "thumbnail"
                      )}
                      alt={selectedCoffee.name}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white">{selectedCoffee.name}</h3>
                    <p className="text-gray-300 text-sm mt-1">{selectedCoffee.origin}</p>
                    <div className="hidden sm:flex items-center gap-4 mt-2 text-gray-300 text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <Package size={14} />
                        {variants.length} variants
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Box size={14} />
                        {totalStock} in stock
                      </span>
                      <span className="inline-flex items-center gap-1.5">{formatPrice(totalValue)}</span>
                    </div>
                    <div className="flex sm:hidden items-center gap-2 mt-2 text-gray-300 text-xs">
                      <span>{variants.length} variants</span>
                      <span>•</span>
                      <span>{totalStock} in stock</span>
                      <span>•</span>
                      <span>{formatPrice(totalValue)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCoffeeSelector(true);
                    setSelectedCoffeeId("");
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium text-sm backdrop-blur-sm"
                >
                  Change Coffee
                </button>
              </div>
            </div>
          )}

          {/* Variants Section */}
          {selectedCoffee && !showCoffeeSelector && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">Variants</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">Manage sizes, grinds, pricing, and inventory for {selectedCoffee.name}</p>
                  </div>
                  <button
                    onClick={addVariant}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md hover:shadow-lg font-medium text-sm"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">Add Variant</span>
                    <span className="sm:hidden">Add</span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {isFetchingVariants ? (
                  <div className="py-16 text-center">
                    <div className="inline-flex items-center justify-center w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                    <p className="text-sm text-gray-600 mt-3">Loading variants for {selectedCoffee.name}...</p>
                  </div>
                ) : variants.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
                      <Package size={32} className="text-gray-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No variants yet</h3>
                    <p className="text-gray-600 text-sm mb-6">Create your first variant to get started</p>
                    <button
                      onClick={addVariant}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md hover:shadow-lg font-medium"
                    >
                      <Plus size={20} />
                      Create First Variant
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {variants.map((variant, i) => {
                      const sku =
                        variant.sku ||
                        generateBaseSku({ size: variant.size, grind: variant.grind }) + `-${String(i + 1).padStart(3, "0")}`;
                      const priceNum = variant.price;
                      const stockNum = variant.stock;

                      return (
                        <div
                          key={variant.id ?? variant.tempId ?? i}
                          className={`border-2 rounded-xl p-4 sm:p-5 transition-all ${
                            variant.isDirty ? "border-yellow-400 bg-yellow-50 shadow-md" : "border-gray-200 bg-gray-50 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                            <div className="flex-1">
                              <div className="font-mono text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                                <Edit3 size={14} className="text-gray-600" />
                                {/* SKU display */}
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm sm:text-base">{sku}</span>
                                  <span className="ml-2 px-2 py-1 text-xs rounded-full border-2 border-gray-200 bg-gray-50">Auto</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {GRINDS.find((g) => g.value === variant.grind)?.label} • {variant.size}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {variant.isDirty && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-200 text-yellow-900 text-xs font-bold rounded-full">
                                  <AlertCircle size={12} />
                                  Unsaved
                                </span>
                              )}
                              <button
                                onClick={() => removeVariant(variant.id ?? variant.tempId ?? i)}
                                disabled={variant.id ? deletingIds.has(variant.id) : false}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-all text-sm font-medium"
                              >
                                <Trash2 size={16} />
                                <span className="hidden sm:inline">Delete</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide block mb-2">Size</label>
                              <div className="relative">
                                <select
                                  value={variant.size}
                                  onChange={(e) => handleVariantChange(i, "size", e.target.value as SizeOption)}
                                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none cursor-pointer font-medium"
                                >
                                  {SIZES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide block mb-2">Grind Type</label>
                              <div className="relative">
                                <select
                                  value={variant.grind}
                                  onChange={(e) => handleVariantChange(i, "grind", e.target.value as GrindOption)}
                                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none cursor-pointer font-medium"
                                >
                                  {GRINDS.map((g) => (
                                    <option key={g.value} value={g.value}>
                                      {g.label}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide block mb-2">Price (£)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={variant.price}
                                onChange={(e) => handleVariantChange(i, "price", e.target.value)}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-medium"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-bold text-gray-900 uppercase tracking-wide block mb-2">Stock</label>
                              <input
                                type="number"
                                min="0"
                                value={variant.stock}
                                onChange={(e) => handleVariantChange(i, "stock", e.target.value)}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-medium"
                              />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t-2 border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Line Total</span>
                              <div className="text-lg sm:text-xl font-bold text-gray-900">{formatPrice(priceNum * stockNum)}</div>
                            </div>
                          </div>

                          {variant.error && (
                            <div className="mt-4 p-3 bg-red-50 border-2 border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                              <AlertCircle size={16} />
                              {variant.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={variantsEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions Footer */}
          {selectedCoffee && !showCoffeeSelector && (
            <div className="mt-8 bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="hidden sm:block text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{variants.length}</span> variants •{" "}
                  <span className="font-semibold text-gray-900">{totalStock}</span> in stock •{" "}
                  <span className="font-semibold text-gray-900">{formatPrice(totalValue)}</span> total value
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCoffeeSelector(true);
                      setSelectedCoffeeId("");
                    }}
                    className="flex-1 sm:flex-none px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-semibold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAll}
                    disabled={isLoading || !selectedCoffee}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                      isLoading || !selectedCoffee ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-gray-900 text-white hover:bg-gray-800 shadow-lg hover:shadow-xl"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save All
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Toasts */}
      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}
    </>
  );
}