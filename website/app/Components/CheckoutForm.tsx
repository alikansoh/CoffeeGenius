'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  useStripe,
  useElements,
  CardElement,
  PaymentRequestButtonElement,
} from '@stripe/react-stripe-js';
import type { PaymentRequest, ConfirmCardPaymentOptions } from '@stripe/stripe-js';
import useCart from '@/app/store/CartStore';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, MapPin, Lock } from 'lucide-react';

type Props = {
  total: number;
  clientSecret: string;
  paymentIntentId?: string | null;
};

type ShippingOption = {
  id: string;
  label: string;
  detail?: string;
  amount: number;
};

type ShippingAddress = {
  country?: string;
  countryCode?: string;
  city?: string | null;
  administrativeArea?: string | null;
  postalCode?: string | null;
  addressLine?: (string | null)[] | null;
  recipient?: string | null;
  organization?: string | null;
  phone?: string | null;
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

type WalletBillingAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type WalletPaymentMethod = {
  id: string;
  billing_details?: {
    name?: string | null;
    address?: WalletBillingAddress | null;
  } | null;
};

type PaymentMethodEvent = {
  paymentMethod: WalletPaymentMethod;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  shippingAddress?: ShippingAddress | null;
  complete: (result: 'success' | 'fail' | 'unknown') => void;
};

type PlacesModule = {
  AutocompleteSessionToken: new () => google.maps.places.AutocompleteSessionToken;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      includedRegionCodes?: string[];
      sessionToken?: google.maps.places.AutocompleteSessionToken;
    }) => Promise<{
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
        };
      }>;
    }>;
  };
  Place: new (opts: { id: string }) => {
    fetchFields: (opts: {
      fields: string[];
      sessionToken?: google.maps.places.AutocompleteSessionToken;
    }) => Promise<void>;
    addressComponents?: Array<{ types?: string[]; longText?: string; long_name?: string }>;
    formattedAddress?: string;
  };
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

const MIN_AUTOCOMPLETE_CHARS = 4;
const DEBOUNCE_MS = 800;
const SESSION_EXPIRE_MS = 2 * 60 * 1000; // 2 minutes

type LocalConfirmResult = {
  error?: { message?: string } | null;
  paymentIntent?: { status?: string } | null;
};

export default function CheckoutForm({ total, clientSecret, paymentIntentId: paymentIntentIdProp }: Props): React.JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const clearCart = useCart((s) => s.clearCart);

  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [postcode, setPostcode] = useState<string>('');
  const [country, setCountry] = useState<string>('GB');

  const [billingFirstName, setBillingFirstName] = useState<string>('');
  const [billingLastName, setBillingLastName] = useState<string>('');
  const [billingUnit, setBillingUnit] = useState<string>('');
  const [billingAddress, setBillingAddress] = useState<string>('');
  const [billingCity, setBillingCity] = useState<string>('');
  const [billingPostcode, setBillingPostcode] = useState<string>('');
  const [billingCountry, setBillingCountry] = useState<string>('GB');

  const [billingSame, setBillingSame] = useState<boolean>(true);

  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [billingPostcodeError, setBillingPostcodeError] = useState<string | null>(null);

  const addressRef = useRef<HTMLInputElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesLibRef = useRef<PlacesModule | null>(null);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedPredictionRef = useRef<boolean>(false);

  type Prediction = { id: string; text: string; placeId?: string; isGeocode?: boolean };
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activePredictionIndex, setActivePredictionIndex] = useState<number>(-1);
  const [showPredictions, setShowPredictions] = useState<boolean>(false);

  type Timer = ReturnType<typeof setTimeout>;
  const debounceTimerRef = useRef<Timer | null>(null);

  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUsePaymentRequest, setCanUsePaymentRequest] = useState<boolean>(false);

  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const amountPence = useMemo(() => Math.round(total * 100), [total]);

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

  const normalizeUkPostcode = (value: string): string => {
    const raw = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length <= 3) return raw;
    return `${raw.slice(0, raw.length - 3)} ${raw.slice(-3)}`.trim();
  };

  const isValidUkPostcode = (value: string): boolean => {
    if (!value) return false;
    const normalized = normalizeUkPostcode(value);
    const re = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
    return re.test(normalized);
  };

  const isProbablyUkPostcode = (value: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{1,2}\d/.test(normalized);
  };

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

        try {
          const mod = await g.maps.importLibrary('places');
          placesLibRef.current = mod as unknown as PlacesModule;
        } catch (err) {
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

  const startSession = (): void => {
    if (!placesLibRef.current || !window.google?.maps?.places) return;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
    }
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

  const fetchPredictions = useCallback(
    async (inputValue: string): Promise<void> => {
      const trimmed = inputValue.trim();
      if (!trimmed || trimmed.length < MIN_AUTOCOMPLETE_CHARS) {
        setPredictions([]);
        setShowPredictions(false);
        return;
      }

      startSession();

      const placesLib = placesLibRef.current;
      const results: Prediction[] = [];

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
              results.push({ id: `p-${i}`, text });
            }
          }
        } catch (err) {
          console.warn('[AutocompleteSuggestion] error', err);
        }
      }

      const wantGeocode = isProbablyUkPostcode(trimmed) || trimmed.length <= 7;
      if (wantGeocode && geocoderRef.current) {
        try {
          geocoderRef.current.geocode(
            { address: trimmed, componentRestrictions: { country: 'GB' } },
            (geocodeResults, status) => {
              if (status === 'OK' && geocodeResults && geocodeResults.length > 0) {
                const geoPreds = geocodeResults.slice(0, 4).map((g, idx) => ({
                  id: `geo-${idx}-${g.place_id ?? g.formatted_address}`,
                  text: g.formatted_address ?? '',
                  isGeocode: true as const,
                }));
                const combined = [
                  ...results,
                  ...geoPreds.filter((gp) => !results.some((r) => r.text === gp.text)),
                ];
                setPredictions(combined);
                setActivePredictionIndex(-1);
                setShowPredictions(combined.length > 0);
              } else {
                setPredictions(results);
                setActivePredictionIndex(-1);
                setShowPredictions(results.length > 0);
              }
            }
          );
          return;
        } catch (err) {
          console.warn('[Geocoder] error', err);
        }
      }

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

  const handleAddressInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setAddress(value);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setPredictions([]);
    setShowPredictions(false);

    if (!value || value.trim().length < MIN_AUTOCOMPLETE_CHARS) {
      clearSession();
      return;
    }

    startSession();
    scheduleFetchPredictions(value);
  };

  const selectPrediction = async (p: Prediction): Promise<void> => {
    justSelectedPredictionRef.current = true;
    window.setTimeout(() => {
      justSelectedPredictionRef.current = false;
    }, 400);

    setAddress(p.text);
    setPredictions([]);
    setShowPredictions(false);

    try {
      addressRef.current?.blur();
    } catch {}

    if (p.isGeocode) {
      await geocodeAddress(p.text);
      clearSession();
      return;
    }

    const placesLib = placesLibRef.current;
    if (!placesLib) {
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

      const components = place.addressComponents ?? [];
      const lookup = (type: string): string | null => {
        const comp = components.find((c) => (c.types ?? []).includes(type));
        if (!comp) return null;
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

      clearSession();
    } catch (err) {
      console.warn('[Place.fetchFields] error, falling back to geocode', err);
      await geocodeAddress(p.text);
      clearSession();
    }
  };

  const geocodeAddress = async (value: string): Promise<void> => {
    const geocoder = geocoderRef.current;
    if (!geocoder || !value) return;
    try {
      geocoder.geocode({ address: value, componentRestrictions: { country: 'GB' } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          parsePlaceToFields(results[0]);
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
    }
  };

  const handleAddressBlur = (): void => {
    if (justSelectedPredictionRef.current) {
      setTimeout(() => {
        setShowPredictions(false);
      }, 50);
      return;
    }

    setTimeout(() => {
      setShowPredictions(false);
      if (isProbablyUkPostcode(address) && predictions.length === 0) {
        void geocodeAddress(address);
      }
    }, 150);
  };

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

  const extractPaymentIntentId = (cs?: string | null): string | null => {
    if (!cs) return null;
    const parts = cs.split('_secret');
    if (parts.length > 0 && parts[0].startsWith('pi_')) return parts[0];
    return null;
  };

  const paymentIntentId = useMemo(
    () => paymentIntentIdProp ?? extractPaymentIntentId(clientSecret ?? null),
    [paymentIntentIdProp, clientSecret]
  );

  const saveShipping = useCallback(
    async (opts: {
      paymentIntentId?: string | null;
      shippingAddress: Record<string, unknown> | null;
      billingAddress?: Record<string, unknown> | null;
      client: { name?: string | null; email?: string | null; phone?: string | null } | null;
    }) => {
      try {
        const res = await fetch('/api/save-shipping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: opts.paymentIntentId ?? undefined,
            shippingAddress: opts.shippingAddress,
            billingAddress: opts.billingAddress ?? undefined,
            client: opts.client,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { message?: string })?.message ?? `Failed to save shipping (status ${res.status})`;
          throw new Error(msg);
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('saveShipping error:', msg);
        throw new Error(msg);
      }
    },
    []
  );

  const finalizeOrder = useCallback(
    async (opts: { paymentIntentId?: string | null }) => {
      try {
        await fetch('/api/complete-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: opts.paymentIntentId ?? undefined,
          }),
        });
      } catch (e) {
        console.warn('finalizeOrder warning:', e);
      }
    },
    []
  );

  // Centralized result handling for Stripe confirm responses
  const handleConfirmResult = useCallback(
    async (result: LocalConfirmResult): Promise<boolean> => {
      // result.error -> show message
      if (result.error) {
        const msg = result.error.message ?? 'Payment failed.';
        setError(msg);
        return false;
      }

      const status = result.paymentIntent?.status ?? '';

      if (status === 'succeeded') {
        return true;
      }

      if (status === 'requires_action' || status === 'requires_confirmation') {
        // Try to handle actions (3DS) - this will show UI if required
        if (!stripe) {
          setError('Stripe SDK not available to complete authentication.');
          return false;
        }
        const next = (await stripe.confirmCardPayment(clientSecret)) as unknown as LocalConfirmResult;
        if (next.error) {
          setError(next.error.message ?? 'Authentication required but failed.');
          return false;
        }
        if (next.paymentIntent?.status === 'succeeded') {
          return true;
        }
        setError('Payment requires additional action and was not completed.');
        return false;
      }

      if (status === 'requires_payment_method') {
        setError('Payment method was declined. Please try another card or payment method.');
        return false;
      }

      if (status === 'processing') {
        // Processing: treat as in-progress. Webhook will be canonical.
        setError(null);
        return true;
      }

      // Fallback
      setError('Payment not completed. Try another card.');
      return false;
    },
    [stripe, clientSecret]
  );

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

      const payerNameVal = event.payerName ?? `${firstName} ${lastName}`.trim();
      const payerEmailVal = event.payerEmail ?? email;
      const payerPhoneVal = event.payerPhone ?? phone;

      const shippingAddressRaw = event.shippingAddress ?? null;

      const recipient = (shippingAddressRaw?.recipient ?? payerNameVal ?? '')?.trim();
      let normalizedFirst = '';
      let normalizedLast = '';
      if (recipient) {
        const parts = recipient.split(/\s+/);
        normalizedFirst = parts.shift() ?? '';
        normalizedLast = parts.length > 0 ? parts.join(' ') : '';
      }

      const addressLine0 = shippingAddressRaw?.addressLine && shippingAddressRaw.addressLine.length > 0
        ? (shippingAddressRaw.addressLine[0] ?? '')
        : '';
      const addressLine1 = shippingAddressRaw?.addressLine && shippingAddressRaw.addressLine.length > 1
        ? (shippingAddressRaw.addressLine[1] ?? '')
        : '';

      const cityVal = (shippingAddressRaw?.city ?? shippingAddressRaw?.administrativeArea ?? city) ?? '';
      const postcodeVal = (shippingAddressRaw?.postalCode ?? '') ?? '';
      const countryVal = (shippingAddressRaw?.country ?? shippingAddressRaw?.countryCode ?? country) ?? '';

      const phoneVal = payerPhoneVal ?? (shippingAddressRaw?.phone as string | null | undefined) ?? null;
      const emailVal = payerEmailVal ?? null;

      const payer = {
        name: (payerNameVal && payerNameVal.trim()) ? payerNameVal : (recipient || null),
        email: emailVal ?? null,
        phone: phoneVal ?? null,
      };

      const shippingPayload: Record<string, unknown> = {
        firstName: normalizedFirst || (firstName || ''),
        lastName: normalizedLast || (lastName || ''),
        email: emailVal ?? email,
        phone: phoneVal ?? phone,
        unit: addressLine1 || '',
        address: addressLine0 || (address || ''),
        city: cityVal || city,
        postcode: postcodeVal ? normalizeUkPostcode(String(postcodeVal)) : (postcode || ''),
        country: countryVal || country,
      };

      let billingPayload: Record<string, unknown> = {
        firstName: normalizedFirst || firstName,
        lastName: normalizedLast || lastName,
        unit: addressLine1 || unit,
        address: addressLine0 || address,
        city: cityVal || city,
        postcode: postcodeVal ? normalizeUkPostcode(String(postcodeVal)) : postcode,
        country: countryVal || country,
        sameAsShipping: true,
      };

      try {
        const pm = event.paymentMethod;
        if (pm && pm.billing_details && pm.billing_details.address) {
          const addr = pm.billing_details.address;
          const name = pm.billing_details.name ?? null;
          const [bFirst, ...bRest] = (name || '').split(/\s+/);
          billingPayload = {
            firstName: bFirst || billingPayload.firstName,
            lastName: bRest.length ? bRest.join(' ') : billingPayload.lastName,
            unit: addr.line2 ?? billingPayload.unit,
            address: addr.line1 ?? billingPayload.address,
            city: addr.city ?? billingPayload.city,
            postcode: addr.postal_code ? normalizeUkPostcode(String(addr.postal_code)) : billingPayload.postcode,
            country: addr.country ?? billingPayload.country,
            sameAsShipping: false,
          };
        }
      } catch {
        // ignore and fall back
      }

      try {
        await saveShipping({ paymentIntentId, shippingAddress: shippingPayload, billingAddress: billingPayload, client: payer });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        try {
          event.complete('fail');
        } catch {}
        setError(message || 'Failed to save shipping details. Please try again.');
        return;
      }

      setProcessing(true);
      try {
        const result = (await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: event.paymentMethod.id },
          { handleActions: false } as ConfirmCardPaymentOptions
        )) as unknown as LocalConfirmResult;

        const ok = await handleConfirmResult(result);

        if (!ok) {
          try {
            event.complete('fail');
          } catch {}
          setProcessing(false);
          return;
        }

        try {
          event.complete('success');
        } catch {}

        // best-effort finalize
        await finalizeOrder({ paymentIntentId });

        clearCart();
        router.push('/checkout/success');
      } catch (err) {
        try {
          event.complete && event.complete('fail');
        } catch {}
        const message = err instanceof Error ? err.message : String(err);
        setError(message || 'Unexpected error during wallet payment.');
      } finally {
        setProcessing(false);
      }
    };

    (paymentRequest as unknown as { on: (evName: string, fn: unknown) => void }).on(
      'shippingaddresschange',
      onShippingAddressChange as unknown
    );
    (paymentRequest as unknown as { on: (evName: string, fn: unknown) => void }).on(
      'paymentmethod',
      onPaymentMethod as unknown
    );

    return () => {
      try {
        (paymentRequest as unknown as { off?: (evName: string, fn: unknown) => void }).off?.(
          'shippingaddresschange',
          onShippingAddressChange as unknown
        );
        (paymentRequest as unknown as { off?: (evName: string, fn: unknown) => void }).off?.(
          'paymentmethod',
          onPaymentMethod as unknown
        );
      } catch {}
    };
  }, [
    paymentRequest,
    stripe,
    clientSecret,
    amountPence,
    firstName,
    lastName,
    email,
    phone,
    saveShipping,
    paymentIntentId,
    finalizeOrder,
    clearCart,
    router,
    city,
    address,
    postcode,
    country,
    handleConfirmResult,
  ]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPostcodeError(null);
    setBillingPostcodeError(null);

    if (!stripe || !elements) {
      setError('Stripe is not loaded yet.');
      return;
    }

    if (!email || !firstName || !lastName || !address || !city || !postcode || !phone) {
      setError('Please fill in all required shipping fields.');
      return;
    }

    if (!billingSame) {
      if (!billingFirstName || !billingLastName || !billingAddress || !billingCity || !billingPostcode) {
        setError('Please fill in all required billing fields.');
        return;
      }
    }

    const normalizedPostcode = normalizeUkPostcode(postcode);
    if (!isValidUkPostcode(normalizedPostcode)) {
      setPostcodeError('Please enter a valid UK postcode (e.g. EC1A 1BB or SW1A 1AA).');
      return;
    }
    setPostcode(normalizedPostcode);

    let normalizedBillingPostcode = billingPostcode;
    if (!billingSame) {
      normalizedBillingPostcode = normalizeUkPostcode(billingPostcode);
      if (!isValidUkPostcode(normalizedBillingPostcode)) {
        setBillingPostcodeError('Please enter a valid UK postcode for billing (e.g. EC1A 1BB).');
        return;
      }
      setBillingPostcode(normalizedBillingPostcode);
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found.');
      return;
    }

    setProcessing(true);

    try {
      const shippingPayload = {
        firstName,
        lastName,
        email,
        phone,
        unit,
        address,
        city,
        postcode: normalizedPostcode,
        country,
      };
      const clientPayload = { name: `${firstName} ${lastName}`.trim(), email, phone };

      const billingPayload = billingSame
        ? {
            firstName,
            lastName,
            unit,
            address,
            city,
            postcode: normalizedPostcode,
            country,
            sameAsShipping: true,
          }
        : {
            firstName: billingFirstName,
            lastName: billingLastName,
            unit: billingUnit,
            address: billingAddress,
            city: billingCity,
            postcode: normalizedBillingPostcode,
            country: billingCountry,
            sameAsShipping: false,
          };

      try {
        await saveShipping({ paymentIntentId, shippingAddress: shippingPayload, billingAddress: billingPayload, client: clientPayload });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || 'Failed to save shipping details. Please try again.');
        setProcessing(false);
        return;
      }

      const billingDetails = billingSame
        ? {
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
          }
        : {
            name: `${billingFirstName} ${billingLastName}`.trim(),
            email: email || undefined,
            phone: phone || undefined,
            address: {
              line1: billingAddress,
              line2: billingUnit || undefined,
              city: billingCity,
              postal_code: normalizedBillingPostcode,
              country: billingCountry,
            },
          };

      const result = (await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: billingDetails,
        },
      })) as unknown as LocalConfirmResult;

      const ok = await handleConfirmResult(result);

      if (!ok) {
        setProcessing(false);
        return;
      }

      // best-effort finalize
      await finalizeOrder({ paymentIntentId });

      clearCart();
      router.push('/checkout/success');
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
              💡 <strong>Tip:</strong> Enter your <strong>postcode first</strong> (e.g. SW1A 1AA or EC1 2NV) for faster results, or start typing your street name.
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
                    setPostcodeError('Please enter a valid UK postcode (e.g. EC1A 1BB or SW1A 1AA).');
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

          <div className="pt-2">
            <label className="inline-flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={billingSame}
                onChange={(e) => setBillingSame(e.target.checked)}
                className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
              />
              <span>Billing address same as shipping</span>
            </label>
            <div className="text-xs text-gray-500 mt-1">If unchecked, you&apos;ll be able to enter a different billing address.</div>
          </div>
        </div>
      </div>

      {!billingSame && (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-bold text-black mb-3 sm:mb-4 flex items-center">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Billing Address
          </h2>

          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">First Name <span className="text-black">*</span></label>
                <input
                  name="billing-given-name"
                  autoComplete="billing given-name"
                  type="text"
                  value={billingFirstName}
                  onChange={(e) => setBillingFirstName(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">Last Name <span className="text-black">*</span></label>
                <input
                  name="billing-family-name"
                  autoComplete="billing family-name"
                  type="text"
                  value={billingLastName}
                  onChange={(e) => setBillingLastName(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Apt, suite, unit (optional)</label>
              <input
                name="billing-address-line2"
                autoComplete="billing address-line2"
                type="text"
                value={billingUnit}
                onChange={(e) => setBillingUnit(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="Flat 4 / Apt 2B"
              />
            </div>

            <div>
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Street Address <span className="text-black">*</span></label>
              <input
                name="billing-address-line1"
                autoComplete="billing address-line1"
                type="text"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                placeholder="123 High Street"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">City <span className="text-black">*</span></label>
                <input
                  name="billing-address-level2"
                  autoComplete="billing address-level2"
                  type="text"
                  value={billingCity}
                  onChange={(e) => setBillingCity(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                  placeholder="London"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">Postcode <span className="text-black">*</span></label>
                <input
                  name="billing-postal-code"
                  autoComplete="billing postal-code"
                  type="text"
                  value={billingPostcode}
                  onChange={(e) => {
                    setBillingPostcode(e.target.value);
                    setBillingPostcodeError(null);
                  }}
                  onBlur={() => {
                    const normalized = normalizeUkPostcode(billingPostcode);
                    setBillingPostcode(normalized);
                    if (normalized && !isValidUkPostcode(normalized)) {
                      setBillingPostcodeError('Please enter a valid UK postcode (e.g. EC1A 1BB).');
                    } else {
                      setBillingPostcodeError(null);
                    }
                  }}
                  required
                  className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all ${billingPostcodeError ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="EC1A 1BB"
                />
                {billingPostcodeError ? (
                  <div className="text-xs text-red-600 mt-1">{billingPostcodeError}</div>
                ) : (
                  <div className="text-xs text-gray-500 mt-1">Enter a UK postcode (we will normalize it for you)</div>
                )}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">Country <span className="text-black">*</span></label>
                <select
                  name="billing-country"
                  autoComplete="billing country"
                  value={billingCountry}
                  onChange={(e) => setBillingCountry(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                >
                  <option value="GB">United Kingdom</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

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