"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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

function useTypewriter(phrases: string[]) {
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (phrases.length === 0) {
      const timeout = setTimeout(() => setText(""), 0);
      return () => clearTimeout(timeout);
    }

    const currentPhrase = phrases[phraseIndex];
    
    if (!isDeleting && text === currentPhrase) {
      const pauseTimeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
      return () => clearTimeout(pauseTimeout);
    }

    if (isDeleting && text === "") {
      const nextTimeout = setTimeout(() => {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }, 500);
      return () => clearTimeout(nextTimeout);
    }

    const timeout = setTimeout(() => {
      setText((current) => {
        if (isDeleting) {
          return currentPhrase.substring(0, current.length - 1);
        } else {
          return currentPhrase.substring(0, current.length + 1);
        }
      });
    }, isDeleting ? 50 : 100);

    return () => clearTimeout(timeout);
  }, [text, phraseIndex, isDeleting, phrases]);

  return text;
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
    "Search by name, notes, or origin...",
    "Try 'Ethiopia' or 'Colombia'...",
    "your coffee is waiting...",
    "Discover new flavors...",
    "Search tasting notes...",
    "Find your perfect roast..."
  ];
  const typewriterText = useTypewriter(query === "" ? typewriterPhrases : []);

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

  const toggleRoast = useCallback((level: string) => {
    setSelectedRoasts((prev) => {
      const s = new Set(prev);
      if (s.has(level)) s.delete(level);
      else s.add(level);
      return s;
    });
  }, []);

  const removeRoast = useCallback((level: string) => {
    setSelectedRoasts((prev) => {
      const s = new Set(prev);
      s.delete(level);
      return s;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setSelectedRoasts(new Set());
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    setSort("featured");
  }, [priceBounds.min, priceBounds.max]);

  const clearPriceFilter = useCallback(() => {
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
  }, [priceBounds.min, priceBounds.max]);

  const clearSearchQuery = useCallback(() => {
    setQuery("");
  }, []);

  const isPriceFilterActive = minPrice !== priceBounds.min || maxPrice !== priceBounds.max;

  const activeFilterTags = useMemo(() => {
    const tags: { type: string; label: string; onRemove: () => void }[] = [];

    if (debouncedQuery) {
      tags.push({
        type: "search",
        label: `Search: "${debouncedQuery}"`,
        onRemove: clearSearchQuery,
      });
    }

    selectedRoasts.forEach((roast) => {
      tags.push({
        type: "roast",
        label: `Roast: ${roast.charAt(0).toUpperCase() + roast.slice(1)}`,
        onRemove: () => removeRoast(roast),
      });
    });

    if (isPriceFilterActive) {
      const minDisplay = typeof minPrice === "number" ? `£${minPrice.toFixed(2)}` : `£${priceBounds.min.toFixed(2)}`;
      const maxDisplay = typeof maxPrice === "number" ? `£${maxPrice.toFixed(2)}` : `£${priceBounds.max.toFixed(2)}`;
      tags.push({
        type: "price",
        label: `Price: ${minDisplay} — ${maxDisplay}`,
        onRemove: clearPriceFilter,
      });
    }

    return tags;
  }, [debouncedQuery, selectedRoasts, minPrice, maxPrice, priceBounds, isPriceFilterActive, clearSearchQuery, removeRoast, clearPriceFilter]);

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
      <style jsx global>{`
        input, select, textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="mt-16 sm:mt-0 min-h-screen bg-gradient-to-b from-white to-gray-50 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-amber-50">
                <Coffee size={18} className="text-amber-700" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                All Coffees
              </p>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 tracking-tight">
              Explore Our Roasts
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl leading-relaxed">
              Curated selection of single origins and blends, freshly roasted to order.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 z-10 transition-colors" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder=""
                aria-label="Search coffees"
                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 bg-white outline-none text-base transition-all focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 hover:border-gray-300 shadow-sm"
                style={{ fontSize: '16px' }}
              />

              {query === "" && typewriterText && (
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-12 right-4 flex items-center text-gray-400 pointer-events-none select-none"
                >
                  <span className="text-base">
                    {typewriterText}
                    <span className="animate-pulse ml-0.5">|</span>
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 px-6 py-4 bg-white hover:bg-gray-50 hover:border-gray-900 hover:shadow-lg transition-all shadow-sm relative overflow-hidden group"
            >
              <Sliders size={20} className="relative z-10" />
              <span className="text-sm font-bold relative z-10">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="bg-gray-900 text-white text-xs font-bold px-2.5 py-1 rounded-full relative z-10">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Filter Tags */}
          {activeFilterTags.length > 0 && (
            <div className="mb-8 p-4 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-gray-700">Active filters:</span>
                {activeFilterTags.map((tag, index) => (
                  <span
                    key={`${tag.type}-${index}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-sm font-semibold text-gray-700 border-2 border-gray-200 hover:border-gray-900 transition-all shadow-sm hover:shadow"
                  >
                    {tag.label}
                    <button
                      onClick={tag.onRemove}
                      className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                      aria-label={`Remove ${tag.label} filter`}
                    >
                      <X size={14} className="text-gray-500" />
                    </button>
                  </span>
                ))}
                {activeFilterTags.length > 1 && (
                  <button
                    onClick={resetFilters}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-sm font-bold text-red-600 border-2 border-red-200 hover:bg-red-100 hover:border-red-300 transition-all shadow-sm hover:shadow"
                  >
                    <RotateCcw size={14} />
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results Info & Sort */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-gray-900 text-2xl">
                {filtered.length}
              </span>
              <span className="text-gray-600 text-base">
                {filtered.length === 1 ? "Product" : "Products"}
              </span>
              {filtered.length !== products.length && (
                <span className="text-gray-400 text-sm">
                  of {products.length} total
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 font-bold">Sort by</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2.5 bg-white text-sm font-semibold hover:border-gray-900 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 outline-none transition-all shadow-sm"
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
            <div className="mt-20 border-2 border-dashed border-gray-200 rounded-3xl bg-white p-16 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gray-50 mb-6">
                <Search size={40} className="text-gray-400" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">
                No coffees found
              </h3>
              <p className="text-gray-600 text-lg mb-10 max-w-md mx-auto leading-relaxed">
                No coffees match your current filters. Try adjusting your search or filter criteria.
              </p>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
              >
                <RotateCcw size={20} />
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 " size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder=""
                    className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-lg outline-none text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition-all"
                    style={{ fontSize: '16px' }}
                  />

                  {query === "" && typewriterText && (
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-10 right-3 flex items-center text-sm text-gray-400 pointer-events-none select-none"
                    >
                      <span>
                        {typewriterText}
                        <span className="animate-pulse ml-0.5">|</span>
                      </span>
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