"use client";

import { useEffect, useMemo, useState } from "react";
import ProductCard, { Product } from "../Components/ProductCard";
import {
  Search,
  Sliders,
  X,
  RotateCcw,
  Coffee,
} from "lucide-react";
import useCart from "../store/CartStore";

const DEMO_PRODUCTS: Product[] = [
  {
    id: "espresso-blend",
    name: "Signature Espresso Blend",
    origin: "House Blend",
    notes: "Rich chocolate, silky body, long finish",
    price: 14.0,
    prices: { "250g": 14.0, "1kg": 48.0 },
    img: "/test.webp",
    roastLevel: "dark",
  },
  {
    id: "ethiopian-light",
    name: "Ethiopian Light Roast",
    origin: "Yirgacheffe, Ethiopia",
    notes: "Bright citrus, floral notes, honey sweetness",
    price: 12.5,
    prices: { "250g": 12.5, "1kg": 42.0 },
    img: "/test.webp",
    roastLevel: "light",
  },
  {
    id: "colombian-medium",
    name: "Colombian Medium Roast",
    origin: "Huila, Colombia",
    notes: "Caramel sweetness, balanced body, chocolate",
    price: 11.0,
    prices: { "250g": 11.0, "1kg": 36.0 },
    img: "/test.webp",
    roastLevel: "medium",
  },
  {
    id: "sumatra-dark",
    name: "Sumatra Dark Roast",
    origin: "Sumatra, Indonesia",
    notes: "Earthy, spicy, full body",
    price: 13.5,
    prices: { "250g": 13.5, "1kg": 46.0 },
    img: "/test.webp",
    roastLevel: "dark",
  },
  {
    id: "kenya-aa",
    name: "Kenya AA",
    origin: "Kenya",
    notes: "Bold berry notes, bright acidity, crisp finish",
    price: 13.0,
    prices: { "250g": 13.0, "1kg": 44.0 },
    img: "/test.webp",
    roastLevel: "medium",
  },
];

type SortOption =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "newest";

const initialPriceBounds = (() => {
  const prices = DEMO_PRODUCTS.map((p) => p.prices?.["250g"] ?? p.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
})();

function useTypewriter(phrases: string[], active: boolean) {
  const [text, setText] = useState("");
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (!active) {
      setText("");
      setCursorOn(true);
      return;
    }

    let mounted = true;
    let phraseIndex = 0;
    let charIndex = 0;
    let typing = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      if (!mounted) return;
      const current = phrases[phraseIndex] ?? "";

      if (typing) {
        if (charIndex <= current.length) {
          setText(current.slice(0, charIndex));
          charIndex++;
          timeoutId = setTimeout(step, 80);
        } else {
          typing = false;
          timeoutId = setTimeout(step, 2000);
        }
      } else {
        if (charIndex > 0) {
          charIndex--;
          setText(current.slice(0, charIndex));
          timeoutId = setTimeout(step, 40);
        } else {
          typing = true;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timeoutId = setTimeout(step, 500);
        }
      }
    };

    step();
    const cursorId = setInterval(() => {
      setCursorOn((c) => !c);
    }, 530);

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(cursorId);
    };
  }, [phrases, active]);

  return text + (cursorOn ? "|" : " ");
}

export default function ShopPage() {
  const [products] = useState<Product[]>(DEMO_PRODUCTS);
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [selectedRoasts, setSelectedRoasts] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState<number | "">(initialPriceBounds.min);
  const [maxPrice, setMaxPrice] = useState<number | "">(initialPriceBounds.max);
  const [sort, setSort] = useState<SortOption>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const origins = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.origin) s.add(p.origin);
    return Array.from(s).sort();
  }, [products]);

  const priceBounds = useMemo(() => {
    const prices = products.map((p) => p.prices?.["250g"] ?? p.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [products]);

  const typewriterPhrases = [
    "Search coffee...",
    "Try 'Ethiopia'",
    "Find your notes...",
    "Discover origins..."
  ];
  const showTypewriter = query === "";
  const typewriterText = useTypewriter(typewriterPhrases, showTypewriter);

  const filtered = useMemo(() => {
    let out = products.slice();

    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.notes || "").toLowerCase().includes(q) ||
          (p.origin || "").toLowerCase().includes(q)
      );
    }

    if (selectedRoasts.size > 0) {
      out = out.filter((p) =>
        p.roastLevel ? selectedRoasts.has(p.roastLevel) : false
      );
    }

    const min = typeof minPrice === "number" ? minPrice : -Infinity;
    const max = typeof maxPrice === "number" ? maxPrice : Infinity;
    out = out.filter((p) => {
      const unit = p.prices?.["250g"] ?? p.price;
      return unit >= min && unit <= max;
    });

    switch (sort) {
      case "price-asc":
        out.sort((a, b) => (a.prices?.["250g"] ?? a.price) - (b.prices?.["250g"] ?? b.price));
        break;
      case "price-desc":
        out.sort((a, b) => (b.prices?.["250g"] ?? b.price) - (a.prices?.["250g"] ?? a.price));
        break;
      case "name-asc":
        out.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
        out = out.reverse();
        break;
      case "featured":
      default:
        break;
    }

    return out;
  }, [products, debouncedQuery, selectedRoasts, minPrice, maxPrice, sort]);

  function toggleRoast(level: string) {
    setSelectedRoasts((prev) => {
      const s = new Set(prev);
      if (s.has(level)) s.delete(level);
      else s.add(level);
      return s;
    });
  }

  function resetFilters() {
    setQuery("");
    setSelectedRoasts(new Set());
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    setSort("featured");
  }

  async function handleAdd(
    p: Product,
    options?: { size: "250g" | "1kg"; grind: string; quantity: number }
  ) {
    const size = options?.size ?? "250g";
    const grind = options?.grind ?? "whole-bean";
    const quantity = options?.quantity ?? 1;

    const unitPrice = p.prices?.[size] ?? p.price;
    const cartId = `${p.id}::${size}::${grind}`;
    const name = `${p.name} — ${size} — ${grind}`;

    addItem({ id: cartId, name, price: unitPrice, img: p.img }, quantity);

    setAddedMap((s) => ({ ...s, [cartId]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [cartId]: false })), 1200);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.body.style.overflow = filtersOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (debouncedQuery) count++;
    if (selectedRoasts.size > 0) count += selectedRoasts.size;
    if (minPrice !== priceBounds.min || maxPrice !== priceBounds.max) count++;
    return count;
  }, [debouncedQuery, selectedRoasts, minPrice, maxPrice, priceBounds]);

  return (
    <>
      {/* Add viewport meta to prevent zoom on iOS */}
      <style jsx global>{`
        input, select, textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="mt-16 sm:mt-0 min-h-screen bg-gradient-to-b from-white to-gray-50 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <Coffee size={16} className="text-amber-700" />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                All Coffees
              </p>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-3">
              Explore Our Roasts
            </h1>
            <p className="text-gray-600 max-w-2xl leading-relaxed">
              Curated selection of single origins and blends, freshly roasted to order.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-8 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder=""
                aria-label="Search coffees"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 bg-white outline-none text-base transition-all focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                style={{ fontSize: '16px' }}
              />

              {query === "" && (
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-12 right-4 flex items-center text-gray-400 pointer-events-none select-none overflow-hidden"
                >
                  <span className="text-base">{typewriterText}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center justify-center gap-3 rounded-xl border-2 border-gray-200 px-5 py-3.5 bg-white hover:border-gray-900 hover:shadow-md transition-all"
            >
              <Sliders size={20} />
              <span className="text-sm font-semibold">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="bg-gray-900 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Results Info & Sort */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b-2 border-gray-100">
            <div className="text-sm text-gray-600">
              <span className="font-bold text-gray-900 text-lg">
                {filtered.length} {filtered.length === 1 ? "Product" : "Products"}
              </span>
              {filtered.length !== products.length && (
                <span className="ml-2 text-gray-500">
                  of {products.length} total
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 font-semibold">Sort by</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-lg border-2 border-gray-200 px-4 py-2 bg-white text-sm font-medium hover:border-gray-900 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                style={{ fontSize: '16px' }}
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((p, i) => {
              const isProductAdded = Object.keys(addedMap).some((k) => k.startsWith(`${p.id}::`));
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  index={i}
                  onAddToCart={handleAdd}
                  isAdded={isProductAdded}
                />
              );
            })}
          </div>

          {/* Empty State */}
          {filtered.length === 0 && (
            <div className="mt-16 border-2 border-dashed border-gray-200 rounded-2xl bg-white p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-50 mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                No coffees found
              </h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                No coffees match your current filters. Try adjusting your search or filter criteria.
              </p>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl"
              >
                <RotateCcw size={18} />
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Filter Panel */}
        <div
          className={`fixed right-0 z-50 w-full sm:max-w-md transform transition-transform duration-300 top-16 sm:top-0 bottom-0 ${
            filtersOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div
            onClick={() => setFiltersOpen(false)}
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${
              filtersOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          />

          <aside className="relative z-50 h-full bg-white shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white px-6 py-5 flex items-center justify-between border-b-2 border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Filters</h3>
                <p className="text-sm text-gray-500 mt-1">Refine your search</p>
              </div>

              <button
                onClick={() => setFiltersOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close filters"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Search */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder=""
                    className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-lg outline-none text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition-all"
                    style={{ fontSize: '16px' }}
                  />

                  {query === "" && (
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-10 right-3 flex items-center text-sm text-gray-400 pointer-events-none select-none overflow-hidden"
                    >
                      <span>{typewriterText}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Sort by
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 bg-white text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                  style={{ fontSize: '16px' }}
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="newest">Newest</option>
                </select>
              </div>

              {/* Roast Level */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Roast level
                </label>
                <div className="flex flex-wrap gap-2">
                  {["light", "medium", "dark"].map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleRoast(r)}
                      className={`px-5 py-2.5 rounded-lg border-2 text-sm font-semibold capitalize transition-all ${
                        selectedRoasts.has(r)
                          ? "bg-gray-900 text-white border-gray-900 shadow-md"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Price range
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium block mb-2">Min</label>
                    <input
                      type="number"
                      value={minPrice === "" ? "" : minPrice}
                      onChange={(e) =>
                        setMinPrice(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full rounded-lg border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                      placeholder="£0"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium block mb-2">Max</label>
                    <input
                      type="number"
                      value={maxPrice === "" ? "" : maxPrice}
                      onChange={(e) =>
                        setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full rounded-lg border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                      placeholder="£100"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2 font-medium">
                  Range: £{priceBounds.min.toFixed(2)} — £{priceBounds.max.toFixed(2)}
                </div>
              </div>

              {/* Origin */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Origin
                </label>
                <select
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) setQuery("");
                    else setQuery(v);
                  }}
                  className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                  defaultValue=""
                  style={{ fontSize: '16px' }}
                >
                  <option value="">Any origin</option>
                  {origins.map((o) => (
                    <option value={o} key={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset Button */}
              <button
                onClick={resetFilters}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-900 transition-all"
              >
                <RotateCcw size={18} />
                Reset filters
              </button>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 p-6 shadow-lg">
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full px-6 py-4 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
              >
                Show {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}