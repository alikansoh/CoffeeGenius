"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Check } from "lucide-react";

export type Product = {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  price: number;
  img?: string;
  roastLevel?: "light" | "medium" | "dark";
};

const COLORS = {
  primary: "#111827",
};

/**
 * RoastLevelIndicator (bean icons, shared style with slider)
 * - Uses /bean.svg and /bean-filled.svg (same as BestSellerSlider)
 * - Slight entrance scale on hover via group hover hooks
 */
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
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-200 transition-all duration-300 group-hover:border-neutral-300 group-hover:shadow-sm">
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="transition-transform duration-200 group-hover:scale-105"
            style={{ transitionDelay: `${i * 35}ms` }}
          >
            <Image
              src={i <= numeric ? "/bean-filled.svg" : "/bean.svg"}
              alt={i <= numeric ? `${level} bean` : ""}
              width={16}
              height={16}
              className="w-[16px] h-[16px]"
            />
          </div>
        ))}
      </div>
      <div className="h-4 w-px bg-neutral-200" />
      <span className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">{level}</span>
    </div>
  );
}

/**
 * Responsive ProductCard
 * - Uses bean-based RoastLevelIndicator
 * - Reduced visual footprint and paddings on small screens
 */
export default function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded: isAddedProp,
}: {
  product: Product;
  index?: number;
  onAddToCart?: (product: Product) => void;
  isAdded?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Use prop if provided
  const isAdded = isAddedProp || false;

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/shop/${encodeURIComponent(product.id)}`);
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToCart) onAddToCart(product);
  };

  const noteChips = (product.notes || "").split(",").map((s) => s.trim()).filter(Boolean);
  const displayNotes = noteChips.length > 0 ? noteChips : ["No tasting notes"];

  return (
    <div
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="group w-full rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transform transition-all duration-300"
      style={{ maxWidth: 420 }}
    >
      {/* Image area - more compact on small screens */}
      <div className="relative w-full overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 aspect-[4/3] lg:aspect-square">
        {product.img ? (
          <Image
            src={product.img}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority={index !== undefined && index < 3}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/12 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Header */}
      <div className="relative w-full bg-gray-900 px-4 py-4 sm:px-6 sm:py-5">
        <h3 className="text-lg sm:text-2xl font-bold text-white leading-tight tracking-tight mb-1">
          {product.name}
        </h3>
        {product.origin && (
          <p className="text-xs sm:text-sm text-neutral-400 tracking-wide uppercase">
            {product.origin}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="relative">
        <div
          className={`px-4 sm:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5 space-y-3 sm:space-y-4 transition-all duration-300 ${
            isHovered && isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative"
          }`}
        >
          <div className="flex flex-wrap gap-2">
            {displayNotes.map((note, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200"
              >
                {note}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
            {product.roastLevel && (
              <div className="flex-1">
                <RoastLevelIndicator level={product.roastLevel} />
              </div>
            )}
            <p className="text-xl sm:text-2xl font-bold text-gray-900">
              £{product.price.toFixed(2)}
            </p>
          </div>
        </div>

        <div
          className={`px-4 sm:px-6 py-4 sm:py-6 transition-all duration-300 ${
            isHovered && isLargeScreen
              ? "opacity-100 relative"
              : isLargeScreen
              ? "opacity-0 absolute inset-0 pointer-events-none"
              : "opacity-100 relative border-t-2 border-neutral-100"
          }`}
        >
          <p className={`text-gray-700 text-sm font-medium mb-3 tracking-wide text-center ${isLargeScreen ? "" : "hidden"}`}>
            Would you like to
          </p>
          <div className="w-full space-y-3">
            <button
              onClick={handleQuickAdd}
              className={`relative w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-base transition-all duration-300 overflow-hidden cursor-pointer ${
                isAdded
                  ? "bg-green-600 text-white"
                  : "bg-black text-white hover:bg-neutral-800 active:scale-95"
              } shadow-lg`}
            >
              {isAdded && <span className="absolute inset-0 bg-green-400 animate-ping opacity-30 rounded-lg" />}
              {isAdded ? (
                <>
                  <Check size={18} strokeWidth={2.5} />
                  <span>Added!</span>
                </>
              ) : (
                <>
                  <ShoppingCart size={18} />
                  <span>Quick Add</span>
                </>
              )}
            </button>
            <button
              onClick={handleLearnMore}
              className="w-full bg-transparent border-2 border-black text-black px-5 py-3 rounded-lg font-bold text-base hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              Learn More
            </button>
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