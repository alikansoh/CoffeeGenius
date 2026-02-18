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
  roastLevel?: "light" | "medium" | "dark";
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
  roastLevel?: "light" | "medium" | "dark";
  availableSizes?: SizePrice[];
  availableGrinds?: string[];
  variants?: Variant[];
  bestSeller?: boolean;
};

type QuickAddOptions = {
  size: string;
  grind: string;
  quantity: number;
};

const COLORS = {
  primary: "#111827",
};

function RoastLevelIndicator({ level }: { level: Product["roastLevel"] }) {
  if (!level) return null;

  const levelMap: Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };
  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((bean) => (
          <Image
            key={bean}
            src={bean <= numeric ? "/bean-filled.svg" : "/bean.svg"}
            alt=""
            width={16}
            height={16}
            className="w-4 h-4"
          />
        ))}
      </div>
      <div className="h-3 w-px bg-gray-300" />
      <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
        {level}
      </span>
    </div>
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
      product.availableSizes?.map((s) => s.size).sort((a, b) => {
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

  const selectedVariant = product.variants?.find(
    (v) => v.size === size && v.grind === grind
  );

  useEffect(() => {
    if (availableSizes.length > 0 && !size) {
      setSize(availableSizes[0]);
    }
  }, [availableSizes, size]);

  useEffect(() => {
    if (size && availableGrindsForSize.length > 0) {
      if (!availableGrindsForSize.includes(grind)) {
        setGrind(availableGrindsForSize[0]);
      }
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
      router.push(`/coffee/${encodeURIComponent(product.slug)}`);
    }
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

    if (selectedVariant.stock <= 0) {
      return;
    }

    setProcessing(true);
    try {
      await Promise.resolve(onAddToCart(product, { size, grind, quantity }));
      setLocalAdded(true);
      setTimeout(() => {
        setLocalAdded(false);
        setIsFlipped(false);
      }, 1200);
    } finally {
      setProcessing(false);
    }
  };

  // Show/Hide notes ("show more/less") -- same color for all tags
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
    const sizePrice = product.availableSizes?.find(
      (sz) => sz.size === s
    )?.price;
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
    return grindMap[grindValue] || grindValue.charAt(0).toUpperCase() + grindValue.slice(1);
  };

  const availableStock = selectedVariant?.stock ?? 0;
  const isOutOfStock = selectedVariant ? availableStock === 0 : false;

  if (!product || !product.id) {
    console.warn("Invalid product data:", product);
    return null;
  }

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
              className="transition-transform duration-500 group-hover:scale-105"
              priority={index < 4}
            />
          </div>

          <div className="p-5 flex flex-col flex-1">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
              </div>
              {product.origin && (
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {product.origin}
                </p>
              )}
            </div>

            {/* FLAVOR TAGS - all are amber color */}
            {allNotes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {notesToDisplay.map((note, idx) => (
                  <span
                    key={note + idx}
                    title={note}
                    className={
                      "px-3 py-1 text-xs font-semibold rounded-full shadow-sm hover:shadow-md transition-shadow duration-150 border bg-amber-50 text-amber-800 border-amber-300"
                    }
                  >
                    #{note}
                  </span>
                ))}
                {allNotes.length > MIN_SHOWN && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setShowAllNotes(s => !s);
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

            {product.roastLevel && (
              <div className="mb-4">
                <RoastLevelIndicator level={product.roastLevel} />
              </div>
            )}

            <div className="mt-auto mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  £{currentPrice.toFixed(2)}
                </span>
                <span className="text-xs text-gray-500 font-medium">{size || "250g"}</span>
              </div>
            </div>

            {!localAdded && (
              <>
                <div
                  className={`hidden lg:block transition-all duration-300 ${
                    isHovered && isLargeScreen ? "opacity-100" : "opacity-0 pointer-events-none"
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
          onClick={(e) => e.stopPropagation()}
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
            {product.origin && <p className="text-xs text-gray-500">{product.origin}</p>}
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
                    <div className="text-xs opacity-75 mt-1">£{unitPriceForSize(s).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Stock info
            <div className="text-xs font-semibold">
              {!selectedVariant ? (
                <span className="text-amber-600">Select options to check availability</span>
              ) : isOutOfStock ? (
                <span className="text-red-600">Out of stock</span>
              ) : availableStock < 10 ? (
                <span className="text-amber-600">Only {availableStock} left in stock</span>
              ) : (
                <span className="text-green-600">{availableStock} in stock</span>
              )}
            </div> */}

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
                <div className="flex-1 text-center font-bold text-lg text-gray-900">{quantity}</div>
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
                availableGrindsForSize.length === 0
              }
              className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {processing ? "Adding..." : isOutOfStock ? "Out of Stock" : "Add to cart"}
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

        if (!response.ok) {
          throw new Error("Failed to fetch best sellers");
        }

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
              roastLevel: coffee.roastLevel,
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
    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }

  function handleAdd(p: Product, options: QuickAddOptions) {
    const selectedVariant = p.variants?.find(
      (v) => v.size === options.size && v.grind === options.grind
    );

    if (!selectedVariant) return;
    if (selectedVariant.stock <= 0) return;

    const cartItem: Omit<CartItem, "quantity"> = {
      id: selectedVariant._id,
      productType: "coffee",
      productId: p.id,
      variantId: selectedVariant._id,
      sku: selectedVariant.sku,
      name: `${p.name} — ${options.size} — ${options.grind}`,
      price: selectedVariant.price,
      img: selectedVariant.img || p.img || "/test.webp",
      size: selectedVariant.size,
      grind: selectedVariant.grind,
      stock: selectedVariant.stock,
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

  if (products.length === 0) {
    return null;
  }

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