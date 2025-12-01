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
 * RoastLevelIndicator (uses next/image for bean icons)
 */
export function RoastLevelIndicator({ level }: { level: Product["roastLevel"] }) {
  const levelMap: Record<NonNullable<Product["roastLevel"]>, number> = {
    light: 1,
    medium: 2,
    dark: 3
  };
  const numeric = level ? levelMap[level] : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <Image
            key={i}
            src="/bean.svg"
            alt=""
            width={16}
            height={16}
            className={i <= numeric ? "opacity-100" : "opacity-20"}
          />
        ))}
      </div>
      <span className="text-xs text-neutral-400 capitalize">{level}</span>
    </div>
  );
}

/**
 * ProductCard
 * - Full-width black rectangle under image with product name
 * - On hover (large screens): entire content below name is replaced with action buttons
 * - On small screens: buttons always visible below the card content
 */
export default function ProductCard({
  product,
  index,
  onAddToCart,
  isAdded: isAddedProp
}: {
  product: Product;
  index?: number;
  onAddToCart?: (product: Product) => void;
  isAdded?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Use prop if provided, otherwise use internal state
  const isAdded = isAddedProp || false;

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/shop/${encodeURIComponent(product.id)}`);
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Call onAddToCart callback if provided
    if (onAddToCart) {
      onAddToCart(product);
    }
  };

  // Split notes into chips
  const noteChips = (product.notes || "").split(",").map((s) => s.trim()).filter(Boolean);
  const displayNotes = noteChips.length > 0 ? noteChips : ["No tasting notes"];

  return (
    <div
      onMouseEnter={() => isLargeScreen && setIsHovered(true)}
      onMouseLeave={() => isLargeScreen && setIsHovered(false)}
      className="group w-full rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transform transition-all duration-300"
    >
      {/* Image area */}
      <div className="relative w-full aspect-square overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100">
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
        {/* Refined overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Full-width black rectangle with product name */}
      <div className="relative w-full bg-gray-900 px-6 py-6">
        <h3 className="text-2xl font-bold text-white leading-tight tracking-tight mb-2">
          {product.name}
        </h3>
        {product.origin && (
          <p className="text-sm text-neutral-400 tracking-wide uppercase">
            {product.origin}
          </p>
        )}
      </div>

      {/* Card body - shows product details OR action buttons on hover */}
      <div className="relative">
        {/* Product details - hidden on hover (large screens only) */}
        <div 
          className={`px-6 pt-5 pb-5 space-y-4 transition-all duration-300 ${
            isHovered && isLargeScreen ? "opacity-0 absolute inset-0 pointer-events-none" : "opacity-100 relative"
          }`}
        >
          {/* Notes as elegant chips */}
          <div className="flex flex-wrap gap-2">
            {displayNotes.map((note, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200"
              >
                {note}
              </span>
            ))}
          </div>

          {/* Bottom row: roast level + price */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
            {product.roastLevel && (
              <div className="flex-1">
                <RoastLevelIndicator level={product.roastLevel} />
              </div>
            )}
            <p className="text-2xl font-bold text-gray-900">
              £{product.price.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Action buttons - visible on hover (large screens) or always visible (small screens) */}
        <div 
          className={`px-6 py-6 transition-all duration-300 ${
            isHovered && isLargeScreen 
              ? "opacity-100 relative" 
              : isLargeScreen 
                ? "opacity-0 absolute inset-0 pointer-events-none" 
                : "opacity-100 relative border-t-2 border-neutral-100"
          }`}
        >
          <p className={`text-gray-700 text-sm font-medium mb-4 tracking-wide text-center ${isLargeScreen ? "" : "hidden"}`}>
            Would you like to
          </p>
          <div className="w-full space-y-3">
            <button
              onClick={handleQuickAdd}
              className={`relative w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg font-bold text-base transition-all duration-300 overflow-hidden cursor-pointer ${
                isAdded
                  ? "bg-green-600 text-white"
                  : "bg-black text-white hover:bg-neutral-800 active:scale-95"
              } shadow-lg`}
            >
              {isAdded && (
                <span className="absolute inset-0 bg-green-400 animate-ping opacity-30 rounded-lg" />
              )}
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
              className="w-full bg-transparent border-2 border-black text-black px-6 py-3.5 rounded-lg font-bold text-base hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
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