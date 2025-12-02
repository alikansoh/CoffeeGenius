"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";

export type Product = {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  prices?: {
    "250g"?: number;
    "1kg"?: number;
  };
  img?: string;
  roastLevel?: "light" | "medium" | "dark";
};

type QuickAddOptions = {
  size: "250g" | "1kg";
  grind: "whole-bean" | "espresso" | "filter";
  quantity: number;
};

export function RoastLevelIndicator({ level }: { level: Product["roastLevel"] }) {
  if (!level) return null;

  const levelMap: Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };
  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((bean) => (
          <div key={bean}>
            <Image
              src={bean <= numeric ? "/bean-filled.svg" : "/bean.svg"}
              alt=""
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </div>
        ))}
      </div>
      <div className="h-3 w-px bg-gray-300" />
      <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
        {level}
      </span>
    </div>
  );
}

export default function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded: isAddedProp,
}: {
  product: Product;
  index?: number;
  onAddToCart?: (product: Product, options?: QuickAddOptions) => void;
  isAdded?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [size, setSize] = useState<QuickAddOptions["size"]>("250g");
  const [grind, setGrind] = useState<QuickAddOptions["grind"]>("whole-bean");
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [localAdded, setLocalAdded] = useState(false);

  const isAdded = isAddedProp || localAdded;

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/coffee/${encodeURIComponent(product.id)}`);
  };

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    setSize("250g");
    setGrind("whole-bean");
    setQuantity(1);
  };

  const submitQuickAdd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onAddToCart) return;

    setProcessing(true);
    try {
      await Promise.resolve(onAddToCart(product, { size, grind, quantity }));
      setLocalAdded(true);
      setTimeout(() => setLocalAdded(false), 1200);
      setIsFlipped(false);
    } finally {
      setProcessing(false);
    }
  };

  const noteChips = (product.notes || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const displayNotes = noteChips.length > 0 ? noteChips.slice(0, 3) : [];

  const unitPriceForSize = (s: QuickAddOptions["size"]) =>
    (product.prices && product.prices[s]) ?? product.price;

  return (
    <div
      onClick={() => isLargeScreen && setIsHovered(true)}
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="group w-full mx-auto sm:mx-0 bg-white hover:shadow-lg transition-shadow duration-300 rounded-lg border border-gray-200 relative"
      style={{ maxWidth: 320, perspective: 1000, minHeight: 500 }}
      aria-live="polite"
    >
      <div
        className="w-full h-full transition-all duration-500"
        style={{
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* FRONT */}
        <div
          className="w-full h-full flex flex-col bg-white rounded-lg"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="relative w-full bg-gray-100 rounded-t-lg overflow-hidden aspect-square">
            {product.img ? (
              <Image
                src={product.img}
                alt={product.name}
                fill
                style={{ objectFit: "cover" }}
                sizes="(max-width: 640px) 100vw, 320px"
                priority={index !== undefined && index < 4}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                No image
              </div>
            )}
          </div>

          <div className="p-4 flex flex-col flex-1">
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-gray-900 mb-0.5">
                {product.name}
              </h3>
              {product.origin && (
                <p className="text-sm text-gray-500">{product.origin}</p>
              )}
            </div>

            {displayNotes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {displayNotes.map((note, idx) => (
                  <span
                    key={idx}
                    title={note}
                    className="px-3 py-1 text-sm font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-sm hover:shadow-md transition-shadow duration-150"
                  >
                    {note}
                  </span>
                ))}
              </div>
            )}

            {product.roastLevel && (
              <div className="mb-3">
                <RoastLevelIndicator level={product.roastLevel} />
              </div>
            )}

            <div className="mt-auto">
              <div className="mb-3">
                <span className="text-xl font-bold text-gray-900">
                  £{(product.prices?.["250g"] ?? product.price).toFixed(2)}
                </span>
                <span className="text-sm text-gray-500 ml-1">/ 250g</span>
              </div>

              {!isAdded && (
                <>
                  {/* Desktop buttons - show on hover */}
                  <div
                    className={`hidden lg:block transition-all duration-300 ${
                      isHovered && isLargeScreen
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <div className="flex gap-2">
                      <button
                        onClick={openQuickAdd}
                        className="flex-1 flex cursor-pointer items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors"
                        aria-label={`Quick add ${product.name} to cart`}
                      >
                        <ShoppingCart size={16} />
                        <span>Quick Add</span>
                      </button>
                      <button
                        onClick={handleLearnMore}
                        className="px-3 py-2 cursor-pointer text-gray-600 text-sm font-medium hover:text-gray-900 transition-colors"
                        aria-label={`Learn more about ${product.name}`}
                      >
                        Details
                      </button>
                    </div>
                  </div>

                  {/* Mobile buttons - always visible */}
                  <div className="lg:hidden flex gap-2">
                    <button
                      onClick={openQuickAdd}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors"
                      aria-label={`Quick add ${product.name} to cart`}
                    >
                      <ShoppingCart size={16} />
                      <span>Add to cart</span>
                    </button>
                    <button
                      onClick={handleLearnMore}
                      className="px-3 py-2 text-gray-600 text-sm font-medium hover:text-gray-900 transition-colors"
                      aria-label={`Learn more about ${product.name}`}
                    >
                      Details
                    </button>
                  </div>
                </>
              )}

              {isAdded && (
                <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                  <Check className="w-4 h-4" />
                  <span className="font-medium text-sm">Added to cart</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0 top-0 left-0 w-full h-full bg-white rounded-lg p-4 flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-0.5">Configure</p>
            <h3 className="text-lg font-semibold text-gray-900">
              {product.name}
            </h3>
          </div>

          <div className="space-y-3 flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Size
              </label>
              <div className="flex gap-2">
                {(["250g", "1kg"] as QuickAddOptions["size"][]).map((s) => {
                  const selected = s === size;
                  return (
                    <button
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSize(s);
                      }}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                        selected
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      <div>{s}</div>
                      <div className="text-xs opacity-75">
                        £{unitPriceForSize(s).toFixed(2)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Grind
              </label>
              <select
                value={grind}
                onChange={(e) => setGrind(e.target.value as QuickAddOptions["grind"])}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
              >
                <option value="whole-bean">Whole bean</option>
                <option value="espresso">Ground for espresso</option>
                <option value="filter">Ground for filter</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuantity((q) => Math.max(1, q - 1));
                  }}
                  className="w-8 h-8 rounded border border-gray-300 font-medium hover:bg-gray-100 transition-colors"
                >
                  −
                </button>
                <div className="flex-1 text-center font-medium">
                  {quantity}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuantity((q) => q + 1);
                  }}
                  className="w-8 h-8 rounded border border-gray-300 font-medium hover:bg-gray-100 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
              className="flex-1 px-3 py-2 rounded border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitQuickAdd}
              disabled={processing}
              className="flex-1 px-3 py-2 rounded bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {processing ? "Adding..." : "Add to cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}