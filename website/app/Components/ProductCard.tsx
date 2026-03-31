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
  roastType?: "espresso" | "filter" | "omni" | null;
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

  const isOmni = product.roastType === "omni";
  const [roastStyle, setRoastStyle] = useState<"espresso" | "filter" | "">(
    isOmni ? "" : ""
  );

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

  const selectedVariant = useMemo(() => {
    if (!product?.variants || !size || !grind) return null;
    return product.variants.find((v) => v.size === size && v.grind === grind) || null;
  }, [product?.variants, size, grind]);

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

    if (isOmni && !roastStyle) {
      alert("Please select a roast style (Espresso or Filter)");
      return;
    }

    if (quantity > (selectedVariant.stock || 0)) {
      alert(`Only ${selectedVariant.stock} items available`);
      return;
    }

    setProcessing(true);
    try {
      const roastLabel = isOmni
        ? roastStyle
        : selectedVariant.RostType || product.roastType || "";

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

  const ROAST_TYPE_META: Record<
    "espresso" | "filter" | "omni",
    { label: string; pill: string; text: string; icon: string }
  > = {
    espresso: {
      label: "Espresso",
      pill: "bg-gradient-to-r from-amber-400 to-amber-600",
      text: "text-white",
      icon: "☕",
    },
    filter: {
      label: "Filter",
      pill: "bg-gradient-to-r from-sky-300 to-sky-500",
      text: "text-white",
      icon: "🫖",
    },
    omni: {
      label: "Omni Roast",
      pill: "bg-gradient-to-r from-emerald-400 to-emerald-600",
      text: "text-white",
      icon: "✺",
    },
  };

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
        {/* FRONT */}
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
            <div className="mb-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
                {product.roastType && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap flex-shrink-0 ${ROAST_TYPE_META[product.roastType].pill} ${ROAST_TYPE_META[product.roastType].text}`}
                  >
                    <span>{ROAST_TYPE_META[product.roastType].icon}</span>
                    {ROAST_TYPE_META[product.roastType].label}
                  </span>
                )}
              </div>
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

        {/* BACK */}
        <div
          className="absolute inset-0 top-0 left-0 w-full h-full bg-white rounded-2xl p-5 flex flex-col"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="mb-5">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Configure
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
              {product.bestSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  <Star size={10} className="fill-white" />
                </span>
              )}
            </div>
            {product.origin && (
              <p className="text-xs text-gray-500 mt-1">{product.origin}</p>
            )}
            {product.roastType && (
              <span
                className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${ROAST_TYPE_META[product.roastType].pill} ${ROAST_TYPE_META[product.roastType].text}`}
              >
                <span>{ROAST_TYPE_META[product.roastType].icon}</span>
                {ROAST_TYPE_META[product.roastType].label}
              </span>
            )}
          </div>

          <div className="space-y-4 flex-1">
            {/* Roast Style — only for omni */}
            {isOmni && (
              <div>
                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                  Roast Style
                </label>
                <div className="flex gap-2">
                  {(["espresso", "filter"] as const).map((rs) => (
                    <button
                      key={rs}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRoastStyle(rs);
                      }}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                        roastStyle === rs
                          ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                      }`}
                    >
                      {rs === "espresso" ? "☕ Espresso" : "🫖 Filter"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size */}
            <div>
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
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
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                      size === s.size
                        ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                    }`}
                  >
                    <div className="font-bold">{s.size}</div>
                    <div className="text-xs opacity-75 mt-1">
                      £{unitPriceForSize(s.size).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Grind / Brew Method */}
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
                  {availableGrindsForSize.map((g) => (
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
                (isOmni && !roastStyle)
              }
              className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {processing
                ? "Adding..."
                : isOutOfStock
                ? "Out of Stock"
                : "Add to cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}