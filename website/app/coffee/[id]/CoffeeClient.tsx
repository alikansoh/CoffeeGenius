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
  ChevronUp,
  AlertCircle,
  Star,
  Play,
  X,
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
  story?: string; // <- added
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
  roastLevel?: "light" | "medium" | "dark";
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
  story?: string; // <- added
}

type GrindOption = "whole-bean" | "espresso" | "filter" | "cafetiere" | "aeropress";
type SizeOption = string;

const GRIND_OPTIONS: { value: GrindOption; label: string; description: string }[] = [
  { value: "whole-bean", label: "Whole Bean", description: "For home grinding" },
  { value: "espresso", label: "Espresso", description: "Fine grind for espresso" },
  { value: "filter", label: "Filter", description: "Medium grind for pour-over" },
  { value: "cafetiere", label: "Cafetière", description: "Coarse grind for French press" },
  { value: "aeropress", label: "AeroPress", description: "Fine-medium grind" },
];

const ROAST_LEVEL_INFO: Record<string, { intensity: number; color: string; description: string }> = {
  light: {
    intensity: 33,
    color: "bg-amber-300",
    description:
      "Light roast — brighter acidity, a delicate body, and pronounced origin-driven flavors such as floral, citrus, and tea-like notes.",
  },
  medium: {
    intensity: 66,
    color: "bg-amber-600",
    description:
      "Medium roast — balanced acidity and body with rounded sweetness; expect caramel, nutty and milk-chocolate undertones while still retaining some origin character.",
  },
  dark: {
    intensity: 100,
    color: "bg-amber-900",
    description:
      "Dark roast — lower acidity with pronounced roast character and fuller body; expect deep chocolate, toasted or caramelized notes and a bolder, more robust cup.",
  },
};

export function RoastLevelIndicator({ level }: { level?: ExtendedProduct["roastLevel"] }) {
  if (!level) return null;

  const levelMap: Record<NonNullable<ExtendedProduct["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };
  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((bean) => (
          <div key={bean} className="w-4 h-4">
            <Image
              src={bean <= numeric ? "/bean-filled.svg" : "/bean.svg"}
              alt={bean <= numeric ? `${level} roast bean filled` : "bean outline"}
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </div>
        ))}
      </div>

      <div className="h-4 w-px bg-gray-200" />

      <div className="flex flex-col">
        <span className="text-xs text-gray-700 uppercase tracking-wider font-semibold">{level}</span>
      </div>
    </div>
  );
}

function StockStatusBadge({ stock, variant }: { stock: number; variant?: Variant }) {
  const stockStatus = variant?.stockStatus ||
    (stock === 0 ? "out_of_stock" : stock < 10 ? "low_stock" : "in_stock");

  if (stockStatus === "out_of_stock") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
        <AlertCircle size={14} className="text-red-600" />
        <span className="text-xs font-semibold text-red-600">Out of stock</span>
      </div>
    );
  }

  if (stockStatus === "low_stock") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
        <AlertCircle size={14} className="text-amber-600" />
        <span className="text-xs font-semibold text-amber-600">Only {stock} left in stock</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
      <Check size={14} className="text-green-600" />
      <span className="text-xs font-semibold text-green-600">{stock} in stock</span>
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
  const [userSelectedGrind, setUserSelectedGrind] = useState<GrindOption | null>(null);
  const [userSelectedImageIndex, setUserSelectedImageIndex] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | null>("details");

  // Video detection map
  const [videoMap, setVideoMap] = useState<Record<string, boolean>>({});
  const [playingVideoSrc, setPlayingVideoSrc] = useState<string | null>(null);

  const productId = params?.id as string;

  // Detect a single publicId - returns true if video, false otherwise
  const detectSinglePublicId = useCallback(async (publicId: string): Promise<boolean> => {
    if (!publicId) return false;

    // First check by extension
    if (isVideo(publicId)) return true;

    // Then try HEAD request
    try {
      const url = getCloudinaryVideo(publicId);
      const res = await fetch(url, { method: "HEAD" });
      const ct = res.headers.get("content-type") || "";
      return ct.startsWith("video/");
    } catch {
      return false;
    }
  }, []);

  // Detect all publicIds and return a map
  const detectAllPublicIds = useCallback(async (publicIds: string[]): Promise<Record<string, boolean>> => {
    const results: Record<string, boolean> = {};

    await Promise.all(
      publicIds.map(async (publicId) => {
        if (publicId) {
          results[publicId] = await detectSinglePublicId(publicId);
        }
      })
    );

    return results;
  }, [detectSinglePublicId]);

  // Check if a publicId is a video
  const isVideoId = useCallback((publicId: string) => {
    if (!publicId) return false;
    if (videoMap[publicId] !== undefined) return videoMap[publicId];
    return isVideo(publicId);
  }, [videoMap]);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/coffee/${encodeURIComponent(productId)}`);

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
        } else if (apiCoffee.availableSizes && apiCoffee.availableSizes.length > 0) {
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
            availableGrinds: sizeGrindsMap[size] || apiCoffee.availableGrinds || [],
          }));

        // Get all images from API (not just the main img)
        const allImages: string[] = apiCoffee.images && apiCoffee.images.length > 0
          ? apiCoffee.images
          : (apiCoffee.img ? [apiCoffee.img] : []);

        // Detect video types BEFORE setting product state
        const detectedVideoMap = await detectAllPublicIds(allImages);
        setVideoMap(detectedVideoMap);

        const transformedProduct: ExtendedProduct = {
          id: apiCoffee._id || apiCoffee.slug,
          slug: apiCoffee.slug,
          name: apiCoffee.name,
          origin: apiCoffee.origin,
          notes: apiCoffee.notes || "",
          price: apiCoffee.minPrice,
          prices,
          img: apiCoffee.img,
          roastLevel: apiCoffee.roastLevel,
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
          story: apiCoffee.story || "", // <- mapped
        };

        setProduct(transformedProduct);
        setSelectedSize(Object.keys(prices)[0] || "250g");

        const allResponse = await fetch("/api/coffee");
        if (allResponse.ok) {
          const allData = await allResponse.json();

          const others: ApiCoffee[] = allData.data.filter((coffee: ApiCoffee) => coffee._id !== apiCoffee._id);
          const sameRoast = others.filter((c) => c.roastLevel === apiCoffee.roastLevel);
          let selectedForRelated: ApiCoffee[] = sameRoast.slice(0, 4);

          if (selectedForRelated.length < 4) {
            const needed = 4 - selectedForRelated.length;
            const additional = others
              .filter((c) => !selectedForRelated.some((s) => s._id === c._id))
              .slice(0, needed);
            selectedForRelated = [...selectedForRelated, ...additional];
          }

          const relatedTransformed: ExtendedProduct[] = selectedForRelated.map((coffee: ApiCoffee) => {
            const relatedPrices: Record<string, number> = {};
            if (coffee.availableSizes && coffee.availableSizes.length > 0) {
              coffee.availableSizes.forEach((sizeObj: SizePrice) => {
                relatedPrices[sizeObj.size] = sizeObj.price;
              });
            } else {
              relatedPrices["250g"] = coffee.minPrice;
            }

            return {
              id: coffee._1 || coffee.slug,
              slug: coffee.slug,
              name: coffee.name,
              origin: coffee.origin,
              notes: coffee.notes || "",
              price: coffee.minPrice,
              prices: relatedPrices,
              img: coffee.img,
              roastLevel: coffee.roastLevel,
              availableGrinds: coffee.availableGrinds,
              bestSeller: coffee.bestSeller,
            } as ExtendedProduct;
          });

          setRelatedProducts(relatedTransformed);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId, detectAllPublicIds]);

  // Filter out videos from productImages for the main gallery display
  const productImages = useMemo(() => {
    const allMedia = product?.images || [product?.img || "/test.webp"];
    return allMedia;
  }, [product]);

  // Separate images and videos
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

  // All displayable media (images first, then videos)
  const allDisplayMedia = useMemo(() => {
    return [...imageItems, ...videoItems];
  }, [imageItems, videoItems]);

  const availableGrindsForSize = useMemo(() => {
    if (!selectedSize || !product) return [];

    if (product.availableSizes && product.availableSizes.length > 0) {
      const sizeData = product.availableSizes.find((s) => s.size === selectedSize);
      if (sizeData?.availableGrinds && sizeData.availableGrinds.length > 0) {
        return sizeData.availableGrinds;
      }
    }

    return product.availableGrinds || [];
  }, [selectedSize, product]);

  const filteredGrindOptions = useMemo(
    () => GRIND_OPTIONS.filter((g) => availableGrindsForSize.includes(g.value as GrindOption)),
    [availableGrindsForSize]
  );

  const selectedGrind = useMemo<GrindOption>(() => {
    if (userSelectedGrind && availableGrindsForSize.includes(userSelectedGrind)) {
      return userSelectedGrind;
    }
    return ((availableGrindsForSize[0] as GrindOption) ?? "whole-bean") as GrindOption;
  }, [userSelectedGrind, availableGrindsForSize]);

  const selectedVariant = useMemo(() => {
    if (!product?.variants || !selectedSize || !selectedGrind) return null;

    return product.variants.find((v) => v.size === selectedSize && v.grind === selectedGrind);
  }, [product?.variants, selectedSize, selectedGrind]);

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
    if (selectedVariant) {
      return selectedVariant.price;
    }
    if (!product) return 0;
    return product.prices?.[selectedSize] ?? product.price;
  }, [selectedVariant, product, selectedSize]);

  const availableStock = useMemo(() => {
    return selectedVariant?.stock ?? 0;
  }, [selectedVariant]);

  const isOutOfStock = selectedVariant ? availableStock === 0 : false;

  const totalPrice = useMemo(() => currentPrice * quantity, [currentPrice, quantity]);

  const brewingText = product?.brewing ?? "";

  const brewingEntries = useMemo((): [string, string][] => {
    if (!brewingText) return [];
    const lines = brewingText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const entries: [string, string][] = lines.map((line, idx) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) {
        const label = line.slice(0, colonIndex).trim();
        const guide = line.slice(colonIndex + 1).trim();
        return [label || `Guide ${idx + 1}`, guide || ""];
      }
      return [`Guide ${idx + 1}`, line];
    });
    return entries;
  }, [brewingText]);

  const availableSizes = useMemo(() => (product?.prices ? Object.keys(product.prices).sort() : ["250g"]), [product]);

  useEffect(() => {
    if (!loading && !product) {
      router.push("/coffee");
    }
  }, [product, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Coffee size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading product... </p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Coffee size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">{error || "Product not found"}</p>
        </div>
      </div>
    );
  }

  const notesArray = product.notes
    ?.split(",")
    .map((n) => n.trim())
    .filter(Boolean) ?? [];
  const roastInfo = product.roastLevel ? ROAST_LEVEL_INFO[product.roastLevel] : null;

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
    };

    addItem(cartItem, quantity);

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  // Get the current selected media item
  const currentMediaItem = allDisplayMedia[selectedImageIndex] || product.img || "/test.webp";
  const isCurrentItemVideo = isVideoId(currentMediaItem);

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="mt-16 sm:mt-0 min-h-screen bg-gradient-to-b from-white to-gray-50">
        <div className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 lg:px-8 py-3 sm:py-4 md:py-4 lg:py-4">
            <button
              onClick={() => router.push("/coffee")}
              className="inline-flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900 font-semibold transition-colors group text-sm sm:text-base"
              aria-label="Back to shop"
            >
              <ArrowLeft
                size={18}
                className="group-hover:-translate-x-1 transition-transform"
              />
              Back to Shop
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 lg:px-8 py-6 sm:py-8 md:py-12 lg:py-12">
          <div className="md:hidden mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <MapPin size={14} className="text-amber-700" />
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                {product.origin}
              </p>
              {product.bestSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#8b5e3c] text-white text-[10px] font-bold shadow-md">
                  <Star size={10} className="fill-white" />
                  <span>Best Seller</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
              {product.name}
            </h1>

            <div className="flex items-baseline gap-2 mb-3">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                £{currentPrice.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">per {selectedSize}</p>
            </div>

            {selectedVariant && (
              <StockStatusBadge stock={availableStock} variant={selectedVariant} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 md:gap-12 lg:gap-12">
            <div className="space-y-3 sm:space-y-4">
              <div className="relative aspect-square rounded-2xl sm:rounded-3xl overflow-hidden bg-gray-100 shadow-lg sm:shadow-xl">
                {product.bestSeller && (
                  <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#8b5e3c] text-white text-xs font-bold shadow-lg">
                    <Star size={14} className="fill-white" />
                    <span>Best Seller</span>
                  </div>
                )}

                {isCurrentItemVideo ? (
                  <>
                    <Image
                      src={getVideoThumbnail(currentMediaItem)}
                      alt={`${product.name} - Video`}
                      fill
                      className="object-cover"
                      priority
                    />
                    <button
                      type="button"
                      onClick={() => setPlayingVideoSrc(getCloudinaryVideo(currentMediaItem))}
                      className="absolute inset-0 flex items-center justify-center"
                      aria-label="Play video"
                    >
                      <div className="bg-black/40 rounded-full p-4">
                        <Play size={48} className="text-white" />
                      </div>
                    </button>
                    <div className="absolute top-3 right-3 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full">
                      VIDEO
                    </div>
                  </>
                ) : (
                  <Image
                    src={getCloudinaryUrl(currentMediaItem, "large")}
                    alt={`${product.name} - Image ${selectedImageIndex + 1}`}
                    fill
                    className="object-cover"
                    priority
                  />
                )}
              </div>

              {allDisplayMedia.length > 1 && (
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {allDisplayMedia.map((mediaItem, index) => {
                    const isMediaVideo = isVideoId(mediaItem);

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
                        className={`relative aspect-square rounded-lg sm:rounded-xl overflow-hidden transition-all focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                          selectedImageIndex === index
                            ? "ring-3 sm:ring-4 ring-gray-900 shadow-md sm:shadow-lg"
                            : "ring-2 ring-gray-200 hover:ring-gray-400"
                        }`}
                        aria-label={isMediaVideo ? `Play video ${index + 1}` : `View image ${index + 1}`}
                      >
                        {isMediaVideo ? (
                          <>
                            <Image
                              src={getVideoThumbnail(mediaItem)}
                              alt={`${product.name} video thumbnail ${index + 1}`}
                              fill
                              className="object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-black/40 rounded-full p-1.5">
                                <Play size={16} className="text-white" />
                              </div>
                            </div>
                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-bold rounded">
                              VIDEO
                            </div>
                          </>
                        ) : (
                          <Image
                            src={getCloudinaryUrl(mediaItem, "thumbnail")}
                            alt={`${product.name} thumbnail ${index + 1}`}
                            fill
                            className="object-cover"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-4">
                <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAccordion("details")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    aria-expanded={activeAccordion === "details"}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Package size={18} className="text-amber-700" />
                      <span className="font-bold text-gray-900 text-sm sm:text-base">Product Details</span>
                    </div>
                    {activeAccordion === "details" ? <ChevronUp size={18} className="text-gray-600" /> : <ChevronDown size={18} className="text-gray-600" />}
                  </button>
                  {activeAccordion === "details" && (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3 text-xs sm:text-sm text-gray-700">
                      <p>
                        <strong>Origin:</strong> {product.origin}
                      </p>
                      {product.roastLevel && (
                        <p>
                          <strong>Roast Level:</strong> <span className="capitalize">{product.roastLevel}</span>
                        </p>
                      )}
                      {product.process && (
                        <p>
                          <strong>Process:</strong> {product.process}
                        </p>
                      )}
                      {product.variety && (
                        <p>
                          <strong>Variety:</strong> {product.variety}
                        </p>
                      )}
                      {product.altitude && (
                        <p>
                          <strong>Altitude:</strong> {product.altitude}
                        </p>
                      )}
                      {product.harvest && (
                        <p>
                          <strong>Harvest:</strong> {product.harvest}
                        </p>
                      )}
                      {product.cupping_score && (
                        <p>
                          <strong>Cupping Score:</strong> {product.cupping_score}/100
                        </p>
                      )}

                      {notesArray.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Tasting Notes</p>
                          <div className="flex flex-wrap gap-2">
                            {notesArray.map((note, idx) => (
                              <span key={idx} className="px-3 py-1.5 rounded-lg bg-amber-50 text-xs sm:text-sm font-semibold text-gray-800 border-2 border-amber-100 shadow-sm">
                                {note}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-gray-600 leading-relaxed mt-3 sm:mt-4 pt-3 border-t border-gray-200">
                        Our coffee is carefully sourced from trusted farmers and roasted in small batches to ensure maximum freshness and flavor. Each bag is roasted to order, guaranteeing you receive the freshest coffee possible.
                      </p>
                    </div>
                  )}
                </div>

                {brewingEntries.length > 0 && (
                  <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleAccordion("brewing")}
                      className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                      aria-expanded={activeAccordion === "brewing"}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Coffee size={18} className="text-amber-700" />
                        <span className="font-bold text-gray-900 text-sm sm:text-base">Brewing Guide</span>
                      </div>
                      {activeAccordion === "brewing" ? <ChevronUp size={18} className="text-gray-600" /> : <ChevronDown size={18} className="text-gray-600" />}
                    </button>

                    {activeAccordion === "brewing" && (
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3 text-xs sm:text-sm text-gray-700">
                        {brewingEntries.map(([label, guide], i) => (
                          <div key={`${label}-${i}`} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-28 text-xs font-semibold text-gray-900">{label}</div>
                            <div className="text-gray-700 whitespace-pre-wrap">{guide}</div>
                          </div>
                        ))}

                        <p className="text-gray-600 leading-relaxed mt-3 sm:mt-4 pt-3 border-t border-gray-200">
                          Experiment with ratios and brew times to find your perfect cup. Always use filtered water heated to 92-96°C for best results.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAccordion("shipping")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    aria-expanded={activeAccordion === "shipping"}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Truck size={18} className="text-amber-700" />
                      <span className="font-bold text-gray-900 text-sm sm:text-base">Shipping & Returns</span>
                    </div>
                    {activeAccordion === "shipping" ? <ChevronUp size={18} className="text-gray-600" /> : <ChevronDown size={18} className="text-gray-600" />}
                  </button>
                  {activeAccordion === "shipping" && (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 sm:space-y-3 text-xs sm:text-sm text-gray-700">
                      <div>
                        <strong>Free UK Shipping</strong> on orders over £30
                      </div>
                      <div>
                        <strong>Standard Delivery:</strong> 3-5 business days
                      </div>
                      <div>
                        <strong>Express Delivery:</strong> 1-2 business days (£5.99)
                      </div>
                      <div>
                        <strong>Returns:</strong> 30-day return policy for unopened items
                      </div>
                      <p className="text-gray-600 leading-relaxed mt-3 sm:mt-4 pt-3 border-t border-gray-200">
                        All coffee is freshly roasted to order. Please allow 1-2 business days for roasting before shipping.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="hidden md:block">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <MapPin size={16} className="text-amber-700" />
                  <p className="text-sm font-bold text-amber-700 uppercase tracking-wide">{product.origin}</p>
                  {product.bestSeller && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#8b5e3c] text-white text-xs font-bold shadow-md">
                      <Star size={12} className="fill-white" />
                      <span>Best Seller</span>
                    </span>
                  )}
                </div>

                <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 mb-4 leading-tight">{product.name}</h1>

                <div className="flex items-baseline gap-3 mb-4">
                  <p className="text-4xl font-bold text-gray-900">£{currentPrice.toFixed(2)}</p>
                  <p className="text-lg text-gray-500">per {selectedSize}</p>
                </div>

                {selectedVariant && (
                  <div className="mb-6">
                    <StockStatusBadge stock={availableStock} variant={selectedVariant} />
                  </div>
                )}
              </div>

              {product.roastLevel && (
                <div>
                  <RoastLevelIndicator level={product.roastLevel} />
                  {roastInfo && (
                    <p className="mt-3 text-xs sm:text-sm text-gray-600">
                      {roastInfo.description}
                    </p>
                  )}
                </div>
              )}

              {/* Story / Description (prominent, before size selection) */}
              <div className="bg-white rounded-xl border-2 border-gray-100 p-4 sm:p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Story</h3>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {product.story ? product.story : "No story available for this coffee."}
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-bold text-gray-900 block mb-2 sm:mb-3">Select Size</label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {availableSizes.map((size) => {
                    const price = product.prices?.[size] ?? product.price;
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`p-3 sm:p-4 rounded-xl border-2 cursor-pointer text-left transition-all ${
                          selectedSize === size
                            ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                            : "bg-white text-gray-900 border-gray-200 hover:border-gray-900"
                        }`}
                        aria-pressed={selectedSize === size}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-base sm:text-lg">{size}</span>
                          {selectedSize === size && <Check size={18} className="text-white" />}
                        </div>
                        <span className={`text-xs sm:text-sm font-semibold ${selectedSize === size ? "text-gray-300" : "text-gray-600"}`}>
                          £{price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="text-xs sm:text-sm font-bold text-gray-900">Brew Method</label>
                  <span className="text-xs text-gray-500">{filteredGrindOptions.length} available</span>
                </div>
                {filteredGrindOptions.length > 0 ? (
                  <div className="space-y-2">
                    {filteredGrindOptions.map((grind) => (
                      <button
                        key={grind.value}
                        onClick={() => setUserSelectedGrind(grind.value)}
                        className={`w-full p-3 sm:p-4 rounded-xl border-2 text-left cursor-pointer transition-all ${
                          selectedGrind === grind.value ? "bg-gray-900 text-white border-gray-900 shadow-lg" : "bg-white text-gray-900 border-gray-200 hover:border-gray-900"
                        }`}
                        aria-pressed={selectedGrind === grind.value}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm sm:text-base">{grind.label}</p>
                            <p className={`text-xs sm:text-sm ${selectedGrind === grind.value ? "text-gray-300" : "text-gray-600"}`}>{grind.description}</p>
                          </div>
                          {selectedGrind === grind.value && <Check size={18} className="text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-center text-sm text-gray-600">No brew methods available for this size</div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="text-xs sm:text-sm font-bold text-gray-900">Quantity</label>
                  {selectedVariant && <StockStatusBadge stock={availableStock} variant={selectedVariant} />}
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={isOutOfStock || !selectedVariant}
                      className="px-4 sm:px-5 py-2.5 cursor-pointer sm:py-3 hover:bg-gray-50 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setQuantity(Math.min(val, availableStock || 999));
                      }}
                      disabled={isOutOfStock || !selectedVariant}
                      max={availableStock}
                      className="w-12 sm:w-16 text-center font-bold text-base sm:text-lg outline-none disabled:opacity-50"
                      min="1"
                      style={{ fontSize: "16px" }}
                      aria-label="Quantity"
                    />
                    <button
                      onClick={() => setQuantity((q) => Math.min(q + 1, availableStock || 999))}
                      disabled={isOutOfStock || !selectedVariant}
                      className="px-4 sm:px-5 cursor-pointer py-2.5 sm:py-3 hover:bg-gray-50 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-xs sm:text-sm text-gray-600">Total</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">£{totalPrice.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={
                  isAdded ||
                  filteredGrindOptions.length === 0 ||
                  !selectedVariant ||
                  isOutOfStock ||
                  quantity > availableStock
                }
                className={`w-full py-4 sm:py-5 cursor-pointer rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 sm:gap-3 ${
                  isAdded
                    ? "bg-green-600 text-white"
                    : isOutOfStock || !selectedVariant
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
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
                    <Check size={20} />
                    Added to Cart!
                  </>
                ) : isOutOfStock ? (
                  <>
                    <AlertCircle size={20} />
                    Out of Stock
                  </>
                ) : !selectedVariant ? (
                  <>
                    <ShoppingCart size={20} />
                    Select Options
                  </>
                ) : (
                  <>
                    <ShoppingCart size={20} />
                    Add to Cart
                  </>
                )}
              </button>
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <div className="mt-12 sm:mt-16 pt-12 sm:pt-16 border-t-2 border-gray-100">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">
                You might also like
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {relatedProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setUserSelectedGrind(null);
                      setUserSelectedImageIndex(null);
                      router.push(`/coffee/${encodeURIComponent(p.slug || p.id)}`);
                    }}
                    className="group bg-white rounded-xl cursor-pointer sm:rounded-2xl border-2 border-gray-100 overflow-hidden hover:border-gray-900 hover:shadow-lg transition-all text-left relative"
                  >
                    {p.bestSeller && (
                      <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#8b5e3c] text-white text-[10px] font-bold shadow-md">
                        <Star size={10} className="fill-white" />
                        <span>Best</span>
                      </div>
                    )}

                    <div className="relative aspect-square">
                      <Image
                        src={p.img ? getCloudinaryUrl(p.img, "medium") : "/test.webp"}
                        alt={p.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-3 sm:p-4">
                      <p className="text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide mb-1 sm:mb-2">
                        {p.origin}
                      </p>
                      <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-1 sm:mb-2 group-hover:text-amber-700 transition-colors line-clamp-2">
                        {p.name}
                      </h3>
                      <p className="text-base sm:text-lg font-bold text-gray-900">
                        £{(Object.values(p.prices || {})[0] ?? p.price).toFixed(2)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Video modal player */}
        {playingVideoSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setPlayingVideoSrc(null)}
          >
            <div className="relative w-full max-w-4xl aspect-video bg-black" onClick={(e) => e.stopPropagation()}>
              <video src={playingVideoSrc} controls autoPlay playsInline className="w-full h-full" />
              <button
                onClick={() => setPlayingVideoSrc(null)}
                className="absolute top-2 right-2 p-2 bg-white rounded-full shadow"
                aria-label="Close video"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}