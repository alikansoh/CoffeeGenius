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
      <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-neutral-50 border border-neutral-200">
        <span className="text-xs text-neutral-400">Unknown</span>
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
    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 transition-all duration-300 group-hover:border-amber-300 group-hover:shadow-md rounded-full">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="transition-transform duration-200 group-hover:scale-110"
            style={{ transitionDelay: `${i * 35}ms` }}
          >
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
      <div className="h-4 w-px bg-amber-300" />
      <span className="text-xs text-amber-700 uppercase tracking-wide font-bold">{level}</span>
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
      className="group w-full mx-auto sm:mx-0 overflow-visible bg-white shadow-lg hover:shadow-2xl transform transition-all duration-500 hover:-translate-y-2 rounded-2xl border border-neutral-100 hover:border-neutral-200"
      style={{ maxWidth: 320, perspective: 1000 }}
      aria-live="polite"
    >
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 450ms cubic-bezier(.2,.9,.2,1)",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          position: "relative",
        }}
      >
        {/* FRONT */}
        <div style={{ backfaceVisibility: "hidden" }} className="relative bg-white rounded-2xl overflow-hidden">
          <div className="relative w-full overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 aspect-[4/3] lg:aspect-square rounded-t-2xl">
            {product.img ? (
              <Image
                src={product.img}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                priority={index !== undefined && index < 3}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">No image</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
              {product.roastLevel?.toUpperCase() || "UNKNOWN"}
            </div>
          </div>

          <div className="relative w-full bg-gradient-to-r from-gray-900 to-gray-800 px-3 py-3 sm:px-6 sm:py-5 rounded-b-2xl">
            <h3 className="text-base sm:text-2xl font-bold text-white leading-tight tracking-tight mb-1">{product.name}</h3>
            {product.origin && <p className="text-xs sm:text-sm text-neutral-300 tracking-wide uppercase">{product.origin}</p>}
          </div>

          <div className="relative">
            <div
              className={`px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-5 space-y-2 sm:space-y-4 transition-all duration-300 ${
                isHovered && isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative"
              }`}
            >
              <div className="flex flex-wrap gap-2">
                {displayNotes.map((note, idx) => (
                  <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-200">
                    {note}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                {product.roastLevel && <div className="flex-1"><RoastLevelIndicator level={product.roastLevel} /></div>}
                <p className="text-lg sm:text-xl font-extrabold text-gray-900 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  £{(product.prices?.["250g"] ?? product.price).toFixed(2)} <span className="text-xs text-neutral-500 font-medium">/ 250g</span>
                </p>
              </div>
            </div>

            <div
              className={`px-3 sm:px-6 py-3 sm:py-6 transition-all duration-300 ${
                isHovered && isLargeScreen ? "opacity-100 relative" : isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative border-t-2 border-neutral-100"
              }`}
            >
              <p className={`text-gray-700 text-sm font-medium mb-3 tracking-wide text-center ${isLargeScreen ? "" : "hidden"}`}>Would you like to</p>
              <div className="w-full space-y-2 sm:space-y-3">
                <button
                  onClick={openQuickAdd}
                  className="w-full bg-transparent border-2 border-black text-black px-4 py-3 sm:px-5 sm:py-4 rounded-xl font-bold text-sm sm:text-base hover:bg-black hover:text-white transition-all duration-300 cursor-pointer shadow-md hover:shadow-lg"
                >
                  Quick add
                </button>

                <button
                  onClick={handleLearnMore}
                  className="w-full bg-transparent border-2 border-neutral-200 text-neutral-700 px-4 py-3 sm:px-5 sm:py-4 rounded-xl font-medium text-sm sm:text-base hover:bg-neutral-100 transition-all duration-300 cursor-pointer"
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
          className="rounded-2xl overflow-hidden"
          aria-hidden={!isFlipped}
        >
          {/* Full-width rectangle using original card colors (gradient) */}
          <div className="flex flex-col h-full bg-white">
            <div className="w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white px-4 py-6">
              <div className="max-w-full mx-auto text-center">
                <div className="text-xs text-gray-300 uppercase tracking-wide mb-2">You&apos;re adding</div>
                <div className="w-full inline-block bg-transparent">
                  <div className="px-4 py-4 font-extrabold text-lg sm:text-xl tracking-tight">{product.name}</div>
                </div>
              </div>
            </div>

            {/* Controls panel below rectangle */}
            <div className="px-4 pb-4 pt-3">
              <div className="bg-white rounded-xl p-3 shadow-md">
                <div>
                  <div className="text-xs font-bold text-neutral-700 mb-2">Size</div>
                  <div className="flex gap-3">
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
                          className={`flex-1 flex items-center justify-between gap-2 px-4 py-3 rounded-lg border transition-colors duration-200 text-sm font-semibold ${
                            selected
                              ? "bg-gray-900 text-white border-gray-900"
                              : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50"
                          }`}
                        >
                          <div className="text-left">
                            <div className={`${selected ? "font-extrabold" : "font-semibold"}`}>{s}</div>
                            <div className="text-xs text-neutral-500">£{unitPriceForSize(s).toFixed(2)}</div>
                          </div>
                          <div className="flex items-center">
                            {selected ? <Check size={18} className="text-white" /> : <span className="text-neutral-400"> </span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-bold text-neutral-700 mb-2">Grind</div>
                  <select
                    value={grind}
                    onChange={(e) => setGrind(e.target.value as QuickAddOptions["grind"])}
                    className="w-full rounded-lg border-2 border-neutral-200 px-3 py-2 text-sm"
                    aria-label="Choose grind style"
                  >
                    <option value="whole-bean">Whole bean</option>
                    <option value="espresso">Ground — Espresso</option>
                    <option value="filter">Ground — Filter</option>
                  </select>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-bold text-neutral-700 mb-2">Quantity</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuantity((q) => Math.max(1, q - 1));
                      }}
                      className="px-3 py-2 rounded-lg border-2 border-neutral-200"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <div className="px-4 py-2 border-2 border-neutral-200 rounded-lg text-sm">{quantity}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuantity((q) => q + 1);
                      }}
                      className="px-3 py-2 rounded-lg border-2 border-neutral-200"
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
                    className="flex-1 px-3 py-2 rounded-lg border-2 border-neutral-200 bg-white text-sm font-semibold hover:border-black transition"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={submitQuickAdd}
                    disabled={processing}
                    className="flex-1 px-3 py-2 rounded-lg bg-black text-white font-bold hover:bg-neutral-900 transition"
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

      <style jsx>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .animate-ping {
          animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}