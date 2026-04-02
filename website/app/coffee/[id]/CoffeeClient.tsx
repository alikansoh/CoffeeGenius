"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ShoppingCart,
  Check,
  Coffee,
  MapPin,
  Package,
  Truck,
  ChevronDown,
  AlertCircle,
  Star,
  Play,
  X,
  Minus,
  Plus,
} from "lucide-react";
import useCart, { CartItem } from "../../store/CartStore";
import {
  getCloudinaryUrl,
  getCloudinaryVideo,
  getVideoThumbnail,
  isVideo,
} from "@/app/utils/cloudinary";

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
  inStock?: boolean;
  roastType?: "espresso" | "filter" | "omni" | "decaf";
  RostType?: "espresso" | "filter" | "omni" | "decaf";
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
}

interface SizePrice {
  size: string;
  price: number;
  availableGrinds?: string[];
  totalStock?: number;
  inStock?: boolean;
}

interface ApiCoffee {
  _1: string;
  _id: string;
  slug: string;
  name: string;
  origin: string;
  img: string;
  images?: string[];
  notes?: string;
  roastLevel?: "light" | "medium" | "dark";
  roastType?: "espresso" | "filter" | "omni" | "decaf";
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  brewing?: string;
  bestSeller?: boolean;
  createdAt: string;
  variantCount: number;
  minPrice: number;
  availableGrinds: string[];
  availableSizes: SizePrice[];
  totalStock: number;
  variants: Variant[];
  inStock?: boolean;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  story?: string;
}

export interface ExtendedProduct {
  id: string;
  slug?: string;
  name: string;
  origin: string;
  notes: string;
  price: number;
  prices?: Record<string, number>;
  img: string;
  roastType?: "espresso" | "filter" | "omni" | "decaf";
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  images?: string[];
  availableGrinds?: string[];
  availableSizes?: SizePrice[];
  variants?: Variant[];
  brewing?: string;
  inStock?: boolean;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  bestSeller?: boolean;
  story?: string;
}

type GrindOption =
  | "whole-bean"
  | "espresso"
  | "filter"
  | "cafetiere"
  | "aeropress";
type SizeOption = string;

const GRIND_OPTIONS: {
  value: GrindOption;
  label: string;
  description: string;
}[] = [
  {
    value: "whole-bean",
    label: "Whole Bean",
    description: "For home grinding",
  },
  {
    value: "espresso",
    label: "Espresso",
    description: "Fine grind for espresso",
  },
  {
    value: "filter",
    label: "Filter",
    description: "Medium grind for pour-over",
  },
  {
    value: "cafetiere",
    label: "Cafetière",
    description: "Coarse grind for French press",
  },
  { value: "aeropress", label: "AeroPress", description: "Fine-medium grind" },
];

const ROAST_TYPE_META: Record<
  "espresso" | "filter" | "omni" | "decaf",
  {
    label: string;
    desc: string;
    pill: string;
    text: string;
    icon: string;
    badge: string;
  }
> = {
  espresso: {
    label: "Espresso Roast",
    desc: "Rich, concentrated — great for pressure extraction.",
    pill: "bg-zinc-900",
    text: "text-white",
    icon: "☕",
    badge: "bg-zinc-100 text-zinc-800 border border-zinc-200",
  },
  filter: {
    label: "Filter Roast",
    desc: "Clean and bright — ideal for pour-over and drip.",
    pill: "bg-slate-700",
    text: "text-white",
    icon: "🫖",
    badge: "bg-slate-100 text-slate-800 border border-slate-200",
  },
  omni: {
    label: "Espresso & Filter",
    desc: "Versatile roast — works beautifully as espresso or filter.",
    pill: "bg-zinc-800",
    text: "text-white",
    icon: "✦",
    badge: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  },
  decaf: {
    label: "Decaf",
    desc: "All the flavour, without the caffeine.",
    pill: "bg-emerald-700",
    text: "text-white",
    icon: "🌿",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  },
};

// ── Helper: get the effective roast type from a variant ────────────────────────
// Checks both RostType (legacy typo field) and roastType
function getVariantRoast(v: Variant): "espresso" | "filter" | "omni" | "decaf" | undefined {
  return v.RostType || v.roastType;
}

// ── Helper: expand "omni" into ["espresso", "filter"] ─────────────────────────
// "omni" expands to both espresso and filter; "decaf" does NOT expand — it is a
// standalone roast type that only matches itself.
function expandRoastType(rt: string): ("espresso" | "filter" | "decaf")[] {
  if (rt === "omni") return ["espresso", "filter"];
  if (rt === "espresso") return ["espresso"];
  if (rt === "filter") return ["filter"];
  if (rt === "decaf") return ["decaf"];
  return [];
}

// ── Check if a variant matches a chosen roast style ───────────────────────────
// "omni" variants satisfy both "espresso" and "filter" selections.
function variantMatchesRoast(
  variant: Variant,
  chosenRoast: "espresso" | "filter" | "decaf" | null
): boolean {
  if (!chosenRoast) return true;
  const vRoast = getVariantRoast(variant);
  if (!vRoast) return true; // variant has no roast info, matches anything
  if (chosenRoast === "decaf") return vRoast === "decaf";
  if (vRoast === "decaf") return false; // decaf only matches decaf
  if (vRoast === "omni") return true; // omni matches both espresso and filter
  return vRoast === chosenRoast;
}

function SimpleRoastType({ type }: { type: "espresso" | "filter" | "omni" | "decaf" }) {
  const meta = ROAST_TYPE_META[type];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full ${meta.pill}`}
      >
        <span className="text-sm">{meta.icon}</span>
        <span className={`font-semibold text-sm tracking-wide ${meta.text}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-zinc-400">{meta.desc}</p>
    </div>
  );
}

function RoastTypeBadge({ type }: { type: "espresso" | "filter" | "omni" | "decaf" }) {
  const meta = ROAST_TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${meta.badge}`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function ReadMore({
  text,
  maxChars = 320,
}: {
  text?: string;
  maxChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) {
    return (
      <p className="text-sm italic text-zinc-400">
        No story available for this coffee.
      </p>
    );
  }

  const isLong = text.length > maxChars;
  const displayed =
    !isLong || expanded ? text : text.slice(0, maxChars).trimEnd() + "…";

  return (
    <div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-600">
        {displayed}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((s) => !s)}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-900 hover:text-zinc-600 transition-colors focus:outline-none"
        >
          <span>{expanded ? "Read less" : "Read more"}</span>
          <span className="inline-block transition-transform">
            {expanded ? "↑" : "↓"}
          </span>
        </button>
      )}
    </div>
  );
}

/* ── Step Label — refined numbered indicator ── */
function StepLabel({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 flex-shrink-0
          ${
            done
              ? "bg-zinc-900 text-white"
              : active
              ? "bg-zinc-900 text-white ring-4 ring-zinc-900/10"
              : "bg-zinc-100 text-zinc-400 border border-zinc-200"
          }`}
      >
        {done ? <Check size={11} strokeWidth={3} /> : step}
      </div>
      <span
        className={`text-[13px] font-semibold tracking-wide transition-colors ${
          active || done ? "text-zinc-900" : "text-zinc-400"
        }`}
      >
        {label}
      </span>
      {done && (
        <div className="ml-auto">
          <span className="text-[11px] font-medium text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full border border-zinc-100">
            Done
          </span>
        </div>
      )}
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);

  const [product, setProduct] = useState<ExtendedProduct | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<ExtendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSize, setSelectedSize] = useState<SizeOption>("250g");
  const [userSelectedGrind, setUserSelectedGrind] =
    useState<GrindOption | null>(null);
  const [selectedRoastStyle, setSelectedRoastStyle] = useState<
    "espresso" | "filter" | "decaf" | null
  >(null);
  const [userSelectedImageIndex, setUserSelectedImageIndex] = useState<
    number | null
  >(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | null>(
    "details"
  );

  const [videoMap, setVideoMap] = useState<Record<string, boolean>>({});
  const [playingVideoSrc, setPlayingVideoSrc] = useState<string | null>(null);

  const [selectedRoastFilter, setSelectedRoastFilter] = useState<
    "all" | "espresso" | "filter" | "omni" | "decaf"
  >("all");

  const productId = params?.id as string;

  const detectSinglePublicId = useCallback(
    async (publicId: string): Promise<boolean> => {
      if (!publicId) return false;
      if (isVideo(publicId)) return true;
      try {
        const url = getCloudinaryVideo(publicId);
        const res = await fetch(url, { method: "HEAD" });
        const ct = res.headers.get("content-type") || "";
        return ct.startsWith("video/");
      } catch {
        return false;
      }
    },
    []
  );

  const detectAllPublicIds = useCallback(
    async (publicIds: string[]): Promise<Record<string, boolean>> => {
      const results: Record<string, boolean> = {};
      await Promise.all(
        publicIds.map(async (publicId) => {
          if (publicId) {
            results[publicId] = await detectSinglePublicId(publicId);
          }
        })
      );
      return results;
    },
    [detectSinglePublicId]
  );

  const isVideoId = useCallback(
    (publicId: string) => {
      if (!publicId) return false;
      if (videoMap[publicId] !== undefined) return videoMap[publicId];
      return isVideo(publicId);
    },
    [videoMap]
  );

  // ── Derive whether the product is omni from both product-level and variant-level data ──
  const derivedIsOmni = useMemo(() => {
    if (!product) return false;
    // Explicit product-level roastType
    if (product.roastType === "omni") return true;
    // Check if variants collectively provide both espresso and filter
    if (product.variants) {
      const expandedTypes = new Set<string>();
      product.variants.forEach((v) => {
        const vRoast = getVariantRoast(v);
        if (vRoast) {
          expandRoastType(vRoast).forEach((rt) => expandedTypes.add(rt));
        }
      });
      if (expandedTypes.has("espresso") && expandedTypes.has("filter")) return true;
    }
    // Also expand product.roastType
    if (product.roastType) {
      const expanded = expandRoastType(product.roastType);
      if (expanded.includes("espresso") && expanded.includes("filter")) return true;
    }
    return false;
  }, [product]);

  // ── Derive the display roast type ──
  const derivedRoastType = useMemo((): "espresso" | "filter" | "omni" | "decaf" | null => {
    if (!product) return null;
    if (derivedIsOmni) return "omni";
    if (product.roastType) return product.roastType;
    // Check variants
    if (product.variants) {
      const expandedTypes = new Set<"espresso" | "filter" | "decaf">();
      product.variants.forEach((v) => {
        const vRoast = getVariantRoast(v);
        if (vRoast) {
          expandRoastType(vRoast).forEach((rt) => expandedTypes.add(rt));
        }
      });
      if (expandedTypes.size === 2) return "omni";
      if (expandedTypes.size === 1) return Array.from(expandedTypes)[0];
    }
    return null;
  }, [product, derivedIsOmni]);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/coffee/${encodeURIComponent(productId)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch product");
        }

        const data = await response.json();
        const apiCoffee: ApiCoffee = data.data;

        const prices: Record<string, number> = {};
        const sizeGrindsMap: Record<string, string[]> = {};

        if (apiCoffee.variants && apiCoffee.variants.length > 0) {
          apiCoffee.variants.forEach((variant: Variant) => {
            if (!prices[variant.size]) {
              prices[variant.size] = variant.price;
            }
            if (!sizeGrindsMap[variant.size]) {
              sizeGrindsMap[variant.size] = [];
            }
            if (!sizeGrindsMap[variant.size].includes(variant.grind)) {
              sizeGrindsMap[variant.size].push(variant.grind);
            }
          });
        } else if (
          apiCoffee.availableSizes &&
          apiCoffee.availableSizes.length > 0
        ) {
          apiCoffee.availableSizes.forEach((sizeObj: SizePrice) => {
            prices[sizeObj.size] = sizeObj.price;
          });
        } else {
          prices["250g"] = apiCoffee.minPrice;
        }

        const availableSizesWithGrinds: SizePrice[] = Object.keys(prices)
          .sort()
          .map((size) => ({
            size,
            price: prices[size],
            availableGrinds:
              sizeGrindsMap[size] || apiCoffee.availableGrinds || [],
          }));

        const allImages: string[] =
          apiCoffee.images && apiCoffee.images.length > 0
            ? apiCoffee.images
            : apiCoffee.img
            ? [apiCoffee.img]
            : [];

        // Derive roastType: expand from variants if product-level is missing
        let derivedProductRoastType = apiCoffee.roastType || undefined;
        if (!derivedProductRoastType && apiCoffee.variants) {
          const expandedTypes = new Set<"espresso" | "filter" | "decaf">();
          apiCoffee.variants.forEach((v) => {
            const vRoast = v.RostType || v.roastType;
            if (vRoast) {
              expandRoastType(vRoast).forEach((rt) => expandedTypes.add(rt));
            }
          });
          if (expandedTypes.has("espresso") && expandedTypes.has("filter")) {
            derivedProductRoastType = "omni";
          } else if (expandedTypes.size === 1) {
            derivedProductRoastType = Array.from(expandedTypes)[0];
          }
        }

        const transformedProduct: ExtendedProduct = {
          id: apiCoffee._id || apiCoffee.slug,
          slug: apiCoffee.slug,
          name: apiCoffee.name,
          origin: apiCoffee.origin,
          notes: apiCoffee.notes || "",
          price: apiCoffee.minPrice,
          prices,
          img: apiCoffee.img,
          roastType: derivedProductRoastType,
          process: apiCoffee.process,
          altitude: apiCoffee.altitude,
          harvest: apiCoffee.harvest,
          cupping_score: apiCoffee.cupping_score,
          variety: apiCoffee.variety,
          brewing: apiCoffee.brewing,
          images: allImages,
          availableGrinds: apiCoffee.availableGrinds,
          availableSizes: availableSizesWithGrinds,
          variants: apiCoffee.variants,
          inStock: apiCoffee.inStock,
          stockStatus: apiCoffee.stockStatus,
          bestSeller: apiCoffee.bestSeller,
          story: apiCoffee.story || "",
        };

        setProduct(transformedProduct);
        setSelectedSize(Object.keys(prices)[0] || "250g");
        setUserSelectedGrind(null);

        // Determine if the product is omni (using expanded logic)
        const isProductOmni = derivedProductRoastType === "omni";

        if (isProductOmni) {
          setSelectedRoastStyle("espresso");
        } else if (
          derivedProductRoastType === "espresso" ||
          derivedProductRoastType === "filter"
        ) {
          setSelectedRoastStyle(derivedProductRoastType);
        } else {
          setSelectedRoastStyle(null);
        }

        setLoading(false);
        setError(null);

        detectAllPublicIds(allImages).then((detectedVideoMap) => {
          setVideoMap(detectedVideoMap);
        });

        fetch("/api/coffee")
          .then((allResponse) => {
            if (!allResponse.ok) return;
            return allResponse.json();
          })
          .then((allData) => {
            if (!allData) return;

            const others: ApiCoffee[] = allData.data.filter(
              (coffee: ApiCoffee) => coffee._id !== apiCoffee._id
            );

            let sameType: ApiCoffee[] = [];
            if (apiCoffee.roastType) {
              sameType = others.filter(
                (c) => c.roastType === apiCoffee.roastType
              );
            }

            let selectedForRelated: ApiCoffee[] = sameType.slice(0, 4);

            if (selectedForRelated.length < 4) {
              const needed = 4 - selectedForRelated.length;
              const additional = others
                .filter((c) => !selectedForRelated.some((s) => s._id === c._id))
                .slice(0, needed);
              selectedForRelated = [...selectedForRelated, ...additional];
            }

            const relatedTransformed: ExtendedProduct[] =
              selectedForRelated.map((coffee: ApiCoffee) => {
                const relatedPrices: Record<string, number> = {};
                if (coffee.availableSizes && coffee.availableSizes.length > 0) {
                  coffee.availableSizes.forEach((sizeObj: SizePrice) => {
                    relatedPrices[sizeObj.size] = sizeObj.price;
                  });
                } else {
                  relatedPrices["250g"] = coffee.minPrice;
                }

                return {
                  id: coffee._id || coffee.slug,
                  slug: coffee.slug,
                  name: coffee.name,
                  origin: coffee.origin,
                  notes: coffee.notes || "",
                  price: coffee.minPrice,
                  prices: relatedPrices,
                  img: coffee.img,
                  roastType: coffee.roastType,
                  availableGrinds: coffee.availableGrinds,
                  bestSeller: coffee.bestSeller,
                } as ExtendedProduct;
              });

            setRelatedProducts(relatedTransformed);
          })
          .catch((err) => {
            console.error("Error fetching related products:", err);
          });
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product details");
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId, detectAllPublicIds]);

  const productImages = useMemo(() => {
    return product?.images || [product?.img || "/test.webp"];
  }, [product]);

  const { imageItems, videoItems } = useMemo(() => {
    const images: string[] = [];
    const videos: string[] = [];
    productImages.forEach((item) => {
      if (isVideoId(item)) {
        videos.push(item);
      } else {
        images.push(item);
      }
    });
    return { imageItems: images, videoItems: videos };
  }, [productImages, isVideoId]);

  const allDisplayMedia = useMemo(() => {
    return [...imageItems, ...videoItems];
  }, [imageItems, videoItems]);

  // ── Check if a size is available for the selected roast style ───────────────
  const isSizeAvailableForRoastStyle = useCallback(
    (size: string): boolean => {
      if (!product?.variants) return true;
      if (!derivedIsOmni || !selectedRoastStyle) return true;

      // Check if any variant for this size matches the roast style
      // (variantMatchesRoast handles omni variants matching both)
      return product.variants.some(
        (v) => v.size === size && variantMatchesRoast(v, selectedRoastStyle)
      );
    },
    [product, selectedRoastStyle, derivedIsOmni]
  );

  const availableGrindsForSize = useMemo(() => {
    if (!selectedSize || !product) return [];

    if (product.variants && product.variants.length > 0) {
      const matchingVariants = product.variants.filter((v) => {
        if (v.size !== selectedSize) return false;
        if (derivedIsOmni && selectedRoastStyle) {
          return variantMatchesRoast(v, selectedRoastStyle);
        }
        return true;
      });

      if (matchingVariants.length > 0) {
        return [...new Set(matchingVariants.map((v) => v.grind))];
      }
    }

    if (product.availableSizes && product.availableSizes.length > 0) {
      const sizeData = product.availableSizes.find(
        (s) => s.size === selectedSize
      );
      if (sizeData?.availableGrinds && sizeData.availableGrinds.length > 0) {
        return sizeData.availableGrinds;
      }
    }

    return product.availableGrinds || [];
  }, [selectedSize, selectedRoastStyle, product, derivedIsOmni]);

  const filteredGrindOptions = useMemo(
    () =>
      GRIND_OPTIONS.filter((g) =>
        availableGrindsForSize.includes(g.value as GrindOption)
      ),
    [availableGrindsForSize]
  );

  const selectedGrind = useMemo<GrindOption>(() => {
    if (
      userSelectedGrind &&
      availableGrindsForSize.includes(userSelectedGrind)
    ) {
      return userSelectedGrind;
    }
    return (availableGrindsForSize[0] as GrindOption) ?? "whole-bean";
  }, [userSelectedGrind, availableGrindsForSize]);

  // ── Variant matching: uses variantMatchesRoast so "omni" variants match both ─
  const selectedVariant = useMemo(() => {
    if (!product?.variants || !selectedSize || !selectedGrind) return null;

    // Try to find a variant matching size + grind + roast style
    if (derivedIsOmni && selectedRoastStyle) {
      const match = product.variants.find(
        (v) =>
          v.size === selectedSize &&
          v.grind === selectedGrind &&
          variantMatchesRoast(v, selectedRoastStyle)
      );
      if (match) return match;
    }

    // Fallback: match by size and grind only
    return (
      product.variants.find(
        (v) => v.size === selectedSize && v.grind === selectedGrind
      ) ?? null
    );
  }, [product, selectedSize, selectedGrind, selectedRoastStyle, derivedIsOmni]);

  useEffect(() => {
    setUserSelectedGrind(null);
  }, [selectedRoastStyle]);

  useEffect(() => {
    if (derivedIsOmni && selectedRoastStyle && product?.variants) {
      if (!isSizeAvailableForRoastStyle(selectedSize)) {
        const firstAvailable = (product.availableSizes || []).find((s) =>
          isSizeAvailableForRoastStyle(s.size)
        );
        if (firstAvailable) setSelectedSize(firstAvailable.size);
      }
    }
  }, [
    selectedRoastStyle,
    product,
    selectedSize,
    isSizeAvailableForRoastStyle,
    derivedIsOmni,
  ]);

  useEffect(() => {
    if (selectedSize && availableGrindsForSize.length > 0) {
      if (!availableGrindsForSize.includes(selectedGrind)) {
        setUserSelectedGrind(availableGrindsForSize[0] as GrindOption);
      }
    }
  }, [selectedSize, availableGrindsForSize, selectedGrind]);

  const selectedImageIndex = useMemo(() => {
    const len = allDisplayMedia.length || 1;
    const idx = userSelectedImageIndex ?? 0;
    if (idx < 0) return 0;
    if (idx >= len) return 0;
    return idx;
  }, [userSelectedImageIndex, allDisplayMedia]);

  const currentPrice = useMemo(() => {
    if (selectedVariant) return selectedVariant.price;
    if (!product) return 0;
    return product.prices?.[selectedSize] ?? product.price;
  }, [selectedVariant, product, selectedSize]);

  const availableStock = useMemo(() => {
    return selectedVariant?.stock ?? 0;
  }, [selectedVariant]);

  const isOutOfStock = selectedVariant ? availableStock === 0 : false;

  const totalPrice = useMemo(
    () => currentPrice * quantity,
    [currentPrice, quantity]
  );

  const brewingText = product?.brewing ?? "";

  const brewingEntries = useMemo((): [string, string][] => {
    if (!brewingText) return [];
    const lines = brewingText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line, idx) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) {
        const label = line.slice(0, colonIndex).trim();
        const guide = line.slice(colonIndex + 1).trim();
        return [label || `Guide ${idx + 1}`, guide || ""];
      }
      return [`Guide ${idx + 1}`, line];
    });
  }, [brewingText]);

  const availableSizes = useMemo(
    () => (product?.prices ? Object.keys(product.prices).sort() : ["250g"]),
    [product]
  );

  const filteredRelatedProducts = useMemo(() => {
    if (selectedRoastFilter === "all") return relatedProducts;
    return relatedProducts.filter((p) => p.roastType === selectedRoastFilter);
  }, [relatedProducts, selectedRoastFilter]);

  const availableRoastTabs = useMemo(() => {
    const types = new Set(
      relatedProducts.map((p) => p.roastType).filter(Boolean)
    );
    return Array.from(types) as ("espresso" | "filter" | "omni" | "decaf")[];
  }, [relatedProducts]);

  useEffect(() => {
    if (!loading && !product) {
      router.push("/coffee");
    }
  }, [product, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="relative mx-auto mb-6 w-14 h-14">
            <div className="absolute inset-0 rounded-full bg-zinc-100 animate-ping opacity-60" />
            <div className="relative w-14 h-14 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100">
              <Coffee size={24} className="text-zinc-600" />
            </div>
          </div>
          <p className="text-zinc-400 text-sm font-medium tracking-wide">
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Coffee size={40} className="mx-auto mb-4 text-zinc-200" />
          <p className="text-zinc-500 font-medium">
            {error || "Product not found"}
          </p>
          <button
            onClick={() => router.push("/coffee")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  const notesArray =
    product.notes
      ?.split(",")
      .map((n) => n.trim())
      .filter(Boolean) ?? [];

  const toggleAccordion = (section: string) => {
    setActiveAccordion((prev) => (prev === section ? null : section));
  };

  const handleAddToCart = () => {
    if (!selectedVariant) {
      alert("Please select a valid size and brew method");
      return;
    }
    if (isOutOfStock) {
      alert("This item is currently out of stock");
      return;
    }
    if (quantity > availableStock) {
      alert(`Only ${availableStock} items available in stock`);
      return;
    }

    // Use the user's chosen roast style, not the raw variant roastType
    // so "omni" never leaks into the cart label
    const variantRoast = getVariantRoast(selectedVariant);
    const roastLabel =
      derivedIsOmni && selectedRoastStyle
        ? selectedRoastStyle // "espresso" or "filter" — customer's choice
        : variantRoast === "omni"
        ? ""
        : variantRoast || product.roastType || "";

    const cartItem: Omit<CartItem, "quantity"> = {
      id: selectedVariant._id,
      productType: "coffee",
      productId: product.id,
      variantId: selectedVariant._id,
      name: `${product.name} — ${selectedSize} — ${selectedGrind}`,
      price: selectedVariant.price,
      img: selectedVariant.img || product.img || "/test.webp",
      size: selectedVariant.size,
      grind: selectedVariant.grind,
      sku: selectedVariant.sku,
      stock: selectedVariant.stock,
      roastType: roastLabel,
    };

    addItem(cartItem, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const currentMediaItem =
    allDisplayMedia[selectedImageIndex] || product.img || "/test.webp";
  const isCurrentItemVideo = isVideoId(currentMediaItem);

  const step1Done = derivedIsOmni ? selectedRoastStyle !== null : true;
  const step2Done = step1Done && !!selectedSize;
  const step3Done = step2Done && !!selectedGrind;

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }

        /* Hide number input spinners */
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>

      <main className="mt-16 sm:mt-0 min-h-screen bg-zinc-50">
        {/* ── Back bar ─�� */}
        <div className="bg-white border-b border-zinc-100 sticky top-0 z-30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-3.5">
            <button
              onClick={() => router.push("/coffee")}
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-900 font-medium transition-colors group text-sm"
              aria-label="Back to shop"
            >
              <ArrowLeft
                size={15}
                className="group-hover:-translate-x-0.5 transition-transform"
              />
              Back to Shop
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-12">
          {/* ── Mobile header ── */}
          <div className="md:hidden mb-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <MapPin size={12} className="text-zinc-400" />
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                {product.origin}
              </p>
              {product.bestSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900 text-white text-[10px] font-bold">
                  <Star size={8} className="fill-white" />
                  Best Seller
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 leading-tight">
              {product.name}
            </h1>

            <div className="flex items-baseline gap-2 mb-3">
              <p className="text-2xl font-bold text-zinc-900">
                £{currentPrice.toFixed(2)}
              </p>
              <p className="text-sm text-zinc-400">/ {selectedSize}</p>
            </div>

            {derivedRoastType && (
              <div className="mt-2">
                <SimpleRoastType type={derivedRoastType} />
              </div>
            )}
          </div>

          {/* ── Main grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 lg:gap-14">
            {/* ════ LEFT: Media + Accordions ════ */}
            <div className="space-y-3 sm:space-y-4">
              {/* Main image */}
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-zinc-100 shadow-sm">
                {product.bestSeller && (
                  <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 text-white text-xs font-bold shadow-md">
                    <Star size={11} className="fill-white" />
                    Best Seller
                  </div>
                )}

                {isCurrentItemVideo ? (
                  <>
                    <Image
                      src={getVideoThumbnail(currentMediaItem)}
                      alt={`${product.name} - Video`}
                      fill
                      className="object-contain"
                      priority
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPlayingVideoSrc(getCloudinaryVideo(currentMediaItem))
                      }
                      className="absolute inset-0 flex items-center justify-center group"
                      aria-label="Play video"
                    >
                      <div className="bg-black/40 group-hover:bg-black/55 rounded-full p-4 transition-colors">
                        <Play size={40} className="text-white fill-white" />
                      </div>
                    </button>
                    <div className="absolute top-3 right-3 px-2.5 py-1 bg-red-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                      Video
                    </div>
                  </>
                ) : (
                  <Image
                    src={getCloudinaryUrl(currentMediaItem, "large")}
                    alt={`${product.name} - Image ${selectedImageIndex + 1}`}
                    fill
                    className="object-contain"
                    priority
                  />
                )}
              </div>

              {/* Thumbnails */}
              {allDisplayMedia.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {allDisplayMedia.map((mediaItem, index) => {
                    const isMediaVideo = isVideoId(mediaItem);
                    const isActive = selectedImageIndex === index;
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          if (isMediaVideo) {
                            setPlayingVideoSrc(getCloudinaryVideo(mediaItem));
                          } else {
                            setUserSelectedImageIndex(index);
                          }
                        }}
                        className={`relative aspect-square rounded-xl overflow-hidden transition-all duration-200 focus:outline-none ${
                          isActive
                            ? "ring-2 ring-zinc-900 ring-offset-1"
                            : "ring-1 ring-zinc-200 hover:ring-zinc-400"
                        }`}
                        aria-label={
                          isMediaVideo
                            ? `Play video ${index + 1}`
                            : `View image ${index + 1}`
                        }
                      >
                        {isMediaVideo ? (
                          <>
                            <Image
                              src={getVideoThumbnail(mediaItem)}
                              alt={`Video thumbnail ${index + 1}`}
                              fill
                              className="object-contain"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play
                                size={14}
                                className="text-white fill-white"
                              />
                            </div>
                          </>
                        ) : (
                          <Image
                            src={getCloudinaryUrl(mediaItem, "thumbnail")}
                            alt={`Thumbnail ${index + 1}`}
                            fill
                            className="object-contain"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Accordions ── */}
              <div className="space-y-2 pt-2">
                {/* Product Details */}
                <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                  <button
                    onClick={() => toggleAccordion("details")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                    aria-expanded={activeAccordion === "details"}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                        <Package size={15} className="text-zinc-600" />
                      </div>
                      <span className="font-semibold text-zinc-900 text-sm">
                        Product Details
                      </span>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-zinc-400 transition-transform duration-200 ${
                        activeAccordion === "details" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {activeAccordion === "details" && (
                    <div className="px-4 sm:px-5 pb-5 border-t border-zinc-100">
                      <div className="pt-4 space-y-2.5 text-sm text-zinc-700">
                        <p>
                          <span className="font-semibold text-zinc-900">
                            Origin:
                          </span>{" "}
                          {product.origin}
                        </p>
                        {derivedRoastType && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-zinc-900">
                              Roast Profile:
                            </span>
                            <RoastTypeBadge type={derivedRoastType} />
                          </div>
                        )}
                        {product.process && (
                          <p>
                            <span className="font-semibold text-zinc-900">
                              Process:
                            </span>{" "}
                            {product.process}
                          </p>
                        )}
                        {product.variety && (
                          <p>
                            <span className="font-semibold text-zinc-900">
                              Variety:
                            </span>{" "}
                            {product.variety}
                          </p>
                        )}
                        {product.altitude && (
                          <p>
                            <span className="font-semibold text-zinc-900">
                              Altitude:
                            </span>{" "}
                            {product.altitude}
                          </p>
                        )}
                        {product.harvest && (
                          <p>
                            <span className="font-semibold text-zinc-900">
                              Harvest:
                            </span>{" "}
                            {product.harvest}
                          </p>
                        )}
                        {product.cupping_score && (
                          <p>
                            <span className="font-semibold text-zinc-900">
                              Cupping Score:
                            </span>{" "}
                            {product.cupping_score}/100
                          </p>
                        )}
                        {notesArray.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">
                              Tasting Notes
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {notesArray.map((note, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 border border-zinc-200"
                                >
                                  {note}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-zinc-400 text-xs leading-relaxed mt-4 pt-3 border-t border-zinc-100">
                          Carefully sourced and roasted in small batches for
                          maximum freshness. Each bag roasted to order.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Brewing Guide */}
                {brewingEntries.length > 0 && (
                  <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                    <button
                      onClick={() => toggleAccordion("brewing")}
                      className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                      aria-expanded={activeAccordion === "brewing"}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                          <Coffee size={15} className="text-zinc-600" />
                        </div>
                        <span className="font-semibold text-zinc-900 text-sm">
                          Brewing Guide
                        </span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-zinc-400 transition-transform duration-200 ${
                          activeAccordion === "brewing" ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {activeAccordion === "brewing" && (
                      <div className="px-4 sm:px-5 pb-5 border-t border-zinc-100">
                        <div className="pt-4 space-y-3 text-sm text-zinc-700">
                          {brewingEntries.map(([label, guide], i) => (
                            <div
                              key={`${label}-${i}`}
                              className="flex items-start gap-3"
                            >
                              <div className="flex-shrink-0 w-28 text-xs font-semibold text-zinc-900">
                                {label}
                              </div>
                              <div className="text-zinc-500 whitespace-pre-wrap text-xs leading-relaxed">
                                {guide}
                              </div>
                            </div>
                          ))}
                          <p className="text-zinc-400 text-xs leading-relaxed mt-3 pt-3 border-t border-zinc-100">
                            Use filtered water at 92–96°C. Adjust ratios to
                            taste.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Shipping */}
                <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                  <button
                    onClick={() => toggleAccordion("shipping")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                    aria-expanded={activeAccordion === "shipping"}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                        <Truck size={15} className="text-zinc-600" />
                      </div>
                      <span className="font-semibold text-zinc-900 text-sm">
                        Shipping &amp; Returns
                      </span>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-zinc-400 transition-transform duration-200 ${
                        activeAccordion === "shipping" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {activeAccordion === "shipping" && (
                    <div className="px-4 sm:px-5 pb-5 border-t border-zinc-100">
                      <div className="pt-4 space-y-2.5 text-sm text-zinc-600">
                        <div>
                          <span className="font-semibold text-zinc-900">
                            Standard UK Delivery:
                          </span>{" "}
                          £5.00 — 2–4 business days
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-900">
                            Returns:
                          </span>{" "}
                          Coffee beans cannot be returned. Wrong or damaged?
                          Contact us within 7 days.
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-900">
                            Equipment:
                          </span>{" "}
                          30-day return window for unused, unopened items.
                        </div>
                        <p className="text-zinc-400 text-xs leading-relaxed mt-3 pt-3 border-t border-zinc-100">
                          All coffee is freshly roasted to order. Allow 1–3
                          business days before dispatch.{" "}
                          <a
                            href="/shipping"
                            className="text-zinc-700 underline underline-offset-2"
                          >
                            Full policy →
                          </a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ════ RIGHT: Product info + Purchase flow ════ */}
            <div className="space-y-4">
              {/* Desktop header */}
              <div className="hidden md:block">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <MapPin size={13} className="text-zinc-400" />
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    {product.origin}
                  </p>
                  {product.bestSeller && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-bold">
                      <Star size={10} className="fill-white" />
                      Best Seller
                    </span>
                  )}
                </div>

                <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 mb-3 leading-tight tracking-tight">
                  {product.name}
                </h1>

                <div className="flex items-baseline gap-3 mb-4">
                  <p className="text-3xl lg:text-4xl font-bold text-zinc-900">
                    £{currentPrice.toFixed(2)}
                  </p>
                  <p className="text-sm text-zinc-400">/ {selectedSize}</p>
                </div>

                {derivedRoastType && (
                  <div className="mb-1">
                    <SimpleRoastType type={derivedRoastType} />
                  </div>
                )}
              </div>

              {/* ── Origin Story ── */}
              <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <button
                  onClick={() => toggleAccordion("story")}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                  aria-expanded={activeAccordion === "story"}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                      <Coffee className="w-4 h-4 text-zinc-600" />
                    </div>
                    <div>
                      <span className="font-semibold text-sm text-zinc-900 block">
                        Origin Story
                      </span>
                      {product.origin && (
                        <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-widest">
                          {product.origin}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                      activeAccordion === "story" ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {activeAccordion === "story" && (
                  <div className="border-t border-zinc-100">
                    <div className="px-5 pt-5 pb-6">
                      {(product.origin ||
                        product.variety ||
                        product.altitude ||
                        product.harvest) && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {product.origin && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700">
                              <MapPin size={9} />
                              {product.origin}
                            </span>
                          )}
                          {product.variety && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700">
                              🌱 {product.variety}
                            </span>
                          )}
                          {product.altitude && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700">
                              ⛰ {product.altitude}
                            </span>
                          )}
                          {product.harvest && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700">
                              🗓 {product.harvest}
                            </span>
                          )}
                        </div>
                      )}

                      <ReadMore text={product.story} maxChars={320} />

                      {product.cupping_score && (
                        <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                            Cupping Score
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  size={12}
                                  className={
                                    i <
                                    Math.round(
                                      (product.cupping_score! / 100) * 5
                                    )
                                      ? "fill-zinc-800 text-zinc-800"
                                      : "text-zinc-200 fill-zinc-200"
                                  }
                                />
                              ))}
                            </div>
                            <span className="text-sm font-bold text-zinc-800">
                              {product.cupping_score}
                              <span className="text-xs font-normal text-zinc-400">
                                /100
                              </span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ════ PURCHASE FLOW CARD ════ */}
              <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                {/* Card header */}
                <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/60">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
                    Customise your order
                  </p>
                </div>

                <div className="divide-y divide-zinc-100">
                  {/* ── STEP: Brewing Style (omni only) ── */}
                  {derivedIsOmni && (
                    <div className="px-5 py-5">
                      <StepLabel
                        step={1}
                        label="Choose your brewing style"
                        active={!step1Done}
                        done={step1Done}
                      />

                      <div className="mb-4 px-3.5 py-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-start gap-2.5">
                        <span className="text-base mt-0.5 flex-shrink-0">
                          ✦
                        </span>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          This versatile roast is optimised for both{" "}
                          <span className="font-semibold text-zinc-700">
                            espresso
                          </span>{" "}
                          and{" "}
                          <span className="font-semibold text-zinc-700">
                            filter
                          </span>{" "}
                          brewing. Select your preferred style.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {(["espresso", "filter"] as const).map((style) => {
                          const meta = ROAST_TYPE_META[style];
                          const isSelected = selectedRoastStyle === style;

                          // Count sizes available for this roast style
                          // using variantMatchesRoast so omni variants count for both
                          const sizesForStyle = availableSizes.filter(
                            (size) => {
                              if (!product.variants) return true;
                              return product.variants.some(
                                (v) =>
                                  v.size === size &&
                                  variantMatchesRoast(v, style)
                              );
                            }
                          );

                          return (
                            <button
                              key={style}
                              onClick={() => setSelectedRoastStyle(style)}
                              className={`relative p-4 rounded-xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-1
                                ${
                                  isSelected
                                    ? "bg-zinc-900 border-2 border-zinc-900 shadow-sm"
                                    : "bg-white border-2 border-zinc-200 hover:border-zinc-400"
                                }`}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-lg">{meta.icon}</span>
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                                    <Check
                                      size={11}
                                      className="text-zinc-900"
                                      strokeWidth={3}
                                    />
                                  </div>
                                )}
                              </div>
                              <p
                                className={`font-bold text-sm mb-0.5 ${
                                  isSelected ? "text-white" : "text-zinc-900"
                                }`}
                              >
                                {meta.label}
                              </p>
                              <p
                                className={`text-xs leading-snug ${
                                  isSelected ? "text-zinc-400" : "text-zinc-500"
                                }`}
                              >
                                {meta.desc}
                              </p>
                              <p
                                className={`text-[10px] font-semibold mt-2 uppercase tracking-wide ${
                                  isSelected ? "text-zinc-500" : "text-zinc-400"
                                }`}
                              >
                                {sizesForStyle.length} size
                                {sizesForStyle.length !== 1 ? "s" : ""}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── STEP: Size ── */}
                  <div
                    className={`px-5 py-5 transition-opacity duration-200 ${
                      derivedIsOmni && !step1Done
                        ? "opacity-30 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    <StepLabel
                      step={derivedIsOmni ? 2 : 1}
                      label="Select a size"
                      active={step1Done && !step2Done}
                      done={step2Done}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      {availableSizes.map((size) => {
                        const price = product.prices?.[size] ?? product.price;
                        const unavailable = derivedIsOmni
                          ? !isSizeAvailableForRoastStyle(size)
                          : false;
                        const isSelected = selectedSize === size;

                        return (
                          <button
                            key={size}
                            onClick={() => {
                              if (!unavailable) setSelectedSize(size);
                            }}
                            disabled={unavailable}
                            className={`relative p-3.5 rounded-xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-1
                              ${
                                unavailable
                                  ? "bg-zinc-50 border-2 border-zinc-100 cursor-not-allowed opacity-40"
                                  : isSelected
                                  ? "bg-zinc-900 border-2 border-zinc-900 shadow-sm cursor-pointer"
                                  : "bg-white border-2 border-zinc-200 hover:border-zinc-400 cursor-pointer"
                              }`}
                            aria-pressed={!unavailable && isSelected}
                            aria-disabled={unavailable}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span
                                className={`font-bold text-base ${
                                  unavailable
                                    ? "text-zinc-300"
                                    : isSelected
                                    ? "text-white"
                                    : "text-zinc-900"
                                }`}
                              >
                                {size}
                              </span>
                              {!unavailable && isSelected && (
                                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                                  <Check
                                    size={11}
                                    className="text-zinc-900"
                                    strokeWidth={3}
                                  />
                                </div>
                              )}
                            </div>
                            <span
                              className={`text-xs font-medium ${
                                unavailable
                                  ? "text-zinc-300"
                                  : isSelected
                                  ? "text-zinc-400"
                                  : "text-zinc-500"
                              }`}
                            >
                              £{price.toFixed(2)}
                            </span>
                            {unavailable && (
                              <span className="absolute top-2 right-2 text-[9px] font-bold text-zinc-300 uppercase tracking-wide">
                                N/A
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── STEP: Grind ── */}
                  <div
                    className={`px-5 py-5 transition-opacity duration-200 ${
                      !step2Done
                        ? "opacity-30 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    <StepLabel
                      step={derivedIsOmni ? 3 : 2}
                      label="Pick your grind"
                      active={step2Done && !step3Done}
                      done={step3Done}
                    />

                    {filteredGrindOptions.length > 0 ? (
                      <div className="grid grid-cols-1 gap-1.5">
                        {filteredGrindOptions.map((grind) => {
                          const isSelected = selectedGrind === grind.value;
                          return (
                            <button
                              key={grind.value}
                              onClick={() => setUserSelectedGrind(grind.value)}
                              className={`w-full px-4 py-3 rounded-xl border-2 text-left cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-1
                                ${
                                  isSelected
                                    ? "bg-zinc-900 border-zinc-900 shadow-sm"
                                    : "bg-white border-zinc-200 hover:border-zinc-400"
                                }`}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {/* Selection indicator dot */}
                                  <div
                                    className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                                      isSelected
                                        ? "border-white bg-white"
                                        : "border-zinc-300 bg-transparent"
                                    }`}
                                  >
                                    {isSelected && (
                                      <div className="w-2 h-2 rounded-full bg-zinc-900" />
                                    )}
                                  </div>
                                  <div>
                                    <p
                                      className={`font-semibold text-sm ${
                                        isSelected
                                          ? "text-white"
                                          : "text-zinc-900"
                                      }`}
                                    >
                                      {grind.label}
                                    </p>
                                    <p
                                      className={`text-xs mt-0.5 ${
                                        isSelected
                                          ? "text-zinc-400"
                                          : "text-zinc-500"
                                      }`}
                                    >
                                      {grind.description}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <Check
                                    size={15}
                                    className="text-white flex-shrink-0"
                                    strokeWidth={2.5}
                                  />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-sm text-zinc-400">
                        No grind options available for this selection
                      </div>
                    )}
                  </div>

                  {/* ── Quantity + Total ── */}
                  <div
                    className={`px-5 py-5 transition-opacity duration-200 ${
                      !step3Done
                        ? "opacity-30 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-zinc-900">
                        Quantity
                      </span>
                      {selectedVariant && (
                        <span className="text-xs text-zinc-400">
                          {availableStock} in stock
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Quantity stepper */}
                      <div className="flex items-center border-2 border-zinc-200 rounded-xl overflow-hidden bg-white">
                        <button
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          disabled={
                            isOutOfStock || !selectedVariant || quantity <= 1
                          }
                          className="w-11 h-11 flex items-center justify-center hover:bg-zinc-50 text-zinc-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} strokeWidth={2.5} />
                        </button>
                        <div className="w-10 text-center">
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) => {
                              const val = Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              );
                              setQuantity(Math.min(val, availableStock || 999));
                            }}
                            disabled={isOutOfStock || !selectedVariant}
                            max={availableStock}
                            className="w-full text-center font-bold text-base outline-none disabled:opacity-30 bg-transparent"
                            min="1"
                            aria-label="Quantity"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setQuantity((q) =>
                              Math.min(q + 1, availableStock || 999)
                            )
                          }
                          disabled={isOutOfStock || !selectedVariant}
                          className="w-11 h-11 flex items-center justify-center hover:bg-zinc-50 text-zinc-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </button>
                      </div>

                      {/* Total */}
                      <div className="flex-1 text-right">
                        <p className="text-[11px] text-zinc-400 font-medium mb-0.5 uppercase tracking-wide">
                          Total
                        </p>
                        <p className="text-2xl font-bold text-zinc-900">
                          £{totalPrice.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Add to Cart Button ── */}
                <div className="px-5 pb-5 pt-1">
                  <button
                    onClick={handleAddToCart}
                    disabled={
                      isAdded ||
                      filteredGrindOptions.length === 0 ||
                      !selectedVariant ||
                      isOutOfStock ||
                      quantity > availableStock
                    }
                    className={`w-full py-4 cursor-pointer rounded-xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2.5
                      ${
                        isAdded
                          ? "bg-zinc-700 text-white"
                          : isOutOfStock || !selectedVariant
                          ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                          : "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.99] shadow-sm hover:shadow"
                      }`}
                    aria-disabled={
                      isAdded ||
                      filteredGrindOptions.length === 0 ||
                      !selectedVariant ||
                      isOutOfStock
                    }
                  >
                    {isAdded ? (
                      <>
                        <Check size={18} strokeWidth={3} />
                        Added to Cart!
                      </>
                    ) : isOutOfStock ? (
                      <>
                        <AlertCircle size={18} />
                        Out of Stock
                      </>
                    ) : !selectedVariant ? (
                      <>
                        <ShoppingCart size={18} />
                        Complete your selection
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={18} />
                        Add to Cart — £{totalPrice.toFixed(2)}
                      </>
                    )}
                  </button>

                  {/* Trust signals */}
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Truck size={11} />
                      UK delivery £5
                    </span>
                    <span className="text-zinc-200">·</span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Coffee size={11} />
                      Roasted to order
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ════ Related Products ════ */}
          {relatedProducts.length > 0 && (
            <div className="mt-16 pt-12 border-t border-zinc-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                  You might also like
                </h2>

                {availableRoastTabs.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedRoastFilter("all")}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border-2 cursor-pointer ${
                        selectedRoastFilter === "all"
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      All
                    </button>
                    {availableRoastTabs.map((type) => {
                      const meta = ROAST_TYPE_META[type];
                      const isActive = selectedRoastFilter === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedRoastFilter(type)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border-2 cursor-pointer ${
                            isActive
                              ? `${meta.pill} text-white border-transparent`
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                          }`}
                        >
                          <span>{meta.icon}</span>
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {filteredRelatedProducts.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {filteredRelatedProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setUserSelectedGrind(null);
                        setUserSelectedImageIndex(null);
                        router.push(
                          `/coffee/${encodeURIComponent(p.slug || p.id)}`
                        );
                      }}
                      className="group bg-white rounded-2xl cursor-pointer border border-zinc-200 overflow-hidden hover:border-zinc-400 hover:shadow-md transition-all duration-200 text-left relative"
                    >
                      {p.bestSeller && (
                        <div className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900 text-white text-[10px] font-bold">
                          <Star size={8} className="fill-white" />
                          Best
                        </div>
                      )}

                      <div className="relative aspect-square bg-zinc-50">
                        <Image
                          src={
                            p.img
                              ? getCloudinaryUrl(p.img, "medium")
                              : "/test.webp"
                          }
                          alt={p.name}
                          fill
                          className="object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="p-3.5">
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">
                          {p.origin}
                        </p>
                        {p.roastType && (
                          <div className="mb-2">
                            <RoastTypeBadge type={p.roastType} />
                          </div>
                        )}
                        <h3 className="font-bold text-sm text-zinc-900 mb-1.5 group-hover:text-zinc-600 transition-colors line-clamp-2 leading-snug">
                          {p.name}
                        </h3>
                        <p className="text-base font-bold text-zinc-900">
                          £
                          {(
                            Object.values(p.prices || {})[0] ?? p.price
                          ).toFixed(2)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-zinc-400 text-sm">
                  No products found for this roast type.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Video Lightbox ── */}
        {playingVideoSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setPlayingVideoSrc(null)}
          >
            <div
              className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={playingVideoSrc}
                controls
                autoPlay
                playsInline
                className="w-full h-full"
              />
              <button
                onClick={() => setPlayingVideoSrc(null)}
                className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
                aria-label="Close video"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}