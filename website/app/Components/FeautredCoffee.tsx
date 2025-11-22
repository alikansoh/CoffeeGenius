"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Star, ShoppingCart, Check, ChevronLeft, ChevronRight } from "lucide-react";
import useCart from "../store/CartStore";

export type Product = {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  img?: string;
  rating?: number;
};

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

/**
 * BestSellerSlider
 *
 * - A responsive, accessible slider of "Best Seller" product cards.
 * - Uses a simple scroll-snap horizontal scroller so it's robust and avoids hydration mismatch.
 * - Left/right buttons scroll by the viewport width. Works with mouse, touch, keyboard.
 * - Add-to-cart is wired to the Zustand store (useCart.addItem).
 *
 * Usage: <BestSellerSlider /> anywhere on a client page. Ensure store/cartStore.ts exists.
 */
const defaultProducts: Product[] = [
  {
    id: "espresso-blend",
    name: "Signature Espresso Blend",
    origin: "House Blend",
    notes: "Rich chocolate, toffee, smooth crema",
    price: 14.0,
    img: "/placeholder-espresso.jpg",
    rating: 4.9,
  },
  {
    id: "ethiopian-light",
    name: "Ethiopian Light Roast",
    origin: "Yirgacheffe, Ethiopia",
    notes: "Citrus, floral, honey sweetness",
    price: 12.5,
    img: "/placeholder-bean.jpg",
    rating: 4.8,
  },
  {
    id: "colombian-medium",
    name: "Colombian Medium Roast",
    origin: "Huila, Colombia",
    notes: "Caramel, chocolate, balanced body",
    price: 11.0,
    img: "/placeholder-bean2.jpg",
    rating: 4.7,
  },
  {
    id: "sumatra-dark",
    name: "Sumatra Dark Roast",
    origin: "Sumatra, Indonesia",
    notes: "Earthy, spicy, heavy body",
    price: 13.5,
    img: "/placeholder-bean3.jpg",
    rating: 4.6,
  },
];

export default function BestSellerSlider({ products = defaultProducts }: { products?: Product[] }) {
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // mark mounted to safely use client-only APIs if needed later
    setTimeout(() => setMounted(true), 0);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    function update() {
      const container = containerRef.current!;
      setCanScrollLeft(container.scrollLeft > 10);
      setCanScrollRight(container.scrollLeft + container.clientWidth + 10 < container.scrollWidth);
    }
    update();

    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [products.length]);

  function scrollByView(direction: "left" | "right") {
    const container = containerRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.9; // scroll nearly one viewport of the slider
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }

  function handleAdd(p: Product) {
    addItem({ id: p.id, name: p.name, price: p.price, img: p.img }, 1);
    setAddedMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [p.id]: false })), 1400);
  }

  return (
    <section aria-labelledby="bestseller-heading" className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 id="bestseller-heading" className="text-3xl md:text-4xl font-extrabold" style={{ color: COLORS.primary }}>
              Our Best Sellers
            </h2>
            <p className="mt-2 text-sm text-gray-500">Loved by customers — freshly roasted and highly rated.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <Star size={16} className="text-amber-400" />
              <span>Top rated</span>
            </div>

            {/* Left / Right controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollByView("left")}
                aria-label="Scroll left"
                disabled={!mounted || !canScrollLeft}
                className={`p-2 rounded-full bg-white border border-gray-100 shadow-sm hover:shadow-md focus:outline-none ${!canScrollLeft ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollByView("right")}
                aria-label="Scroll right"
                disabled={!mounted || !canScrollRight}
                className={`p-2 rounded-full bg-white border border-gray-100 shadow-sm hover:shadow-md focus:outline-none ${!canScrollRight ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Slider viewport */}
        <div
          ref={trackRef}
          className="relative"
        >
          <div
            ref={containerRef}
            className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-6"
            // accessibility
            role="list"
            aria-label="Best seller products"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {products.map((p) => (
              <article
                key={p.id}
                role="listitem"
                className="snap-center shrink-0 w-[88%] sm:w-[44%] md:w-1/3 lg:w-1/4 xl:w-1/5"
              >
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col h-full">
                  {/* Image top */}
                  <div className="relative w-full h-56 sm:h-64 md:h-56 lg:h-64 bg-gray-50">
                    {p.img ? (
                      <Image src={p.img} alt={p.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-200" />
                    )}
                    <div className="absolute left-3 top-3 inline-flex items-center gap-2 bg-white/95 px-3 py-1 rounded-full text-xs font-medium shadow-sm">
                      <Star size={14} className="text-amber-400" />
                      <span className="text-amber-700">{p.rating?.toFixed(1) ?? "—"}</span>
                    </div>
                  </div>

                  {/* Title under image, description below */}
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: COLORS.primary }}>{p.name}</h3>
                    {p.origin && <div className="text-sm text-gray-500 mb-2">{p.origin}</div>}
                    <p className="text-sm text-gray-700 mb-4 line-clamp-3">{p.notes}</p>

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-gray-500">From</div>
                        <div className="text-lg font-bold" style={{ color: COLORS.primary }}>
                          £{p.price.toFixed(2)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleAdd(p)}
                        className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        aria-label={`Add ${p.name} to cart`}
                      >
                        {addedMap[p.id] ? (
                          <>
                            <Check size={16} />
                            Added
                          </>
                        ) : (
                          <>
                            <ShoppingCart size={16} />
                            Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Optional small indicators (dots) */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {products.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  // scroll to product i
                  const container = containerRef.current;
                  if (!container) return;
                  const card = container.children[i] as HTMLElement | undefined;
                  if (!card) return;
                  card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
                className="w-2 h-2 rounded-full bg-gray-300 hover:bg-gray-400"
                aria-label={`Go to product ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}