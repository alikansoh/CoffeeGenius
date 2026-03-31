"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  ArrowRight,
  Star,
} from "lucide-react";
import useCart, { CartItem } from "../store/CartStore";
import { getCloudinaryUrl } from "@/app/utils/cloudinary";

interface Variant {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  roastType?: "espresso" | "filter" | "omni";
  price: number;
  stock: number;
  img: string;
}

interface SizePrice {
  size: string;
  price: number;
  availableGrinds?: string[];
  totalStock?: number;
}

interface ApiCoffee {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  notes?: string;
  img: string;
  images?: string[];
  roastType?: "espresso" | "filter" | "omni";
  roastTypes?: ("espresso" | "filter" | "omni")[];
  minPrice: number;
  availableGrinds: string[];
  availableSizes: SizePrice[];
  variants: Variant[];
  bestSeller: boolean;
}

export type Product = {
  id: string;
  slug: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  prices?: Record<string, number>;
  img?: string;
  images?: string[];
  roastType?: "espresso" | "filter" | "omni" | null;
  availableSizes?: SizePrice[];
  availableGrinds?: string[];
  variants?: Variant[];
  bestSeller?: boolean;
};

type QuickAddOptions = {
  size: string;
  grind: string;
  quantity: number;
  roastStyle?: string;
};

const COLORS = {
  primary: "#111827",
};

// ── Helper: expand "omni" into ["espresso", "filter"] ─────────────────────────
// An "omni" roast means the coffee works for BOTH espresso and filter.
// We always present "espresso" and "filter" as selectable choices, never "omni".
function expandRoastType(rt: string): ("espresso" | "filter")[] {
  if (rt === "omni") return ["espresso", "filter"];
  if (rt === "espresso") return ["espresso"];
  if (rt === "filter") return ["filter"];
  return [];
}

// ── Check if a variant matches a chosen roast style ───────────────────────────
// "omni" variants satisfy both "espresso" and "filter" selections.
function variantMatchesRoast(
  variant: Variant,
  chosenRoast: "espresso" | "filter" | ""
): boolean {
  if (!chosenRoast) return true;
  if (!variant.roastType) return true;
  if (variant.roastType === "omni") return true;
  return variant.roastType === chosenRoast;
}

// ── Roast Type Badge ──────────────────────────────────────────────────────────
const ROAST_TYPE_META: Record<"espresso" | "filter" | "omni", { label: string }> = {
  espresso: { label: "Espresso roast" },
  filter:   { label: "Filter roast" },
  omni:     { label: "Espresso & filter" },
};

function RoastDot({ type }: { type: "espresso" | "filter" | "omni" }) {
  if (type === "omni") {
    return (
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          width: 10,
          height: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ background: "currentColor", borderRadius: 1 }} />
        <span style={{ background: "currentColor", borderRadius: 1, opacity: 0.4 }} />
        <span style={{ background: "currentColor", borderRadius: 1, opacity: 0.4 }} />
        <span style={{ background: "currentColor", borderRadius: 1 }} />
      </span>
    );
  }
  if (type === "espresso") {
    return (
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        border: "1.5px solid currentColor",
        flexShrink: 0,
      }}
    />
  );
}

function RoastTypeBadge({ type }: { type: "espresso" | "filter" | "omni" }) {
  const { label } = ROAST_TYPE_META[type];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        border: "1px solid #d1d5db",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "#6b7280",
        backgroundColor: "#f9fafb",
      }}
    >
      {label}
    </span>
  );
}

function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded: isAddedProp,
}: {
  product: Product;
  index: number;
  onAddToCart?: (product: Product, options: QuickAddOptions) => void;
  isAdded?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [size, setSize] = useState<string>("");
  const [grind, setGrind] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [localAdded, setLocalAdded] = useState(false);

  const [roastStyle, setRoastStyle] = useState<"espresso" | "filter" | "">("");

  const isAdded = isAddedProp || localAdded;

  const cardImageSrc = useMemo(() => {
    const primary =
      Array.isArray(product.images) && product.images.length > 0
        ? product.images[0]
        : product.img;
    if (!primary) return "/test.webp";
    if (
      primary.startsWith("http://") ||
      primary.startsWith("https://") ||
      primary.startsWith("/")
    ) {
      return primary;
    }
    return getCloudinaryUrl(primary, "medium");
  }, [product.images, product.img]);

  const availableSizes = useMemo(
    () =>
      product.availableSizes
        ?.map((s) => s.size)
        .sort((a, b) => {
          const sizeOrder: Record<string, number> = {
            "250g": 1,
            "500g": 2,
            "1kg": 3,
          };
          return (sizeOrder[a] || 999) - (sizeOrder[b] || 999);
        }) ||
      (product.prices ? Object.keys(product.prices).sort() : ["250g"]),
    [product.availableSizes, product.prices]
  );

  const availableGrindsForSize = useMemo(() => {
    if (!size) return [];
    if (product.availableSizes && product.availableSizes.length > 0) {
      const sizeData = product.availableSizes.find((s) => s.size === size);
      if (sizeData?.availableGrinds && sizeData.availableGrinds.length > 0) {
        return sizeData.availableGrinds;
      }
    }
    return product.availableGrinds && product.availableGrinds.length > 0
      ? product.availableGrinds
      : ["whole-bean"];
  }, [product.availableSizes, product.availableGrinds, size]);

  // ── Collect all expanded roast types across ALL variants + product-level ─────
  const allProductRoastTypes = useMemo((): ("espresso" | "filter")[] => {
    const roastTypes = new Set<"espresso" | "filter">();

    // Expand from variant-level roastType values
    if (product.variants) {
      product.variants.forEach((v) => {
        if (v.roastType) {
          expandRoastType(v.roastType).forEach((rt) => roastTypes.add(rt));
        }
      });
    }

    // Also expand from the product-level roastType (covers case where
    // product.roastType is "omni" but variants might not have roastType set)
    if (product.roastType) {
      expandRoastType(product.roastType).forEach((rt) => roastTypes.add(rt));
    }

    return Array.from(roastTypes);
  }, [product.variants, product.roastType]);

  // ── Collect expanded roast types for the currently selected size ─────────────
  const availableRoastTypesForSize = useMemo((): ("espresso" | "filter")[] => {
    if (!size) return [];
    const roastTypes = new Set<"espresso" | "filter">();

    if (product.variants) {
      product.variants
        .filter((v) => v.size === size && v.roastType)
        .forEach((v) => {
          expandRoastType(v.roastType!).forEach((rt) => roastTypes.add(rt));
        });
    }

    // If no variant-level roast info for this size, fall back to product-level
    if (roastTypes.size === 0 && product.roastType) {
      expandRoastType(product.roastType).forEach((rt) => roastTypes.add(rt));
    }

    return Array.from(roastTypes);
  }, [size, product.variants, product.roastType]);

  // ── Derived roast type for display badge ────────────────────────────────────
  const derivedRoastType = useMemo((): "espresso" | "filter" | "omni" | null => {
    if (allProductRoastTypes.length === 2) return "omni";
    if (allProductRoastTypes.length === 1) return allProductRoastTypes[0];
    if (product.roastType) return product.roastType;
    return null;
  }, [allProductRoastTypes, product.roastType]);

  // ── Show the roast picker when there are 2 choices ──────────────────────────
  const showRoastPicker = allProductRoastTypes.length > 1;

  // ── The list of roast options to render — always espresso/filter, never omni ─
  const pickerRoastTypes = useMemo((): ("espresso" | "filter")[] => {
    if (allProductRoastTypes.length > 0) return allProductRoastTypes;
    return ["espresso", "filter"];
  }, [allProductRoastTypes]);

  const effectiveRoastStyle = useMemo(() => {
    if (showRoastPicker) return roastStyle;
    if (availableRoastTypesForSize.length === 1)
      return availableRoastTypesForSize[0];
    return "";
  }, [showRoastPicker, roastStyle, availableRoastTypesForSize]);

  // ── Variant matching: uses variantMatchesRoast so "omni" variants match both ─
  const selectedVariant = useMemo(() => {
    if (!product?.variants || !size || !grind) return null;

    if (effectiveRoastStyle) {
      // Find a variant that matches size + grind + roast (omni matches any)
      const match = product.variants.find(
        (v) =>
          v.size === size &&
          v.grind === grind &&
          variantMatchesRoast(v, effectiveRoastStyle as "espresso" | "filter")
      );
      if (match) return match;
    }

    // Fallback: match by size and grind only
    return (
      product.variants.find((v) => v.size === size && v.grind === grind) || null
    );
  }, [product?.variants, size, grind, effectiveRoastStyle]);

  useEffect(() => {
    if (availableSizes.length > 0 && !size) setSize(availableSizes[0]);
  }, [availableSizes, size]);

  useEffect(() => {
    if (size && availableGrindsForSize.length > 0) {
      if (!availableGrindsForSize.includes(grind))
        setGrind(availableGrindsForSize[0]);
    }
  }, [size, availableGrindsForSize, grind]);

  useEffect(() => {
    if (showRoastPicker) {
      if (availableRoastTypesForSize.length === 1) {
        setRoastStyle(availableRoastTypesForSize[0]);
      } else if (
        availableRoastTypesForSize.length > 0 &&
        roastStyle !== "" &&
        !availableRoastTypesForSize.includes(roastStyle as "espresso" | "filter")
      ) {
        setRoastStyle("");
      }
      // If both are available, keep whatever the user already picked (or "" if none yet)
    }
  }, [size, showRoastPicker, availableRoastTypesForSize, roastStyle]);

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleCardClick = () => {
    if (!isFlipped) router.push(`/coffee/${encodeURIComponent(product.slug)}`);
  };

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/coffee/${encodeURIComponent(product.slug)}`);
  };

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    setQuantity(1);
  };

  const submitQuickAdd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onAddToCart || !selectedVariant) return;
    if (selectedVariant.stock <= 0) return;
    if (showRoastPicker && !roastStyle) return;
    setProcessing(true);
    try {
      await Promise.resolve(
        onAddToCart(product, {
          size,
          grind,
          quantity,
          roastStyle: effectiveRoastStyle || undefined,
        })
      );
      setLocalAdded(true);
      setTimeout(() => {
        setLocalAdded(false);
        setIsFlipped(false);
      }, 1200);
    } finally {
      setProcessing(false);
    }
  };

  const allNotes = useMemo(
    () =>
      (product.notes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [product.notes]
  );
  const MIN_SHOWN = 3;
  const [showAllNotes, setShowAllNotes] = useState(false);
  const notesToDisplay = showAllNotes ? allNotes : allNotes.slice(0, MIN_SHOWN);

  const unitPriceForSize = (s: string): number => {
    const sizePrice = product.availableSizes?.find((sz) => sz.size === s)?.price;
    if (sizePrice !== undefined) return sizePrice;
    const pricesPrice = product.prices?.[s];
    if (pricesPrice !== undefined) return pricesPrice;
    return product.price || 0;
  };

  const currentPrice = size ? unitPriceForSize(size) : product.price || 0;

  const formatGrindName = (grindValue: string): string => {
    const grindMap: Record<string, string> = {
      "whole-bean": "Whole bean",
      espresso: "Ground for espresso",
      filter: "Ground for filter",
      aeropress: "Ground for AeroPress",
      cafetiere: "Ground for Cafetière",
      "french-press": "Ground for French Press",
      "cold-brew": "Ground for cold brew",
      coarse: "Coarse grind",
      medium: "Medium grind",
      fine: "Fine grind",
    };
    return (
      grindMap[grindValue] ||
      grindValue.charAt(0).toUpperCase() + grindValue.slice(1)
    );
  };

  const availableStock = selectedVariant?.stock ?? 0;
  const isOutOfStock = selectedVariant ? availableStock === 0 : false;

  const roastNotAvailable =
    showRoastPicker &&
    roastStyle !== "" &&
    availableRoastTypesForSize.length > 0 &&
    !availableRoastTypesForSize.includes(roastStyle as "espresso" | "filter");

  if (!product || !product.id) return null;

  return (
    <div
      onClick={handleCardClick}
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="shrink-0 w-full bg-white rounded-2xl border border-gray-200 relative transition-all duration-300 hover:-translate-y-1 cursor-pointer"
      style={{
        maxWidth: 320,
        perspective: 1000,
        minHeight: 520,
        boxShadow:
          "0 4px 6px -1px rgba(120, 53, 15, 0.1), 0 2px 4px -2px rgba(120, 53, 15, 0.1)",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.boxShadow =
          "0 20px 25px -5px rgba(120, 53, 15, 0.2), 0 8px 10px -6px rgba(120, 53, 15, 0.15)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow =
          "0 4px 6px -1px rgba(120, 53, 15, 0.1), 0 2px 4px -2px rgba(120, 53, 15, 0.1)";
      }}
      role="listitem"
      aria-live="polite"
    >
      <div
        className="w-full h-full transition-all duration-500"
        style={{
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* ── FRONT ── */}
        <div
          className="w-full h-full flex flex-col bg-white rounded-2xl"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="relative w-full bg-gray-100 rounded-t-2xl overflow-hidden aspect-square">
            {product.bestSeller && (
              <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900 text-white text-xs font-bold shadow-lg">
                <Star size={14} className="fill-white" />
                <span>Best Seller</span>
              </div>
            )}
            <Image
              src={cardImageSrc}
              alt={product.name}
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width: 640px) 100vw, 320px"
              className="transition-transform duration-500 group-hover:scale-105"
              priority={index < 4}
            />
          </div>

          <div className="p-5 flex flex-col flex-1">
            {derivedRoastType && (
              <div className="mb-2">
                <RoastTypeBadge type={derivedRoastType} />
              </div>
            )}

            <div className="mb-3">
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {product.name}
              </h3>
              {product.origin && (
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {product.origin}
                </p>
              )}
            </div>

            {allNotes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {notesToDisplay.map((note, idx) => (
                  <span
                    key={note + idx}
                    title={note}
                    className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm hover:shadow-md transition-shadow duration-150 border bg-amber-50 text-amber-800 border-amber-300"
                  >
                    #{note}
                  </span>
                ))}
                {allNotes.length > MIN_SHOWN && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllNotes((s) => !s);
                    }}
                    className="px-3 py-1 text-xs font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 transition-all"
                    style={{ height: 32 }}
                    aria-label={
                      showAllNotes ? "Show less notes" : "Show more notes"
                    }
                  >
                    {showAllNotes
                      ? "Show less"
                      : `+${allNotes.length - MIN_SHOWN} more`}
                  </button>
                )}
              </div>
            )}

            <div className="mt-auto mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  £{currentPrice.toFixed(2)}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {size || "250g"}
                </span>
              </div>
            </div>

            {!localAdded && (
              <>
                <div
                  className={`hidden lg:block transition-all duration-300 ${
                    isHovered && isLargeScreen
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                >
                  <div className="flex gap-2">
                    <button
                      onClick={openQuickAdd}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                    >
                      <ShoppingCart size={16} />
                      <span>Quick Add</span>
                    </button>
                    <button
                      onClick={handleLearnMore}
                      className="px-4 py-2.5 text-gray-700 text-sm font-semibold hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Details
                    </button>
                  </div>
                </div>

                <div className="lg:hidden flex gap-2">
                  <button
                    onClick={openQuickAdd}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <ShoppingCart size={16} />
                    <span>Add to cart</span>
                  </button>
                  <button
                    onClick={handleLearnMore}
                    className="px-4 py-2.5 text-gray-700 text-sm font-semibold hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Details
                  </button>
                </div>
              </>
            )}

            {localAdded && (
              <div className="flex items-center justify-center gap-2 text-green-600 py-2.5 font-semibold">
                <Check className="w-5 h-5" />
                <span className="text-sm">Added to cart</span>
              </div>
            )}
          </div>
        </div>

        {/* ── BACK ── */}
        <div
          className="absolute inset-0 top-0 left-0 w-full h-full bg-white rounded-2xl p-5 flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Configure
            </p>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
              {product.bestSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  <Star size={10} className="fill-white" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {product.origin && (
                <p className="text-xs text-gray-500">{product.origin}</p>
              )}
              {derivedRoastType && (
                <RoastTypeBadge type={derivedRoastType} />
              )}
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {/* Size */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                Size
              </label>
              <div className="flex gap-2">
                {availableSizes.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSize(s);
                    }}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                      size === s
                        ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                    }`}
                  >
                    <div className="font-bold">{s}</div>
                    <div className="text-xs opacity-75 mt-1">
                      £{unitPriceForSize(s).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Roast Style picker ── */}
            {showRoastPicker && (
              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                  Roast Style
                </label>
                <div className="flex gap-2">
                  {pickerRoastTypes.map((rs) => {
                    const isAvailableForSize =
                      availableRoastTypesForSize.length > 0
                        ? availableRoastTypesForSize.includes(rs)
                        : true;

                    return (
                      <button
                        key={rs}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAvailableForSize) setRoastStyle(rs);
                        }}
                        disabled={!isAvailableForSize}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                          !isAvailableForSize
                            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50"
                            : roastStyle === rs
                            ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                        }`}
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <RoastDot type={rs} />
                          {rs === "espresso" ? "Espresso" : "Filter"}
                        </span>
                        {!isAvailableForSize && (
                          <div className="text-[10px] mt-0.5 font-normal">
                            Unavailable
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single roast type display (non-picker) */}
            {!showRoastPicker && availableRoastTypesForSize.length === 1 && (
              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                  Roast Style
                </label>
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm font-medium bg-gray-50 text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <RoastDot type={availableRoastTypesForSize[0]} />
                    {availableRoastTypesForSize[0] === "espresso"
                      ? "Espresso"
                      : "Filter"}
                  </span>
                </div>
              </div>
            )}

            {/* Grind */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                Brew Method
              </label>
              {availableGrindsForSize.length > 1 ? (
                <select
                  value={grind}
                  onChange={(e) => setGrind(e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm font-medium focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 focus:outline-none transition-all bg-white"
                  style={{ fontSize: "16px" }}
                >
                  {availableGrindsForSize
                    .filter((g): g is string => Boolean(g))
                    .map((g) => (
                      <option key={g} value={g}>
                        {formatGrindName(g)}
                      </option>
                    ))}
                </select>
              ) : availableGrindsForSize.length === 1 ? (
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm font-medium bg-gray-50 text-gray-700">
                  {formatGrindName(availableGrindsForSize[0])}
                </div>
              ) : (
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm font-medium bg-gray-50 text-gray-500">
                  No brew methods available for this size
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                Quantity
              </label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuantity((q) => Math.max(1, q - 1));
                  }}
                  disabled={isOutOfStock || !selectedVariant}
                  className="w-9 h-9 rounded-lg border border-gray-300 font-bold text-gray-700 hover:bg-white transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <div className="flex-1 text-center font-bold text-lg text-gray-900">
                  {quantity}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuantity((q) =>
                      Math.min(q + 1, availableStock || 999)
                    );
                  }}
                  disabled={isOutOfStock || !selectedVariant}
                  className="w-9 h-9 rounded-lg border border-gray-300 font-bold text-gray-700 hover:bg-white transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
              className="flex-1 px-4 py-2.5 rounded-lg border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitQuickAdd}
              disabled={
                processing ||
                !size ||
                !grind ||
                !selectedVariant ||
                isOutOfStock ||
                availableGrindsForSize.length === 0 ||
                (showRoastPicker && !roastStyle) ||
                roastNotAvailable
              }
              className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {processing
                ? "Adding..."
                : isOutOfStock
                ? "Out of Stock"
                : roastNotAvailable
                ? "Roast Unavailable"
                : "Add to cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BestSellerSlider() {
  const addItem = useCart((s) => s.addItem);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const fetchBestSellers = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/coffee?bestSeller=true&limit=10");
        if (!response.ok) throw new Error("Failed to fetch best sellers");
        const data = await response.json();

        const transformedProducts: Product[] = data.data.map(
          (coffee: ApiCoffee) => {
            const prices: Record<string, number> = {};
            if (coffee.availableSizes && coffee.availableSizes.length > 0) {
              coffee.availableSizes.forEach((sizeObj: SizePrice) => {
                prices[sizeObj.size] = sizeObj.price;
              });
            } else {
              prices["250g"] = coffee.minPrice;
            }

            const roastTypes = coffee.roastTypes ?? [];
            let roastType: "espresso" | "filter" | "omni" | null;
            if (coffee.roastType) {
              roastType = coffee.roastType;
            } else if (roastTypes.length === 1) {
              roastType = roastTypes[0];
            } else if (roastTypes.length > 1) {
              roastType = "omni";
            } else {
              roastType = null;
            }

            return {
              id: coffee._id || coffee.slug,
              slug: coffee.slug,
              name: coffee.name,
              origin: coffee.origin,
              notes: coffee.notes || "",
              price: coffee.minPrice || 0,
              prices,
              img: coffee.img,
              images:
                coffee.images && coffee.images.length > 0
                  ? coffee.images
                  : [coffee.img],
              roastType,
              availableSizes: coffee.availableSizes,
              availableGrinds: coffee.availableGrinds,
              variants: coffee.variants,
              bestSeller: coffee.bestSeller,
            };
          }
        );

        setProducts(transformedProducts);
      } catch (error) {
        console.error("Error fetching best sellers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBestSellers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateScrollState = () => {
      const container = containerRef.current;
      if (!container) return;
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    };

    updateScrollState();
    const containerEl = containerRef.current;
    containerEl?.addEventListener("scroll", updateScrollState, {
      passive: true,
    });
    window.addEventListener("resize", updateScrollState);

    return () => {
      containerEl?.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [products]);

  function scroll(direction: "left" | "right") {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({
      left:
        direction === "left"
          ? -container.clientWidth * 0.8
          : container.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  function handleAdd(p: Product, options: QuickAddOptions) {
    // Use variantMatchesRoast so "omni" variants match both espresso and filter
    const selectedVariant = p.variants?.find(
      (v) =>
        v.size === options.size &&
        v.grind === options.grind &&
        variantMatchesRoast(v, (options.roastStyle as "espresso" | "filter") || "")
    );
    // Fallback: match by size and grind only
    const fallbackVariant = !selectedVariant
      ? p.variants?.find(
          (v) => v.size === options.size && v.grind === options.grind
        )
      : null;
    const variant = selectedVariant || fallbackVariant;

    if (!variant || variant.stock <= 0) return;

    // Use the user's chosen roast style, not the raw variant roastType
    // so "omni" never leaks into the cart label
    const roastLabel =
      options.roastStyle ||
      (variant.roastType === "omni" ? "" : variant.roastType) ||
      (p.roastType === "omni" ? "" : p.roastType) ||
      "";

    const cartItem: Omit<CartItem, "quantity"> = {
      id: variant._id,
      productType: "coffee",
      productId: p.id,
      variantId: variant._id,
      sku: variant.sku,
      name: `${p.name} — ${options.size} — ${options.grind}`,
      price: variant.price,
      img: variant.img || p.img || "/test.webp",
      size: variant.size,
      grind: variant.grind,
      stock: variant.stock,
      roastType: roastLabel,
    };

    addItem(cartItem, options.quantity);
    setAddedMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [p.id]: false })), 1200);
  }

  if (loading) {
    return (
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-4" />
            <div className="h-12 bg-gray-200 rounded w-64 mb-8" />
            <div className="flex gap-5 overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-64 h-96 bg-gray-200 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="bestseller-heading"
      className="py-16 bg-white overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-black" />
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 flex items-center gap-2">
                <Coffee size={14} />
                Customer Favorites
              </p>
            </div>
            <h2
              id="bestseller-heading"
              className="text-4xl md:text-5xl font-bold tracking-tight mb-3"
              style={{ color: COLORS.primary }}
            >
              Best Sellers
            </h2>
            <p className="text-neutral-500 max-w-md text-sm md:text-base leading-relaxed">
              Discover our most loved roasts — handpicked by thousands of coffee
              enthusiasts and freshly roasted to order.
            </p>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <Link
              href="/coffee"
              className="group text-sm font-medium hover:text-neutral-600 transition-colors flex items-center gap-1"
            >
              View All Products
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
            role="list"
            aria-label="Best seller products"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {products.map((p, i) => (
              <ProductCard
                key={`${p.id}-${i}`}
                product={p}
                index={i}
                onAddToCart={handleAdd}
                isAdded={addedMap[p.id] || false}
              />
            ))}
          </div>

          <div className="lg:hidden">
            <div className="flex justify-center mt-6">
              <p className="text-xs text-neutral-400 font-medium flex items-center gap-2">
                <span className="animate-arrow-left">←</span>
                <span>Swipe</span>
                <span className="animate-arrow-right">→</span>
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              disabled={!mounted || !canScrollLeft}
              className={`p-3 rounded-full border-2 border-black transition-all duration-300 ${
                !canScrollLeft
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-black hover:text-white hover:scale-110 active:scale-95"
              }`}
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </button>
            <button
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              disabled={!mounted || !canScrollRight}
              className={`p-3 rounded-full border-2 border-black transition-all duration-300 ${
                !canScrollRight
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-black hover:text-white hover:scale-110 active:scale-95"
              }`}
            >
              <ChevronRight size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/coffee"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-black text-white font-semibold rounded-full hover:bg-neutral-800 transition-all duration-300 hover:shadow-lg active:scale-95"
            >
              View All Coffee
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        @keyframes arrow-left {
          0%,
          100% {
            transform: translateX(0);
            opacity: 0.4;
          }
          50% {
            transform: translateX(-4px);
            opacity: 1;
          }
        }
        @keyframes arrow-right {
          0%,
          100% {
            transform: translateX(0);
            opacity: 0.4;
          }
          50% {
            transform: translateX(4px);
            opacity: 1;
          }
        }
        .animate-arrow-left {
          display: inline-block;
          animation: arrow-left 1.5s ease-in-out infinite;
        }
        .animate-arrow-right {
          display: inline-block;
          animation: arrow-right 1.5s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}