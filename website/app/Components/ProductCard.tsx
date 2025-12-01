"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

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
  if (!level) {
    return (
      <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-50 border border-gray-200">
        <span className="text-xs text-gray-400">Unknown</span>
      </div>
    );
  }

  const levelMap: Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3,
  };

  const numeric = levelMap[level];

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <Image
              src={i <= numeric ? "/bean-filled.svg" : "/bean.svg"}
              alt={i <= numeric ? `${level} bean` : ""}
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </div>
        ))}
      </div>
      <div className="h-4 w-px bg-gray-300" />
      <span className="text-xs text-gray-600 uppercase tracking-wide font-medium">{level}</span>
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
  const [quantity, setQuantity] = useState<number>(1);
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
  const displayNotes = noteChips.length > 0 ? noteChips : ["No tasting notes"];

  const unitPriceForSize = (s: QuickAddOptions["size"]) =>
    (product.prices && product.prices[s]) ?? product.price;

  return (
    <div
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="group w-full mx-auto sm:mx-0 overflow-visible bg-white shadow hover:shadow-lg transition-shadow duration-200 rounded-lg border border-gray-200"
      style={{ maxWidth: 320, perspective: 1000 }}
      aria-live="polite"
    >
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 400ms ease",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          position: "relative",
        }}
      >
        {/* FRONT */}
        <div style={{ backfaceVisibility: "hidden" }} className="relative bg-white rounded-lg overflow-hidden">
          <div className="relative w-full overflow-hidden bg-gray-50 aspect-[4/3] lg:aspect-square rounded-t-lg">
            {product.img ? (
              <Image
                src={product.img}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                priority={index !== undefined && index < 3}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No image</div>
            )}
            <div className="absolute bottom-4 left-4 bg-white text-gray-800 px-3 py-1 rounded-full text-xs font-medium shadow">
              {product.roastLevel?.toUpperCase() || "UNKNOWN"}
            </div>
          </div>

          <div className="relative w-full bg-white px-3 py-4 sm:px-6 sm:py-6 rounded-b-lg border-t border-gray-100">
            <h3 className="text-base sm:text-xl font-semibold text-gray-900 leading-tight mb-1">{product.name}</h3>
            {product.origin && <p className="text-xs sm:text-sm text-gray-500 uppercase">{product.origin}</p>}
          </div>

          <div className="relative">
            <div
              className={`px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-5 space-y-2 sm:space-y-4 transition-opacity duration-200 ${
                isHovered && isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative"
              }`}
            >
              <div className="flex flex-wrap gap-2">
                {displayNotes.map((note, idx) => (
                  <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                    {note}
                  </span>
                ))}
              </div>

              <div className="flex items-start justify-between pt-3 border-t border-gray-100">
                {product.roastLevel && <div className="flex-1"><RoastLevelIndicator level={product.roastLevel} /></div>}
                <div className="text-right">
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    £{(product.prices?.["250g"] ?? product.price).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">per 250g</p>
                </div>
              </div>
            </div>

            <div
              className={`px-3 sm:px-6 py-3 sm:py-6 transition-opacity duration-200 ${
                isHovered && isLargeScreen ? "opacity-100 relative" : isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative border-t border-gray-100"
              }`}
            >
              <p className={`text-gray-600 text-sm font-medium mb-3 text-center ${isLargeScreen ? "" : "hidden"}`}>Would you like to</p>
              <div className="w-full space-y-2">
                <button
                  onClick={openQuickAdd}
                  className="w-full bg-gray-900 text-white px-4 cursor-pointer py-3 sm:px-5 sm:py-3 rounded-lg font-semibold text-sm sm:text-base hover:bg-gray-800 transition-colors duration-200"
                >
                  Quick add
                </button>

                <button
                  onClick={handleLearnMore}
                  className="w-full bg-white border border-gray-300  cursor-pointer text-gray-700 px-4 py-3 sm:px-5 sm:py-3 rounded-lg font-medium text-sm sm:text-base hover:bg-gray-50 transition-colors duration-200"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", position: "absolute", inset: 0 }}
          className="rounded-lg overflow-hidden shadow-lg"
          aria-hidden={!isFlipped}
        >
          <div className="flex flex-col h-full bg-white">
            <div className="w-full bg-gray-900 text-white px-4 py-5 border-b border-gray-200">
              <div className="max-w-full mx-auto text-center">
                <div className="text-xs text-gray-300 uppercase tracking-wide mb-2">You&apos;re adding</div>
                <div className="w-full inline-block bg-transparent">
                  <div className="px-4 py-3 font-semibold text-lg sm:text-xl">{product.name}</div>
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Size</div>
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
                          aria-pressed={selected}
                          className={`flex-1 flex items-center  cursor-pointer justify-between gap-2 px-3 py-2.5 rounded-lg border transition-colors duration-150 text-sm font-medium ${
                            selected
                              ? "bg-gray-900 text-white border-gray-900"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <div className="text-left">
                            <div className={`${selected ? "font-semibold" : "font-medium"}`}>{s}</div>
                            <div className={`text-xs ${selected ? "text-gray-300" : "text-gray-500"}`}>£{unitPriceForSize(s).toFixed(2)}</div>
                          </div>
                          <div className="flex items-center">
                            {selected ? <Check size={16} className="text-white" /> : <span className="text-gray-400"> </span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Grind</div>
                  <select
                    value={grind}
                    onChange={(e) => setGrind(e.target.value as QuickAddOptions["grind"])}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:border-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
                    aria-label="Choose grind style"
                  >
                    <option value="whole-bean">Whole bean</option>
                    <option value="espresso">Ground — Espresso</option>
                    <option value="filter">Ground — Filter</option>
                  </select>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Quantity</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuantity((q) => Math.max(1, q - 1));
                      }}
                      className="px-3 py-2.5 rounded-lg border border-gray-300 font-semibold hover:bg-gray-50 transition-colors duration-150"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <div className="flex-1 text-center px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold bg-white">{quantity}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuantity((q) => q + 1);
                      }}
                      className="px-3 py-2.5 rounded-lg border border-gray-300 font-semibold hover:bg-gray-50 transition-colors duration-150"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFlipped(false);
                    }}
                    className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 transition-colors duration-150"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={submitQuickAdd}
                    disabled={processing}
                    className="flex-1 px-3 py-2.5 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Add to cart"
                  >
                    {processing ? "Adding…" : "Add to cart"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}