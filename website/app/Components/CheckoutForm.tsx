'use client';

import React, { useState } from "react";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import useCart from "@/app/store/CartStore";
import { useRouter } from "next/navigation";
import { User, Mail, Phone, MapPin, Lock } from "lucide-react";

type Props = {
  total: number;
  clientSecret: string;
};

export default function CheckoutForm({ total, clientSecret }:  Props) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const clearCart = useCart((s) => s.clearCart);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("GB");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError("Stripe is not loaded yet.");
      return;
    }

    if (!email || !firstName || !lastName || !address || ! city || !postcode || !phone) {
      setError("Please fill in all required fields.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found.");
      return;
    }

    setProcessing(true);

    try {
      const { error: confirmError, paymentIntent } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${firstName} ${lastName}`,
              email: email,
              phone: phone,
              address: {
                line1: address,
                city: city,
                postal_code: postcode,
                country: country,
              },
            },
          },
        });

      if (confirmError) {
        setError(confirmError.message || "Payment failed.");
        setProcessing(false);
        return;
      }

      if (paymentIntent?. status === "succeeded") {
        await fetch("/api/complete-order", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            shippingAddress: {
              firstName,
              lastName,
              email,
              phone,
              address,
              city,
              postcode,
              country,
            },
          }),
        }).catch(() => {});

        clearCart();
        router.push("/checkout/success");
      } else {
        setError("Payment not completed. Try another card.");
      }
    } catch (err:  unknown) {
      setError((err as Error)?.message || "Unexpected error.");
    } finally {
      setProcessing(false);
    }
  };

  const cardStyle = {
    style: {
      base: {
        fontSize: "16px",
        color: "#000000",
        fontFamily: '"Inter", sans-serif',
        "::placeholder": { color: "#9CA3AF" },
      },
      invalid:  { color: "#dc2626" },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      {/* Contact Information */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm: p-6">
        <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
          <User className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Contact Information
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="sm:col-span-2 md:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
              Email <span className="text-black">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm: h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="sm:col-span-2 md:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
              Phone Number <span className="text-black">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm: py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm: gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
                First Name <span className="text-black">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm: text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus: ring-black focus:border-black transition-all"
                placeholder="John"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
                Last Name <span className="text-black">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm: text-sm font-medium text-black mb-1 sm:mb-2">
              Street Address <span className="text-black">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target. value)}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              placeholder="123 High Street"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm: mb-2">
                City <span className="text-black">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full px-3 sm: px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus: border-black transition-all"
                placeholder="London"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
                Postcode <span className="text-black">*</span>
              </label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="SW1A 1AA"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
                Country <span className="text-black">*</span>
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm: text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus: ring-black focus:border-black transition-all"
              >
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

      {/* Payment Information */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
          <Lock className="w-4 h-4 sm:w-5 sm: h-5 mr-2" />
          Payment Information
        </h2>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-black mb-1 sm:mb-2">
            Card Details <span className="text-black">*</span>
          </label>
          <div className="p-3 sm:p-4 border-2 border-gray-300 rounded-lg focus-within:border-black focus-within:ring-2 focus-within:ring-black transition-all bg-white">
            <CardElement options={cardStyle} />
          </div>
          <p className="mt-2 text-[10px] sm:text-xs text-gray-500 flex items-center">
            <Lock className="w-3 h-3 mr-1" />
            Your payment information is encrypted and secure
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-red-800 flex items-start sm:items-center">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0 mt-0.5 sm:mt-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={! stripe || processing}
        className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-sm sm:text-base"
      >
        {processing ?  (
          <>
            <svg className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing…
          </>
        ) : (
          <>
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Complete Order • £{total. toFixed(2)}
          </>
        )}
      </button>

      <p className="text-center text-[10px] sm:text-xs text-gray-500 px-4">
        By completing your purchase you agree to our Terms of Service and Privacy Policy
      </p>
    </form>
  );
}