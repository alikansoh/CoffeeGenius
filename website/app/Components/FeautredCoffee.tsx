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

  // responsive state
  const [isLarge, setIsLarge] = useState(false);
  const [edgePadding, setEdgePadding] = useState("calc(50% - 41%)");

  // track if the user has interacted (so we don't auto-center after manual scroll)
  const userInteractedRef = useRef(false);
  // mark that initial centering has run
  const initialCenteredRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // keep track of breakpoint and edge padding for large screens
  useEffect(() => {
    function updateSize() {
      const large = window.innerWidth >= 1024;
      setIsLarge(large);

      if (large) {
        // gentler padding on wide screens to show multiple large cards
        setEdgePadding("clamp(3rem, 10vw, 8rem)");
      } else {
        setEdgePadding("calc(50% - 41%)");
      }
    }

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
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

      // choose center-friendly index on large screens
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
  }, [products.length, isLarge]);

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
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-neutral-300" />
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 flex items-center gap-2">
                <Coffee size={14} className="text-neutral-600" />
                Customer Favorites
              </p>
            </div>
            <h2
              id="bestseller-heading"
              className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2"
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
          </div>
        </div>

        <div className="relative">
          {/* left nav */}
          <button
            onClick={() => scrollByView("left")}
            aria-label="Scroll left"
            disabled={!mounted || !canScrollLeft}
            className={`nav-button left-nav ${!canScrollLeft ? "disabled" : ""}`}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>

          {/* right nav */}
          <button
            onClick={() => scrollByView("right")}
            aria-label="Scroll right"
            disabled={!mounted || !canScrollRight}
            className={`nav-button right-nav ${!canScrollRight ? "disabled" : ""}`}
          >
            <ChevronRight size={20} strokeWidth={2} />
          </button>

          <div
            ref={containerRef}
            className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-hide items-stretch"
            role="list"
            aria-label="Best seller products"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              paddingLeft: edgePadding,
              paddingRight: edgePadding,
            }}
          >
            {products.map((p, i) => {
              const isActive = activeIndex === i;
              const cardTransformClasses = isActive ? (isLarge ? "scale-100" : "scale-[1.04]") : "hover:-translate-y-2";

              return (
                <article
                  key={p.id}
                  role="listitem"
                  className={`snap-center shrink-0 card transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div
                    className={`group rounded-2xl overflow-hidden bg-white flex flex-col h-full border border-neutral-100 transition-all duration-500 ${cardTransformClasses}`}
                    style={{
                      boxShadow: isActive ? "0 18px 40px rgba(16,24,40,0.12)" : "0 8px 20px rgba(16,24,40,0.06)",
                    }}
                  >
                    <div className="relative w-full aspect-[9/10] sm:aspect-[4/5] md:aspect-[4/5] lg:aspect-[5/4] bg-neutral-50 overflow-hidden">
                      {p.img ? (
                        <Image
                          src={p.img}
                          alt={p.name}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100" />
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/16 via-transparent to-transparent opacity-0 group-hover:opacity-80 transition-opacity duration-400" />

                      <div className="absolute top-4 left-4">
                        <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white rounded-full">
                          Best Seller
                        </span>
                      </div>

                      <div className="absolute top-4 right-4">
                        <div className="price-badge">
                          £{p.price.toFixed(2)}
                        </div>
                      </div>

                      {/* Quick add overlay for small screens; hidden on large because footer CTA is prominent */}
                      <div className="absolute bottom-4 left-4 right-4 sm:block lg:hidden opacity-0 translate-y-6 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                        <button
                          onClick={() => handleAdd(p)}
                          className="w-full py-3 bg-white/95 backdrop-blur-sm text-black font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-white transition-colors shadow-sm"
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
                        className="text-base md:text-lg font-bold mb-2 leading-snug group-hover:text-neutral-700 transition-colors"
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
                          <div className="text-lg md:text-xl font-bold tracking-tight" style={{ color: COLORS.primary }}>
                            £{p.price.toFixed(2)}
                          </div>
                        </div>

                        <button
                          onClick={() => handleAdd(p)}
                          className={`relative inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm md:text-base font-semibold overflow-hidden transition-all duration-300 ${
                            addedMap[p.id]
                              ? "bg-green-600 text-white scale-105"
                              : "bg-black text-white hover:bg-neutral-800 active:scale-95 hover:shadow-md"
                          }`}
                          aria-label={`Add ${p.name} to cart`}
                        >
                          {addedMap[p.id] && (
                            <span className="absolute inset-0 bg-green-400 animate-ping opacity-30 rounded-md" />
                          )}
                          {addedMap[p.id] ? (
                            <>
                              <Check size={16} strokeWidth={2.5} className="animate-bounce" />
                              <span>Added</span>
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
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            {products.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                className="relative p-1 group"
                aria-label={`Go to product ${i + 1}`}
              >
                <span
                  className={`absolute inset-0 rounded-full transition-all duration-300 ${
                    activeIndex === i ? "bg-black/5 scale-125" : "group-hover:bg-black/5 group-hover:scale-125"
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

          <div className="mt-8 flex justify-center">
            <a
              href="/shop"
              className="group inline-flex items-center gap-2 px-8 py-3 bg-black text-white font-semibold rounded-full hover:bg-neutral-800 transition-all duration-300 hover:shadow-lg active:scale-95"
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

        /* card sizing: larger on lg */
        .card {
          min-width: 280px;
          width: 86%;
        }
        @media (min-width: 640px) {
          .card { min-width: 320px; width: 48%; }
        }
        @media (min-width: 768px) {
          .card { min-width: 360px; width: 36%; }
        }
        @media (min-width: 1024px) {
          /* make cards noticeably bigger on large screens */
          .card { min-width: 420px; width: 34%; }
        }
        @media (min-width: 1280px) {
          .card { min-width: 480px; width: 30%; }
        }

        /* price badge */
        .price-badge {
          background: linear-gradient(180deg, #ffffffee, #f8fafc);
          padding: 6px 10px;
          border-radius: 9999px;
          font-weight: 700;
          color: ${COLORS.primary};
          box-shadow: 0 6px 20px rgba(16,24,40,0.06);
          border: 1px solid rgba(0,0,0,0.04);
        }

        /* nav buttons positioned vertically centered and outside carousel */
        .nav-button {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 40;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(16,24,40,0.06);
          box-shadow: 0 8px 20px rgba(16,24,40,0.08);
          transition: transform 0.18s ease, opacity 0.18s ease;
        }
        .nav-button:hover {
          transform: translateY(-50%) scale(1.04);
        }
        .nav-button.disabled {
          opacity: 0.28;
          cursor: not-allowed;
        }

        /* left / right offsets */
        .left-nav { left: 6px; }
        .right-nav { right: 6px; }

        /* on large screens move them further out so they don't overlap card edges */
        @media (min-width: 1024px) {
          .left-nav { left: -28px; }
          .right-nav { right: -28px; width: 52px; height: 52px; }
        }

        /* progress bar for dots */
        @keyframes progress {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }

        /* ensure image overlay doesn't block CTA on large */
        @media (min-width: 1024px) {
          .group:hover .absolute.bottom-4 { opacity: 0 !important; transform: translateY(10px) !important; }
        }
      `}</style>
    </section>
  );
}