  "use client";

  import Image from "next/image";
  import Link from "next/link";
  import { X, Trash, Lock, ShoppingBag, Coffee as CoffeeIcon } from "lucide-react";
  import { useEffect, useState } from "react";
  import { useRouter } from "next/navigation";
  import useCart from "../store/CartStore";
  import { getCloudinaryUrl } from "@/app/utils/cloudinary";

  const COLORS = {
    primary: "#111827",
    accent: "#6b7280",
    black: "#000000",
  };

  export default function CartDrawer() {
    const router = useRouter();
    const items = useCart((s) => s.items);
    const isOpen = useCart((s) => s.isOpen);
    const close = useCart((s) => s.close);
    const updateQuantity = useCart((s) => s.updateQuantity);
    const removeItem = useCart((s) => s.removeItem);
    const getTotalPrice = useCart((s) => s.getTotalPrice);
    const getTotalItems = useCart((s) => s.getTotalItems);
    const getItemsByType = useCart((s) => s.getItemsByType);

    // ✅ Fix hydration mismatch
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        setMounted(true);
      }, 0);
      return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && isOpen) close();
      }
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [isOpen, close]);

    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      return () => {
        document.body.style.overflow = "";
      };
    }, [isOpen]);

    function formatPrice(n: number) {
      return `£${n.toFixed(2)}`;
    }

    const handleCheckout = () => {
      close();
      router.push("/checkout");
    };

    // ✅ Only calculate these after mount
    const totalPrice = mounted ? getTotalPrice() : 0;
    const totalItems = mounted ? getTotalItems() : 0;
    const coffeeItems = mounted ? getItemsByType("coffee") : [];
    const equipmentItems = mounted ? getItemsByType("equipment") : [];
    const shipping = totalPrice > 30 ? 0 : 4.99;
    const grandTotal = totalPrice + shipping;

    // helper to normalize cloudinary publicId or URL for display
    const getImageSrc = (idOrUrl?: string, preset: "thumbnail" | "medium" = "thumbnail") => {
      if (!idOrUrl) return "/test.webp";
      if (idOrUrl.startsWith("http://") || idOrUrl.startsWith("https://") || idOrUrl.startsWith("/")) {
        return idOrUrl;
      }
      return getCloudinaryUrl(idOrUrl, preset);
    };

    // ✅ Show loading state during SSR/hydration
    if (!mounted) {
      return (
        <div
          aria-hidden={!isOpen}
          className={`fixed inset-0 z-50 transition-opacity ${
            isOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={close}
          />

          <aside
            role="dialog"
            aria-label="Shopping cart"
            className={`fixed right-0 top-0 h-full z-50 w-full max-w-md md:max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-in-out
              ${isOpen ? "translate-x-0" : "translate-x-full"} rounded-l-2xl overflow-hidden`}
          >
            <div className="flex h-full flex-col">
              {/* Header - Loading State */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold" style={{ color: COLORS.primary }}>
                    Your basket
                  </div>
                  <div className="inline-flex items-center justify-center text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    <span className="animate-pulse">... </span>
                  </div>
                </div>

                <div>
                  <button
                    aria-label="Close cart"
                    onClick={close}
                    className="p-2 rounded-md hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <X size={18} style={{ color: COLORS.primary }} />
                  </button>
                </div>
              </div>

              {/* Body - Loading */}
              <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-pulse">
                    <div className="mx-auto mb-4 w-28 h-28 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200" />
                    <div className="h-4 bg-gray-200 rounded w-32 mx-auto mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-48 mx-auto" />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      );
    }

    // ✅ Now safe to render with real cart data
    return (
      // overlay
      <div
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-50 transition-opacity ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${
            isOpen ?  "opacity-100" : "opacity-0"
          }`}
          onClick={close}
        />

        <aside
          role="dialog"
          aria-label="Shopping cart"
          className={`fixed right-0 top-0 h-full z-50 w-full max-w-md md:max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-in-out
            ${isOpen ? "translate-x-0" : "translate-x-full"} rounded-l-2xl overflow-hidden`}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold" style={{ color: COLORS.primary }}>
                  Your basket
                </div>
                <div className="inline-flex items-center justify-center text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                </div>
              </div>

              <div>
                <button
                  aria-label="Close cart"
                  onClick={close}
                  className="p-2 rounded-md hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <X size={18} style={{ color: COLORS.primary }} />
                </button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  <div className="mx-auto mb-4 w-28 h-28 rounded-full bg-gradient-to-tr from-amber-50 to-amber-100 flex items-center justify-center">
                    <ShoppingBag size={44} className="text-gray-300" />
                  </div>
                  <div className="text-sm font-medium" style={{ color: COLORS.primary }}>
                    Your cart is empty
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Add some delicious coffee to get started. 
                  </div>
                  <div className="mt-4">
                    <Link
                      href="/coffee"
                      onClick={close}
                      className="inline-block px-4 py-2 rounded-md bg-black text-white text-sm font-semibold hover:opacity-95"
                    >
                      Browse coffee
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Coffee Items */}
                  {coffeeItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CoffeeIcon size={16} className="text-amber-700" />
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Coffee
                        </h3>
                      </div>
                      <ul className="space-y-3">
                        {coffeeItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="w-16 h-16 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-gray-200">
                              {item.img ?  (
                                <Image
                                  src={getImageSrc(item.img, "thumbnail")}
                                  alt={item.name}
                                  width={64}
                                  height={64}
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div
                                    className="text-sm font-medium line-clamp-2"
                                    style={{ color: COLORS.primary }}
                                  >
                                    {item.name}
                                  </div>
                                  <div className="mt-1 flex gap-2 text-xs text-gray-500">
                                    {item.size && <span>{item.size}</span>}
                                    {item.grind && <span>• {item.grind}</span>}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold whitespace-nowrap">
                                  {formatPrice(item.price * item.quantity)}
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-3">
                                <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white">
                                  <button
                                    type="button"
                                    aria-label={`Decrease quantity for ${item.name}`}
                                    onClick={() =>
                                      updateQuantity(item.id, Math.max(1, item.quantity - 1))
                                    }
                                    className="px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none"
                                  >
                                    −
                                  </button>
                                  <div className="px-3 py-1 text-sm w-10 text-center font-medium">
                                    {item.quantity}
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Increase quantity for ${item.name}`}
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                    disabled={item.stock ? item.quantity >= item.stock : false}
                                    className="px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg focus:outline-none"
                                  aria-label={`Remove ${item.name}`}
                                  title="Remove"
                                >
                                  <Trash size={16} />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Equipment Items */}
                  {equipmentItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingBag size={16} className="text-gray-700" />
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Equipment
                        </h3>
                      </div>
                      <ul className="space-y-3">
                        {equipmentItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="w-16 h-16 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-gray-200">
                              {item.img ? (
                                <Image
                                  src={getImageSrc(item.img, "thumbnail")}
                                  alt={item.name}
                                  width={64}
                                  height={64}
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div
                                    className="text-sm font-medium line-clamp-2"
                                    style={{ color: COLORS.primary }}
                                  >
                                    {item.name}
                                  </div>
                                  {item.metadata?.brand && (
                                    <div className="mt-1 text-xs text-gray-500">
                                      {item.metadata.brand}
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm font-semibold whitespace-nowrap">
                                  {formatPrice(item.price * item.quantity)}
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-3">
                                <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white">
                                  <button
                                    type="button"
                                    aria-label={`Decrease quantity for ${item.name}`}
                                    onClick={() =>
                                      updateQuantity(item.id, Math.max(1, item.quantity - 1))
                                    }
                                    className="px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none"
                                  >
                                    −
                                  </button>
                                  <div className="px-3 py-1 text-sm w-10 text-center font-medium">
                                    {item.quantity}
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Increase quantity for ${item.name}`}
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                    disabled={typeof item.stock === 'number' && item.stock > 0 && item.quantity >= item.stock}
                                    className="px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg focus:outline-none"
                                  aria-label={`Remove ${item.name}`}
                                  title="Remove"
                                >
                                  <Trash size={16} />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer / Checkout */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 p-5 bg-gradient-to-t from-white/60">
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    <span className="font-medium">
                      {totalPrice > 30 ? (
                        <span className="text-green-600">FREE</span>
                      ) : (
                        formatPrice(shipping)
                      )}
                    </span>
                  </div>
                  {totalPrice > 0 && totalPrice <= 30 && (
                    <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                      Add {formatPrice(30 - totalPrice)} more for free shipping
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-base font-semibold" style={{ color: COLORS.primary }}>
                      Total
                    </span>
                    <span className="text-lg font-bold" style={{ color: COLORS.primary }}>
                      {formatPrice(grandTotal)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={handleCheckout}
                    className="w-full px-4 py-3 rounded-lg bg-black text-white text-sm font-semibold hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 inline-flex items-center justify-center gap-2"
                    aria-label="Secure checkout"
                    title="Secure checkout"
                  >
                    <Lock size={16} />
                    <span>Secure checkout</span>
                  </button>

                  <Link
                    href="/cart"
                    onClick={close}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none text-center"
                  >
                    View full cart
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    );
  }