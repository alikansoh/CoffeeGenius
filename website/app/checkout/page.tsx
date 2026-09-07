"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import CheckoutForm from "@/app/Components/CheckoutForm";
import useCart from "@/app/store/CartStore";
import Link from "next/link";
import { ShoppingBag, Package, CreditCard, Tag, X, Sparkles } from "lucide-react";
import Image from "next/image";
import { getCloudinaryUrl } from "@/app/utils/cloudinary";
import { computeShippingPence } from "@/lib/shipping";
import { penceToPounds } from "@/lib/currency";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

type Shortage = {
  id: string;
  name: string;
  requested: number;
  available: number;
  source: string;
};

type AppliedCoupon = {
  code: string;
  name: string;
  discountAmount: number; // pounds
  couponId: string;
  isAutomatic?: boolean;
};

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const openCart = useCart((s) => s.open);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isInitialLoadRef = useRef(true);

  const [mounted, setMounted] = useState(false);

  const [shortages, setShortages] = useState<Shortage[] | null>(null);
  const [showShortageModal, setShowShortageModal] = useState<boolean>(false);

  const [deliveryPence, setDeliveryPence] = useState<number>(499);
  const [thresholdPence, setThresholdPence] = useState<number>(3000);
  const [freeEnabled, setFreeEnabled] = useState<boolean>(true);

  const [email, setEmail] = useState<string>("");

  const [debouncedEmail, setDebouncedEmail] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedEmail(email);
    }, 600);
    return () => clearTimeout(t);
  }, [email]);

  const [couponCode, setCouponCode] = useState<string>("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [autoCoupon, setAutoCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const json = await res.json();
        if (!active) return;
        setDeliveryPence(Number(json.deliveryPricePence ?? 499));
        setThresholdPence(Number(json.freeDeliveryThresholdPence ?? 3000));
        setFreeEnabled(Boolean(json.freeDeliveryEnabled ?? true));
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const visibleItems = mounted ? items : [];

  // The basket can hold any number of subscriptions (each variant+frequency combo is its own
  // line — see CoffeeClient) alongside normal one-off items. Every subscription is its own
  // Stripe charge (a subscription can't share a payment with a one-off charge or another
  // subscription), so split them here: each subscription gets its own recurring Price,
  // everything else goes through the normal order/coupon/shipping path exactly as before.
  //
  // Memoized on `items` (the store's actual array, stable unless the cart changes) rather than
  // `visibleItems` — .filter() always returns a new array reference, and several effects below
  // depend on these arrays, so recomputing them on every render (not just when the cart
  // actually changes) would retrigger those effects every render — an infinite fetch loop.
  const subscriptionItems = useMemo(
    () => (mounted ? items.filter((it) => it.isSubscription) : []),
    [mounted, items]
  );
  const hasSubscription = subscriptionItems.length > 0;
  const oneTimeItems = useMemo(
    () => (mounted ? items.filter((it) => !it.isSubscription) : []),
    [mounted, items]
  );
  const hasOneTimeItems = oneTimeItems.length > 0;
  // True only when there's nothing BUT a subscription — used to hide/skip the normal
  // order UI (coupon box, shipping line) rather than "any subscription present".

  const subtotal = mounted
    ? oneTimeItems.reduce((sum, it) => sum + it.price * it.quantity, 0)
    : 0;

  const activeCoupon = coupon || autoCoupon;
  const discountPounds = activeCoupon?.discountAmount ?? 0;
  const subtotalAfterDiscount = Math.max(0, subtotal - discountPounds);

  // Sum of every subscription's own NORMAL (non-intro) per-cycle amount — used, combined with
  // the one-off subtotal below, to decide free delivery on the very first charge of each. Kept
  // in sync with the same "normal price" convention used server-side in
  // /api/subscriptions/create, so this always agrees with what Stripe actually charges.
  const subscriptionNormalAmount = subscriptionItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

  // Free delivery is decided on the COMBINED total of the one-off order and every subscription's
  // normal amount together — not evaluated separately — per the store's delivery rules. A large
  // enough combined order waives delivery on both the one-off order and every subscription's
  // first charge; each subscription's later renewals are then judged on their own amount alone
  // (see /api/subscriptions/create).
  const combinedOrderAmountPence = Math.round((subtotalAfterDiscount + subscriptionNormalAmount) * 100);

  const shippingPence = !hasOneTimeItems
    ? 0
    : computeShippingPence(combinedOrderAmountPence, {
        deliveryPricePence: deliveryPence,
        freeDeliveryThresholdPence: thresholdPence,
        freeDeliveryEnabled: freeEnabled,
      });
  const shipping = penceToPounds(shippingPence);

  const total = mounted
    ? Math.round((subtotalAfterDiscount + shipping) * 100) / 100
    : 0;

  const [couponCartSignature, setCouponCartSignature] = useState<string | null>(
    null
  );

  // Remove coupons when cart changes
  useEffect(() => {
    if (!autoCoupon && !coupon) return;
    const signature = visibleItems
      .map((it) => `${it.id}:${it.quantity}`)
      .sort()
      .join("|");

    if (couponCartSignature === null) {
      setCouponCartSignature(signature);
      return;
    }
    if (signature !== couponCartSignature) {
      setCoupon(null);
      setAutoCoupon(null);
      setCouponCode("");
      setCouponError(
        "Your cart changed, so the coupon was removed. Please re-apply it."
      );
      setCouponCartSignature(signature);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  // Auto-apply automatic coupons — only considers the one-off items, never the subscription
  useEffect(() => {
    if (!mounted) return;
    if (!hasOneTimeItems) return;

    async function fetchAutomaticCoupon() {
      try {
        const res = await fetch("/api/coupons/automatic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: debouncedEmail || undefined,
            items: oneTimeItems.map((it) => ({
              id: it.id,
              name: it.name,
              price: it.price,
              quantity: it.quantity,
              productType: it.productType || "coffee",
            })),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.automaticCoupon) {
          setAutoCoupon(null);
          return;
        }

        setAutoCoupon({
          code: data.automaticCoupon.code,
          name: data.automaticCoupon.name,
          discountAmount: data.automaticCoupon.discountAmount,
          couponId: data.automaticCoupon.couponId,
          isAutomatic: true,
        });
        const signature = oneTimeItems
          .map((it) => `${it.id}:${it.quantity}`)
          .sort()
          .join("|");
        setCouponCartSignature(signature);
      } catch (err) {
        console.error("Failed to fetch automatic coupon", err);
      }
    }

    fetchAutomaticCoupon();
  }, [mounted, oneTimeItems, hasOneTimeItems, debouncedEmail]);

  // One-off items: recreate the PaymentIntent whenever cart contents, shipping, email, or
  // coupon change — cheap and safe to call repeatedly, Stripe just abandons unconfirmed ones.
  useEffect(() => {
    if (!mounted) return;
    if (!hasOneTimeItems) return;

    async function createIntent() {
      const isInitial = isInitialLoadRef.current;
      if (isInitial) setLoading(true);

      try {
        const res = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: oneTimeItems,
            shippingPence,
            email: debouncedEmail || undefined,
            couponCode: activeCoupon?.code,
          }),
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
        console.error("createIntent failed", err);
        setClientSecret(null);
      } finally {
        if (isInitial) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    }

    createIntent();
  }, [mounted, oneTimeItems, hasOneTimeItems, shippingPence, debouncedEmail, activeCoupon?.code]);

  // Subscriptions: each cart line (one per variant+frequency combo) gets its own Stripe
  // Subscription, created exactly once per (item id, coupon) — unlike the one-off flow this
  // must NOT re-fire as the customer types their email, or it would spin up a fresh Stripe
  // Subscription (and abandon the last one) on every keystroke. Email/address are attached
  // later via /api/subscriptions/save-shipping, right before the customer confirms payment.
  type SubscriptionPricing = {
    clientSecret: string | null;
    introOffer: { percentOff: number; cycles: number } | null;
    chargePrice: number | null; // per-unit price actually charged today (intro price if active)
  };
  const subscriptionIntentKeysRef = useRef<Record<string, string>>({});
  const [subResults, setSubResults] = useState<Record<string, SubscriptionPricing>>({});
  // The coupon code currently applied to subscriptions (separate from `coupon`, which tracks
  // the code applied to the one-off items) — re-typing the same code re-fetches pricing.
  const [subscriptionCouponCode, setSubscriptionCouponCode] = useState<string | null>(null);

  const createSubscriptionIntent = async (item: (typeof visibleItems)[number], couponCodeToApply?: string | null) => {
    const isInitial = isInitialLoadRef.current;
    // Only hold up the whole page's spinner on the subscription call(s) if there are no
    // one-off items also being priced — otherwise the order effect above already covers it.
    if (isInitial && !hasOneTimeItems) setLoading(true);
    subscriptionIntentKeysRef.current[item.id] = `${item.id}:${couponCodeToApply || ""}`;

    try {
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: item.variantId || item.id,
          frequencyWeeks: item.frequencyWeeks,
          quantity: item.quantity,
          couponCode: couponCodeToApply || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setSubResults((prev) => ({
          ...prev,
          [item.id]: {
            clientSecret: data.clientSecret,
            introOffer: data.introOffer
              ? { percentOff: data.introOffer.percentOff, cycles: data.introOffer.cycles }
              : null,
            chargePrice: typeof data.subscriptionPrice === "number" ? data.subscriptionPrice : null,
          },
        }));
        return data;
      } else {
        delete subscriptionIntentKeysRef.current[item.id];
        setSubResults((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        return null;
      }
    } catch (err) {
      console.error("createSubscriptionIntent failed", err);
      delete subscriptionIntentKeysRef.current[item.id];
      setSubResults((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return null;
    } finally {
      if (isInitial && !hasOneTimeItems) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (!mounted) return;
    subscriptionItems.forEach((item) => {
      const key = `${item.id}:${subscriptionCouponCode || ""}`;
      if (subscriptionIntentKeysRef.current[item.id] === key) return;
      createSubscriptionIntent(item, subscriptionCouponCode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, subscriptionItems, hasOneTimeItems, subscriptionCouponCode]);

  // What each subscription actually charges today (intro price while active, else normal) —
  // subscriptions never carry a delivery charge, so no shipping component here.
  const subscriptionChargeAmount = subscriptionItems.reduce((sum, it) => {
    const chargePrice = subResults[it.id]?.chargePrice;
    return sum + (chargePrice ?? it.price) * it.quantity;
  }, 0);
  // Total saved today across all subscriptions with an active intro offer/coupon.
  const introDiscountTotal = subscriptionItems.reduce((sum, it) => {
    const result = subResults[it.id];
    if (result?.introOffer && result.chargePrice !== null) {
      return sum + Math.max(0, it.price - result.chargePrice) * it.quantity;
    }
    return sum;
  }, 0);
  const displaySubtotal = subtotal + subscriptionNormalAmount;
  const displayTotal = total + subscriptionChargeAmount;

  const getImageSrc = (
    idOrUrl?: string,
    preset: "thumbnail" | "medium" = "thumbnail"
  ) => {
    if (!idOrUrl) return "/test.webp";
    if (
      idOrUrl.startsWith("http://") ||
      idOrUrl.startsWith("https://") ||
      idOrUrl.startsWith("/")
    ) {
      return idOrUrl;
    }
    return getCloudinaryUrl(idOrUrl, preset);
  };

  const closeShortageModal = () => {
    setShowShortageModal(false);
    setShortages(null);
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    const code = couponCode.trim();

    setCouponLoading(true);
    setCouponError(null);

    let orderApplied = false;
    let subscriptionApplied = false;
    let firstErrorMessage: string | null = null;

    if (hasOneTimeItems) {
      try {
        const res = await fetch("/api/coupons/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            email,
            items: oneTimeItems.map((it) => ({
              id: it.id,
              name: it.name,
              price: it.price,
              quantity: it.quantity,
              productType: it.productType || "coffee",
            })),
          }),
        });

        const json = await res.json();
        const result = json.result;

        if (res.ok && result?.valid && result.discountAmount > 0) {
          setCoupon({
            code: code.toUpperCase(),
            name: result.name,
            discountAmount: result.discountAmount,
            couponId: result.couponId,
            isAutomatic: false,
          });
          orderApplied = true;
          const signature = oneTimeItems
            .map((it) => `${it.id}:${it.quantity}`)
            .sort()
            .join("|");
          setCouponCartSignature(signature);
        } else {
          firstErrorMessage = (res.ok ? result?.message : json.error) || "Coupon cannot be applied";
        }
      } catch (err) {
        firstErrorMessage = err instanceof Error ? err.message : "Failed to apply coupon";
      }
    }

    if (hasSubscription) {
      const results = await Promise.all(
        subscriptionItems.map((item) => createSubscriptionIntent(item, code))
      );
      if (results.some((data) => data?.introOffer)) {
        subscriptionApplied = true;
        setSubscriptionCouponCode(code);
      } else if (!firstErrorMessage) {
        firstErrorMessage = "Coupon doesn't apply to the subscription item(s)";
      }
    }

    if (orderApplied || subscriptionApplied) {
      setCouponCode("");
      setCouponError(null);
    } else {
      setCouponError(firstErrorMessage || "Coupon cannot be applied");
    }

    setCouponLoading(false);
  };

  // Only manual coupons can be removed. Automatic store offers stay applied
  // for as long as the cart qualifies for them.
  const removeCoupon = () => {
    setCoupon(null);
    setCouponCode("");
    setCouponError(null);
    if (subscriptionCouponCode) {
      setSubscriptionCouponCode(null);
    }
  };

  return (
    <div className="min-h-screen bg-white py-4 sm:py-6 lg:py-8 px-4 mt-10 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-3xl lg:text-4xl font-bold text-black mb-2">
            Checkout
          </h1>
          <p className="text-base sm:text-base text-gray-600">
            Complete your order securely
          </p>
        </div>

        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <div className="flex items-center justify-center space-x-2 sm:space-x-4 min-w-max px-4">
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                1
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-black whitespace-nowrap">
                Cart
              </span>
            </div>
            <div className="w-8 sm:w-16 h-0.5 bg-black" />
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                2
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-black whitespace-nowrap">
                Checkout
              </span>
            </div>
            <div className="w-8 sm:w-16 h-0.5 bg-gray-300" />
            <div className="flex items-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center font-semibold text-base sm:text-base">
                3
              </div>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base font-medium text-gray-500 whitespace-nowrap">
                Complete
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <aside className="order-1 lg:order-2 lg:col-span-1">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6 lg:sticky lg:top-4">
              <h2 className="text-xl sm:text-xl font-bold mb-4 flex items-center text-black">
                <ShoppingBag className="w-5 h-5 sm:w-5 sm:h-5 mr-2" />
                Order Summary
              </h2>

              <div className="max-h-48 sm:max-h-64 overflow-y-auto mb-4 space-y-3">
                {visibleItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex gap-2 sm:gap-3 pb-3 border-b border-gray-200"
                  >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white border border-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                      {it.img ? (
                        <Image
                          src={getImageSrc(it.img, "thumbnail")}
                          alt={it.name}
                          width={64}
                          height={64}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm sm:text-base text-black truncate">
                        {it.name}
                      </h3>
                      <p className="text-sm sm:text-sm text-gray-500 mt-1">
                        {it.size
                          ? `${it.size}${it.grind ? ` / ${it.grind}` : ""}${
                              it.roastType ? ` / ${it.roastType}` : ""
                            }`
                          : it.metadata?.brand}{" "}
                      </p>
                      {it.isSubscription && (
                        <p className="text-sm sm:text-sm text-black font-medium mt-0.5">
                          Delivery every {it.frequencyWeeks} week{(it.frequencyWeeks || 1) > 1 ? "s" : ""}
                          {it.subscriptionDiscountPercent
                            ? ` with ${it.subscriptionDiscountPercent}% discount`
                            : ""}
                          {subResults[it.id]?.introOffer && (
                            <span className="block text-green-700 font-normal">
                              <Sparkles className="w-3 h-3 inline -mt-0.5 mr-1" />
                              {subResults[it.id]!.introOffer!.percentOff}% off first{" "}
                              {subResults[it.id]!.introOffer!.cycles}
                              {subResults[it.id]!.introOffer!.cycles > 1 ? " deliveries" : " delivery"}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-sm sm:text-sm text-gray-400 mt-1">
                        Qty: {it.quantity}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {it.isSubscription && subResults[it.id]?.introOffer && subResults[it.id]?.chargePrice != null ? (
                        <>
                          <p className="font-semibold text-sm sm:text-base text-black">
                            £{(subResults[it.id]!.chargePrice! * it.quantity).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400 line-through">
                            £{(it.price * it.quantity).toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <p className="font-semibold text-sm sm:text-base text-black">
                          £{(it.price * it.quantity).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {!mounted && visibleItems.length === 0 && (
                  <div className="text-sm text-gray-500">Loading items…</div>
                )}
                {mounted && visibleItems.length === 0 && (
                  <div className="text-sm text-gray-500">
                    No items in your cart.
                  </div>
                )}
              </div>

              {hasSubscription && (
                <div className="py-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    {subscriptionItems.length > 1
                      ? "Your subscriptions are"
                      : "Your subscription is"}{" "}
                    billed separately from any one-off items below (each on its own delivery
                    schedule), and you can cancel anytime from the link in your confirmation
                    email. A coupon code below can discount both.
                  </p>
                </div>
              )}

              <div className="py-3 border-t border-gray-200">
                <div className="flex items-center text-sm font-medium text-black mb-2">
                  <Tag className="w-4 h-4 mr-2" />
                  Coupon
                </div>

                {coupon && (
                  <div className="flex items-center justify-between bg-black/5 rounded-lg px-3 py-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-black">
                          {coupon.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Code: {coupon.code}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-black">
                        -£{coupon.discountAmount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        aria-label="Remove coupon"
                        className="text-gray-500 hover:text-black"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {!coupon && autoCoupon && (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-black">
                          {autoCoupon.name}
                        </span>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full font-medium">
                          <Sparkles className="w-3 h-3" />
                          Offer applied
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Automatically applied to your order
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-black">
                      -£{autoCoupon.discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyCoupon();
                      }
                    }}
                    placeholder={
                      autoCoupon
                        ? "Try another coupon code"
                        : "Coupon code"
                    }
                    className="flex-1 px-3 py-2 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black uppercase"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {couponLoading ? "…" : "Apply"}
                  </button>
                </div>
                {couponError && (
                  <div className="text-xs text-red-600 mt-1">
                    {couponError}
                  </div>
                )}
                {autoCoupon && !coupon && (
                  <p className="text-xs text-gray-500 mt-1">
                    Apply a manual code to replace this offer
                  </p>
                )}
              </div>

              <div className="space-y-2 sm:space-y-3 py-3 sm:py-4 border-t border-gray-200">
                <div className="flex justify-between text-sm sm:text-base">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-black">
                    £{displaySubtotal.toFixed(2)}
                  </span>
                </div>
                {activeCoupon && (
                  <div className="flex justify-between text-sm sm:text-base">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-black">
                      -£{activeCoupon.discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                {hasSubscription && introDiscountTotal > 0 && (
                  <div className="flex justify-between text-sm sm:text-base">
                    <span className="text-gray-600">
                      {subscriptionCouponCode ? "Coupon" : "Intro offer"} on subscription
                      {subscriptionItems.length > 1 ? "s" : ""}
                    </span>
                    <span className="font-medium text-black">
                      -£{introDiscountTotal.toFixed(2)}
                    </span>
                  </div>
                )}
                {hasOneTimeItems && (
                  <div className="flex justify-between text-sm sm:text-base">
                    <span className="text-gray-600">Shipping</span>
                    <span className="font-medium text-black">
                      {shippingPence === 0 ? (
                        <span className="text-black">FREE</span>
                      ) : (
                        `£${shipping.toFixed(2)}`
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 sm:pt-4 border-t-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="text-base sm:text-lg font-bold text-black">
                    Total due today
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-black">
                    £{displayTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {hasSubscription && (
                <div className="pt-3 sm:pt-4 border-t border-gray-200 space-y-2">
                  <span className="text-sm font-medium text-gray-600 block">Recurring subtotal</span>
                  {subscriptionItems.map((it) => {
                    const result = subResults[it.id];
                    return (
                      <div key={it.id}>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-xs text-gray-500 truncate">{it.name}</span>
                          <span className="text-sm sm:text-base font-semibold text-black whitespace-nowrap">
                            £{(it.price * it.quantity).toFixed(2)} every {it.frequencyWeeks} week
                            {(it.frequencyWeeks || 1) > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-xs text-gray-500">Delivery</span>
                          <span className="text-xs font-medium text-black">FREE</span>
                        </div>
                        {result?.introOffer && (
                          <p className="text-xs text-gray-500">
                            Starting after the first {result.introOffer.cycles}
                            {result.introOffer.cycles > 1 ? " deliveries" : " delivery"} at the discounted intro
                            price.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {mounted && hasOneTimeItems && shippingPence > 0 && (
                <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-black text-white rounded-lg text-center">
                  <p className="text-sm sm:text-base">
                    Add{" "}
                    <strong>
                      £
                      {Math.max(
                        0,
                        penceToPounds(thresholdPence) - penceToPounds(combinedOrderAmountPence)
                      ).toFixed(2)}
                    </strong>{" "}
                    more for free shipping!
                  </p>
                </div>
              )}
            </div>
          </aside>

          <div className="order-2 lg:order-1 lg:col-span-2 space-y-4 sm:space-y-6">
            {!mounted || visibleItems.length === 0 ? (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8 text-center">
                <ShoppingBag className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg sm:text-lg text-gray-600 mb-4">
                  Your cart is empty.
                </p>
                <Link
                  href="/coffee"
                  className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm sm:text-base"
                >
                  Browse Coffee
                </Link>
              </div>
            ) : loading ? (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-black" />
                  <span className="text-base sm:text-lg text-gray-600">
                    Preparing secure payment…
                  </span>
                </div>
              </div>
            ) : !(hasOneTimeItems ? !!clientSecret : true) ||
              !(hasSubscription ? subscriptionItems.every((it) => !!subResults[it.id]?.clientSecret) : true) ? (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-black" />
                  <span className="text-base sm:text-lg text-gray-600">
                    Preparing secure payment…
                  </span>
                </div>
              </div>
            ) : clientSecret || subscriptionItems.some((it) => subResults[it.id]?.clientSecret) ? (
              (() => {
                const subscriptionClientSecrets = subscriptionItems
                  .map((it) => subResults[it.id]?.clientSecret)
                  .filter((s): s is string => !!s);
                const primaryClientSecret = clientSecret || subscriptionClientSecrets[0] || null;
                // If the order is primary, every subscription is a secondary charge; otherwise
                // the first subscription IS the primary charge, and the rest are secondary.
                const secondaryClientSecrets = hasOneTimeItems
                  ? subscriptionClientSecrets
                  : subscriptionClientSecrets.slice(1);
                if (!primaryClientSecret) return null;

                const subscriptionDescriptions = subscriptionItems.map((it) => {
                  const result = subResults[it.id];
                  const chargePrice = result?.chargePrice ?? it.price;
                  return `${it.name} — Delivery every ${it.frequencyWeeks} week${
                    (it.frequencyWeeks || 1) > 1 ? "s" : ""
                  }${
                    it.subscriptionDiscountPercent ? ` with ${it.subscriptionDiscountPercent}% discount` : ""
                  } (£${(chargePrice * it.quantity).toFixed(2)}/${
                    it.frequencyWeeks === 1 ? "week" : `${it.frequencyWeeks} weeks`
                  }) — free delivery${
                    result?.introOffer
                      ? ` — ${result.introOffer.percentOff}% off your first ${result.introOffer.cycles}${
                          result.introOffer.cycles > 1 ? " deliveries" : " delivery"
                        }`
                      : ""
                  }`;
                });

                return (
                  <Elements stripe={stripePromise} options={{ clientSecret: primaryClientSecret }}>
                    <CheckoutForm
                      total={displayTotal}
                      clientSecret={primaryClientSecret}
                      shippingPence={shippingPence}
                      email={email}
                      onEmailChange={setEmail}
                      isSubscriptionCheckout={!hasOneTimeItems && hasSubscription}
                      secondaryClientSecrets={secondaryClientSecrets.length ? secondaryClientSecrets : undefined}
                      subscriptionDescriptions={hasSubscription ? subscriptionDescriptions : undefined}
                    />
                  </Elements>
                );
              })()
            ) : showShortageModal ? (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 sm:p-8">
                <p className="text-base sm:text-lg text-yellow-800 mb-4">
                  Some items in your cart are unavailable. Please review the
                  details in the popup and update your cart.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      closeShortageModal();
                      openCart();
                    }}
                    className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-50"
                  >
                    Edit Cart
                  </button>
                  <button
                    onClick={() => closeShortageModal()}
                    className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 sm:p-8">
                <p className="text-base sm:text-lg text-red-600">
                  Unable to initialize payment. Please try again later.
                </p>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-6">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="flex flex-col items-center">
                  <CreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2" />
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">
                    Secure Payment
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <Package className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2" />
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">
                    Fast Delivery
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <svg
                    className="w-7 h-7 sm:w-8 sm:h-8 text-black mb-1 sm:mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <p className="text-sm sm:text-sm text-gray-600 font-medium">
                    Money Back
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showShortageModal && shortages && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl mx-4 bg-white rounded-lg shadow-lg border p-6">
            <h3 className="text-lg font-semibold mb-3">
              Some items are unavailable
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              One or more items in your cart are out of stock or have
              insufficient quantity. Please update your cart before continuing.
            </p>

            <div className="space-y-3 mb-4">
              {shortages.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray-600">
                      Requested: {s.requested} • Available: {s.available}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">{s.source}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  closeShortageModal();
                  openCart();
                }}
                className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-50"
              >
                Edit Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  closeShortageModal();
                }}
                className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800"
              >
                Close & Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}