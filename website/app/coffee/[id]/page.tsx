"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ShoppingCart,
  Check,
  Star,
  Coffee,
  MapPin,
  Flame,
  Wine,
  Package,
  Truck,
  ChevronDown,
  ChevronUp,
  Heart,
} from "lucide-react";
import useCart from "../../store/CartStore";

// Extended Product type with new fields
export interface ExtendedProduct {
  id: string;
  name: string;
  origin: string;
  notes: string;
  price: number;
  prices?: { "250g": number; "1kg": number };
  img: string;
  roastLevel?: string;
  process?: string;
  altitude?: string;
  harvest?: string;
  cupping_score?: number;
  variety?: string;
  images?: string[];
  availableGrinds?: GrindOption[]; // Available grind options for this product
}

type GrindOption = "whole-bean" | "espresso" | "filter" | "cafetiere" | "aeropress";
type SizeOption = "250g" | "1kg";

const GRIND_OPTIONS: { value: GrindOption; label: string; description: string }[] = [
  { value: "whole-bean", label: "Whole Bean", description: "For home grinding" },
  { value: "espresso", label: "Espresso", description: "Fine grind for espresso" },
  { value: "filter", label: "Filter", description: "Medium grind for pour-over" },
  { value: "cafetiere", label: "Cafetière", description: "Coarse grind for French press" },
  { value: "aeropress", label: "AeroPress", description: "Fine-medium grind" },
];

// Demo products with extended data
const DEMO_PRODUCTS: ExtendedProduct[] = [
  {
    id: "espresso-blend",
    name: "Signature Espresso Blend",
    origin: "House Blend",
    notes: "Rich chocolate, silky body, long finish",
    price: 14.0,
    prices: { "250g": 14.0, "1kg": 48.0 },
    img: "/test.webp",
    roastLevel: "dark",
    process: "Washed",
    altitude: "1,500 - 2,000m",
    harvest: "Seasonal",
    cupping_score: 87,
    variety: "Blend",
    images: ["/test.webp", "/test.webp", "/test.webp", "/test.webp"],
    availableGrinds: ["whole-bean", "espresso", "filter"],
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
    process: "Washed",
    altitude: "1,800 - 2,200m",
    harvest: "November - January",
    cupping_score: 89,
    variety: "Heirloom",
    images: ["/test.webp", "/test.webp", "/test.webp", "/test.webp"],
    availableGrinds: ["whole-bean", "filter", "aeropress"],
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
    process: "Washed",
    altitude: "1,600 - 1,900m",
    harvest: "April - June",
    cupping_score: 86,
    variety: "Caturra, Castillo",
    images: ["/test.webp", "/test.webp", "/test.webp", "/test.webp"],
    availableGrinds: ["whole-bean", "espresso", "filter", "cafetiere", "aeropress"],
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
    process: "Wet-hulled (Giling Basah)",
    altitude: "1,200 - 1,500m",
    harvest: "Year-round",
    cupping_score: 85,
    variety: "Typica, Catimor",
    images: ["/test.webp", "/test.webp", "/test.webp", "/test.webp"],
    availableGrinds: ["whole-bean", "espresso", "cafetiere"],
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
    process: "Washed",
    altitude: "1,500 - 2,100m",
    harvest: "October - December",
    cupping_score: 88,
    variety: "SL28, SL34",
    images: ["/test.webp", "/test.webp", "/test.webp", "/test.webp"],
    availableGrinds: ["whole-bean", "filter", "aeropress", "cafetiere"],
  },
];

const ROAST_LEVEL_INFO: Record<string, { intensity: number; color: string; description: string }> = {
  light: {
    intensity: 33,
    color: "bg-amber-300",
    description: "Bright acidity, floral & fruity notes, tea-like body",
  },
  medium: {
    intensity: 66,
    color: "bg-amber-600",
    description: "Balanced acidity, sweet & nutty notes, smooth body",
  },
  dark: {
    intensity: 100,
    color: "bg-amber-900",
    description: "Low acidity, bold & smoky notes, full body",
  },
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);

  const productId = params?.id as string;
  const product = useMemo(
    () => DEMO_PRODUCTS.find((p) => p.id === productId),
    [productId]
  );

  const [selectedSize, setSelectedSize] = useState<SizeOption>("250g");
  const [selectedGrind, setSelectedGrind] = useState<GrindOption>("whole-bean");
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | null>("details");
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const productImages = useMemo(
    () => product?.images || [product?.img || "/test.webp"],
    [product]
  );

  const availableGrinds = useMemo(
    () => product?.availableGrinds || GRIND_OPTIONS.map((g) => g.value),
    [product]
  );

  const filteredGrindOptions = useMemo(
    () => GRIND_OPTIONS.filter((g) => availableGrinds.includes(g.value)),
    [availableGrinds]
  );

  // Fix: Avoid unconditional synchronous setState calls inside effect.
  // Only update state when the derived default differs from the current state.
  useEffect(() => {
    if (!product) return;

    const defaultGrind = availableGrinds[0] ?? "whole-bean";

    // Use functional updates and only return a new value when different.
    setSelectedGrind((prev) => (prev === defaultGrind ? prev : defaultGrind));
    setSelectedImageIndex((prev) => (prev === 0 ? prev : 0));
    // dependencies:
    // product?.id and availableGrinds are the things that should trigger a reset
  }, [product?.id, availableGrinds]);

  const currentPrice = useMemo(() => {
    if (!product) return 0;
    return product.prices?.[selectedSize] ?? product.price;
  }, [product, selectedSize]);

  const totalPrice = useMemo(() => {
    return currentPrice * quantity;
  }, [currentPrice, quantity]);

  useEffect(() => {
    if (!product) {
      router.push("/coffee");
    }
  }, [product, router]);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Coffee size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading product... </p>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    const cartId = `${product.id}::${selectedSize}::${selectedGrind}`;
    const name = `${product.name} — ${selectedSize} — ${selectedGrind}`;

    addItem(
      { id: cartId, name, price: currentPrice, img: product.img || "/test.webp" },
      quantity
    );

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const roastInfo = product.roastLevel ? ROAST_LEVEL_INFO[product.roastLevel] : null;
  const notesArray = product.notes?.split(",").map((n) => n.trim()) ?? [];

  const toggleAccordion = (section: string) => {
    setActiveAccordion(activeAccordion === section ? null : section);
  };

  return (
    <>
      <style jsx global>{`
        input, select, textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="mt-16 sm:mt-0 min-h-screen bg-gradient-to-b from-white to-gray-50">
        {/* Back Button */}
        <div className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <button
              onClick={() => router.push("/coffee")}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-semibold transition-colors group text-sm sm:text-base"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
              Back to Shop
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
          {/* Mobile Product Name - Shown only on mobile */}
          <div className="lg:hidden mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-amber-700" />
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                {product.origin}
              </p>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
              {product.name}
            </h1>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={14}
                    className="fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-gray-600">
                4.9 (127)
              </span>
            </div>

            {/* Price on mobile */}
            <div className="flex items-baseline gap-2">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                £{currentPrice.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">per {selectedSize}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* Left Column - Image Gallery */}
            <div className="space-y-3 sm:space-y-4">
              {/* Main Image */}
              <div className="relative aspect-square rounded-2xl sm:rounded-3xl overflow-hidden bg-gray-100 shadow-lg sm:shadow-xl">
                <Image
                  src={productImages[selectedImageIndex] || "/test.webp"}
                  alt={`${product.name} - Image ${selectedImageIndex + 1}`}
                  fill
                  className="object-cover"
                  priority
                />
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 sm:p-3 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white transition-all shadow-lg"
                  aria-label="Add to favorites"
                >
                  <Heart
                    size={20}
                    className={`transition-colors ${
                      isFavorite ? "fill-red-500 text-red-500" : "text-gray-600"
                    }`}
                  />
                </button>
              </div>

              {/* Thumbnail Gallery */}
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {productImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative aspect-square rounded-lg sm:rounded-xl overflow-hidden transition-all ${
                      selectedImageIndex === index
                        ? "ring-3 sm:ring-4 ring-gray-900 shadow-md sm:shadow-lg"
                        : "ring-2 ring-gray-200 hover:ring-gray-400"
                    }`}
                  >
                    <Image
                      src={img}
                      alt={`${product.name} thumbnail ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>

              {/* Product Details Accordions */}
              <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-4">
                {/* Product Details */}
                <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAccordion("details")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Package size={18} className="text-amber-700" />
                      <span className="font-bold text-gray-900 text-sm sm:text-base">Product Details</span>
                    </div>
                    {activeAccordion === "details" ? (
                      <ChevronUp size={18} className="text-gray-600" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-600" />
                    )}
                  </button>
                  {activeAccordion === "details" && (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 sm:space-y-3 text-xs sm:text-sm text-gray-700">
                      <p>
                        <strong>Origin:</strong> {product.origin}
                      </p>
                      {product.roastLevel && (
                        <p>
                          <strong>Roast Level:</strong>{" "}
                          <span className="capitalize">{product.roastLevel}</span>
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
                      <p className="text-gray-600 leading-relaxed mt-3 sm:mt-4 pt-3 border-t border-gray-200">
                        Our coffee is carefully sourced from trusted farmers and roasted
                        in small batches to ensure maximum freshness and flavor.  Each bag
                        is roasted to order, guaranteeing you receive the freshest coffee
                        possible.
                      </p>
                    </div>
                  )}
                </div>

                {/* Brewing Guide */}
                <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAccordion("brewing")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Coffee size={18} className="text-amber-700" />
                      <span className="font-bold text-gray-900 text-sm sm:text-base">Brewing Guide</span>
                    </div>
                    {activeAccordion === "brewing" ? (
                      <ChevronUp size={18} className="text-gray-600" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-600" />
                    )}
                  </button>
                  {activeAccordion === "brewing" && (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 sm:space-y-3 text-xs sm:text-sm text-gray-700">
                      <div>
                        <strong>Espresso:</strong> 18-20g dose, 25-30s extraction
                      </div>
                      <div>
                        <strong>Pour Over:</strong> 1:16 ratio, 3-4 minute brew time
                      </div>
                      <div>
                        <strong>French Press:</strong> 1:15 ratio, 4 minute steep
                      </div>
                      <div>
                        <strong>AeroPress:</strong> 1:15 ratio, 2-3 minute brew
                      </div>
                      <p className="text-gray-600 leading-relaxed mt-3 sm:mt-4 pt-3 border-t border-gray-200">
                        Experiment with ratios and brew times to find your perfect cup.
                        Always use filtered water heated to 92-96°C for best results.
                      </p>
                    </div>
                  )}
                </div>

                {/* Shipping & Returns */}
                <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleAccordion("shipping")}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Truck size={18} className="text-amber-700" />
                      <span className="font-bold text-gray-900 text-sm sm:text-base">
                        Shipping & Returns
                      </span>
                    </div>
                    {activeAccordion === "shipping" ? (
                      <ChevronUp size={18} className="text-gray-600" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-600" />
                    )}
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
                        All coffee is freshly roasted to order.  Please allow 1-2 business
                        days for roasting before shipping.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Details (Hidden on mobile, shown on desktop) */}
            <div className="space-y-4 sm:space-y-6">
              {/* Header - Desktop only */}
              <div className="hidden lg:block">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-amber-700" />
                  <p className="text-sm font-bold text-amber-700 uppercase tracking-wide">
                    {product.origin}
                  </p>
                </div>

                <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                  {product.name}
                </h1>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={18}
                        className="fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-600">
                    4.9 (127 reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3 mb-6">
                  <p className="text-4xl font-bold text-gray-900">
                    £{currentPrice.toFixed(2)}
                  </p>
                  <p className="text-lg text-gray-500">per {selectedSize}</p>
                </div>

                {/* Tasting Notes - Desktop */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border-2 border-amber-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-lg bg-white/80">
                      <Wine size={18} className="text-amber-700" />
                    </div>
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Tasting Notes
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {notesArray.map((note, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-2 rounded-xl bg-white text-sm font-semibold text-gray-700 border-2 border-amber-200 shadow-sm hover:shadow-md transition-shadow"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tasting Notes - Mobile only */}
              <div className="lg:hidden bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 border-2 border-amber-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-white/80">
                    <Wine size={16} className="text-amber-700" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wide">
                    Tasting Notes
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {notesArray.map((note, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-lg sm:rounded-xl bg-white text-xs sm:text-sm font-semibold text-gray-700 border-2 border-amber-200 shadow-sm"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>

              {/* Roast Level */}
              {roastInfo && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border-2 border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-amber-50">
                      <Flame size={16} className="text-amber-700" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Roast Level
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 mb-3">
                    <span className="text-base sm:text-lg font-bold text-gray-900 capitalize">
                      {product.roastLevel}
                    </span>
                    <div className="flex-1 h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${roastInfo.color} transition-all rounded-full`}
                        style={{ width: `${roastInfo.intensity}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600">{roastInfo.description}</p>
                </div>
              )}

              {/* Size Selection */}
              <div>
                <label className="text-xs sm:text-sm font-bold text-gray-900 block mb-2 sm:mb-3">
                  Select Size
                </label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {(["250g", "1kg"] as SizeOption[]).map((size) => {
                    const price = product.prices?.[size] ?? product.price;
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all ${
                          selectedSize === size
                            ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                            : "bg-white text-gray-900 border-gray-200 hover:border-gray-900"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-base sm:text-lg">{size}</span>
                          {selectedSize === size && (
                            <Check size={18} className="text-white" />
                          )}
                        </div>
                        <span
                          className={`text-xs sm:text-sm font-semibold ${
                            selectedSize === size ? "text-gray-300" : "text-gray-600"
                          }`}
                        >
                          £{price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grind Selection - Dynamic */}
              <div>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="text-xs sm:text-sm font-bold text-gray-900">
                    Select Grind
                  </label>
                  <span className="text-xs text-gray-500">
                    {filteredGrindOptions.length} available
                  </span>
                </div>
                <div className="space-y-2">
                  {filteredGrindOptions.map((grind) => (
                    <button
                      key={grind.value}
                      onClick={() => setSelectedGrind(grind.value)}
                      className={`w-full p-3 sm:p-4 rounded-xl border-2 text-left transition-all ${
                        selectedGrind === grind.value
                          ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                          : "bg-white text-gray-900 border-gray-200 hover:border-gray-900"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm sm:text-base">{grind.label}</p>
                          <p
                            className={`text-xs sm:text-sm ${
                              selectedGrind === grind.value ? "text-gray-300" : "text-gray-600"
                            }`}
                          >
                            {grind.description}
                          </p>
                        </div>
                        {selectedGrind === grind.value && (
                          <Check size={18} className="text-white" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs sm:text-sm font-bold text-gray-900 block mb-2 sm:mb-3">
                  Quantity
                </label>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-gray-50 font-bold text-lg transition-colors"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-12 sm:w-16 text-center font-bold text-base sm:text-lg outline-none"
                      min="1"
                      style={{ fontSize: "16px" }}
                    />
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-gray-50 font-bold text-lg transition-colors"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-xs sm:text-sm text-gray-600">Total</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">
                      £{totalPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                disabled={isAdded}
                className={`w-full py-4 sm:py-5 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 sm:gap-3 ${
                  isAdded ? "bg-green-600 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                {isAdded ? (
                  <>
                    <Check size={20} />
                    Added to Cart!
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

          {/* Related Products Section */}
          <div className="mt-12 sm:mt-16 pt-12 sm:pt-16 border-t-2 border-gray-100">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">You might also like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {DEMO_PRODUCTS.filter((p) => p.id !== product.id)
                .slice(0, 4)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/coffee/${p.id}`)}
                    className="group bg-white rounded-xl sm:rounded-2xl border-2 border-gray-100 overflow-hidden hover:border-gray-900 hover:shadow-lg transition-all text-left"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={p.img || "/test.webp"}
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
                        £{(p.prices?.["250g"] ?? p.price).toFixed(2)}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}