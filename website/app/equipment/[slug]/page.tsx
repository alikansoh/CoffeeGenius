"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ShoppingCart,
  Check,
  AlertCircle,
  Play,
  X,
  Shield,
  RotateCcw,
  Truck,
  ChevronRight,
  Package,
  Copy,
  Info,
} from "lucide-react";
import useCart from "@/app/store/CartStore";
import {
  getCloudinaryUrl,
  getCloudinaryVideo,
  getVideoThumbnail,
  isVideo,
} from "@/app/utils/cloudinary";

interface ApiEquipment {
  _id: string;
  slug: string;
  name: string;
  brand?: string;
  category?: string;
  features?: string[];
  notes?: string;
  description?: string;
  specs?: Record<string, unknown>;
  pricePence?: number;
  price?: number;
  minPrice?: number;
  minPricePence?: number;
  imgPublicId?: string;
  imgUrl?: string;
  imagesPublicIds?: string[];
  imagesUrls?: string[];
  totalStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);

  const slug = params?.slug as string;
  const [product, setProduct] = useState<ApiEquipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<ApiEquipment[]>([]);

  // media handling
  const [videoMap, setVideoMap] = useState<Record<string, boolean>>({});
  const [playingVideoSrc, setPlayingVideoSrc] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Specs & features UI state
  const [copiedSpecKey, setCopiedSpecKey] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [showFeatureModal, setShowFeatureModal] = useState(false);

  // Section toggles (features, about, specs)
  const [showFeaturesSection, setShowFeaturesSection] = useState(true);
  const [showAboutSection, setShowAboutSection] = useState(true);
  const [showSpecsSection, setShowSpecsSection] = useState(true);

  const detectSinglePublicId = useCallback(async (publicId: string): Promise<boolean> => {
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
  }, []);

  const detectAllPublicIds = useCallback(
    async (publicIds: string[]): Promise<Record<string, boolean>> => {
      const results: Record<string, boolean> = {};
      if (!publicIds || publicIds.length === 0) return results;

      await Promise.all(
        publicIds.map(async (p) => {
          if (!p) return;
          try {
            results[p] = await detectSinglePublicId(p);
          } catch {
            results[p] = false;
          }
        })
      );

      return results;
    },
    [detectSinglePublicId]
  );

  useEffect(() => {
    if (!slug) return;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/equipment/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error("Failed to fetch equipment");

        const json = await res.json();
        const data: ApiEquipment = json.data;
        setProduct(data);

        const allMedia =
          (data.imagesPublicIds && data.imagesPublicIds.length > 0
            ? data.imagesPublicIds
            : data.imagesUrls && data.imagesUrls.length > 0
            ? data.imagesUrls
            : data.imgPublicId
            ? [data.imgPublicId]
            : data.imgUrl
            ? [data.imgUrl]
            : []);

        const detected = await detectAllPublicIds(allMedia);
        setVideoMap(detected);
        setError(null);
        setSelectedImageIndex(0);
        setPlayingVideoSrc(null);
        // keep section open/closed state as-is (no automatic resets)
      } catch (err) {
        console.error(err);
        setError("Failed to load equipment");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [slug, detectAllPublicIds]);

  useEffect(() => {
    if (!product?.category) return;

    const fetchRelated = async () => {
      try {
        const res = await fetch(
          `/api/equipment?category=${encodeURIComponent(product.category || "")}&limit=50`
        );
        if (!res.ok) return;

        const json = await res.json();
        const filtered = (json.data || [])
          .filter((p: ApiEquipment) => p.slug !== product.slug)
          .slice(0, 3);
        setRelatedProducts(filtered);
      } catch (err) {
        console.error("Failed to fetch related products:", err);
      }
    };

    fetchRelated();
  }, [product]);

  const mediaItems = useMemo(() => {
    if (!product) return [];
    if (product.imagesPublicIds && product.imagesPublicIds.length > 0) return product.imagesPublicIds;
    if (product.imagesUrls && product.imagesUrls.length > 0) return product.imagesUrls;
    if (product.imgPublicId) return [product.imgPublicId];
    if (product.imgUrl) return [product.imgUrl];
    return [];
  }, [product]);

  const isVideoId = useCallback(
    (id: string) => {
      if (!id) return false;
      if (videoMap[id] !== undefined) return videoMap[id];
      return isVideo(id);
    },
    [videoMap]
  );

  const imageItems = useMemo(() => mediaItems.filter((m) => !isVideoId(m)), [mediaItems, isVideoId]);
  const videoItems = useMemo(() => mediaItems.filter((m) => isVideoId(m)), [mediaItems, isVideoId]);
  const allDisplayMedia = useMemo(() => [...imageItems, ...videoItems], [imageItems, videoItems]);

  useEffect(() => {
    if (selectedImageIndex >= allDisplayMedia.length) {
      setSelectedImageIndex(0);
    }
  }, [allDisplayMedia.length, selectedImageIndex]);

  const currentMedia = allDisplayMedia[selectedImageIndex] ?? allDisplayMedia[0] ?? null;

  const price = useMemo(() => {
    if (!product) return 0;
    return product.price ?? product.minPrice ?? (product.pricePence ? product.pricePence / 100 : 0);
  }, [product]);

  const stock = product?.totalStock ?? 0;
  const isOutOfStock = stock === 0;

  useEffect(() => {
    if (!loading && !product) {
      router.push("/equipment");
    }
  }, [loading, product, router]);

  const handleAddToCart = () => {
    if (!product) return;
    if (isOutOfStock) {
      alert("This item is out of stock");
      return;
    }
    if (quantity > stock) {
      alert(`Only ${stock} available`);
      return;
    }

    const cartItem = {
      id: product._id || product.slug,
      productType: "equipment",
      productId: product._id || product.slug,
      variantId: product._id || product.slug,
      name: `${product.name} ${product.brand ? `— ${product.brand}` : ""}`,
      price,
      img: product.imgUrl || (product.imagesUrls && product.imagesUrls[0]) || "/test.webp",
      size: undefined,
      grind: undefined,
      sku: product._id || product.slug,
      stock,
    };

    // @ts-expect-error: store typing differs from this ad-hoc cart item shape on purpose
    addItem(cartItem, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const resolveImageUrl = (m: string | undefined, size: "large" | "medium" | "thumbnail" = "large") => {
    if (!m) return "/test.webp";
    if (/^https?:\/\//i.test(m)) return m;
    return getCloudinaryUrl(m, size);
  };

  const resolveVideoUrl = (m: string | undefined) => {
    if (!m) return "";
    if (/^https?:\/\//i.test(m)) return m;
    return getCloudinaryVideo(m);
  };

  const resolveVideoThumb = (m: string | undefined) => {
    if (!m) return "/test.webp";
    if (/^https?:\/\//i.test(m)) return m;
    return getVideoThumbnail(m);
  };

  // --- Specs & Features helpers ---
  const prettifyKey = (k: string) =>
    k
      .replace(/[_-]/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const formatSpecValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (Array.isArray(v)) return v.map(String).join(", ");
    if (typeof v === "object" && v !== null) {
      const o = v as Record<string, unknown>;
      if ("value" in o && "unit" in o) {
        const val = o["value"];
        const unit = o["unit"];
        return `${String(val)}${unit ? ` ${String(unit)}` : ""}`;
      }
      return Object.values(o).map(String).join(", ");
    }
    return String(v);
  };

  const copyToClipboard = async (key: string, value: unknown): Promise<void> => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedSpecKey(key);
      setTimeout(() => setCopiedSpecKey(null), 1200);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  // features list (no search) - show all when features section is open
  const featuresList = useMemo(() => {
    if (!product?.features) return [];
    return product.features;
  }, [product]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-black font-medium">Loading equipment...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <AlertCircle size={48} className="text-black mx-auto mb-4" />
          <p className="text-black text-lg">{error || "Equipment not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="mt-16 min-h-screen bg-gray-50 text-black">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => router.push("/equipment")}
              className="inline-flex items-center gap-2 text-black font-semibold hover:gap-3 transition-all duration-200"
            >
              <ArrowLeft size={18} />
              Back to Equipment
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Column - Media and Content */}
            <div className="space-y-6">
              {/* Mobile: Title above image */}
              <div className="lg:hidden bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <h1 className="text-2xl font-bold mb-1">{product.name}</h1>
                {product.brand && <p className="text-sm text-black/60">by {product.brand}</p>}
              </div>

              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm">
                {playingVideoSrc ? (
                  <>
                    <video
                      src={playingVideoSrc}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover bg-black"
                    />
                    <button
                      onClick={() => setPlayingVideoSrc(null)}
                      aria-label="Close video"
                      className="absolute top-4 right-4 p-2 bg-white rounded-full border border-gray-200 shadow-lg hover:bg-gray-50 transition-colors"
                    >
                      <X size={18} />
                    </button>
                    <div className="absolute top-4 left-4 px-3 py-1.5 text-xs font-bold rounded-full bg-black text-white">
                      VIDEO
                    </div>
                  </>
                ) : currentMedia ? (
                  isVideoId(currentMedia) ? (
                    <>
                      <Image src={resolveVideoThumb(currentMedia)} alt={`${product.name} video`} fill className="object-cover" />
                      <button
                        className="absolute inset-0 flex items-center justify-center group"
                        onClick={() => {
                          const v = resolveVideoUrl(currentMedia);
                          if (v) setPlayingVideoSrc(v);
                        }}
                        aria-label="Play video inline"
                      >
                        <div className="bg-black/80 group-hover:bg-black rounded-full p-5 transition-all duration-200 group-hover:scale-110">
                          <Play size={40} className="text-white" />
                        </div>
                      </button>
                      <div className="absolute top-4 left-4 px-3 py-1.5 text-xs font-bold rounded-full bg-black/80 text-white backdrop-blur-sm">
                        VIDEO
                      </div>
                    </>
                  ) : (
                    <Image
                      src={resolveImageUrl(currentMedia, "large")}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-black/40">
                    <Package size={64} className="mb-3" />
                    <p className="text-sm font-medium">No image available</p>
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {allDisplayMedia.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {allDisplayMedia.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPlayingVideoSrc(null);
                        if (isVideoId(m)) {
                          const v = resolveVideoUrl(m);
                          if (v) {
                            setPlayingVideoSrc(v);
                            setSelectedImageIndex(i);
                            return;
                          }
                        }
                        setSelectedImageIndex(i);
                      }}
                      className={`relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                        selectedImageIndex === i && !playingVideoSrc
                          ? "border-black shadow-md scale-105"
                          : "border-gray-200 hover:border-gray-400 hover:scale-105"
                      }`}
                      aria-label={isVideoId(m) ? `Play video ${i + 1}` : `View image ${i + 1}`}
                    >
                      {isVideoId(m) ? (
                        <>
                          <Image src={resolveVideoThumb(m)} alt={`${product.name} video thumb`} fill className="object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="bg-white/90 rounded-full p-1.5">
                              <Play size={16} className="text-black" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <Image src={resolveImageUrl(m, "thumbnail")} alt={`${product.name} thumb`} fill className="object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Short Description (About) - now collapsible */}
              {product.description && (
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setShowAboutSection((s) => !s)}
                      className="flex items-center gap-3 text-left"
                      aria-expanded={showAboutSection}
                    >
                      <div className={`transition-transform duration-200 ${showAboutSection ? "rotate-90" : ""}`} aria-hidden="true">
                        <ChevronRight size={18} />
                      </div>

                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-1 h-6 bg-black rounded-full"></div>
                        About
                      </h3>
                    </button>
                  </div>

                  {showAboutSection && <p className="text-base leading-relaxed text-black/80">{product.description}</p>}
                </div>
              )}

              {/* Specs - enhanced design, now collapsible */}
              {product.specs && Object.keys(product.specs).length > 0 && (
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setShowSpecsSection((s) => !s)}
                      className="flex items-center gap-3 text-left"
                      aria-expanded={showSpecsSection}
                    >
                      <div className={`transition-transform duration-200 ${showSpecsSection ? "rotate-90" : ""}`} aria-hidden="true">
                        <ChevronRight size={18} />
                      </div>

                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-1 h-6 bg-black rounded-full"></div>
                        Specifications
                      </h3>
                    </button>
                  </div>

                  {showSpecsSection && (
                    <div className="space-y-3">
                      {Object.entries(product.specs).map(([k, v]) => (
                        <div
                          key={k}
                          className="group relative flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="text-xs font-semibold text-black/50 uppercase tracking-wider mb-1.5 letter-spacing-wide">
                              {prettifyKey(k)}
                            </div>
                            <div className="text-base font-semibold text-black">{formatSpecValue(v)}</div>
                          </div>

                          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={() => copyToClipboard(k, formatSpecValue(v))}
                              title="Copy value"
                              className="p-2 rounded-md hover:bg-black/5 transition-colors duration-150"
                            >
                              {copiedSpecKey === k ? (
                                <Check size={16} className="text-green-600" />
                              ) : (
                                <Copy size={16} className="text-black/40" />
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setSelectedFeature(`${prettifyKey(k)}: ${formatSpecValue(v)}`);
                                setShowFeatureModal(true);
                              }}
                              title="Details"
                              className="p-2 rounded-md hover:bg-black/5 transition-colors duration-150"
                            >
                              <Info size={16} className="text-black/40" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Features - simplified: no search, togglable whole section */}
              {product.features && product.features.length > 0 && (
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-5 gap-4">
                    <button
                      onClick={() => setShowFeaturesSection((s) => !s)}
                      className="flex items-center gap-3 text-left"
                      aria-expanded={showFeaturesSection}
                    >
                      <div
                        className={`transition-transform duration-200 ${
                          showFeaturesSection ? "rotate-90" : ""
                        }`}
                        aria-hidden="true"
                      >
                        <ChevronRight size={18} />
                      </div>

                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-1 h-6 bg-black rounded-full"></div>
                        Key Features
                      </h3>
                      <div className="text-sm text-black/50 ml-2">({product.features.length})</div>
                    </button>
                  </div>

                  {/* only render the list if section is open */}
                  {showFeaturesSection && (
                    <div className="space-y-2">
                      {featuresList.map((f, idx) => (
                        <button
                          key={f + idx}
                          onClick={() => {
                            setSelectedFeature(f);
                            setShowFeatureModal(true);
                          }}
                          className="w-full text-left group relative p-4 rounded-lg border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-black/5 to-black/10 flex items-center justify-center group-hover:from-black/10 group-hover:to-black/15 transition-all duration-200 text-sm font-semibold text-black"
                              aria-hidden="true"
                            >
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-black leading-relaxed">{f}</div>
                            </div>
                            <ChevronRight size={18} className="text-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Details and Actions */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    {/* hide on mobile since we show title above image on small screens */}
                    <h1 className="hidden lg:block text-3xl font-bold mb-2">{product.name}</h1>
                    {product.brand && <p className="text-base text-black/60">by {product.brand}</p>}
                  </div>

                  {product.brand && !product.category && (
                    <div className="text-sm font-semibold px-4 py-2 border border-gray-200 rounded-lg bg-gray-50">
                      {product.brand}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div>
                    <div className="text-3xl font-bold mb-1">£{price.toFixed(2)}</div>
                    <div className="text-xs text-black/50">Incl. VAT where applicable</div>
                  </div>

                  <div>
                    {isOutOfStock ? (
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700">
                        <AlertCircle size={16} />
                        <span className="text-sm font-medium">Out of Stock</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700">
                        <Check size={16} />
                        <span className="text-sm font-medium">{stock} Available</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {product.notes && (
                <div className="bg-amber-50 rounded-xl p-5 border-l-4 border-amber-400">
                  <h4 className="font-bold mb-2 text-amber-900">Important Note</h4>
                  <p className="text-sm text-amber-800 leading-relaxed">{product.notes}</p>
                </div>
              )}

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <label className="text-sm font-bold block mb-3 uppercase tracking-wide text-black/70">Quantity</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={isOutOfStock}
                      className="px-5 py-3 hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value || "1", 10));
                        setQuantity(Math.min(val, stock || 999));
                      }}
                      className="w-20 text-center outline-none font-bold text-lg"
                      min={1}
                      max={stock || 999}
                    />
                    <button
                      onClick={() => setQuantity((q) => Math.min(q + 1, stock || 999))}
                      disabled={isOutOfStock}
                      className="px-5 py-3 hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex-1 text-right">
                    <div className="text-xs text-black/50 uppercase tracking-wider mb-1 font-semibold">Total Price</div>
                    <div className="text-2xl font-bold">£{(price * quantity).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={isAdded || isOutOfStock}
                className={`w-full py-4 rounded-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                  isAdded
                    ? "bg-green-600 hover:bg-green-700"
                    : isOutOfStock
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-black hover:bg-black/90 hover:shadow-lg hover:scale-[1.02]"
                }`}
              >
                {isAdded ? (
                  <>
                    <Check size={20} />
                    <span>Added to Cart</span>
                  </>
                ) : isOutOfStock ? (
                  <>
                    <AlertCircle size={20} />
                    <span>Out of Stock</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={20} />
                    <span>Add to Cart</span>
                  </>
                )}
              </button>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <h4 className="font-bold mb-4 text-lg">Shipping & Returns</h4>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                      <Shield size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold mb-1">Quality Guarantee</div>
                      <div className="text-sm text-black/60">Authentic products only</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                      <Truck size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold mb-1">Standard Delivery</div>
                      <div className="text-sm text-black/60">Arrives in 3-5 business days</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                      <RotateCcw size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold mb-1">30-Day Returns</div>
                      <div className="text-sm text-black/60">Items must be in original condition</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <div className="mt-16">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <div className="w-1 h-7 bg-black rounded-full"></div>
                  You May Also Like
                </h2>
                <button
                  onClick={() => router.push(`/equipment?category=${encodeURIComponent(product.category ?? "")}`)}
                  className="text-sm px-4 py-2 border border-gray-200 rounded-lg font-medium hover:bg-black/5 transition-colors"
                >
                  View All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedProducts.map((relatedProduct) => {
                  const relatedPrice =
                    relatedProduct.price ?? relatedProduct.minPrice ?? (relatedProduct.pricePence ? relatedProduct.pricePence / 100 : 0);
                  const relatedImg = relatedProduct.imgUrl || (relatedProduct.imagesUrls && relatedProduct.imagesUrls[0]);
                  const relatedStock = relatedProduct.totalStock ?? 0;

                  return (
                    <button
                      key={relatedProduct._id}
                      onClick={() => router.push(`/equipment/${encodeURIComponent(relatedProduct.slug)}`)}
                      className="group text-left bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-200 overflow-hidden"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
                        {relatedImg ? (
                          <Image
                            src={/^https?:\/\//i.test(relatedImg) ? relatedImg : getCloudinaryUrl(relatedImg, "medium")}
                            alt={relatedProduct.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-black/20">
                            <Package size={48} />
                          </div>
                        )}
                        {relatedStock === 0 && (
                          <div className="absolute top-3 right-3 px-3 py-1.5 text-xs font-bold rounded-full bg-red-500 text-white shadow-md">
                            Out of Stock
                          </div>
                        )}
                      </div>

                      <div className="p-5">
                        {relatedProduct.category && (
                          <div className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-2">
                            {relatedProduct.category}
                          </div>
                        )}
                        <div className="font-bold text-lg mb-1 group-hover:text-black/70 transition-colors">
                          {relatedProduct.name}
                        </div>
                        {relatedProduct.brand && (
                          <div className="text-sm text-black/60 mb-3">by {relatedProduct.brand}</div>
                        )}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="text-xl font-bold">£{relatedPrice.toFixed(2)}</div>
                          <ChevronRight size={20} className="text-black/30 group-hover:text-black group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Feature Modal */}
      {showFeatureModal && selectedFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFeatureModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl p-8 shadow-2xl z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">Feature Details</h3>
                <p className="text-sm text-black/60">Information about this product feature</p>
              </div>
              <button
                onClick={() => setShowFeatureModal(false)}
                className="p-2 rounded-lg border border-gray-200 hover:bg-black/5 transition-colors flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 mb-6">
              <p className="text-base leading-relaxed text-black">{selectedFeature}</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedFeature || "");
                  setTimeout(() => setShowFeatureModal(false), 1000);
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-200 rounded-xl text-sm font-semibold hover:bg-black/5 transition-colors flex items-center justify-center gap-2"
              >
                <Copy size={16} />
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowFeatureModal(false)}
                className="flex-1 px-6 py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-black/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}