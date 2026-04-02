"use client";

import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart, Star } from "lucide-react";
import useCart, { CartItem } from "../store/CartStore";
import { getCloudinaryUrl, isVideo } from "@/app/utils/cloudinary";

interface Variant {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  roastType?: "espresso" | "filter" | "omni" | "decaf";
  price: number;
  stock: number;
  img: string;
  RostType?: string;
}

export type Product = {
  id: string;
  slug?: string;
  name: string;
  origin?: string;
  notes?: string;
  price?: number;
  prices?: Record<string, number>;
  img?: string;
  images?: string[];
  grinds?: string[];
  stock?: number;
  roastType?: "espresso" | "filter" | "omni" | "decaf" | null;
  availableSizes?: Array<{
    size: string;
    price: number;
    availableGrinds?: string[];
    totalStock?: number;
  }>;
  availableGrinds?: string[];
  minPrice?: number;
  variants?: Variant[];
  bestSeller?: boolean;
};

// ── Helper: expand "omni" into ["espresso", "filter"] ─────────────────────────
// "decaf" stays as its own standalone type — it is NOT expanded.
function expandRoastType(
  rt: string
): ("espresso" | "filter" | "decaf")[] {
  if (rt === "omni") return ["espresso", "filter"];
  if (rt === "espresso" || rt === "filter") return [rt];
  if (rt === "decaf") return ["decaf"];
  return [];
}

// ── Roast Type Badge ──────────────────────────────────────────────────────────
const ROAST_TYPE_BADGE_META: Record<
  "espresso" | "filter" | "omni" | "decaf",
  { label: string }
> = {
  espresso: { label: "Espresso roast" },
  filter: { label: "Filter roast" },
  omni: { label: "Espresso & filter" },
  decaf: { label: "Decaf" },
};

function RoastTypeBadge({ type }: { type: "espresso" | "filter" | "omni" | "decaf" }) {
  const { label } = ROAST_TYPE_BADGE_META[type];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        border: type === "decaf" ? "1px solid #a7f3d0" : "1px solid #d1d5db",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: type === "decaf" ? "#065f46" : "#6b7280",
        backgroundColor: type === "decaf" ? "#ecfdf5" : "#f9fafb",
      }}
    >
      {label}
    </span>
  );
}

// ── Roast Dot visual indicator ─────────────────────────────────────���──────────
function RoastDot({ type }: { type: "espresso" | "filter" | "omni" | "decaf" }) {
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
  if (type === "decaf") {
    return (
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#10b981",
          flexShrink: 0,
        }}
      />
    );
  }
  // filter
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

export default function ProductCard({
  product,
  index,
}: {
  product: Product;
  index?: number;
}) {
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);

  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [size, setSize] = useState<string>("");
  const [grind, setGrind] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [localAdded, setLocalAdded] = useState(false);

  const [roastStyle, setRoastStyle] = useState<"espresso" | "filter" | "decaf" | "">("");

  const allNotes = useMemo(
    () =>
      (product.notes || "")
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0),
    [product.notes]
  );
  const MIN_SHOWN = 3;
  const [showAllNotes, setShowAllNotes] = useState(false);
  const notesToShow = showAllNotes ? allNotes : allNotes.slice(0, MIN_SHOWN);

  const cardImagePublicIdOrUrl = useMemo(() => {
    const gallery = Array.isArray(product.images) ? product.images : [];
    const firstImage = gallery.find((id) => !isVideo(id));
    return firstImage || product.img || "/test.webp";
  }, [product.images, product.img]);

  const cardImageSrc = useMemo(() => {
    if (!cardImagePublicIdOrUrl) return "/test.webp";
    if (
      typeof cardImagePublicIdOrUrl === "string" &&
      (cardImagePublicIdOrUrl.startsWith("http://") ||
        cardImagePublicIdOrUrl.startsWith("https://") ||
        cardImagePublicIdOrUrl.startsWith("/"))
    ) {
      return cardImagePublicIdOrUrl;
    }
    return getCloudinaryUrl(cardImagePublicIdOrUrl, "medium");
  }, [cardImagePublicIdOrUrl]);

  const availableSizes = useMemo(() => {
    const sizes =
      product.availableSizes && product.availableSizes.length > 0
        ? product.availableSizes.map((s) => ({ size: s.size, price: s.price }))
        : product.prices
        ? Object.entries(product.prices).map(([k, v]) => ({ size: k, price: v }))
        : [{ size: "250g", price: product.minPrice ?? product.price ?? 0 }];

    const sizeOrder: Record<string, number> = { "250g": 1, "500g": 2, "1kg": 3 };
    sizes.sort((a, b) => (sizeOrder[a.size] || 999) - (sizeOrder[b.size] || 999));
    return sizes;
  }, [product.availableSizes, product.prices, product.minPrice, product.price]);

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
      : product.grinds && product.grinds.length > 0
      ? product.grinds
      : ["whole-bean"];
  }, [size, product.availableSizes, product.availableGrinds, product.grinds]);

  // ── Roast type detection from variants (expand "omni" → espresso + filter, decaf stays as-is) ──
  const availableRoastTypesForSize = useMemo(() => {
    if (!size || !product.variants) return [];
    const roastTypes = new Set<"espresso" | "filter" | "decaf">();
    product.variants
      .filter((v) => v.size === size && v.roastType)
      .forEach((v) => {
        for (const rt of expandRoastType(v.roastType!)) {
          roastTypes.add(rt);
        }
      });
    return Array.from(roastTypes);
  }, [size, product.variants]);

  const allProductRoastTypes = useMemo(() => {
    if (!product.variants) return [];
    const roastTypes = new Set<"espresso" | "filter" | "decaf">();
    product.variants
      .filter((v) => v.roastType)
      .forEach((v) => {
        for (const rt of expandRoastType(v.roastType!)) {
          roastTypes.add(rt);
        }
      });
    return Array.from(roastTypes);
  }, [product.variants]);

  // ── Derived roast type: falls back to variants when product.roastType is missing ──
  const derivedRoastType = useMemo((): "espresso" | "filter" | "omni" | "decaf" | null => {
    if (product.roastType) return product.roastType;
    if (allProductRoastTypes.length === 1) return allProductRoastTypes[0];
    if (allProductRoastTypes.length > 1) {
      // If the only types are espresso and filter, it's omni
      const hasDecaf = allProductRoastTypes.includes("decaf");
      const hasEspresso = allProductRoastTypes.includes("espresso");
      const hasFilter = allProductRoastTypes.includes("filter");
      if (!hasDecaf && hasEspresso && hasFilter && allProductRoastTypes.length === 2) return "omni";
      // Mixed types — just show null and let the picker handle it
      return null;
    }
    return null;
  }, [product.roastType, allProductRoastTypes]);

  // ── Show picker when there are multiple roast choices ───────────────────────
  const showRoastPicker =
    allProductRoastTypes.length > 1 || derivedRoastType === "omni";

  // ── The list of roast options to render in the picker ───────────────────────
  // Always expanded: omni becomes ["espresso", "filter"], decaf stays as ["decaf"]
  const pickerRoastTypes = useMemo((): ("espresso" | "filter" | "decaf")[] => {
    if (allProductRoastTypes.length > 0) return allProductRoastTypes;
    return ["espresso", "filter"];
  }, [allProductRoastTypes]);

  const effectiveRoastStyle = useMemo(() => {
    if (showRoastPicker) return roastStyle;
    if (availableRoastTypesForSize.length === 1)
      return availableRoastTypesForSize[0];
    return "";
  }, [showRoastPicker, roastStyle, availableRoastTypesForSize]);

  const roastNotAvailable =
    showRoastPicker &&
    roastStyle !== "" &&
    availableRoastTypesForSize.length > 0 &&
    !availableRoastTypesForSize.includes(roastStyle as "espresso" | "filter" | "decaf");

  // ── Variant matching: an "omni" variant matches both "espresso" and "filter" ─
  // A "decaf" variant only matches "decaf"
  const selectedVariant = useMemo(() => {
    if (!product?.variants || !size || !grind) return null;

    // If a roast style is selected (or effective), try to find an exact or omni match
    if (effectiveRoastStyle) {
      // First try exact roastType match
      const exactMatch = product.variants.find(
        (v) =>
          v.size === size &&
          v.grind === grind &&
          v.roastType === effectiveRoastStyle
      );
      if (exactMatch) return exactMatch;

      // Then try omni variant (omni matches both espresso and filter, but NOT decaf)
      if (effectiveRoastStyle !== "decaf") {
        const omniMatch = product.variants.find(
          (v) =>
            v.size === size &&
            v.grind === grind &&
            v.roastType === "omni"
        );
        if (omniMatch) return omniMatch;
      }
    }

    // Fallback: match by size and grind only (for products without roast types)
    return (
      product.variants.find((v) => v.size === size && v.grind === grind) || null
    );
  }, [product?.variants, size, grind, effectiveRoastStyle]);

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

  useEffect(() => {
    if (availableSizes.length > 0 && !size) setSize(availableSizes[0].size);
  }, [availableSizes, size]);

  useEffect(() => {
    if (size && availableGrindsForSize.length > 0) {
      if (!availableGrindsForSize.includes(grind)) setGrind(availableGrindsForSize[0]);
    }
  }, [size, availableGrindsForSize, grind]);

  useEffect(() => {
    if (showRoastPicker) {
      if (availableRoastTypesForSize.length === 1) {
        setRoastStyle(availableRoastTypesForSize[0]);
      } else if (
        availableRoastTypesForSize.length > 0 &&
        !availableRoastTypesForSize.includes(roastStyle as "espresso" | "filter" | "decaf")
      ) {
        setRoastStyle("");
      }
      // If no variant-level data (pure omni from product field), don't reset the selection
    }
  }, [size, showRoastPicker, availableRoastTypesForSize, roastStyle]);

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleCardClick = () => {
    if (!isFlipped) {
      const identifier = product.slug || product.id;
      router.push(`/coffee/${encodeURIComponent(identifier)}`);
    }
  };

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    const identifier = product.slug || product.id;
    router.push(`/coffee/${encodeURIComponent(identifier)}`);
  };

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    setQuantity(1);
  };

  const submitQuickAdd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (!selectedVariant) {
      alert("Please select a valid size and brew method");
      return;
    }

    if (showRoastPicker && !roastStyle) {
      alert("Please select a roast style");
      return;
    }

    if (quantity > (selectedVariant.stock || 0)) {
      alert(`Only ${selectedVariant.stock} items available`);
      return;
    }

    setProcessing(true);
    try {
      const roastLabel =
        effectiveRoastStyle ||
        selectedVariant.RostType ||
        selectedVariant.roastType ||
        derivedRoastType ||
        "";

      const cartItem: Omit<CartItem, "quantity"> = {
        id: selectedVariant._id,
        productType: "coffee",
        productId: product.id,
        variantId: selectedVariant._id,
        sku: selectedVariant.sku,
        name: `${product.name} — ${selectedVariant.size} — ${selectedVariant.grind}`,
        price: selectedVariant.price,
        img: selectedVariant.img || product.img || "/test.webp",
        size: selectedVariant.size,
        grind: selectedVariant.grind,
        stock: selectedVariant.stock,
        roastType: roastLabel,
      };

      addItem(cartItem, quantity);

      setLocalAdded(true);
      setTimeout(() => {
        setLocalAdded(false);
        setIsFlipped(false);
      }, 1200);
    } catch (error) {
      console.error("Failed to add to cart:", error);
      alert("Failed to add to cart");
    } finally {
      setProcessing(false);
    }
  };

  const unitPriceForSize = (s: string): number => {
    if (product.availableSizes) {
      const sizeData = product.availableSizes.find((sz) => sz.size === s);
      return sizeData?.price ?? product.minPrice ?? product.price ?? 0;
    }
    return (
      (product.prices && product.prices[s]) ??
      product.minPrice ??
      product.price ??
      0
    );
  };

  const displayedMin = useMemo(() => {
    if (product.availableSizes && product.availableSizes.length > 0) {
      let min = product.availableSizes[0];
      for (const s of product.availableSizes) {
        if (s.price < min.price) min = s;
      }
      return { price: min.price, size: min.size };
    }

    if (product.prices && Object.keys(product.prices).length > 0) {
      const entries = Object.entries(product.prices);
      let minEntry = entries[0];
      for (const e of entries) {
        if (e[1] < minEntry[1]) minEntry = e;
      }
      return { price: minEntry[1], size: minEntry[0] };
    }

    const p = product.minPrice ?? product.price ?? 0;
    return { price: p, size: product.availableSizes?.[0]?.size ?? "250g" };
  }, [product.availableSizes, product.prices, product.minPrice, product.price]);

  const availableStock = selectedVariant?.stock ?? 0;
  const isOutOfStock = selectedVariant ? availableStock === 0 : false;

  return (
    <div
      onClick={handleCardClick}
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="group w-full mx-auto sm:mx-0 bg-white rounded-2xl border border-gray-200 relative transition-all duration-300 hover:-translate-y-1 cursor-pointer"
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
              priority={index !== undefined && index < 4}
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
                {notesToShow.map((note, idx) => (
                  <span
                    key={note + idx}
                    title={note}
                    className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-sm hover:shadow-md transition-shadow duration-150"
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
                    aria-label={showAllNotes ? "Show less notes" : "Show more notes"}
                  >
                    {showAllNotes ? "Show less" : `+${allNotes.length - MIN_SHOWN} more`}
                  </button>
                )}
              </div>
            )}

            <div className="mt-auto mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  £{displayedMin.price.toFixed(2)}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {displayedMin.size}
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
                      aria-label={`Quick add ${product.name} to cart`}
                    >
                      <ShoppingCart size={16} />
                      <span>Quick Add</span>
                    </button>
                    <button
                      onClick={handleLearnMore}
                      className="px-4 py-2.5 text-gray-700 text-sm font-semibold hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={`Learn more about ${product.name}`}
                    >
                      Details
                    </button>
                  </div>
                </div>

                <div className="lg:hidden flex gap-2">
                  <button
                    onClick={openQuickAdd}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                    aria-label={`Quick add ${product.name} to cart`}
                  >
                    <ShoppingCart size={16} />
                    <span>Add to cart</span>
                  </button>
                  <button
                    onClick={handleLearnMore}
                    className="px-4 py-2.5 text-gray-700 text-sm font-semibold hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label={`Learn more about ${product.name}`}
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
          className="absolute inset-0 w-full h-full bg-white rounded-2xl p-5 flex flex-col overflow-hidden"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-4 flex-shrink-0">
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

          {/* Scrollable options area */}
          <div
            className="space-y-4 flex-1 overflow-y-auto min-h-0"
            style={{ scrollbarWidth: "thin" }}
          >
            {/* Size */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                Size
              </label>
              <div className="flex gap-2">
                {availableSizes.map((s) => (
                  <button
                    key={s.size}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSize(s.size);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                      size === s.size
                        ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                    }`}
                  >
                    <div className="font-bold">{s.size}</div>
                    <div className="text-xs opacity-75 mt-0.5">
                      £{unitPriceForSize(s.size).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Roast Style picker ── */}
            {showRoastPicker && (
              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Roast Style
                </label>
                <div className="flex gap-2">
                  {pickerRoastTypes.map((rs) => {
                    // Check availability per size (already expanded, so no "omni" values here)
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
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                          !isAvailableForSize
                            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50"
                            : roastStyle === rs
                            ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                        }`}
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <RoastDot type={rs} />
                          {rs === "espresso" ? "Espresso" : rs === "decaf" ? "Decaf" : "Filter"}
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
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Roast Style
                </label>
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2 text-sm font-medium bg-gray-50 text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <RoastDot type={availableRoastTypesForSize[0]} />
                    {availableRoastTypesForSize[0] === "espresso"
                      ? "Espresso"
                      : availableRoastTypesForSize[0] === "decaf"
                      ? "Decaf"
                      : "Filter"}
                  </span>
                </div>
              </div>
            )}

            {/* Grind / Brew Method */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                Brew Method
              </label>
              {availableGrindsForSize.length > 1 ? (
                <select
                  value={grind}
                  onChange={(e) => setGrind(e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-200 px-4 py-2 text-sm font-medium focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 focus:outline-none transition-all bg-white"
                  style={{ fontSize: "16px" }}
                >
                  {availableGrindsForSize.map((g) => (
                    <option key={g} value={g}>
                      {formatGrindName(g)}
                    </option>
                  ))}
                </select>
              ) : availableGrindsForSize.length === 1 ? (
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2 text-sm font-medium bg-gray-50 text-gray-700">
                  {formatGrindName(availableGrindsForSize[0])}
                </div>
              ) : (
                <div className="w-full rounded-lg border-2 border-gray-200 px-4 py-2 text-sm font-medium bg-gray-50 text-gray-500">
                  No brew methods available for this size
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
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
                    setQuantity((q) => Math.min(q + 1, availableStock || 999));
                  }}
                  disabled={isOutOfStock || !selectedVariant}
                  className="w-9 h-9 rounded-lg border border-gray-300 font-bold text-gray-700 hover:bg-white transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Buttons — pinned at bottom */}
          <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100 flex-shrink-0">
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