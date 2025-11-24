"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ShoppingCart, Check, ChevronLeft, ChevronRight, Coffee, ArrowRight } from "lucide-react";
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
];

export default function BestSellerSlider({ products = defaultProducts }: { products?: Product[] }) {
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  // track if the user has interacted (so we don't auto-center after manual scroll)
  const userInteractedRef = useRef(false);
  // mark that initial centering has run
  const initialCenteredRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // robust activeIndex calculation based on child centers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function update() {
      if (!container) return;

      // update arrows
      setCanScrollLeft(container.scrollLeft > 8);
      setCanScrollRight(container.scrollLeft + container.clientWidth + 8 < container.scrollWidth);

      // compute the card whose center is closest to the container center
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length === 0) return;

      const containerRect = container.getBoundingClientRect();
      const containerCenter = container.scrollLeft + containerRect.width / 2;

      let closestIdx = 0;
      let closestDist = Infinity;
      children.forEach((child, idx) => {
        const childLeft = child.offsetLeft;
        const childCenter = childLeft + child.clientWidth / 2;
        const dist = Math.abs(childCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      setActiveIndex(closestIdx);
    }

    // initial update
    update();

    // listeners
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [products.length]);

  // detect user interaction (pointer/touch/wheel) so we don't auto-recenter after manual scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function markUser() {
      userInteractedRef.current = true;
    }

    container.addEventListener("pointerdown", markUser, { passive: true });
    container.addEventListener("touchstart", markUser, { passive: true });
    container.addEventListener("wheel", markUser, { passive: true });

    return () => {
      container.removeEventListener("pointerdown", markUser);
      container.removeEventListener("touchstart", markUser);
      container.removeEventListener("wheel", markUser);
    };
  }, []);

  // initial centering: only run once on mount, and on resize only if user hasn't interacted
  useEffect(() => {
    function centerInitial() {
      const container = containerRef.current;
      if (!container) return;
      // guard: don't re-center if user already interacted
      if (userInteractedRef.current) return;

      const isLarge = window.innerWidth >= 1024;
      const targetIndex = isLarge ? Math.floor(products.length / 2) : 0;
      const card = container.children[targetIndex] as HTMLElement | undefined;
      if (!card) return;
      const offset = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
      container.scrollTo({ left: offset, behavior: "smooth" });
      initialCenteredRef.current = true;
    }

    // run once on mount
    centerInitial();

    let t: number | undefined;
    function onResize() {
      // schedule a re-center only if the user hasn't interacted
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (!userInteractedRef.current) centerInitial();
      }, 120);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t) window.clearTimeout(t);
    };
  }, [products.length]);

  // auto-scroll when not hovering (keeps using activeIndex computed from actual scroll)
  useEffect(() => {
    if (!mounted || isHovering) return;

    const interval = setInterval(() => {
      const container = containerRef.current;
      if (!container) return;

      // use the current activeIndex (derived from real scroll), then advance
      const nextIndex = (activeIndex + 1) % products.length;
      const card = container.children[nextIndex] as HTMLElement | undefined;
      if (!card) return;
      const offset = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
      container.scrollTo({ left: offset, behavior: "smooth" });
    }, 4000);

    return () => clearInterval(interval);
  }, [mounted, isHovering, activeIndex, products.length]);

  function scrollByView(direction: "left" | "right") {
    const container = containerRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.9;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }

  function scrollToIndex(i: number) {
    const container = containerRef.current;
    if (!container) return;
    const card = container.children[i] as HTMLElement | undefined;
    if (!card) return;
    const offset = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
    container.scrollTo({ left: offset, behavior: "smooth" });
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
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-black animate-pulse" />
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 flex items-center gap-2">
                <Coffee size={14} className="animate-bounce" style={{ animationDuration: "2s" }} />
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

          <div className="flex items-center gap-4">
            <a
              href="/shop"
              className="group text-sm font-medium hover:text-neutral-600 transition-colors hidden md:flex items-center gap-1"
            >
              View All Products
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </a>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollByView("left")}
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
                onClick={() => scrollByView("right")}
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
          </div>
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            role="list"
            aria-label="Best seller products"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              paddingLeft: "calc(50% - 41%)",
              paddingRight: "calc(50% - 41%)",
            }}
          >
            {products.map((p, i) => (
              <article
                key={p.id}
                role="listitem"
                className={`snap-center shrink-0 w-[82%] sm:w-[46%] md:w-[32%] lg:w-[24%] xl:w-[22%] transition-all duration-500 ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div
                  className={`group rounded-xl overflow-hidden bg-neutral-50 flex flex-col h-full transition-all duration-500 hover:shadow-2xl ${
                    activeIndex === i ? "scale-[1.02] shadow-xl" : "hover:-translate-y-2"
                  }`}
                >
                  <div className="relative w-full aspect-[4/5] bg-neutral-100 overflow-hidden">
                    {p.img ? (
                      <Image
                        src={p.img}
                        alt={p.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="absolute top-3 left-3">
                      <span
                        className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-full transition-all duration-300 ${
                          activeIndex === i ? "animate-pulse" : ""
                        }`}
                      >
                        Best Seller
                      </span>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      <button
                        onClick={() => handleAdd(p)}
                        className="w-full py-3 bg-white/95 backdrop-blur-sm text-black font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-white transition-colors"
                      >
                        <ShoppingCart size={16} />
                        Quick Add
                      </button>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1 bg-white">
                    {p.origin && (
                      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1">
                        {p.origin}
                      </p>
                    )}

                    <h3
                      className="text-base font-bold mb-2 leading-snug group-hover:text-neutral-600 transition-colors"
                      style={{ color: COLORS.primary }}
                    >
                      {p.name}
                    </h3>

                    <p className="text-sm text-neutral-500 mb-4 line-clamp-2 flex-1 leading-relaxed">
                      {p.notes}
                    </p>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-neutral-100">
                      <div>
                        <span className="text-xs text-neutral-400">From</span>
                        <div className="text-xl font-bold tracking-tight" style={{ color: COLORS.primary }}>
                          £{p.price.toFixed(2)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleAdd(p)}
                        className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold overflow-hidden transition-all duration-300 ${
                          addedMap[p.id]
                            ? "bg-green-600 text-white scale-105"
                            : "bg-black text-white hover:bg-neutral-800 active:scale-95 hover:shadow-lg"
                        }`}
                        aria-label={`Add ${p.name} to cart`}
                      >
                        {addedMap[p.id] && (
                          <span className="absolute inset-0 bg-green-400 animate-ping opacity-30 rounded-full" />
                        )}
                        {addedMap[p.id] ? (
                          <>
                            <Check size={16} strokeWidth={2.5} className="animate-bounce" />
                            <span>Added!</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart size={16} className="transition-transform group-hover:rotate-12" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            {products.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                className="relative p-1 group"
                aria-label={`Go to product ${i + 1}`}
              >
                <span
                  className={`absolute inset-0 rounded-full transition-all duration-300 ${
                    activeIndex === i ? "bg-black/5 scale-150" : "group-hover:bg-black/5 group-hover:scale-150"
                  }`}
                />

                <span
                  className={`relative block rounded-full transition-all duration-500 ${
                    activeIndex === i ? "w-8 h-2 bg-black" : "w-2 h-2 bg-neutral-300 group-hover:bg-neutral-500"
                  }`}
                >
                  {activeIndex === i && !isHovering && (
                    <span
                      className="absolute inset-0 bg-neutral-400 rounded-full origin-left"
                      style={{
                        animation: "progress 4s linear infinite",
                      }}
                    />
                  )}
                </span>
              </button>
            ))}
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
        @keyframes progress {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
      `}</style>
    </section>
  );
}