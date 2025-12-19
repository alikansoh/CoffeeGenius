"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { ChevronDown, Check, ShoppingCart, SlidersHorizontal, X } from "lucide-react";
import EspressoMachinesIcon from "../../public/EspressoMachinesIcon";
import useCart, { CartItem } from "../store/CartStore";
import { useRouter } from "next/navigation";

/**
 * Equipment gallery component — now consistently using decimal `price` (pounds) across the stack.
 */

interface EquipmentProduct {
  id: string;
  slug?: string;
  name: string;
  brand?: string;
  category?: string;
  features?: string[];
  price?: number; // in pounds (decimal) — canonical
  img?: string; // image URL (final)
  stock?: number;
  notes?: string;
  description?: string;
}

type SortKey = "featured" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

function formatPriceGBP(value?: number) {
  if (value === undefined || value === null) return "—";
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EquipmentCard({
  product,
  onAdd,
  onView,
  added,
}: {
  product: EquipmentProduct;
  onAdd?: (p: EquipmentProduct) => void;
  onView?: (p: EquipmentProduct) => void;
  added?: boolean;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onView?.(product);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView?.(product)}
      onKeyDown={handleKeyDown}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
      aria-label={`View ${product.name}`}
    >
      <div className="relative bg-gray-50 aspect-square overflow-hidden">
        {product.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.img} alt={product.name} className="object-cover w-full h-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-2">☕</div>
              <div className="text-xs">{product.name}</div>
            </div>
          </div>
        )}

        {product.stock !== undefined && product.stock === 0 && (
          <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            Out of Stock
          </div>
        )}
      </div>

      <div className="p-5">
        {product.brand && <div className="text-xs font-medium text-gray-500 mb-1">{product.brand}</div>}
        <h3 className="font-semibold text-gray-900 text-lg mb-2 line-clamp-2">{product.name}</h3>

        {product.notes && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.notes}</p>}

        {product.features && product.features.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {product.features.map((f, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                {f}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="text-xl font-bold text-gray-900">{formatPriceGBP(product.price)}</div>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.(product);
              }}
              className={`px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                added ? "opacity-80" : ""
              }`}
            >
              <span className="sm:inline">{added ? "Added" : "Add To Cart"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  open,
  onClose,
  priceRange,
  setPriceRange,
  selectedBrands,
  setSelectedBrands,
  selectedFeatures,
  setSelectedFeatures,
  inStockOnly,
  setInStockOnly,
  allBrands,
  allFeatures,
  clearFilters,
  activeFilterCount,
}: {
  open: boolean;
  onClose: () => void;
  priceRange: [number, number];
  setPriceRange: (r: [number, number]) => void;
  selectedBrands: string[];
  setSelectedBrands: (a: string[]) => void;
  selectedFeatures: string[];
  setSelectedFeatures: (a: string[]) => void;
  inStockOnly: boolean;
  setInStockOnly: (v: boolean) => void;
  allBrands: string[];
  allFeatures: string[];
  clearFilters: () => void;
  activeFilterCount: number;
}) {
  const toggleBrand = (brand: string) => {
    setSelectedBrands(selectedBrands.includes(brand) ? selectedBrands.filter((b) => b !== brand) : [...selectedBrands, brand]);
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures(selectedFeatures.includes(feature) ? selectedFeatures.filter((f) => f !== feature) : [...selectedFeatures, feature]);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">Filters</h2>
              {activeFilterCount > 0 && <span className="bg-black text-white text-xs font-semibold px-2 py-1 rounded-full">{activeFilterCount}</span>}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close filters"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Price Range (GBP)</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input type="number" value={priceRange[0]} onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black" placeholder="Min" />
                  <span className="text-gray-400">—</span>
                  <input type="number" value={priceRange[1]} onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black" placeholder="Max" />
                </div>
                <input type="range" min={0} max={3000} step={1} value={priceRange[1]} onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])} className="w-full accent-black" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Brands</h3>
              <div className="space-y-2">
                {allBrands.map((brand) => (
                  <label key={brand} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                    <input type="checkbox" checked={selectedBrands.includes(brand)} onChange={() => toggleBrand(brand)} className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black" />
                    <span className="text-sm text-gray-700">{brand}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Features</h3>
              <div className="flex flex-wrap gap-2">
                {allFeatures.map((feature) => {
                  const isSelected = selectedFeatures.includes(feature);
                  return (
                    <button key={feature} onClick={() => toggleFeature(feature)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isSelected ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      {feature}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black" />
                <div>
                  <div className="text-sm font-medium text-gray-900">In Stock Only</div>
                  <div className="text-xs text-gray-500">Show only available items</div>
                </div>
              </label>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 space-y-3">
            <button onClick={clearFilters} className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Clear All Filters</button>
            <button onClick={onClose} className="w-full px-4 py-3 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">Show Results</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function EquipmentGalleryPage() {
  const CATEGORIES = useMemo(() => ["All", "Espresso Machines", "Coffee Grinders", "Coffee Brewers", "Barista Accessories", "Serving & Storage"], []);
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 3000]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "featured", label: "Featured" },
    { key: "price-asc", label: "Price: Low → High" },
    { key: "price-desc", label: "Price: High → Low" },
    { key: "name-asc", label: "Name: A → Z" },
    { key: "name-desc", label: "Name: Z → A" },
  ];
  const [sort, setSort] = useState<SortKey>("featured");

  // Data state
  const [items, setItems] = useState<EquipmentProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

  const buildCloudinaryImageUrl = (publicId?: string | null) => {
    if (!publicId) return undefined;
    if (publicId.startsWith("http://") || publicId.startsWith("https://")) return publicId;
    if (!CLOUD_NAME) return undefined;
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}`;
  };

  // small runtime type guards
  const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "") ? v : undefined;

  // robust parser accepting numbers or numeric strings (currency symbols allowed)
  const asNumber = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;

    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed === "") return undefined;
      const cleaned = trimmed.replace(/[^\d.-]/g, "");
      if (cleaned === "" || cleaned === "." || cleaned === "-") return undefined;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : undefined;
    }

    return undefined;
  };

  const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  // Fetch API and normalize response
  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/equipment?limit=100", { signal: ctrl.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Failed to fetch (${res.status})`);
        }

        const json: unknown = await res.json();
        const raw = Array.isArray((json as { data?: unknown }).data) ? (json as { data: unknown[] }).data : [];

        const mapped: EquipmentProduct[] = raw.map((r) => {
          const obj = r as Record<string, unknown>;

          // Prefer API-provided full URL field imgUrl
          let imgUrl: string | undefined = asString(obj.imgUrl);
          if (!imgUrl) {
            const pid = asString(obj.imgPublicId) ?? asString(obj.img);
            if (pid) imgUrl = buildCloudinaryImageUrl(pid);
          }

          // price logic: prefer price (pounds decimal) -> fallback to pricePence
          let priceInPounds = 0;
          const pVal = asNumber(obj.price);
          if (pVal !== undefined) {
            priceInPounds = pVal;
          } else if (asNumber(obj.pricePence) !== undefined) {
            priceInPounds = (asNumber(obj.pricePence) ?? 0) / 100;
          } else if (asNumber(obj.minPrice) !== undefined) {
            const mp = asNumber(obj.minPrice)!;
            priceInPounds = mp > 1000 ? mp / 100 : mp;
          } else if (asNumber(obj.minPricePence) !== undefined) {
            priceInPounds = asNumber(obj.minPricePence)! / 100;
          }

          const idVal = asString(obj._id) ?? asString(obj.id) ?? asString(obj.slug) ?? Math.random().toString(36).slice(2, 9);

          return {
            id: String(idVal),
            slug: asString(obj.slug),
            name: asString(obj.name) ?? "Untitled Product",
            brand: asString(obj.brand),
            category: asString(obj.category),
            features: asStringArray(obj.features),
            price: Number(Number(priceInPounds).toFixed(2)),
            img: imgUrl,
            stock: (asNumber(obj.totalStock) ?? asNumber(obj.stock)) as number | undefined,
            notes: asString(obj.notes),
            description: asString(obj.description),
          } as EquipmentProduct;
        });

        setItems(mapped);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("Failed to load equipment:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [CLOUD_NAME]);

  // Filters and sorting (client-side)
  const filtered = useMemo(() => {
    let list = selectedCategory === "All" ? items : items.filter((d) => d.category === selectedCategory);
    list = list.filter((item) => {
      if (item.price !== undefined && (item.price < priceRange[0] || item.price > priceRange[1])) return false;
      if (selectedBrands.length > 0 && item.brand && !selectedBrands.includes(item.brand)) return false;
      if (selectedFeatures.length > 0 && item.features) {
        const hasFeature = selectedFeatures.some((f) => item.features?.includes(f));
        if (!hasFeature) return false;
      }
      if (inStockOnly && (item.stock === undefined || item.stock === 0)) return false;
      return true;
    });
    return list;
  }, [items, selectedCategory, priceRange, selectedBrands, selectedFeatures, inStockOnly]);

  const sorted = useMemo(() => {
    if (sort === "featured") return filtered;
    const list = [...filtered];
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        break;
      case "price-desc":
        list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        break;
      case "name-asc":
        list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        break;
      case "name-desc":
        list.sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""));
        break;
    }
    return list;
  }, [filtered, sort]);

  // Pagination / load more
  const PAGE_SIZE = 8;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  useEffect(() => {
    if (visibleCount === PAGE_SIZE) return;
    const id = window.setTimeout(() => setVisibleCount(PAGE_SIZE), 0);
    return () => window.clearTimeout(id);
  }, [selectedCategory, priceRange[0], priceRange[1], selectedBrands.join(","), selectedFeatures.join(","), inStockOnly, sort, visibleCount]);

  const displayItems = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({});
  const addItem = useCart((s) => s.addItem);

  const handleLoadMore = () => setVisibleCount((c) => Math.min(sorted.length, c + PAGE_SIZE));

  const router = useRouter();

  const handleAdd = (p: EquipmentProduct) => {
    if (p.stock !== undefined && p.stock <= 0) {
      alert("This item is out of stock.");
      return;
    }
  
    const cartItem: Omit<CartItem, "quantity"> = {
      id: p.id,
      productType: "equipment",
      productId: p.id,
      variantId: p.id,
      sku: p.slug ?? p.id,
      name: p.name,
      price: Number(p.price ?? 0), // fixed: store pounds decimal!
      img: p.img ?? "/test.webp",
      size: undefined as unknown as string,
      grind: undefined as unknown as string,
      stock: p.stock ?? 0,
    };
  
    addItem(cartItem, 1);
    setAddingMap((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setAddingMap((s) => ({ ...s, [p.id]: false })), 1200);
  };

  const handleView = (p: EquipmentProduct) => {
    const slugOrId = p.slug ?? p.id;
    router.push(`/equipment/${encodeURIComponent(slugOrId)}`);
  };

  const allBrands = useMemo(() => {
    const bs = new Set<string>();
    items.forEach((i) => i.brand && bs.add(i.brand));
    return Array.from(bs).sort();
  }, [items]);

  const allFeatures = useMemo(() => {
    const fs = new Set<string>();
    items.forEach((i) => i.features?.forEach((f) => fs.add(f)));
    return Array.from(fs).sort();
  }, [items]);

  const clearFilters = () => {
    setPriceRange([0, 3000]);
    setSelectedBrands([]);
    setSelectedFeatures([]);
    setInStockOnly(false);
  };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (priceRange[0] !== 0 || priceRange[1] !== 3000) c++;
    if (selectedBrands.length > 0) c++;
    if (selectedFeatures.length > 0) c++;
    if (inStockOnly) c++;
    return c;
  }, [priceRange, selectedBrands, selectedFeatures, inStockOnly]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <style>{`.no-scrollbar-x::-webkit-scrollbar{display:none}.no-scrollbar-x{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-12 mt-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <EspressoMachinesIcon />
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">Equipment</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">Hand-picked equipment for home baristas and cafés. Clear product information, crisp imagery, and an easy buying flow.</p>
        </div>

        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar-x">
            {CATEGORIES.map((c) => {
              const active = c === selectedCategory;
              return (
                <button key={c} onClick={() => setSelectedCategory(c)} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${active ? "bg-black text-white shadow-md" : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{sorted.length}</span> item{sorted.length !== 1 ? "s" : ""}
            </div>

            <button onClick={() => setFilterOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg bg-white hover:border-gray-300 hover:shadow-sm transition-all text-sm font-medium">
              <SlidersHorizontal className="w-4 h-4" /> Filters
              {activeFilterCount > 0 && <span className="ml-1 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="text-sm border border-gray-200 rounded-lg px-4 py-2 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all">
              {sortOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div className="sm:hidden w-full"><MobileSort current={sort} setSort={setSort} options={sortOptions} /></div>
        </div>

        {loading && <div className="text-center py-8 text-gray-600">Loading equipment…</div>}
        {error && <div className="text-center py-8 text-red-600">Failed to load equipment: {error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayItems.map((p) => (
            <EquipmentCard key={p.id} product={p} onAdd={handleAdd} onView={handleView} added={!!addingMap[p.id]} />
          ))}
        </div>

        {sorted.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">☕</div>
            <p className="text-gray-600 text-lg">No products found in this category</p>
          </div>
        )}

        {sorted.length > displayItems.length && (
          <div className="mt-8 flex justify-center">
            <button onClick={handleLoadMore} className="px-6 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold">Load more</button>
          </div>
        )}
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} priceRange={priceRange} setPriceRange={setPriceRange} selectedBrands={selectedBrands} setSelectedBrands={setSelectedBrands} selectedFeatures={selectedFeatures} setSelectedFeatures={setSelectedFeatures} inStockOnly={inStockOnly} setInStockOnly={setInStockOnly} allBrands={allBrands} allFeatures={allFeatures} clearFilters={clearFilters} activeFilterCount={activeFilterCount} />
    </div>
  );
}

function MobileSort({ current, setSort, options }: { current: SortKey; setSort: (k: SortKey) => void; options: { key: SortKey; label: string }[]; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || !(e.target instanceof Node)) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button onClick={() => setOpen((s) => !s)} className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg bg-white text-sm font-medium hover:border-gray-300 transition-colors">
        <span className="flex items-center gap-2"><span className="text-gray-600">Sort by:</span><span className="text-gray-900">{options.find((o) => o.key === current)?.label ?? "Featured"}</span></span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
          {options.map((o) => {
            const active = o.key === current;
            return (
              <button key={o.key} onClick={() => { setSort(o.key); setOpen(false); }} className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm transition-colors ${active ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                {o.label}
                {active && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}