"use client";
import Image from "next/image";
import Link from "next/link";
import { X, Trash, Lock } from "lucide-react";
import { useEffect } from "react";
import useCart from "../store/CartStore";

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

export default function CartDrawer() {
  const items = useCart((s) => s.items);
  const isOpen = useCart((s) => s.isOpen);
  const close = useCart((s) => s.close);
  const setQty = useCart((s) => s.setQty);
  const removeItem = useCart((s) => s.removeItem);
  const subtotal = useCart((s) => s.subtotal());
  const checkout = useCart((s) => s.clear); // placeholder: clear on checkout, replace with actual checkout logic

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

  return (
    // overlay
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-50 transition-opacity ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />

      <aside
        role="dialog"
        aria-label="Shopping cart"
        className={`fixed right-0 top-0 h-full z-50 w-full max-w-md md:max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"} rounded-l-2xl overflow-hidden`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="text-lg font-semibold" style={{ color: COLORS.primary }}>
                Your basket
              </div>
              <div className="inline-flex items-center justify-center text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                {items.reduce((s, it) => s + it.qty, 0)} items
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

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                <div className="mx-auto mb-4 w-28 h-28 rounded-full bg-gradient-to-tr from-amber-50 to-amber-100 flex items-center justify-center">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 7h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7z" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 10.5a3 3 0 0 0-3-3" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-sm font-medium" style={{ color: COLORS.primary }}>Your cart is empty</div>
                <div className="mt-2 text-xs text-gray-500">Add some delicious coffee to get started.</div>
                <div className="mt-4">
                  <Link href="/coffee" onClick={close} className="inline-block px-4 py-2 rounded-md bg-black text-white text-sm font-semibold hover:opacity-95">
                    Browse coffee
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((it) => (
                  <li key={it.id} className="flex items-start gap-4 py-4">
                    <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-50">
                      {it.img ? (
                        <Image src={it.img} alt={it.name} width={80} height={80} className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium truncate" style={{ color: COLORS.primary }}>
                          {it.name}
                        </div>
                        <div className="text-sm font-semibold">{formatPrice(it.price * it.qty)}</div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${it.name}`}
                            onClick={() => setQty(it.id, Math.max(1, it.qty - 1))}
                            className="px-3 py-1 text-sm hover:bg-gray-50 focus:outline-none"
                          >
                            −
                          </button>
                          <div className="px-3 py-1 text-sm w-12 text-center font-medium">{it.qty}</div>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${it.name}`}
                            onClick={() => setQty(it.id, it.qty + 1)}
                            className="px-3 py-1 text-sm hover:bg-gray-50 focus:outline-none"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                            aria-label={`Remove ${it.name}`}
                            title="Remove"
                          >
                            <Trash size={16} />
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 p-5 bg-gradient-to-t from-white/60">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-gray-500">Subtotal</div>
                <div className="text-lg font-semibold" style={{ color: COLORS.primary }}>
                  {formatPrice(subtotal)}
                </div>
              </div>
              <div className="text-sm text-gray-500">{items.length} {items.length === 1 ? "item" : "items"}</div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  // replace with your checkout flow (analytics, routing, etc.)
                  checkout();
                  close();
                }}
                className="w-full px-4 py-3 rounded-lg bg-black text-white text-sm font-semibold hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 inline-flex items-center justify-center gap-2"
                aria-label="Secure checkout"
                title="Secure checkout"
              >
                <Lock size={16} />
                <span>Secure checkout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}