'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  total: number;
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

/*
  Minimal local typing for the new Places module returned by google.maps.importLibrary('places').
  This avoids using `any` while covering the members we need.
*/
type PlacesModule = {
  AutocompleteSessionToken: new () => google.maps.places.AutocompleteSessionToken;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      includedRegionCodes?: string[];
      // sessionToken supported in the new API
      sessionToken?: google.maps.places.AutocompleteSessionToken;
    }) => Promise<{
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          // description or other fields may exist
        };
      }>;
    }>;
  };
  Place: new (opts: { id: string }) => {
    fetchFields: (opts: {
      fields: string[];
      // sessionToken supported in the new API
      sessionToken?: google.maps.places.AutocompleteSessionToken;
    }) => Promise<void>;
    // After fetchFields resolves, these will be populated
    addressComponents?: Array<{ types?: string[]; longText?: string; long_name?: string }>;
    formattedAddress?: string;
  };
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

// reduce requests / UX tuning
const MIN_AUTOCOMPLETE_CHARS = 4;
const DEBOUNCE_MS = 800;
const SESSION_EXPIRE_MS = 2 * 60 * 1000; // 2 minutes

export default function CheckoutForm({ total, clientSecret }: Props): React.JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const clearCart = useCart((s) => s.clearCart);

  // Contact / shipping
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [postcode, setPostcode] = useState<string>('');
  const [country, setCountry] = useState<string>('GB');

  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  // Refs & libs
  const addressRef = useRef<HTMLInputElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesLibRef = useRef<PlacesModule | null>(null);

  // session token (typed)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Predictions: we support two kinds:
  // - placePrediction from new AutocompleteSuggestion (has placeId)
  // - geocode results (no placeId) created with fake id 'geo:<idx>'
  type Prediction = { id: string; text: string; placeId?: string; isGeocode?: boolean };
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activePredictionIndex, setActivePredictionIndex] = useState<number>(-1);
  const [showPredictions, setShowPredictions] = useState<boolean>(false);

  // debounce
  type Timer = ReturnType<typeof setTimeout>;
  const debounceTimerRef = useRef<Timer | null>(null);

  // Payment request state
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUsePaymentRequest, setCanUsePaymentRequest] = useState<boolean>(false);

  // UX state
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const amountPence = useMemo(() => Math.round(total * 100), [total]);

  // load Google maps script
  const loadGooglePlaces = (apiKey: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('No window'));
      if (window.google && window.google.maps && window.google.maps.places) {
        return resolve();
      }

      const existing = document.getElementById('google-maps-places') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-places';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey
      )}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load'));
      document.head.appendChild(script);
    });

  // UK postcode helpers
  const normalizeUkPostcode = (value: string): string => {
    const raw = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length <= 3) return raw;
    return `${raw.slice(0, raw.length - 3)} ${raw.slice(-3)}`.trim();
  };

  const isValidUkPostcode = (value: string): boolean => {
    if (!value) return false;
    const normalized = normalizeUkPostcode(value);
    const re =
      /^(GIR 0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKPSTUW])\s?[0-9][ABD-HJLNP-UW-Z]{2})$/i;
    return re.test(normalized);
  };

  const isProbablyUkPostcode = (value: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toUpperCase();
    // start-of-input postcode-like (e.g. SW1A or SW1A1 or SW1A 1AA)
    return /^[A-Z]{1,2}\d/.test(normalized);
  };

  // parse geocode results
  const parsePlaceToFields = (place: google.maps.GeocoderResult): void => {
    const components = place.address_components ?? [];
    const lookup = (type: string): string | null => {
      const comp = components.find((c) => (c.types || []).includes(type));
      return comp ? comp.long_name : null;
    };

    const streetNumber = lookup('street_number');
    const route = lookup('route');
    const subpremise = lookup('subpremise');
    const line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
    const formattedAddress = place.formatted_address ?? line1 ?? '';

    const locality = lookup('locality') || lookup('postal_town') || lookup('administrative_area_level_2') || '';
    const postalCode = lookup('postal_code') || '';

    if (subpremise) setUnit(subpremise);
    setAddress(formattedAddress || line1);
    setCity(locality);
    setPostcode(postalCode ? normalizeUkPostcode(postalCode) : postcode);
    setCountry('GB');
  };

  // initialize geocoder and import new Places module
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    let mounted = true;

    loadGooglePlaces(apiKey)
      .then(async () => {
        if (!mounted) return;
        const g = window.google;
        if (!g || !g.maps) return;

        geocoderRef.current = new g.maps.Geocoder();

        // importLibrary is supported on the new SDK; it returns the module with new classes.
        // We cast to our local PlacesModule type for safe usage without using `any`.
        try {
          const mod = await g.maps.importLibrary('places');
          placesLibRef.current = mod as unknown as PlacesModule;
        } catch (err) {
          // importLibrary may not exist in all environments; fall back to global places if available
          // The global google.maps.places does not expose the new Place & AutocompleteSuggestion constructors,
          // but we keep the fallback in case importLibrary isn't available (less optimal).
          console.warn('[Places] importLibrary failed, new API may not be available:', err);
        }
      })
      .catch(() => {
        console.warn('[Google Maps] Failed to load Places script');
      });

    return () => {
      mounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      sessionTokenRef.current = null;
    };
  }, []);

  // session token lifecycle helpers
  const startSession = (): void => {
    if (!placesLibRef.current || !window.google?.maps?.places) return;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
    }
    // reset/refresh expire timer
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
    }
    sessionTimerRef.current = setTimeout(() => {
      sessionTokenRef.current = null;
      sessionTimerRef.current = null;
    }, SESSION_EXPIRE_MS);
  };

  const clearSession = (): void => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionTokenRef.current = null;
  };

  // fetch suggestions using new AutocompleteSuggestion API + geocode fallback for postcodes
  const fetchPredictions = useCallback(
    async (inputValue: string): Promise<void> => {
      const trimmed = inputValue.trim();
      if (!trimmed || trimmed.length < MIN_AUTOCOMPLETE_CHARS) {
        setPredictions([]);
        setShowPredictions(false);
        return;
      }

      // start/ensure session token
      startSession();

      const placesLib = placesLibRef.current;
      const results: Prediction[] = [];

      // 1) Use new AutocompleteSuggestion when available
      if (placesLib) {
        try {
          const resp = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            includedRegionCodes: ['gb'],
            sessionToken: sessionTokenRef.current ?? undefined,
          });

          const suggestions = resp.suggestions ?? [];
          for (let i = 0; i < Math.min(suggestions.length, 6); i++) {
            const s = suggestions[i];
            const text = s.placePrediction?.text?.text || '';
            const placeId = s.placePrediction?.placeId;
            if (text && placeId) {
              results.push({ id: `p-${placeId}`, text, placeId });
            } else if (text) {
              // fallback: create id from index
              results.push({ id: `p-${i}`, text });
            }
          }
        } catch (err) {
          console.warn('[AutocompleteSuggestion] error', err);
        }
      }

      // 2) If input looks like a postcode (or even for any input) perform a lightweight geocode to include nearby addresses
      // This helps when users type postcode only — geocoder returns rich address components.
      const wantGeocode = isProbablyUkPostcode(trimmed) || trimmed.length <= 7;
      if (wantGeocode && geocoderRef.current) {
        try {
          // Use geocode but keep it limited (componentRestrictions country=GB)
          geocoderRef.current.geocode(
            { address: trimmed, componentRestrictions: { country: 'GB' } },
            (geocodeResults, status) => {
              if (status === 'OK' && geocodeResults && geocodeResults.length > 0) {
                // map top 4 geocode results (formatted_address exists)
                const geoPreds = geocodeResults.slice(0, 4).map((g, idx) => ({
                  id: `geo-${idx}-${g.place_id ?? g.formatted_address}`,
                  text: g.formatted_address ?? '',
                  isGeocode: true as const,
                }));
                // merge geocode results after autocomplete suggestions, but de-duplicate by text
                const combined = [
                  ...results,
                  ...geoPreds.filter((gp) => !results.some((r) => r.text === gp.text)),
                ];
                setPredictions(combined);
                setActivePredictionIndex(-1);
                setShowPredictions(combined.length > 0);
              } else {
                // no geocode hits -> show only suggestions (if any)
                setPredictions(results);
                setActivePredictionIndex(-1);
                setShowPredictions(results.length > 0);
              }
            }
          );
          return; // geocoder callback will set predictions
        } catch (err) {
          console.warn('[Geocoder] error', err);
        }
      }

      // fallback if no geocode requested or geocoder not available
      setPredictions(results);
      setActivePredictionIndex(-1);
      setShowPredictions(results.length > 0);
    },
    []
  );

  const scheduleFetchPredictions = useCallback(
    (inputValue: string) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void fetchPredictions(inputValue);
      }, DEBOUNCE_MS);
    },
    [fetchPredictions]
  );

  // handle input changes
  const handleAddressInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setAddress(value);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setPredictions([]);
    setShowPredictions(false);

    if (!value || value.trim().length < MIN_AUTOCOMPLETE_CHARS) {
      // clear session if input cleared
      clearSession();
      return;
    }

    // schedule new predictions (including postcode inputs)
    startSession();
    scheduleFetchPredictions(value);
  };

  // when selecting a prediction
  const selectPrediction = async (p: Prediction): Promise<void> => {
    setAddress(p.text);
    setPredictions([]);
    setShowPredictions(false);

    // If the prediction is a geocode result, directly geocode/parse it
    if (p.isGeocode) {
      await geocodeAddress(p.text);
      clearSession();
      return;
    }

    // If we have a placeId, call Place (new API) with same sessionToken
    const placesLib = placesLibRef.current;
    if (!placesLib) {
      // fallback: geocode by text
      await geocodeAddress(p.text);
      clearSession();
      return;
    }

    try {
      const place = new placesLib.Place({ id: p.placeId ?? '' });
      await place.fetchFields({
        fields: ['addressComponents', 'formattedAddress'],
        sessionToken: sessionTokenRef.current ?? undefined,
      });

      // extract components (new API uses longText sometimes; fallback to long_name)
      const components = place.addressComponents ?? [];
      const lookup = (type: string): string | null => {
        const comp = components.find((c) => (c.types ?? []).includes(type));
        if (!comp) return null;
        // avoid `any` by narrowing shape for fallback
        const longText = (comp as { longText?: string }).longText;
        const long_name = (comp as { long_name?: string }).long_name;
        return longText ?? long_name ?? null;
      };

      const streetNumber = lookup('street_number');
      const route = lookup('route');
      const subpremise = lookup('subpremise');
      const line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
      const formattedAddress = place.formattedAddress ?? line1 ?? '';

      const locality = lookup('locality') || lookup('postal_town') || lookup('administrative_area_level_2') || '';
      const postalCode = lookup('postal_code') || '';

      if (subpremise) setUnit(subpremise);
      setAddress(formattedAddress || line1);
      setCity(locality);
      setPostcode(postalCode ? normalizeUkPostcode(postalCode) : '');
      setCountry('GB');

      // clear session after selection (billing-friendly)
      clearSession();
    } catch (err) {
      console.warn('[Place.fetchFields] error, falling back to geocode', err);
      await geocodeAddress(p.text);
      clearSession();
    }
  };

  // geocode helper (used for postcode or fallback)
  const geocodeAddress = async (value: string): Promise<void> => {
    const geocoder = geocoderRef.current;
    if (!geocoder || !value) return;
    try {
      geocoder.geocode({ address: value, componentRestrictions: { country: 'GB' } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          parsePlaceToFields(results[0]);
        } else {
          // nothing found — leave address as-is
        }
      });
    } catch (err) {
      console.warn('[Geocoder] Error:', err);
    }
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showPredictions || predictions.length === 0) {
      if (e.key === 'Enter' && isProbablyUkPostcode(address)) {
        e.preventDefault();
        void geocodeAddress(address);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivePredictionIndex((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivePredictionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activePredictionIndex >= 0 && predictions[activePredictionIndex]) {
        void selectPrediction(predictions[activePredictionIndex]);
      } else if (isProbablyUkPostcode(address)) {
        void geocodeAddress(address);
        setShowPredictions(false);
      }
    } else if (e.key === 'Escape') {
      setShowPredictions(false);
      setPredictions([]);
      // no session clear here — allow user to continue typing within same session
    }
  };

  const handleAddressBlur = (): void => {
    setTimeout(() => {
      setShowPredictions(false);
      if (isProbablyUkPostcode(address) && predictions.length === 0) {
        void geocodeAddress(address);
      }
    }, 150);
  };

  // Payment Request setup (unchanged)
  useEffect(() => {
    if (!stripe || !clientSecret) {
      setPaymentRequest(null);
      setCanUsePaymentRequest(false);
      return;
    }

    const pr = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: { label: 'Order total', amount: amountPence },
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
        }
      })
      .catch(() => {
        setPaymentRequest(null);
        setCanUsePaymentRequest(false);
      });
  }, [stripe, clientSecret, amountPence]);

  // Payment Request handlers (unchanged)
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
        total: { label: 'Order total', amount: amountPence },
        displayItems: [],
      });
    };

    const onPaymentMethod = async (ev: unknown) => {
      const event = ev as PaymentMethodEvent;
      setError(null);

      try {
        const result = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: (event.paymentMethod as { id: string }).id },
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
        }).catch(() => {});

        clearCart();
        router.push('/checkout/success');
      } catch (err) {
        try {
          event.complete && event.complete('fail');
        } catch {}
        const message = err instanceof Error ? err.message : String(err);
        setError(message || 'Unexpected error during wallet payment.');
      }
    };

    paymentRequest.on('shippingaddresschange', onShippingAddressChange as unknown as (e: unknown) => void);
    paymentRequest.on('paymentmethod', onPaymentMethod as unknown as (e: unknown) => void);
  }, [paymentRequest, stripe, clientSecret, amountPence, firstName, lastName, email, phone, clearCart, router]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPostcodeError(null);

    if (!stripe || !elements) {
      setError('Stripe is not loaded yet.');
      return;
    }

    if (!email || !firstName || !lastName || !address || !city || !postcode || !phone) {
      setError('Please fill in all required fields.');
      return;
    }

    const normalizedPostcode = normalizeUkPostcode(postcode);
    if (!isValidUkPostcode(normalizedPostcode)) {
      setPostcodeError('Please enter a valid UK postcode (e.g. SW1A 1AA).');
      return;
    }
    setPostcode(normalizedPostcode);

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
              line2: unit || undefined,
              city,
              postal_code: normalizedPostcode,
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
            shippingAddress: {
              firstName,
              lastName,
              email,
              phone,
              unit,
              address,
              city,
              postcode: normalizedPostcode,
              country,
            },
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
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">
              First Name <span className="text-black">*</span>
            </label>
            <input
              name="given-name"
              autoComplete="given-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              placeholder="John"
            />
          </div>

          <div>
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">
              Last Name <span className="text-black">*</span>
            </label>
            <input
              name="family-name"
              autoComplete="family-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              placeholder="Doe"
            />
          </div>

          <div>
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">
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
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">
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
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
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

        <div className="space-y-3 sm:space-y-4 relative">
          <div>
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">Apt, suite, unit (optional)</label>
            <input
              name="address-line2"
              autoComplete="address-line2"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              placeholder="Flat 4 / Apt 2B"
            />
            <div className="text-xs text-gray-500 mt-1">Optional — apartment, suite, unit or building name.</div>
          </div>

          <div>
            <label className="block text-base font-medium text-black mb-1 sm:mb-2">Street Address <span className="text-black">*</span></label>
            <input
              id="address-autocomplete"
              ref={addressRef}
              name="address-line1"
              autoComplete="address-line1"
              type="text"
              value={address}
              onChange={handleAddressInput}
              onKeyDown={handleAddressKeyDown}
              onBlur={handleAddressBlur}
              onFocus={() => startSession()}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              placeholder="123 High Street or SW1A 1AA"
            />
            <div className="text-xs text-gray-500 mt-1">
              💡 <strong>Tip:</strong> Enter your <strong>postcode first</strong> (e.g. SW1A 1AA) for faster results, or start typing your street name.
            </div>

            {showPredictions && predictions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md max-h-60 overflow-auto text-sm shadow-lg">
                {predictions.map((p, idx) => (
                  <li
                    key={p.id}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      void selectPrediction(p);
                    }}
                    className={`px-3 py-2 cursor-pointer ${idx === activePredictionIndex ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                    onMouseEnter={() => setActivePredictionIndex(idx)}
                  >
                    {p.text}
                    {p.isGeocode ? <span className="text-xs text-gray-400 ml-2"> (postcode search)</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">City <span className="text-black">*</span></label>
              <input
                name="address-level2"
                autoComplete="address-level2"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="London"
              />
            </div>

            <div>
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Postcode <span className="text-black">*</span></label>
              <input
                name="postal-code"
                autoComplete="postal-code"
                type="text"
                value={postcode}
                onChange={(e) => {
                  setPostcode(e.target.value);
                  setPostcodeError(null);
                }}
                onBlur={() => {
                  const normalized = normalizeUkPostcode(postcode);
                  setPostcode(normalized);
                  if (normalized && !isValidUkPostcode(normalized)) {
                    setPostcodeError('Please enter a valid UK postcode (e.g. SW1A 1AA).');
                  } else {
                    setPostcodeError(null);
                  }
                }}
                required
                className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all ${postcodeError ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="SW1A 1AA"
              />
              {postcodeError ? (
                <div className="text-xs text-red-600 mt-1">{postcodeError}</div>
              ) : (
                <div className="text-xs text-gray-500 mt-1">Enter a UK postcode (we will normalize it for you)</div>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Country <span className="text-black">*</span></label>
              <select
                name="country"
                autoComplete="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
              >
                <option value="GB">United Kingdom</option>
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

        <label className="block text-base font-medium text-black mb-1 sm:mb-2">Card Details</label>
        <div className="p-3 sm:p-4 border-2 border-gray-300 rounded-lg bg-white">
          <CardElement options={cardStyle} />
        </div>
        <p className="mt-2 text-sm text-gray-500 flex items-center">
          <Lock className="w-3 h-3 mr-1" />
          Your payment information is encrypted and secure
        </p>
      </div>

      {error && <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4 text-red-800">{error}</div>}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-base sm:text-base"
      >
        {processing ? (
          <svg className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <Lock className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
        )}
        {processing ? 'Processing…' : `Complete Order • £${total.toFixed(2)}`}
      </button>

      <p className="text-center text-sm text-gray-500 px-4">
        By completing your purchase you agree to our Terms of Service and Privacy Policy
      </p>
    </form>
  );
}