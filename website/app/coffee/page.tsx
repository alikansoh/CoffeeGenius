"use client";

import { useEffect, useMemo, useState } from "react";
import ProductCard, { Product } from "../Components/ProductCard";
import {
  Search,
  Sliders,
  X,
  RotateCcw,
  ChevronDown,
  Coffee,
} from "lucide-react";
import useCart from "../store/CartStore";

/**
 * Demo products — replace with API later.
 */
const DEMO_PRODUCTS: Product[] = [
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

type SortOption =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "newest";

export default function ShopPage() {
  const [products] = useState<Product[]>(DEMO_PRODUCTS);
  const addItem = useCart((s) => s.addItem);
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  // UI state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [selectedRoasts, setSelectedRoasts] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // computed origins and price bounds
  const origins = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.origin) s.add(p.origin);
    return Array.from(s).sort();
  }, [products]);

  const priceBounds = useMemo(() => {
    const prices = products.map((p) => p.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [products]);

  useEffect(() => {
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceBounds.min, priceBounds.max]);

  // filtered + sorted list
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
    out = out.filter((p) => p.price >= min && p.price <= max);

    switch (sort) {
      case "price-asc":
        out.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        out.sort((a, b) => b.price - a.price);
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

  function handleAdd(p: Product) {
    addItem({ id: p.id, name: p.name, price: p.price, img: p.img }, 1);
    setAddedMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddedMap((s) => ({ ...s, [p.id]: false })), 1200);
  }

  // lock body scroll while panel open
  useEffect(() => {
    if (typeof window === "undefined") return;
    document.body.style.overflow = filtersOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (debouncedQuery) count++;
    if (selectedRoasts.size > 0) count += selectedRoasts.size;
    if (minPrice !== priceBounds.min || maxPrice !== priceBounds.max) count++;
    return count;
  }, [debouncedQuery, selectedRoasts, minPrice, maxPrice, priceBounds]);

  return (
    <main
      /*
        Apply the top margin only on small screens so the fixed nav doesn't cover content on mobile.
        Tailwind arbitrary value uses the CSS variable --nav-height with a fallback, and sm:mt-0 removes
        the margin at small+ breakpoints (>=640px). Update --nav-height in your layout/nav if needed.
      */
      className="mt-(--nav-height,64px) sm:mt-0 min-h-screen bg-linear-to-b from-white to-neutral-50 py-10 sm:py-12 lg:py-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 sm:mb-10 lg:mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-12 bg-linear-to-r from-black to-transparent" />
            <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 flex items-center gap-2">
              <Coffee size={14} />
              All Coffees
            </p>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-neutral-900 mb-3">
            Explore Our Roasts
          </h1>
          <p className="text-neutral-600 text-sm sm:text-base max-w-2xl leading-relaxed">
            Curated selection of single origins and blends, freshly roasted to
            order.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Search - Full width on mobile, flexible on desktop */}
          <div className="flex-1 relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search coffees, origins, tasting notes..."
              className="w-full pl-10 sm:pl-12 pr-4 py-3 rounded-xl border-2 border-neutral-200 bg-white outline-none text-base sm:text-sm placeholder:text-neutral-400 focus:border-black transition-colors shadow-sm"
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-3 rounded-xl border-2 border-neutral-200 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-white shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer group"
            aria-expanded={filtersOpen}
            aria-controls="filters-panel"
          >
            <Sliders
              size={18}
              className="group-hover:rotate-90 transition-transform"
            />
            <span className="text-sm font-semibold">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              size={16}
              className="group-hover:translate-y-0.5 transition-transform"
            />
          </button>
        </div>

        {/* Results Info & Sort */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b-2 border-neutral-100">
          <div className="text-sm text-neutral-600 flex items-center gap-2 sm:gap-3">
            <span className="font-semibold text-neutral-900 text-lg">
              {filtered.length} {filtered.length === 1 ? "Product" : "Products"}
            </span>
            {filtered.length !== products.length && (
              <>
                <span className="text-neutral-300">•</span>
                <span className="text-neutral-500">
                  of {products.length} total
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <label className="text-sm text-neutral-600 font-medium">
              Sort by
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border-2 border-neutral-200 px-3 sm:px-4 py-2 bg-white cursor-pointer text-sm font-medium hover:border-black transition-colors shadow-sm"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="name-asc">Name: A → Z</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {filtered.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              index={i}
              onAddToCart={handleAdd}
              isAdded={addedMap[p.id] || false}
            />
          ))}
        </div>

        {/* Empty State */}
        {filtered.length === 0 && (
          <div className="mt-12 sm:mt-16 border-2 border-dashed border-neutral-200 rounded-2xl bg-white p-8 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-100 mb-3 sm:mb-4">
              <Search size={26} className="text-neutral-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-neutral-900 mb-2">
              No coffees found
            </h3>
            <p className="text-neutral-600 mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
              No coffees match your current filters. Try adjusting your search
              or filter criteria.
            </p>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <RotateCcw size={16} />
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Slide-in Filter Panel
          Top offset only on small screens (so fixed nav won't be covered). We use Tailwind arbitrary utilities:
          top-[var(--nav-height,64px)] ensures the panel starts below nav on narrow screens; sm:top-0 removes the offset
          at sm+ breakpoints so the panel covers the whole viewport (desktop).
      */}
      <div
        id="filters-panel"
        className={`fixed right-0 z-50 w-full sm:max-w-md transform transition-transform duration-300 top-(--nav-height,64px) sm:top-0 bottom-0 ${
          filtersOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!filtersOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setFiltersOpen(false)}
          className={`fixed left-0 right-0 bg-black/50 backdrop-blur-sm transition-opacity top-(--nav-height,64px) sm:top-0 bottom-0 ${
            filtersOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        />

        {/* Panel */}
        <aside className="relative z-50 h-full bg-white shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white px-4 py-4 sm:px-6 sm:py-6 flex items-center justify-between border-b-2 border-neutral-100">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-neutral-900">
                Filters and Sort
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                Refine your search
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={resetFilters}
                className="text-sm text-neutral-600 px-2 py-1 rounded-md hover:bg-neutral-100 transition cursor-pointer inline-flex items-center gap-2 font-medium"
                aria-label="Reset filters"
              >
                <RotateCcw size={16} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                className="p-2 rounded-md hover:bg-neutral-100 transition cursor-pointer"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Mobile-friendly Reset (visible only on small screens)
              This adds a prominent, full-width reset button for easier tapping on mobile.
          */}
          <div className="sm:hidden px-4 pb-4">
            <button
              onClick={resetFilters}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-neutral-100 text-neutral-900 font-semibold hover:bg-neutral-200 transition-colors"
              aria-label="Reset filters"
            >
              <RotateCcw size={16} />
              Reset filters
            </button>
          </div>

          {/* Filter Content */}
          <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
            {/* Search */}
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-2">
                Search
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  size={18}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, notes, origin..."
                  className="w-full pl-10 pr-3 py-2.5 sm:py-3 bg-neutral-50 border-2 border-neutral-200 rounded-lg outline-none text-sm focus:border-black transition-colors"
                />
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-2">
                Sort by
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="w-full rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white cursor-pointer text-sm hover:border-black transition-colors"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="name-asc">Name: A → Z</option>
                <option value="newest">Newest</option>
              </select>
            </div>

            {/* Roast Level */}
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-2">
                Roast level
              </label>
              <div className="flex flex-wrap gap-2">
                {["light", "medium", "dark"].map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleRoast(r)}
                    className={`px-4 sm:px-5 py-2 rounded-lg border-2 text-sm font-semibold capitalize transition-all cursor-pointer ${
                      selectedRoasts.has(r)
                        ? "bg-black text-white border-black shadow-sm"
                        : "bg-white text-neutral-700 border-neutral-200 hover:border-black"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-2">
                Price range
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 block mb-1">
                    Min
                  </label>
                  <input
                    type="number"
                    value={minPrice === "" ? "" : minPrice}
                    onChange={(e) =>
                      setMinPrice(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border-2 border-neutral-200 px-3 py-2 text-sm focus:border-black outline-none transition-colors"
                    placeholder="£0"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 block mb-1">
                    Max
                  </label>
                  <input
                    type="number"
                    value={maxPrice === "" ? "" : maxPrice}
                    onChange={(e) =>
                      setMaxPrice(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border-2 border-neutral-200 px-3 py-2 text-sm focus:border-black outline-none transition-colors"
                    placeholder="£100"
                  />
                </div>
              </div>
              <div className="text-xs text-neutral-500 mt-2 flex items-center gap-2">
                <span>Available range:</span>
                <span className="font-semibold text-neutral-700">
                  £{priceBounds.min.toFixed(2)} — £{priceBounds.max.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Origin */}
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-2">
                Origin
              </label>
              <select
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setQuery("");
                  else setQuery(v);
                }}
                className="w-full rounded-lg border-2 border-neutral-200 px-3 py-2 cursor-pointer text-sm hover:border-black transition-colors"
                defaultValue=""
              >
                <option value="">Any origin</option>
                {origins.map((o) => (
                  <option value={o} key={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t-2 border-neutral-100 p-4 sm:p-6">
            <button
              onClick={() => setFiltersOpen(false)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 transition-colors shadow-lg cursor-pointer"
            >
              Show {filtered.length}{" "}
              {filtered.length === 1 ? "result" : "results"}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}