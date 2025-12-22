'use client';

import React, { JSX, useEffect, useMemo, useState } from 'react';
import {
  useStripe,
  useElements,
  CardElement,
  PaymentRequestButtonElement,
} from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import useCart from '@/app/store/CartStore';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, MapPin, Lock } from 'lucide-react';

type Props = {
  total: number; // GBP
  clientSecret: string;
};

type ShippingOption = {
  id: string;
  label: string;
  detail?: string;
  amount: number;
};

type ShippingAddress = {
  country?: string;
  city?: string | null;
  postalCode?: string | null;
  addressLine?: (string | null)[] | null;
  [key: string]: unknown;
};

type ShippingAddressChangeEvent = {
  shippingAddress?: ShippingAddress | null;
  updateWith: (options: {
    status: 'success' | 'failure' | 'invalid_shipping_address';
    shippingOptions?: ShippingOption[];
    total?: { label: string; amount: number };
    displayItems?: { label: string; amount: number }[];
  }) => void;
};

type PaymentMethodEvent = {
  paymentMethod: { id: string };
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  shippingAddress?: ShippingAddress | null;
  complete: (result: 'success' | 'fail' | 'unknown') => void;
};

export default function CheckoutForm({ total, clientSecret }: Props): JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const clearCart = useCart((s) => s.clearCart);

  // Contact / shipping
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('GB');

  // Payment request state
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUsePaymentRequest, setCanUsePaymentRequest] = useState(false);

  // UX state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build amount and label memoized
  const amountPence = useMemo(() => Math.round(total * 100), [total]); // pence

  // Create Payment Request when stripe is ready and clientSecret exists
  useEffect(() => {
    if (!stripe || !clientSecret) {
      setPaymentRequest(null);
      setCanUsePaymentRequest(false);
      return;
    }

    const pr = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: {
        label: 'Order total',
        amount: amountPence,
      },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
      requestShipping: true,
    });

    pr.canMakePayment()
      .then((result) => {
        if (result) {
          setPaymentRequest(pr);
          setCanUsePaymentRequest(true);
        } else {
          setPaymentRequest(null);
          setCanUsePaymentRequest(false);
        }
      })
      .catch(() => {
        setPaymentRequest(null);
        setCanUsePaymentRequest(false);
      });

    // no explicit cleanup required for Stripe's paymentRequest instance here
  }, [stripe, clientSecret, amountPence]);

  // Payment Request event handlers
  useEffect(() => {
    if (!paymentRequest || !stripe) return;

    const onShippingAddressChange = (ev: unknown) => {
      const event = ev as ShippingAddressChangeEvent;

      const shippingOptions: ShippingOption[] = [
        { id: 'standard', label: 'Standard (3-5 days)', detail: 'Free over £30', amount: 0 },
      ];

      event.updateWith({
        status: 'success',
        shippingOptions,
        total: {
          label: 'Order total',
          amount: amountPence,
        },
        displayItems: [],
      });
    };

    const onPaymentMethod = async (ev: unknown) => {
      const event = ev as PaymentMethodEvent;
      setError(null);

      try {
        const result = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: event.paymentMethod.id },
          { handleActions: false }
        );

        if (result.error) {
          event.complete('fail');
          setError(result.error.message ?? 'Payment failed.');
          return;
        }

        if (result.paymentIntent && result.paymentIntent.status === 'requires_action') {
          const next = await stripe.confirmCardPayment(clientSecret);
          if (next.error) {
            event.complete('fail');
            setError(next.error.message ?? 'Payment requires additional action.');
            return;
          }
        }

        event.complete('success');

        // Notify server to complete order (best-effort; failures shouldn't block UX)
        await fetch('/api/complete-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: result.paymentIntent?.id ?? null,
            shippingAddress: event.shippingAddress ?? null,
            payer: {
              name: event.payerName ?? `${firstName} ${lastName}`.trim(),
              email: event.payerEmail ?? email,
              phone: event.payerPhone ?? phone,
            },
          }),
        }).catch(() => { /* swallow errors */ });

        clearCart();
        router.push('/checkout/success');
      } catch (err) {
        try {
          event.complete && event.complete('fail');
        } catch {
          // ignore
        }
        const message = err instanceof Error ? err.message : String(err);
        setError(message || 'Unexpected error during wallet payment.');
      }
    };

    // Register handlers
    // Stripe's PaymentRequest exposes `on`. Types accept a function parameter; passing our functions is fine.
    paymentRequest.on('shippingaddresschange', onShippingAddressChange as unknown as (e: unknown) => void);
    paymentRequest.on('paymentmethod', onPaymentMethod as unknown as (e: unknown) => void);

    // Cleanup: there is no standard `off` on Stripe's PaymentRequest, so we won't attempt removal.
    // If you recreate paymentRequest instances frequently you may want to track and avoid duplicates.

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRequest, stripe, clientSecret, amountPence, firstName, lastName, email, phone, clearCart, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError('Stripe is not loaded yet.');
      return;
    }

    // Basic validation
    if (!email || !firstName || !lastName || !address || !city || !postcode || !phone) {
      setError('Please fill in all required fields.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found.');
      return;
    }

    setProcessing(true);

    try {
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${firstName} ${lastName}`.trim(),
            email: email || undefined,
            phone: phone || undefined,
            address: {
              line1: address,
              city,
              postal_code: postcode,
              country,
            },
          },
        },
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment failed.');
        setProcessing(false);
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        await fetch('/api/complete-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: result.paymentIntent.id,
            shippingAddress: { firstName, lastName, email, phone, address, city, postcode, country },
          }),
        }).catch(() => {});

        clearCart();
        router.push('/checkout/success');
      } else {
        setError('Payment not completed. Try another card.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const cardStyle = {
    style: {
      base: {
        fontSize: '16px',
        color: '#000000',
        fontFamily: '"Inter", sans-serif',
        '::placeholder': { color: '#9CA3AF' },
      },
      invalid: { color: '#dc2626' },
    },
  };

  return (
    <form onSubmit={handleSubmit} method="POST" autoComplete="on" noValidate className="space-y-4 sm:space-y-6">
      {/* Wallet button (Apple Pay / Google Pay) - show only when available */}
      {canUsePaymentRequest && paymentRequest && (
        <div className="mb-2">
          <PaymentRequestButtonElement
            options={{
              paymentRequest,
              style: {
                paymentRequestButton: {
                  type: 'default',
                  theme: 'dark',
                  height: '48px',
                },
              },
            }}
          />
          <div className="text-xs text-gray-500 mt-2">Pay with Apple Pay / Google Pay</div>
        </div>
      )}

      {/* Contact */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
          <User className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Contact Information
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
              Email <span className="text-black">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
              Phone Number <span className="text-black">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="+44 7700 900000"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Shipping Address
        </h2>

        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">First Name <span className="text-black">*</span></label>
              <input name="given-name" autoComplete="given-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all" placeholder="John" />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">Last Name <span className="text-black">*</span></label>
              <input name="family-name" autoComplete="family-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all" placeholder="Doe" />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">Street Address <span className="text-black">*</span></label>
            <input name="address-line1" autoComplete="address-line1" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all" placeholder="123 High Street" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">City <span className="text-black">*</span></label>
              <input name="address-level2" autoComplete="address-level2" type="text" value={city} onChange={(e) => setCity(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all" placeholder="London" />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">Postcode <span className="text-black">*</span></label>
              <input name="postal-code" autoComplete="postal-code" type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all" placeholder="SW1A 1AA" />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">Country <span className="text-black">*</span></label>
              <select name="country" autoComplete="country" value={country} onChange={(e) => setCountry(e.target.value)} required className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all">
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
                <option value="ES">Spain</option>
                <option value="IT">Italy</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
          <Lock className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Payment Information
        </h2>

        <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">Card Details</label>
        <div className="p-3 sm:p-4 border-2 border-gray-300 rounded-lg bg-white">
          <CardElement options={cardStyle} />
        </div>
        <p className="mt-2 text-[10px] sm:text-xs text-gray-500 flex items-center"><Lock className="w-3 h-3 mr-1" />Your payment information is encrypted and secure</p>
      </div>

      {error && <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4 text-red-800">{error}</div>}

      <button type="submit" disabled={!stripe || processing} className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-sm sm:text-base">
        {processing ? (<svg className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle></svg>) : (<Lock className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />)}
        {processing ? 'Processing…' : `Complete Order • £${total.toFixed(2)}`}
      </button>

      <p className="text-center text-[10px] sm:text-xs text-gray-500 px-4">By completing your purchase you agree to our Terms of Service and Privacy Policy</p>
    </form>
  );
}