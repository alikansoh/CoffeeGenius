"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ShoppingCart, Check, ChevronLeft, ChevronRight, Coffee, ArrowRight, ZoomIn, MoveHorizontal } from "lucide-react";
import useCart from "../store/CartStore";

export type Product = {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  img?: string;
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
  },
  {
    id: "ethiopian-light",
    name: "Ethiopian Light Roast",
    origin: "Yirgacheffe, Ethiopia",
    notes: "Bright citrus, floral notes, honey sweetness",
    price: 12.5,
    img: "/test.webp",
  },
  {
    id: "colombian-medium",
    name: "Colombian Medium Roast",
    origin: "Huila, Colombia",
    notes: "Caramel sweetness, balanced body, chocolate",
    price: 11.0,
    img: "/test.webp",
  },
  {
    id: "sumatra-dark",
    name: "Sumatra Dark Roast",
    origin: "Sumatra, Indonesia",
    notes: "Earthy, spicy, full body",
    price: 13.5,
    img: "/test.webp",
  },
  {
    id: "kenya-aa",
    name: "Kenya AA",
    origin: "Kenya",
    notes: "Bold berry notes, bright acidity, crisp finish",
    price: 13.0,
    img: "/test.webp",
  },
];

function ProductCard({ product, index, onAddToCart, isAdded }: { 
  product: Product; 
  index: number; 
  onAddToCart: (p: Product) => void;
  isAdded: boolean;
}) {
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const imageRef = useRef<HTMLDivElement | null>(null);

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !isLargeScreen) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setZoomPosition({ x, y });
  };

  const handleMouseEnter = () => {
    if (isLargeScreen) {
      setIsZooming(true);
    }
  };

  const handleMouseLeave = () => {
    setIsZooming(false);
  };

  return (
    <article
      role="listitem"
      className="shrink-0 w-[82%] sm:w-[46%] md:w-[32%] lg:w-[24%] xl:w-[22%] transition-all duration-500 opacity-100 translate-y-0"
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className="group relative rounded-xl overflow-hidden bg-white flex flex-col h-full transition-all duration-300 border-2 border-neutral-200 hover:border-black hover:shadow-2xl hover:-translate-y-2">
        <div 
          ref={imageRef}
          className={`relative w-full aspect-[6/5] bg-neutral-100 overflow-hidden ${isLargeScreen ? 'cursor-zoom-in' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {product.img ? (
            <>
              <Image
                src={product.img}
                alt={product.name}
                fill
                className="object-cover transition-opacity duration-300"
                style={{
                  opacity: isZooming ? 0 : 1,
                }}
              />
              {/* Zoomed image - only on large screens */}
              {isLargeScreen && (
                <div
                  className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
                  style={{
                    opacity: isZooming ? 1 : 0,
                    backgroundImage: `url(${product.img})`,
                    backgroundSize: '250%',
                    backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          {/* Zoom icon indicator - only show on large screens */}
          {isLargeScreen && (
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
                <ZoomIn size={16} className="text-black" />
              </div>
            </div>
          )}

          <div className="absolute top-3 left-3 transition-all duration-300 group-hover:scale-110">
            <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-full shadow-lg">
              Best Seller
            </span>
          </div>
        </div>

        <div className="p-5 flex flex-col flex-1 bg-white">
          {product.origin && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1">
              {product.origin}
            </p>
          )}

          <h3
            className="text-base font-bold mb-2 leading-snug transition-colors group-hover:text-neutral-600"
            style={{ color: COLORS.primary }}
          >
            {product.name}
          </h3>

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

            <button
              onClick={() => onAddToCart(product)}
              className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold overflow-hidden transition-all duration-300 border-2 ${
                isAdded
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-black text-white border-black hover:bg-neutral-800 hover:border-neutral-800 active:scale-95 hover:shadow-lg"
              }`}
              aria-label={`Add ${product.name} to cart`}
            >
              {isAdded && (
                <span className="absolute inset-0 bg-green-400 animate-ping opacity-30 rounded-full" />
              )}
              {isAdded ? (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  <span>Added!</span>
                </>
              ) : (
                <>
                  <ShoppingCart size={16} />
                  <span>Add</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function BestSellerSlider({ products = defaultProducts }: { products?: Product[] }) {
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  // Show swipe hint on mobile after component mounts
  useEffect(() => {
    // Check if user has seen the hint before
    const hasSeenHint = localStorage.getItem('hasSeenSwipeHint');
    
    if (!hasSeenHint && window.innerWidth < 1024) {
      const timer = setTimeout(() => {
        setShowSwipeHint(true);
      }, 800);

      // Hide hint after 4 seconds
      const hideTimer = setTimeout(() => {
        setShowSwipeHint(false);
        localStorage.setItem('hasSeenSwipeHint', 'true');
      }, 4800);

      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    }
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

  // Hide hint on user interaction
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        setShowSwipeHint(false);
        localStorage.setItem('hasSeenSwipeHint', 'true');
      }
    };

    container.addEventListener("touchstart", handleInteraction);
    container.addEventListener("scroll", handleInteraction);

    return () => {
      container.removeEventListener("touchstart", handleInteraction);
      container.removeEventListener("scroll", handleInteraction);
    };
  }, [hasInteracted]);

  function scroll(direction: "left" | "right") {
    const container = containerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }

  function handleAdd(p: Product) {
    addItem({ id: p.id, name: p.name, price: p.price, img: p.img }, 1);
    setAddedMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [p.id]: false })), 1200);
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
              Discover our most loved roasts — handpicked by thousands of coffee enthusiasts and freshly roasted to order.
            </p>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <a
              href="/shop"
              className="group text-sm font-medium hover:text-neutral-600 transition-colors flex items-center gap-1"
            >
              View All Products
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>

        <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
          {/* Swipe hint - only visible on small screens */}
          <div
            className={`lg:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none transition-opacity duration-500 ${
              showSwipeHint ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="bg-black/80 backdrop-blur-sm text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
              <MoveHorizontal size={24} className="animate-swipe-hint" />
              <span className="text-sm font-semibold whitespace-nowrap">Swipe to explore</span>
            </div>
          </div>

          <div
            ref={containerRef}
            className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide px-4 sm:px-6 lg:px-8"
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

          {/* Navigation buttons - Only visible on large screens, positioned at bottom */}
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
            <a
              href="/shop"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-black text-white font-semibold rounded-full hover:bg-neutral-800 transition-all duration-300 hover:shadow-lg active:scale-95"
            >
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

        @keyframes swipe-hint {
          0%, 100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(8px);
          }
        }

        .animate-swipe-hint {
          animation: swipe-hint 1.5s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}