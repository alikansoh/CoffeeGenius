'use client';

import React, { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Package, Truck, Mail, Home, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import useCart, { CartItem } from '@/app/store/CartStore';
import Image from 'next/image';
import { getCloudinaryUrl } from '@/app/utils/cloudinary';

export default function CheckoutSuccessPage(): JSX.Element {
  const [orderItems, setOrderItems] = useState<CartItem[]>([]);
  const [orderTotal, setOrderTotal] = useState<number>(0);

  // Simple delivery text — we intentionally keep a short friendly message
  const deliveryText = 'Delivery: your items will arrive within 3–5 business days.';

  useEffect(() => {
    // Pull items and total from the cart store (before it was cleared)
    const items = useCart.getState().items;
    const total = useCart.getState().getTotalPrice();

    setTimeout(() => {
      setOrderItems(items);
      setOrderTotal(total);
    }, 0);

    // Confetti animation
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const intervalId = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        window.clearInterval(intervalId);
        return;
      }

      const particleCount = Math.floor(50 * (timeLeft / duration));

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const getImageSrc = (idOrUrl?: string, preset: 'thumbnail' | 'medium' = 'thumbnail'): string => {
    if (!idOrUrl) return '/test.webp';
    if (typeof idOrUrl === 'string' && (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://') || idOrUrl.startsWith('/'))) {
      return idOrUrl;
    }
    return getCloudinaryUrl(String(idOrUrl), preset);
  };

  return (
    <div className="min-h-screen bg-white py-12 mt-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-black rounded-full mb-4 animate-bounce-in">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-4xl font-bold text-black mb-2">Order Confirmed! 🎉</h1>

          <p className="text-lg text-gray-600 mb-4">Thank you for your purchase — your order has been placed.</p>

          <div className="inline-block bg-gray-100 border-2 border-gray-200 px-6 py-3 rounded-lg">
            <p className="text-sm text-gray-600">Delivery</p>
            <p className="text-xl font-bold text-black">{deliveryText}</p>
          </div>
        </div>

        {/* Order Status Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center hover:border-black transition-all">
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-black mb-1">Confirmation Sent</h3>
            <p className="text-sm text-gray-600">Check your email for order details</p>
          </div>

          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center hover:border-black transition-all">
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-black mb-1">Processing Order</h3>
            <p className="text-sm text-gray-600">We&apos;re preparing your items</p>
          </div>

          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center hover:border-black transition-all">
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mx-auto mb-3">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-black mb-1">In Transit</h3>
            <p className="text-sm text-gray-600 font-medium">Your items are on their way</p>
          </div>
        </div>

        {/* Order Items */}
        {orderItems.length > 0 && (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-black mb-4">Your Order</h2>
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="flex gap-4 items-center pb-3 border-b border-gray-200 last:border-0">
                  <div className="w-16 h-16 bg-white border-2 border-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                    {item.img ? (
                      <Image
                        src={getImageSrc(item.img, 'thumbnail')}
                        alt={item.name}
                        width={64}
                        height={64}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-black">{item.name}</h3>
                    <p className="text-sm text-gray-500">
                      {item.size ? `${item.size}${item.grind ? ` • ${item.grind}` : ''}` : item.metadata?.brand}
                    </p>
                    <p className="text-xs text-gray-400">Quantity: {item.quantity}</p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-black">£{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))}

              <div className="pt-3 flex justify-between items-center">
                <span className="text-lg font-bold text-black">Total</span>
                <span className="text-2xl font-bold text-black">£{orderTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* What's Next Section */}
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-black mb-6">What happens next?</h2>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-bold">1</div>
              </div>
              <div>
                <h3 className="font-semibold text-black mb-1">Order Confirmation</h3>
                <p className="text-gray-600 text-sm">
                  You&apos;ll receive an email confirmation with your order details and receipt within the next few minutes.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-bold">2</div>
              </div>
              <div>
                <h3 className="font-semibold text-black mb-1">Order Processing</h3>
                <p className="text-gray-600 text-sm">Our team will carefully prepare and package your coffee. This typically takes 1-2 business days.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-bold">3</div>
              </div>
              <div>
                <h3 className="font-semibold text-black mb-1">Shipping and Tracking</h3>
                <p className="text-gray-600 text-sm">Once shipped, you&apos;ll receive a tracking number to monitor your delivery every step of the way.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-bold">4</div>
              </div>
              <div>
                <h3 className="font-semibold text-black mb-1">Enjoy Your Coffee!</h3>
                <p className="text-gray-600 text-sm">Your fresh coffee will arrive at your doorstep. Time to brew and enjoy! ☕</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-4 bg-gray-100 border-2 border-gray-200 text-black font-semibold rounded-lg hover:bg-gray-200 transition-all"
          >
            <Home className="w-5 h-5 mr-2" />
            Back to Home
          </Link>

          <Link
            href="/coffee"
            className="inline-flex items-center justify-center px-8 py-4 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-all"
          >
            Continue Shopping
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bounce-in {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-bounce-in {
          animation: bounce-in 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}