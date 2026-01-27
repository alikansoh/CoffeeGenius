'use client';

import React, { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from '@/app/Components/CheckoutForm';
import useCart from '@/app/store/CartStore';
import Link from 'next/link';
import { ShoppingBag, Package, CreditCard } from 'lucide-react';
import Image from 'next/image';
import { getCloudinaryUrl } from '@/app/utils/cloudinary';
import { useRouter } from 'next/navigation';
import { computeShippingPence } from '@/lib/shipping';
import { penceToPounds } from '@/lib/currency';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

type Shortage = { id: string; name: string; requested: number; available: number; source: string };

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const getTotalPrice = useCart((s) => s.getTotalPrice);
  const openCart = useCart((s) => s.open);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const [shortages, setShortages] = useState<Shortage[] | null>(null);
  const [showShortageModal, setShowShortageModal] = useState<boolean>(false);

  // settings (pence)
  const [deliveryPence, setDeliveryPence] = useState<number>(499);
  const [thresholdPence, setThresholdPence] = useState<number>(3000);
  const [freeEnabled, setFreeEnabled] = useState<boolean>(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load settings on client
  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const res = await fetch('/api/admin/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const json = await res.json();
        if (!active) return;
        setDeliveryPence(Number(json.deliveryPricePence ?? 499));
        setThresholdPence(Number(json.freeDeliveryThresholdPence ?? 3000));
        setFreeEnabled(Boolean(json.freeDeliveryEnabled ?? true));
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  // Derived values (only after mount to avoid hydration mismatch)
  const visibleItems = mounted ? items : [];
  const subtotal = mounted ? getTotalPrice() : 0; // in pounds
  const subtotalPence = Math.round(subtotal * 100);
  const shippingPence = computeShippingPence(subtotalPence, {
    deliveryPricePence: deliveryPence,
    freeDeliveryThresholdPence: thresholdPence,
    freeDeliveryEnabled: freeEnabled,
  });
  const shipping = penceToPounds(shippingPence);
  const total = mounted ? Math.round((subtotal + shipping) * 100) / 100 : 0;

  useEffect(() => {
    if (!mounted) return;
    if (!visibleItems || visibleItems.length === 0) return;

    async function createIntent() {
      setLoading(true);
      try {
        // Include shippingPence so the server can create a PaymentIntent for the full amount
        const res = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: visibleItems, shippingPence }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok) {
          setClientSecret(data.clientSecret);
          setShortages(null);
          setShowShortageModal(false);
        } else {
          if (res.status === 409 && data && Array.isArray(data.shortages)) {
            setShortages(data.shortages as Shortage[]);
            setShowShortageModal(true);
          } else {
            setClientSecret(null);
          }
        }
      } catch (err) {
        console.error('createIntent failed', err);
        setClientSecret(null);
      } finally {
        setLoading(false);
      }
    }

    createIntent();
  }, [mounted, visibleItems, shippingPence]);

  const getImageSrc = (idOrUrl?: string, preset: 'thumbnail' | 'medium' = 'thumbnail') => {
    if (!idOrUrl) return '/test.webp';
    if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://') || idOrUrl.startsWith('/')) {
      return idOrUrl;
    }
    return getCloudinaryUrl(idOrUrl, preset);
  };

  const closeShortageModal = () => {
    setShowShortageModal(false);
    setShortages(null);
  };

  return (
    <div className="min-h-screen bg-white py-4 sm:py-6 lg:py-8 px-4 mt-10 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-3xl lg:text-4xl font-bold text-black mb-2">Checkout</h1>
          <p className="text-base sm:text-base text-gray-600">Complete your order securely</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <div className="flex items-center justify-center space-x-2 sm:space-x-4 min-w-max px-4">
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                1
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-black whitespace-nowrap">Cart</span>
            </div>
            <div className="w-8 sm:w-16 h-0.5 bg-black" />
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                2
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-black whitespace-nowrap">Checkout</span>
            </div>
            <div className="w-8 sm:w-16 h-0.5 bg-gray-300" />
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                3
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-gray-500 whitespace-nowrap">Complete</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Order Summary */}
          <aside className="order-1 lg:order-2 lg:col-span-1">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6 lg:sticky lg:top-4">
              <h2 className="text-xl sm:text-xl font-bold mb-4 flex items-center text-black">
                <ShoppingBag className="w-5 h-5 sm:w-5 sm:h-5 mr-2" />
                Order Summary
              </h2>

              {/* Items List */}
              <div className="max-h-48 sm:max-h-64 overflow-y-auto mb-4 space-y-3">
                {visibleItems.map((it) => (
                  <div key={it.id} className="flex gap-2 sm:gap-3 pb-3 border-b border-gray-200">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white border border-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                      {it.img ? (
                        <Image src={getImageSrc(it.img, 'thumbnail')} alt={it.name} width={64} height={64} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm sm:text-base text-black truncate">{it.name}</h3>
                      <p className="text-sm sm:text-sm text-gray-500 mt-1">
                        {it.size ? `${it.size}${it.grind ? ` • ${it.grind}` : ''}` : it.metadata?.brand}
                      </p>
                      <p className="text-sm sm:text-sm text-gray-400 mt-1">Qty: {it.quantity}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-sm sm:text-base text-black">£{(it.price * it.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {!mounted && visibleItems.length === 0 && <div className="text-sm text-gray-500">Loading items…</div>}
                {mounted && visibleItems.length === 0 && <div className="text-sm text-gray-500">No items in your cart.</div>}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 sm:space-y-3 py-3 sm:py-4 border-t border-gray-200">
                <div className="flex justify-between text-sm sm:text-base">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-black">£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm sm:text-base">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium text-black">{shippingPence === 0 ? <span className="text-black">FREE</span> : `£${shipping.toFixed(2)}`}</span>
                </div>
              </div>

              {/* Total */}
              <div className="pt-3 sm:pt-4 border-t-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="text-base sm:text-lg font-bold text-black">Total</span>
                  <span className="text-xl sm:text-2xl font-bold text-black">£{total.toFixed(2)}</span>
                </div>
              </div>

              {mounted && subtotal < penceToPounds(thresholdPence) && (
                <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-black text-white rounded-lg text-center">
                  <p className="text-sm sm:text-base">
                    Add <strong>£{(penceToPounds(thresholdPence) - subtotal).toFixed(2)}</strong> more for free shipping!
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Form / Payment */}
          <div className="order-2 lg:order-1 lg:col-span-2 space-y-4 sm:space-y-6">
            {!mounted || visibleItems.length === 0 ? (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8 text-center">
                <ShoppingBag className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg sm:text-lg text-gray-600 mb-4">Your cart is empty.</p>
                <Link href="/coffee" className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm sm:text-base">
                  Browse Coffee
                </Link>
              </div>
            ) : loading ? (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-black" />
                  <span className="text-base sm:text-lg text-gray-600">Preparing secure payment…</span>
                </div>
              </div>
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                {/* pass shippingPence to CheckoutForm so server-side flow can use it if needed */}
                <CheckoutForm total={total} clientSecret={clientSecret} shippingPence={shippingPence} />
              </Elements>
            ) : showShortageModal ? (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 sm:p-8">
                <p className="text-base sm:text-lg text-yellow-800 mb-4">Some items in your cart are unavailable. Please review the details in the popup and update your cart.</p>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => { closeShortageModal(); openCart(); }} className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-50">Edit Cart</button>
                  <button onClick={() => closeShortageModal()} className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800">Close</button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8">
                <p className="text-base sm:text-lg text-red-600">Unable to initialize payment. Please try again later.</p>
              </div>
            )}

            {/* Trust Badges */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-6">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="flex flex-col items-center">
                  <CreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2" />
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">Secure Payment</p>
                </div>
                <div className="flex flex-col items-center">
                  <Package className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2" />
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">Fast Delivery</p>
                </div>
                <div className="flex flex-col items-center">
                  <svg className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">Money Back</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shortage Modal */}
      {showShortageModal && shortages && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl mx-4 bg-white rounded-lg shadow-lg border p-6">
            <h3 className="text-lg font-semibold mb-3">Some items are unavailable</h3>
            <p className="text-sm text-gray-600 mb-4">One or more items in your cart are out of stock or have insufficient quantity. Please update your cart before continuing.</p>

            <div className="space-y-3 mb-4">
              {shortages.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray-600">Requested: {s.requested} • Available: {s.available}</div>
                  </div>
                  <div className="text-xs text-gray-500">{s.source}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button type="button" onClick={() => { closeShortageModal(); openCart(); }} className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-50">Edit Cart</button>
              <button type="button" onClick={() => { closeShortageModal(); }} className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800">Close & Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}