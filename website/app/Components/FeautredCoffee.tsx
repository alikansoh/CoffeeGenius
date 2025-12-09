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
  grind:  string;
  price: number;
  stock: number;
  img: string;
}

interface SizePrice {
  size: string;
  price: number;
  availableGrinds?:  string[];
  totalStock?: number;
}

interface ApiCoffee {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  notes?:  string;
  img: string;
  images?: string[];
  roastLevel?:  "light" | "medium" | "dark";
  minPrice:  number;
  availableGrinds:  string[];
  availableSizes: SizePrice[];
  variants: Variant[];
  bestSeller: boolean;
}

export type Product = {
  id: string;
  slug: string;
  name:  string;
  origin?:  string;
  notes?: string;
  price: number;
  prices?: Record<string, number>;
  img?:  string;
  images?: string[];
  roastLevel?: "light" | "medium" | "dark";
  availableSizes?:  SizePrice[];
  availableGrinds?: string[];
  variants?:  Variant[];
  bestSeller?: boolean;
};

type QuickAddOptions = {
  size: string;
  grind:  string;
  quantity: number;
};

const COLORS = {
  primary:  "#111827",
};

function RoastLevelIndicator({ level }: { level: Product["roastLevel"] }) {
  if (! level) return null;

  const levelMap:  Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };
  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-200">
      <div className="flex items-center gap-1">
        {[1, 2, 3]. map((bean) => (
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
      <div className="h-3 w-px bg-neutral-300" />
      <span className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold">
        {level}
      </span>
    </div>
  );
}

function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded:  isAddedProp,
}: {
  product: Product;
  index: number;
  onAddToCart?:  (product: Product, options: QuickAddOptions) => void;
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
        : product. img;

    if (! primary) return "/test.webp";

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
      product.availableSizes?.map((s) => s.size).sort() ||
      (product.prices ? Object.keys(product.prices).sort() : ["250g"]),
    [product.availableSizes, product.prices]
  );

  const availableGrindsForSize = useMemo(
    () =>
      product.availableSizes?.find((s) => s.size === size)?.availableGrinds ||
      product.availableGrinds || ["whole-bean"],
    [product.availableSizes, product.availableGrinds, size]
  );

  const selectedVariant = product.variants?.find(
    (v) => v.size === size && v.grind === grind
  );

  useEffect(() => {
    if (availableSizes. length > 0 && ! size) {
      setSize(availableSizes[0]);
    }
  }, [availableSizes, size]);

  useEffect(() => {
    if (availableGrindsForSize. length > 0 && !grind) {
      setGrind(availableGrindsForSize[0]);
    }
  }, [availableGrindsForSize, grind]);

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window. innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleCardClick = () => {
    if (!isFlipped) {
      router.push(`/coffee/${encodeURIComponent(product.slug)}`);
    }
  };

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    setQuantity(1);
  };

  const submitQuickAdd = async (e?:  React.MouseEvent) => {
    e?.stopPropagation();
    if (!onAddToCart || ! selectedVariant) return;

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

  const displayNotes = (product.notes || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const unitPriceForSize = (s: string): number => {
    const sizePrice = product.availableSizes?.find(
      (sz) => sz.size === s
    )?.price;
    if (sizePrice !== undefined) return sizePrice;

    const pricesPrice = product.prices?.[s];
    if (pricesPrice !== undefined) return pricesPrice;

    return product.price || 0;
  };

  const displayPrice = useMemo(() => {
    if (product.availableSizes && product.availableSizes.length > 0) {
      const prices = product.availableSizes
        .map((s) => s.price)
        .filter((p) => p > 0);
      if (prices.length > 0) return Math.min(...prices);
    }
    if (product.prices) {
      const priceValues = Object.values(product.prices).filter((p) => p > 0);
      if (priceValues. length > 0) return Math.min(...priceValues);
    }
    return product.price || 0;
  }, [product.availableSizes, product. prices, product.price]);

  const isOutOfStock = selectedVariant ?  selectedVariant.stock === 0 : false;

  if (! product || !product.id) {
    console.warn("Invalid product data:", product);
    return null;
  }

  return (
    <article
      role="listitem"
      className="shrink-0 w-[82%] sm:w-[46%] md:w-[32%] lg:w-[24%] xl:w-[22%] transition-all duration-500 opacity-100 translate-y-0"
      style={{ transitionDelay: `${index * 80}ms` }}
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div
        className="group relative rounded-xl overflow-hidden cursor-pointer bg-white flex flex-col h-full transition-all duration-500 border-2 border-neutral-200"
        style={{ perspective: 1000 }}
      >
        <div
          className="relative w-full h-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ?  "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: 600,
          }}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 w-full h-full bg-white rounded-xl flex flex-col"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* ENHANCED IMAGE CONTAINER - Changed from aspect-3/4 to fixed height */}
            <div className="relative w-full bg-neutral-100 rounded-t-xl overflow-hidden h-[400px]">
              <Image
                src={cardImageSrc}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 82vw, (max-width:  768px) 46vw, (max-width: 1024px) 32vw, (max-width: 1280px) 24vw, 22vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                priority={index < 4}
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {product.bestSeller && (
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-amber-900 text-white rounded-full shadow-lg">
                    <Star size={12} className="fill-white" />
                    <span>Best Seller</span>
                  </span>
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col flex-1">
              {product.origin && (
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1">
                  {product.origin}
                </p>
              )}

              <h3
                className="text-base font-bold mb-2 leading-snug"
                style={{ color: COLORS.primary }}
              >
                {product.name}
              </h3>

              {product.roastLevel && (
                <div className="mb-3">
                  <RoastLevelIndicator level={product.roastLevel} />
                </div>
              )}

              {displayNotes.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-2">
                    Tasting Notes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {displayNotes.map((note, idx) => (
                      <span
                        key={idx}
                        className="relative inline-flex items-center px-3 py-1.5 text-xs font-semibold text-amber-900 rounded-full bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 border-2 border-amber-200 shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-neutral-100 mt-auto">
                <div>
                  <span className="text-xs text-neutral-400">From</span>
                  <div
                    className="text-xl font-bold tracking-tight"
                    style={{ color:  COLORS.primary }}
                  >
                    £{displayPrice. toFixed(2)}
                  </div>
                </div>

                {! isAdded && (
                  <button
                    onClick={openQuickAdd}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-black text-white hover:bg-neutral-800 transition-all duration-200"
                    aria-label={`Quick add ${product.name} to cart`}
                  >
                    <ShoppingCart size={16} />
                    <span>Add</span>
                  </button>
                )}

                {isAdded && (
                  <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                    <Check className="w-4 h-4" />
                    <span className="font-medium text-sm">Added</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BACK (Quick Add) */}
          <div
            className="absolute inset-0 w-full h-full bg-white rounded-xl p-4 flex flex-col"
            style={{
              backfaceVisibility:  "hidden",
              transform: "rotateY(180deg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-0.5">Quick add</p>
              <h3 className="text-lg font-semibold text-gray-900">
                {product.name}
              </h3>
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Size
                </label>
                <div className="flex gap-2">
                  {availableSizes. map((s) => {
                    const sizePrice = unitPriceForSize(s);
                    return (
                      <button
                        key={s}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSize(s);
                        }}
                        className={`flex-1 px-3 py-2 rounded text-sm font-semibold transition-all border ${
                          s === size
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200"
                        }`}
                      >
                        <div>{s}</div>
                        <div className="text-xs opacity-75">
                          £{sizePrice.toFixed(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Brew method
                </label>
                <select
                  value={grind || ""}
                  onChange={(e) => setGrind(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none bg-white"
                  style={{ fontSize: "16px" }}
                >
                  {(availableGrindsForSize || [])
                    .filter((g): g is string => Boolean(g))
                    .map((g) => (
                      <option key={g} value={g}>
                        {g. charAt(0).toUpperCase() +
                          g.slice(1).replace("-", " ")}
                      </option>
                    ))}

                  {(! availableGrindsForSize ||
                    availableGrindsForSize.length === 0) && (
                    <option value="" disabled>
                      No grind options available
                    </option>
                  )}
                </select>
              </div>

              {selectedVariant && (
                <div className="text-sm font-semibold">
                  {isOutOfStock ?  (
                    <span className="text-red-600">Out of stock</span>
                  ) : selectedVariant.stock < 10 ? (
                    <span className="text-amber-600">
                      Only {selectedVariant.stock} left
                    </span>
                  ) : (
                    <span className="text-green-600">
                      {selectedVariant.stock} in stock
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Quantity
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuantity((q) => Math.max(1, q - 1));
                    }}
                    disabled={isOutOfStock || ! selectedVariant}
                    className="w-9 h-9 rounded border border-gray-300 font-bold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled: cursor-not-allowed"
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
                        Math.min(q + 1, selectedVariant?. stock || 999)
                      );
                    }}
                    disabled={isOutOfStock || !selectedVariant}
                    className="w-9 h-9 rounded border border-gray-300 font-bold text-gray-700 hover: bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={(e) => {
                  e. stopPropagation();
                  setIsFlipped(false);
                }}
                className="flex-1 px-3 py-2 rounded border border-gray-300 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitQuickAdd}
                disabled={processing || ! selectedVariant || isOutOfStock}
                className={`flex-1 px-3 py-2 rounded text-sm font-semibold transition-colors ${
                  processing || !selectedVariant || isOutOfStock
                    ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                    : "bg-gray-900 text-white hover: bg-gray-800"
                }`}
              >
                {processing
                  ? "Adding..."
                  : isOutOfStock
                  ? "Out of stock"
                  : "Add to cart"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
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
        const response = await fetch("/api/coffee? bestSeller=true&limit=10");

        if (!response.ok) {
          throw new Error("Failed to fetch best sellers");
        }

        const data = await response.json();

        const transformedProducts:  Product[] = data.data.map(
          (coffee: ApiCoffee) => {
            const prices:  Record<string, number> = {};
            if (coffee.availableSizes && coffee.availableSizes.length > 0) {
              coffee.availableSizes.forEach((sizeObj:  SizePrice) => {
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
              bestSeller: coffee. bestSeller,
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

  function handleAdd(p: Product, options:  QuickAddOptions) {
    const selectedVariant = p.variants?. find(
      (v) => v.size === options.size && v.grind === options.grind
    );

    if (! selectedVariant) return;
    if (selectedVariant.stock <= 0) return;

    const cartItem:  Omit<CartItem, "quantity"> = {
      id: selectedVariant._id,
      productType: "coffee",
      productId: p.id,
      variantId: selectedVariant._id,
      sku: selectedVariant.sku,
      name: `${p.name} — ${options.size} — ${options.grind}`,
      price: selectedVariant. price,
      img: selectedVariant.img || p.img || "/test. webp",
      size: selectedVariant.size,
      grind: selectedVariant.grind,
      stock: selectedVariant.stock,
    };

    addItem(cartItem, options. quantity);
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
              {[1, 2, 3, 4]. map((i) => (
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
              style={{ color:  COLORS.primary }}
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
              WebkitOverflowScrolling:  "touch",
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
                isAdded={addedMap[p. id] || false}
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
              disabled={!mounted || ! canScrollLeft}
              className={`p-3 rounded-full border-2 border-black transition-all duration-300 ${
                ! canScrollLeft
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
        .scrollbar-hide: :-webkit-scrollbar {
          display: none;
        }

        @keyframes arrow-left {
          0%,
          100% {
            transform: translateX(0);
            opacity: 0. 4;
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
            transform:  translateX(4px);
            opacity: 1;
          }
        }

        .animate-arrow-left {
          display: inline-block;
          animation: arrow-left 1. 5s ease-in-out infinite;
        }

        .animate-arrow-right {
          display: inline-block;
          animation: arrow-right 1.5s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}