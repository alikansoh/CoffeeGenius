"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  ArrowRight,
  ZoomIn,
  Play,
} from "lucide-react";
import useCart from "../store/CartStore";

export type Product = {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  prices?: {
    "250g"?: number;
    "1kg"?: number;
  };
  img?: string;
  roastLevel?: "light" | "medium" | "dark";
};

type QuickAddOptions = {
  size: "250g" | "1kg";
  grind: "whole-bean" | "espresso" | "filter";
  quantity: number;
};

const COLORS = {
  primary: "#111827",
  accent: "#000000",
  accentHover: "#1f1f1f",
  softBg: "#FAFAFA",
};

const defaultProducts: Product[] = [
  {
    id: "espresso-blend",
    name: "Signature Espresso Blend",
    origin: "House Blend",
    notes: "Rich chocolate, silky body, long finish",
    price: 14.0,
    img: "/test.webp",
    roastLevel: "dark",
  },
  {
    id: "ethiopian-light",
    name: "Ethiopian Light Roast",
    origin: "Yirgacheffe, Ethiopia",
    notes: "Bright citrus, floral notes, honey sweetness",
    price: 12.5,
    img: "/test.webp",
    roastLevel: "light",
  },
  {
    id: "colombian-medium",
    name: "Colombian Medium Roast",
    origin: "Huila, Colombia",
    notes: "Caramel sweetness, balanced body, chocolate",
    price: 11.0,
    img: "/test.webp",
    roastLevel: "medium",
  },
  {
    id: "sumatra-dark",
    name: "Sumatra Dark Roast",
    origin: "Sumatra, Indonesia",
    notes: "Earthy, spicy, full body",
    price: 13.5,
    img: "/test.webp",
    roastLevel: "dark",
  },
  {
    id: "kenya-aa",
    name: "Kenya AA",
    origin: "Kenya",
    notes: "Bold berry notes, bright acidity, crisp finish",
    price: 13.0,
    img: "/test.webp",
    roastLevel: "medium",
  },
];

function RoastLevelIndicator({ level }: { level: Product["roastLevel"] }) {
  if (!level) return null;

  const levelMap: Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };
  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-200">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((bean) => (
          <div key={bean}>
            <Image
              src={bean <= numeric ? "/bean-filled.svg" : "/bean.svg"}
              alt=""
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </div>
        ))}
      </div>
      <div className="h-3 w-px bg-neutral-300" />
      <span className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold">
        {level}
      </span>
    </div>
  );
}

/**
 * ProductCard: ported functionality from the first component you provided.
 * - Card flip to quick-add configuration on the back
 * - Quick-add supports size, grind, quantity
 * - Quick-add calls onAddToCart(product, options)
 * - Local added state & temporary "Added" UI
 * - Navigates to product page when front is clicked (unless flipped)
 */
function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded: isAddedProp,
}: {
  product: Product;
  index: number;
  onAddToCart?: (product: Product, options?: QuickAddOptions) => void;
  isAdded?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [size, setSize] = useState<QuickAddOptions["size"]>("250g");
  const [grind, setGrind] = useState<QuickAddOptions["grind"]>("whole-bean");
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [localAdded, setLocalAdded] = useState(false);

  const isAdded = isAddedProp || localAdded;

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleCardClick = () => {
    if (!isFlipped) {
      router.push(`/coffee/${encodeURIComponent(product.id)}`);
    }
  };

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/coffee/${encodeURIComponent(product.id)}`);
  };

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    setSize("250g");
    setGrind("whole-bean");
    setQuantity(1);
  };

  const submitQuickAdd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onAddToCart) return;

    setProcessing(true);
    try {
      await Promise.resolve(onAddToCart(product, { size, grind, quantity }));
      setLocalAdded(true);
      setTimeout(() => setLocalAdded(false), 1200);
      setIsFlipped(false);
    } finally {
      setProcessing(false);
    }
  };

  const noteChips = (product.notes || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const displayNotes = noteChips.length > 0 ? noteChips.slice(0, 3) : [];

  const unitPriceForSize = (s: QuickAddOptions["size"]) =>
    (product.prices && product.prices[s]) ?? product.price;

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
        style={{
          perspective: 1000,
        }}
      >
        <div
          className="relative w-full h-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: 520,
          }}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 w-full h-full bg-white rounded-xl flex flex-col"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="relative w-full bg-neutral-100 rounded-t-xl overflow-hidden aspect-[6/5]">
              {product.img ? (
                <Image
                  src={product.img}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 82vw, (max-width: 768px) 46vw, (max-width: 1024px) 32vw, (max-width: 1280px) 24vw, 22vw"
                  className="object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  No image
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="absolute top-3 left-3">
                <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-full shadow-lg">
                  Best Seller
                </span>
              </div>
            </div>

            <div className="p-5 flex flex-col flex-1">
              {product.origin && (
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1">
                  {product.origin}
                </p>
              )}

              <h3 className="text-base font-bold mb-2 leading-snug" style={{ color: COLORS.primary }}>
                {product.name}
              </h3>

              

              {product.roastLevel && (
                <div className="mb-3">
                  <RoastLevelIndicator level={product.roastLevel} />
                </div>
              )}

              <p className="text-sm text-neutral-500 mb-4 line-clamp-2 flex-1 leading-relaxed">
                {product.notes}
              </p>

              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-neutral-100">
                <div>
                  <span className="text-xs text-neutral-400">From</span>
                  <div className="text-xl font-bold tracking-tight" style={{ color: COLORS.primary }}>
                    £{product.price.toFixed(2)}
                  </div>
                </div>

                {!isAdded && (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openQuickAdd(e);
                      }}
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-black text-white hover:bg-neutral-800 transition-all duration-200"
                      aria-label={`Quick add ${product.name} to cart`}
                    >
                      <ShoppingCart size={16} />
                      <span>Quick Add</span>
                    </button>

                
                  </div>
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
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-0.5">Configure</p>
              <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Size</label>
                <div className="flex gap-2">
                  {(["250g", "1kg"] as QuickAddOptions["size"][]).map((s) => {
                    const selected = s === size;
                    return (
                      <button
                        key={s}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSize(s);
                        }}
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                          selected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        <div>{s}</div>
                        <div className="text-xs opacity-75">£{unitPriceForSize(s).toFixed(2)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Grind</label>
                <select
                  value={grind}
                  onChange={(e) => setGrind(e.target.value as QuickAddOptions["grind"])}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  <option value="whole-bean">Whole bean</option>
                  <option value="espresso">Ground for espresso</option>
                  <option value="filter">Ground for filter</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuantity((q) => Math.max(1, q - 1));
                    }}
                    className="w-8 h-8 rounded border border-gray-300 font-medium hover:bg-gray-100 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <div className="flex-1 text-center font-medium">{quantity}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuantity((q) => q + 1);
                    }}
                    className="w-8 h-8 rounded border border-gray-300 font-medium hover:bg-gray-100 transition-colors"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                className="flex-1 px-3 py-2 rounded border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitQuickAdd}
                disabled={processing}
                className="flex-1 px-3 py-2 rounded bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {processing ? "Adding..." : "Add to cart"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * BestSellerSlider
 * - Renders a horizontal slider of ProductCard components
 * - Passes a proper onAddToCart handler that integrates with the store and consumes QuickAddOptions
 */
export default function BestSellerSlider({ products = defaultProducts }: { products?: Product[] }) {
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Update scroll button states
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateScrollState() {
      if (!container) return;
      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }

    updateScrollState();
    container.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  function scroll(direction: "left" | "right") {
    const container = containerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }

  // onAddToCart now accepts quick-add options (size, grind, quantity)
  async function handleAdd(p: Product, options?: QuickAddOptions) {
    const qty = options?.quantity ?? 1;
    // You can extend this payload to include size/grind in the cart store if it supports metadata.
    addItem({ id: p.id, name: p.name, price: p.price, img: p.img }, qty);
    setAddedMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [p.id]: false })), 1200);
  }

  return (
    <section aria-labelledby="bestseller-heading" className="py-16 bg-white overflow-hidden">
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
              Discover our most loved roasts — handpicked by thousands of coffee enthusiasts and freshly roasted to order.
            </p>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <a href="/coffee" className="group text-sm font-medium hover:text-neutral-600 transition-colors flex items-center gap-1">
              View All Products
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </a>
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

          {/* Swipe hint - below slider, only visible on small screens */}
          <div className="lg:hidden">
            <div className="flex justify-center mt-6">
              <p className="text-xs text-neutral-400 font-medium flex items-center gap-2">
                <span className="animate-arrow-left">←</span>
                <span>Swipe</span>
                <span className="animate-arrow-right">→</span>
              </p>
            </div>
          </div>

          {/* Navigation buttons - Only visible on large screens, positioned at bottom */}
          <div className="hidden lg:flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              disabled={!mounted || !canScrollLeft}
              className={`p-3 rounded-full border-2 border-black transition-all duration-300 ${
                !canScrollLeft ? "opacity-30 cursor-not-allowed" : "hover:bg-black hover:text-white hover:scale-110 active:scale-95"
              }`}
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </button>

            <button
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              disabled={!mounted || !canScrollRight}
              className={`p-3 rounded-full border-2 border-black transition-all duration-300 ${
                !canScrollRight ? "opacity-30 cursor-not-allowed" : "hover:bg-black hover:text-white hover:scale-110 active:scale-95"
              }`}
            >
              <ChevronRight size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="mt-10 flex justify-center">
            <a href="/coffee" className="group inline-flex items-center gap-2 px-8 py-4 bg-black text-white font-semibold rounded-full hover:bg-neutral-800 transition-all duration-300 hover:shadow-lg active:scale-95">
              View All Coffee
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        @keyframes arrow-left {
          0%, 100% {
            transform: translateX(0);
            opacity: 0.4;
          }
          50% {
            transform: translateX(-4px);
            opacity: 1;
          }
        }

        @keyframes arrow-right {
          0%, 100% {
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