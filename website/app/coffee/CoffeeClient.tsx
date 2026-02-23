"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ProductCard, { Product } from "../Components/ProductCard";
import { Search, Sliders, X, RotateCcw, Coffee } from "lucide-react";

type SortOption =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "newest";

interface Variant {
  _id: string;
  coffeeId: string;
  sku: string;
  size: string;
  grind: string;
  price: number;
  stock: number;
  img: string;
  createdAt: string;
  updatedAt: string;
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
  roastLevel: "light" | "medium" | "dark";
  roastType?: string; // ✅ Optional — some coffees may not have this
  createdAt: string;
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  availableSizes: SizePrice[];
  totalStock: number;
  variants: Variant[];
  bestSeller?: boolean;
}

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

    const timeout = setTimeout(
      () => {
        setText((current) => {
          if (isDeleting) return currentPhrase.substring(0, current.length - 1);
          return currentPhrase.substring(0, current.length + 1);
        });
      },
      isDeleting ? 50 : 100
    );

    return () => clearTimeout(timeout);
  }, [text, phraseIndex, isDeleting, phrases]);

  return text;
}

export default function ShopPage({ params }: { params: { slug?: string } }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [selectedRoastTypes, setSelectedRoastTypes] = useState<Set<string>>(new Set()); // ✅ Replaced selectedRoasts
  const [minPrice, setMinPrice] = useState<number | "">(0);
  const [maxPrice, setMaxPrice] = useState<number | "">(0);
  const [sort, setSort] = useState<SortOption>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const slug = params?.slug;

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const url = slug
          ? `/api/coffee?search=${encodeURIComponent(slug)}`
          : "/api/coffee";
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();

        console.log("📦 API Response:", data);

        const transformedProducts: Product[] = data.data.map(
          (coffee: ApiCoffee) => {
            console.log(`☕ Coffee: ${coffee.name}`, {
              hasVariants: !!coffee.variants,
              variantCount: coffee.variants?.length || 0,
              bestSeller: coffee.bestSeller,
              roastType: coffee.roastType, // ✅ Log roastType
            });

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
              name: coffee.name,
              slug: coffee.slug,
              origin: coffee.origin,
              notes: coffee.notes || "",
              price: coffee.minPrice,
              prices,
              img: coffee.img,
              roastLevel: coffee.roastLevel,
              roastType: coffee.roastType ?? null, // ✅ Pass roastType (null if missing)
              grinds: coffee.availableGrinds,
              availableSizes: coffee.availableSizes,
              minPrice: coffee.minPrice,
              variants: coffee.variants,
              bestSeller: coffee.bestSeller,
            };
          }
        );

        console.log("✅ Transformed products:", transformedProducts);
        setProducts(transformedProducts);

        if (transformedProducts.length > 0) {
          const prices = transformedProducts.map((p) => {
            const firstSize = Object.values(p.prices || {})[0];
            return firstSize || p.price;
          });
          const min = Math.min(
            ...prices.filter((price): price is number => price !== undefined)
          );
          const max = Math.max(
            ...prices.filter((price): price is number => price !== undefined)
          );
          setMinPrice(min);
          setMaxPrice(max);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load products. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const origins = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.origin) s.add(p.origin);
    return Array.from(s).sort();
  }, [products]);

  // ✅ Dynamically collect available roast types from products (excluding nulls)
  const availableRoastTypes = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.roastType) s.add(p.roastType);
    return Array.from(s).sort();
  }, [products]);

  const priceBounds = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 100 };
    const prices = products.map((p) => {
      const firstSize = Object.values(p.prices || {})[0];
      return firstSize || p.price;
    });
    return {
      min: Math.min(...prices.filter((p) => p !== undefined)),
      max: Math.max(...prices.filter((p) => p !== undefined)),
    };
  }, [products]);

  const typewriterPhrases = [
    "Search by name, notes, or origin...",
    "Try 'Ethiopia' or 'Colombia'...",
    "Your coffee is waiting...",
    "Discover new flavors...",
    "Search tasting notes...",
    "Find your perfect roast...",
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

    // ✅ Filter by roast type (skip if no roastType on product)
    if (selectedRoastTypes.size > 0) {
      out = out.filter((p) =>
        p.roastType ? selectedRoastTypes.has(p.roastType) : false
      );
    }

    const min = typeof minPrice === "number" ? minPrice : -Infinity;
    const max = typeof maxPrice === "number" ? maxPrice : Infinity;
    out = out.filter((p) => {
      const firstSize = Object.values(p.prices || {})[0];
      const unit = firstSize || p.price;
      return (unit ?? 0) >= min && (unit ?? 0) <= max;
    });

    switch (sort) {
      case "price-asc": {
        const getFirstPrice = (p: Product) => {
          const firstSize = Object.values(p.prices || {})[0];
          return firstSize || p.price;
        };
        out.sort((a, b) => (getFirstPrice(a) || 0) - (getFirstPrice(b) || 0));
        break;
      }
      case "price-desc": {
        const getFirstPrice = (p: Product) => {
          const firstSize = Object.values(p.prices || {})[0];
          return firstSize || p.price;
        };
        out.sort((a, b) => (getFirstPrice(b) || 0) - (getFirstPrice(a) || 0));
        break;
      }
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
  }, [products, debouncedQuery, selectedRoastTypes, minPrice, maxPrice, sort]);

  const toggleRoastType = useCallback((type: string) => {
    setSelectedRoastTypes((prev) => {
      const s = new Set(prev);
      if (s.has(type)) s.delete(type);
      else s.add(type);
      return s;
    });
  }, []);

  const removeRoastType = useCallback((type: string) => {
    setSelectedRoastTypes((prev) => {
      const s = new Set(prev);
      s.delete(type);
      return s;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setSelectedRoastTypes(new Set());
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

  const isPriceFilterActive =
    (typeof minPrice === "number" && minPrice !== priceBounds.min) ||
    (typeof maxPrice === "number" && maxPrice !== priceBounds.max);

  const activeFilterTags = useMemo(() => {
    const tags: { type: string; label: string; onRemove: () => void }[] = [];

    if (debouncedQuery) {
      tags.push({
        type: "search",
        label: `Search: "${debouncedQuery}"`,
        onRemove: clearSearchQuery,
      });
    }

    // ✅ Roast type tags
    selectedRoastTypes.forEach((type) => {
      tags.push({
        type: "roastType",
        label: `Type: ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        onRemove: () => removeRoastType(type),
      });
    });

    if (isPriceFilterActive) {
      const minDisplay =
        typeof minPrice === "number"
          ? `£${minPrice.toFixed(2)}`
          : `£${priceBounds.min.toFixed(2)}`;
      const maxDisplay =
        typeof maxPrice === "number"
          ? `£${maxPrice.toFixed(2)}`
          : `£${priceBounds.max.toFixed(2)}`;
      tags.push({
        type: "price",
        label: `Price: ${minDisplay} — ${maxDisplay}`,
        onRemove: clearPriceFilter,
      });
    }

    return tags;
  }, [
    debouncedQuery,
    selectedRoastTypes,
    minPrice,
    maxPrice,
    priceBounds,
    isPriceFilterActive,
    clearSearchQuery,
    removeRoastType,
    clearPriceFilter,
  ]);

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
    if (selectedRoastTypes.size > 0) count += selectedRoastTypes.size;
    if (isPriceFilterActive) count++;
    return count;
  }, [debouncedQuery, selectedRoastTypes, isPriceFilterActive]);

  if (error) {
    return (
      <main className="mt-32 md:mt-24 lg:mt-20 sm:mt-16 min-h-screen bg-gradient-to-b from-white to-gray-50 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mt-20 border-2 border-dashed border-red-200 rounded-3xl bg-red-50 p-16 text-center">
            <h3 className="text-3xl font-bold text-red-900 mb-4">
              Error Loading Products
            </h3>
            <p className="text-red-700 text-lg mb-10">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="mt-10 md:mt-10 lg:mt-0 sm:mt-0 min-h-screen bg-gradient-to-b from-white to-gray-50 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <div className="lg:mt-6 flex items-center gap-2 mb-4">
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
              Curated selection of single origins and blends, freshly roasted to
              order.{" "}
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative group">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 z-10 transition-colors"
                size={20}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search coffees"
                className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-gray-200 bg-white outline-none text-base font-medium transition-all focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 hover:border-gray-300 shadow-sm"
                style={{ fontSize: "16px" }}
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
              className="inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 px-6 py-3 bg-white hover:bg-gray-50 hover:border-gray-900 hover:shadow-lg transition-all shadow-sm relative overflow-hidden group"
            >
              <Sliders size={20} className="relative z-10" />
              <span className="text-sm font-semibold relative z-10">
                Filters
              </span>
              {activeFiltersCount > 0 && (
                <span className="bg-gray-900 text-white text-xs font-bold px-2.5 py-1 rounded-full relative z-10">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Filter Tags */}
          {activeFilterTags.length > 0 && (
            <div className="mb-8 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  Active filters:
                </span>
                {activeFilterTags.map((tag, index) => (
                  <span
                    key={`${tag.type}-${index}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-sm font-medium text-gray-700 border-2 border-gray-200 hover:border-gray-900 transition-all shadow-sm hover:shadow"
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-sm font-semibold text-red-600 border-2 border-red-200 hover:bg-red-100 hover:border-red-300 transition-all shadow-sm hover:shadow"
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
                {loading ? "..." : filtered.length}
              </span>
              <span className="text-gray-600 text-sm">
                {filtered.length === 1 ? "Product" : "Products"}
              </span>
              {!loading && filtered.length !== products.length && (
                <span className="text-gray-400 text-xs">
                  of {products.length} total
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 font-semibold">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                disabled={loading}
                className="rounded-xl border-2 border-gray-200 px-4 py-3 h-12 bg-white text-base font-semibold hover:border-gray-900 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 outline-none transition-all shadow-sm disabled:opacity-50"
                style={{ minWidth: 180 }}
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-200 rounded-2xl h-96 animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Products Grid */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:justify-items-center lg:justify-items-stretch">
              {filtered.map((p, i) => (
                <div
                  key={p.id}
                  className="w-full md:max-w-[320px] md:justify-self-center lg:justify-self-auto"
                >
                  <ProductCard product={p} index={i} />
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filtered.length === 0 && (
            <div className="mt-20 border-2 border-dashed border-gray-200 rounded-3xl bg-white p-16 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gray-50 mb-6">
                <Search size={40} className="text-gray-400" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">
                No coffees found
              </h3>
              <p className="text-gray-600 text-lg mb-10 max-w-md mx-auto leading-relaxed">
                No coffees match your current filters. Try adjusting your search
                or filter criteria.
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
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 outline-none text-base focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition-all"
                    style={{ fontSize: "16px" }}
                  />

                  {query === "" && typewriterText && (
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-10 right-4 flex items-center text-sm text-gray-400 pointer-events-none select-none"
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
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 h-12 bg-white text-base focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                  style={{ fontSize: "16px" }}
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="newest">Newest</option>
                </select>
              </div>

              {/* ✅ Roast Type Filter (replaces Roast Level) */}
              {availableRoastTypes.length > 0 && (
                <div>
                  <label className="text-sm font-bold text-gray-900 block mb-3">
                    Roast type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableRoastTypes.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleRoastType(type)}
                        className={`px-5 py-2.5 rounded-lg border-2 text-sm font-semibold capitalize transition-all ${
                          selectedRoastTypes.has(type)
                            ? "bg-gray-900 text-white border-gray-900 shadow-md"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {/* ✅ Graceful note if some products have no roast type */}
                  <p className="text-xs text-gray-400 mt-2">
                    Some coffees may not be assigned a roast type and will be excluded when filtering.
                  </p>
                </div>
              )}

              {/* Price Range */}
              <div>
                <label className="text-sm font-bold text-gray-900 block mb-3">
                  Price range
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium block mb-2">
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
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                      placeholder="£0"
                      style={{ fontSize: "16px", height: 48 }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium block mb-2">
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
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                      placeholder="£100"
                      style={{ fontSize: "16px", height: 48 }}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2 font-medium">
                  Range: £{priceBounds.min.toFixed(2)} — £
                  {priceBounds.max.toFixed(2)}
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
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all"
                  defaultValue=""
                  style={{ fontSize: "16px" }}
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

            <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 p-6 shadow-lg">
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full px-6 py-3 rounded-lg bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
              >
                Show {filtered.length}{" "}
                {filtered.length === 1 ? "result" : "results"}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}