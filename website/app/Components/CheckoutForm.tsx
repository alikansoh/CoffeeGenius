'use client';

// Explicit reference instead of relying on implicit global type acquisition — this is the
// only file in the project using google.maps types, and editor TS servers (as opposed to a
// full `tsc` build) can intermittently drop rarely-referenced ambient global libs during
// incremental reanalysis, causing phantom "implicitly any" errors here that a clean CLI
// compile never shows.
/// <reference types="google.maps" />

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
  shippingPence?: number;
  email: string;
  onEmailChange: (email: string) => void;
  /** True when this checkout is ONLY a Stripe Subscription (no one-off items alongside it) —
   *  skips the one-off-only save-shipping/complete-order steps after payment confirms. */
  isSubscriptionCheckout?: boolean;
  /**
   * Set when there's more to charge after the primary payment — e.g. the basket has one-off
   * items (primary = the order) plus one or more subscriptions, or multiple subscriptions with
   * no one-off items (primary = the first subscription, these are the rest). Stripe can't
   * charge a recurring subscription and anything else in a single payment, so after the
   * primary payment confirms, each of these gets confirmed too using the same card, as its
   * own charge — the customer only enters their card once.
   */
  secondaryClientSecrets?: string[];
  /** Human-readable lines describing each subscription's recurring charge, e.g.
   *  "Two Brothers Blend — Delivery every 1 week with 5% discount (£7.60/week)".
   *  Shown right by the card input so it's clear what will recur, not just what's due today. */
  subscriptionDescriptions?: string[];
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
const SESSION_EXPIRE_MS = 2 * 60 * 1000;

type LocalConfirmResult = {
  error?: { message?: string } | null;
  paymentIntent?: { status?: string } | null;
};

type ClientAddress = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  address?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
};

type Client = {
  name?: string;
  email?: string;
  phone?: string;
  address?: ClientAddress | null;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function CheckoutForm({
  total,
  clientSecret,
  paymentIntentId: paymentIntentIdProp,
  shippingPence,
  email,
  onEmailChange,
  isSubscriptionCheckout,
  secondaryClientSecrets,
  subscriptionDescriptions,
}: Props): React.JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const clearCart = useCart((s) => s.clearCart);

  // shipping fields
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

  type FieldKey =
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'unit'
    | 'address'
    | 'city'
    | 'postcode'
    | 'country'
    | 'billingFirstName'
    | 'billingLastName'
    | 'billingUnit'
    | 'billingAddress'
    | 'billingCity'
    | 'billingPostcode'
    | 'billingCountry';

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string | null>>>({});

  const addressRef = useRef<HTMLInputElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesLibRef = useRef<PlacesModule | null>(null);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [predictions, setPredictions] = useState<Array<{ id: string; text: string; placeId?: string; isGeocode?: boolean }>>([]);
  const [activePredictionIndex, setActivePredictionIndex] = useState<number>(-1);
  const [showPredictions, setShowPredictions] = useState<boolean>(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canUsePaymentRequest, setCanUsePaymentRequest] = useState<boolean>(false);

  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundClient, setFoundClient] = useState<Client | null>(null);
  const [showAutofillPreview, setShowAutofillPreview] = useState<boolean>(false);

  const hasHandledAutofillRef = useRef<boolean>(false);

  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const amountPence = useMemo(() => Math.round(total * 100), [total]);

  const loadGooglePlaces = (apiKey: string): Promise<void> =>
    new Promise((resolve, reject) => {
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
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
    return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(normalized);
  };

  const isProbablyUkPostcode = (value: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{1,2}\d/.test(normalized);
  };

  const normalizePhoneDigits = (p?: string | null) => (p ? String(p).replace(/\D/g, '') : '');
  const isValidUkPhone = (raw: string | undefined | null): boolean => {
    const digits = normalizePhoneDigits(raw ?? '');
    if (!digits) return false;
    return /^(0\d{10}|44\d{10})$/.test(digits);
  };

  const parsePlaceToFields = (place: google.maps.GeocoderResult): void => {
    const components = place.address_components ?? [];
    const lookup = (type: string): string | null => {
      const comp = components.find((c) => (c.types || []).includes(type));
      return comp ? (comp.long_name as string) : null;
    };

    const streetNumber = lookup('street_number');
    const route = lookup('route');
    const subpremise = lookup('subpremise');
    const line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
    const formattedAddress = place.formatted_address ?? line1 ?? '';

    const locality =
      lookup('locality') ||
      lookup('postal_town') ||
      lookup('administrative_area_level_2') ||
      '';
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
          const mapsWithImport = g.maps as typeof g.maps & {
            importLibrary?: (name: string) => Promise<unknown>;
          };
          if (typeof mapsWithImport.importLibrary === 'function') {
            const mod = await mapsWithImport.importLibrary('places');
            placesLibRef.current = mod as unknown as PlacesModule;
          }
        } catch (err) {
          console.warn('[Places] importLibrary failed:', err);
        }
      })
      .catch(() => {
        console.warn('[Google Maps] Failed to load Places script');
      });

    return () => {
      mounted = false;
    };
  }, []);

  const startSession = (): void => {
    if (!placesLibRef.current || !window.google?.maps?.places) return;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
    }
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
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

  const fetchPredictions = useCallback(async (inputValue: string): Promise<void> => {
    const trimmed = inputValue.trim();
    if (!trimmed || trimmed.length < MIN_AUTOCOMPLETE_CHARS) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    startSession();

    const placesLib = placesLibRef.current;
    const results: Array<{ id: string; text: string; placeId?: string; isGeocode?: boolean }> = [];

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
  }, []);

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
    setFieldErrors((prev) => ({ ...prev, address: null }));

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

  const selectPrediction = async (p: {
    id: string;
    text: string;
    placeId?: string;
    isGeocode?: boolean;
  }): Promise<void> => {
    setAddress(p.text);
    setFieldErrors((prev) => ({ ...prev, address: null }));
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
        return (
          ((comp as unknown as { longText?: string }).longText) ??
          (comp as unknown as { long_name?: string }).long_name ??
          null
        );
      };

      const streetNumber = lookup('street_number');
      const route = lookup('route');
      const subpremise = lookup('subpremise');
      const line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
      const formattedAddress = place.formattedAddress ?? line1 ?? '';

      const locality =
        lookup('locality') || lookup('postal_town') || lookup('administrative_area_level_2') || '';
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
    setTimeout(() => {
      setShowPredictions(false);
      setPredictions([]);
    }, 100);
  };

  const handleAddressFocus = (): void => {
    startSession();
    if (predictions.length > 0 && address.trim().length >= MIN_AUTOCOMPLETE_CHARS) {
      setShowPredictions(true);
    }
  };

  /* ---------------------------
     PaymentRequest
  ----------------------------*/
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

  /* ---------------------------
     Client lookup
  ----------------------------*/
  const normalizeEmailStr = (e?: string | null) => (e ? String(e).trim().toLowerCase() : '');

  const performLookup = useCallback(
    async (opts: { email?: string | null; phone?: string | null }) => {
      if (hasHandledAutofillRef.current) return;

      lookupAbortRef.current?.abort();
      lookupAbortRef.current = new AbortController();
      setLookupError(null);
      setLookupLoading(true);
      setFoundClient(null);
      setShowAutofillPreview(false);

      try {
        const res = await fetch('/api/clients/find', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: opts.email ?? undefined,
            phone: opts.phone ?? undefined,
          }),
          signal: lookupAbortRef.current.signal,
        });

        if (res.status === 404) {
          setLookupLoading(false);
          return;
        }

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          const message =
            (json as { error?: string; message?: string }).error ||
            (json as { error?: string; message?: string }).message ||
            'Lookup failed';
          setLookupError(String(message));
          setLookupLoading(false);
          return;
        }

        const data = (await res.json().catch(() => ({}))) as {
          found?: boolean;
          client?: Client;
        };

        if (data?.found && data.client) {
          setFoundClient(data.client);
          setShowAutofillPreview(true);
          setLookupError(null);
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        console.error('client lookup error', err);
        setLookupError('Network error while looking up profile.');
      } finally {
        setLookupLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (lookupDebounceRef.current) {
      clearTimeout(lookupDebounceRef.current);
      lookupDebounceRef.current = null;
    }

    if (hasHandledAutofillRef.current) return;

    const emailNorm = normalizeEmailStr(email) || '';
    const phoneDigits = normalizePhoneDigits(phone) || '';

    const looksLikeEmail = !!emailNorm && isValidEmail(emailNorm);
    const looksLikePhone = phoneDigits.length >= 7;

    if (!looksLikeEmail && !looksLikePhone) {
      setFoundClient(null);
      setShowAutofillPreview(false);
      setLookupError(null);
      return;
    }

    lookupDebounceRef.current = setTimeout(() => {
      void performLookup({
        email: looksLikeEmail ? emailNorm : undefined,
        phone: looksLikePhone ? phoneDigits : undefined,
      });
    }, DEBOUNCE_MS);

    return () => {
      if (lookupDebounceRef.current) {
        clearTimeout(lookupDebounceRef.current);
        lookupDebounceRef.current = null;
      }
    };
  }, [email, phone, performLookup]);

  const handleEmailBlur = () => {
    if (hasHandledAutofillRef.current) return;
    const emailNorm = normalizeEmailStr(email);
    const phoneDigits = normalizePhoneDigits(phone);
    const looksLikeEmail = !!emailNorm && isValidEmail(emailNorm);
    const looksLikePhone = phoneDigits.length >= 7;
    if (!looksLikeEmail && !looksLikePhone) return;
    void performLookup({
      email: looksLikeEmail ? emailNorm : undefined,
      phone: looksLikePhone ? phoneDigits : undefined,
    });
  };

  const handlePhoneBlur = () => {
    const digits = normalizePhoneDigits(phone);
    if (!isValidUkPhone(digits)) {
      setFieldErrors((prev) => ({ ...prev, phone: 'Please enter a valid UK phone number.' }));
    } else {
      setFieldErrors((prev) => ({ ...prev, phone: null }));
    }

    if (hasHandledAutofillRef.current) return;
    const emailNorm = normalizeEmailStr(email);
    const looksLikeEmail = !!emailNorm && isValidEmail(emailNorm);
    const looksLikePhone = digits.length >= 7;
    if (!looksLikeEmail && !looksLikePhone) return;
    void performLookup({
      email: looksLikeEmail ? emailNorm : undefined,
      phone: looksLikePhone ? digits : undefined,
    });
  };

  const applyFoundClient = useCallback(() => {
    if (!foundClient) return;

    hasHandledAutofillRef.current = true;
    lookupAbortRef.current?.abort();
    if (lookupDebounceRef.current) {
      clearTimeout(lookupDebounceRef.current);
      lookupDebounceRef.current = null;
    }

    const name = foundClient.name ?? '';
    const [f, ...rest] = (name || '').split(/\s+/);
    const l = rest.join(' ');

    if (f) {
      setFirstName(f);
      setFieldErrors((prev) => ({ ...prev, firstName: null }));
    }
    if (l) {
      setLastName(l);
      setFieldErrors((prev) => ({ ...prev, lastName: null }));
    }
    if (foundClient.email) {
      onEmailChange(foundClient.email);
      setFieldErrors((prev) => ({ ...prev, email: null }));
    }
    if (foundClient.phone) {
      setPhone(foundClient.phone);
      setFieldErrors((prev) => ({ ...prev, phone: null }));
    }

    const addr = foundClient.address ?? null;
    if (addr) {
      if (addr.firstName) {
        const [af, ...ar] = String(addr.firstName).split(/\s+/);
        setFirstName((prev) => prev || af || '');
        if (ar.length) setLastName((prev) => prev || ar.join(' ') || '');
      }
      if (addr.lastName) setLastName((prev) => prev || addr.lastName || '');
      if (addr.line1 || addr.address) {
        setAddress((addr.line1 ?? addr.address ?? '') as string);
        setFieldErrors((prev) => ({ ...prev, address: null }));
      }
      if (addr.unit) setUnit(addr.unit ?? '');
      if (addr.city) {
        setCity(addr.city ?? '');
        setFieldErrors((prev) => ({ ...prev, city: null }));
      }
      if (addr.postcode) {
        setPostcode(normalizeUkPostcode(String(addr.postcode ?? '')));
        setFieldErrors((prev) => ({ ...prev, postcode: null }));
      }
      if (addr.country) setCountry(addr.country ?? 'GB');
    }

    setShowAutofillPreview(false);
    setFoundClient(null);
  }, [foundClient, onEmailChange]);

  const discardFoundClient = useCallback(() => {
    hasHandledAutofillRef.current = true;
    lookupAbortRef.current?.abort();
    if (lookupDebounceRef.current) {
      clearTimeout(lookupDebounceRef.current);
      lookupDebounceRef.current = null;
    }
    setFoundClient(null);
    setShowAutofillPreview(false);
    setLookupError(null);
  }, []);

  const handleConfirmResult = useCallback(
    async (result: LocalConfirmResult): Promise<boolean> => {
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
        if (!stripe) {
          setError('Stripe SDK not available to complete authentication.');
          return false;
        }
        const next = (await stripe.confirmCardPayment(clientSecret)) as LocalConfirmResult;
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
        setError(null);
        return true;
      }

      setError('Payment not completed. Try another card.');
      return false;
    },
    [stripe, clientSecret]
  );

  const saveShipping = useCallback(
    async (opts: {
      paymentIntentId?: string | null;
      shippingAddress: Record<string, unknown> | null;
      billingAddress?: Record<string, unknown> | null;
      client: { name?: string | null; email?: string | null; phone?: string | null } | null;
      /** Set to "payment_request" for the Apple Pay / Google Pay one-tap flow — its address
       *  comes straight from the device's Wallet/Contacts entry with no review step shown to
       *  the customer, so the server flags it for a house-number sanity check. */
      source?: 'payment_request';
    }) => {
      const res = await fetch('/api/save-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: opts.paymentIntentId ?? undefined,
          shippingAddress: opts.shippingAddress,
          billingAddress: opts.billingAddress ?? undefined,
          client: opts.client,
          source: opts.source ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message ?? `Failed to save shipping (status ${res.status})`;
        throw new Error(msg);
      }
      return true;
    },
    []
  );

  const saveSubscriptionShipping = useCallback(
    async (opts: {
      paymentIntentId?: string | null;
      shippingAddress: Record<string, unknown> | null;
      client: { name?: string | null; email?: string | null; phone?: string | null } | null;
    }) => {
      const res = await fetch('/api/subscriptions/save-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: opts.paymentIntentId ?? undefined,
          shippingAddress: opts.shippingAddress,
          client: opts.client,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message ?? `Failed to save shipping (status ${res.status})`;
        throw new Error(msg);
      }
      return true;
    },
    []
  );

  const finalizeOrder = useCallback(
    async (opts: { paymentIntentId?: string | null }): Promise<{ ok: boolean; status: number; body: unknown }> => {
      try {
        const res = await fetch('/api/complete-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: opts.paymentIntentId ?? undefined,
          }),
        });

        let body: unknown = null;
        try {
          body = await res.json().catch(() => null);
        } catch {
          body = null;
        }

        if (!res.ok) {
          const message =
            (body && ((body as Record<string, unknown>)['message'] || (body as Record<string, unknown>)['error'])) ||
            res.statusText ||
            `Request failed (${res.status})`;
          return { ok: false, status: res.status, body: { message } };
        }

        return { ok: true, status: res.status, body };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 0, body: { message: message || 'Network error' } };
      }
    },
    []
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

      const recipient = (shippingAddressRaw?.recipient ?? payerNameVal ?? '').trim();
      let normalizedFirst = '';
      let normalizedLast = '';
      if (recipient) {
        const parts = recipient.split(/\s+/);
        normalizedFirst = parts.shift() ?? '';
        normalizedLast = parts.length > 0 ? parts.join(' ') : '';
      }

      const addressLine0 =
        shippingAddressRaw?.addressLine && shippingAddressRaw.addressLine.length > 0
          ? shippingAddressRaw.addressLine[0] ?? ''
          : '';
      const addressLine1 =
        shippingAddressRaw?.addressLine && shippingAddressRaw.addressLine.length > 1
          ? shippingAddressRaw.addressLine[1] ?? ''
          : '';

      const cityVal = (shippingAddressRaw?.city ?? shippingAddressRaw?.administrativeArea ?? city) ?? '';
      const postcodeVal = shippingAddressRaw?.postalCode ?? '';
      const countryVal = (shippingAddressRaw?.country ?? shippingAddressRaw?.countryCode ?? country) ?? '';

      const phoneVal = payerPhoneVal ?? (shippingAddressRaw?.phone as string | null | undefined) ?? null;
      const emailVal = payerEmailVal ?? null;

      const payer = {
        name: payerNameVal && payerNameVal.trim() ? payerNameVal : recipient || null,
        email: emailVal ?? null,
        phone: phoneVal ?? null,
      };

      const shippingPayload: Record<string, unknown> = {
        firstName: normalizedFirst || firstName || '',
        lastName: normalizedLast || lastName || '',
        email: emailVal ?? email,
        phone: phoneVal ?? phone,
        unit: addressLine1 || '',
        // Order.shippingAddress's schema field is `line1`, not `address` — using the wrong key
        // here meant Mongoose silently dropped the street address on every wallet-paid order
        // (it only keeps fields matching the subdocument schema).
        line1: addressLine0 || address || '',
        city: cityVal || city,
        postcode: postcodeVal ? normalizeUkPostcode(String(postcodeVal)) : postcode || '',
        country: countryVal || country,
      };

      let billingPayload: Record<string, unknown> = {
        firstName: normalizedFirst || firstName,
        lastName: normalizedLast || lastName,
        unit: addressLine1 || unit,
        line1: addressLine0 || address,
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
            line1: addr.line1 ?? billingPayload.line1,
            city: addr.city ?? billingPayload.city,
            postcode: addr.postal_code
              ? normalizeUkPostcode(String(addr.postal_code))
              : billingPayload.postcode,
            country: addr.country ?? billingPayload.country,
            sameAsShipping: false,
          };
        }
      } catch {
        // ignore and fall back
      }

      try {
        await saveShipping({
          paymentIntentId,
          shippingAddress: shippingPayload,
          billingAddress: billingPayload,
          client: payer,
          source: 'payment_request',
        });
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
        )) as LocalConfirmResult;

        const status = result.paymentIntent?.status ?? '';

        if (status === 'requires_action') {
          try {
            event.complete('success');
          } catch {}
          const authResult = (await stripe.confirmCardPayment(clientSecret)) as LocalConfirmResult;

          if (authResult.error) {
            setError(authResult.error.message ?? 'Authentication failed.');
            setProcessing(false);
            return;
          }

          if (authResult.paymentIntent?.status !== 'succeeded') {
            setError('Payment authentication was not completed.');
            setProcessing(false);
            return;
          }
        } else if (status === 'succeeded') {
          try {
            event.complete('success');
          } catch {}
        } else if (result.error) {
          const msg = result.error.message ?? 'Payment failed.';
          setError(msg);
          try {
            event.complete('fail');
          } catch {}
          setProcessing(false);
          return;
        } else {
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
        }

        const finalizeResp = await finalizeOrder({ paymentIntentId });
        if (!finalizeResp.ok) {
          const serverMsg =
            (finalizeResp.body as Record<string, unknown>)?.message ||
            `Order finalization failed (status ${finalizeResp.status})`;
          setError(String(serverMsg));
          try {
            event.complete('fail');
          } catch {}
          setProcessing(false);
          return;
        }

        clearCart();
        router.push('/checkout/success');
      } catch (err) {
        try {
          if (event.complete) event.complete('fail');
        } catch {}
        const message = err instanceof Error ? err.message : String(err);
        setError(message || 'Unexpected error during wallet payment.');
      } finally {
        setProcessing(false);
      }
    };

    try {
      paymentRequest.on('shippingaddresschange', (ev: unknown) => onShippingAddressChange(ev));
      paymentRequest.on('paymentmethod', (ev: unknown) => onPaymentMethod(ev));
    } catch {
      // some runtimes may not support .on - swallow safely
    }

    return () => {
      try {
        const prWithOff = paymentRequest as unknown as {
          off?: (evName: string, fn: (e: unknown) => void) => void;
        };
        prWithOff.off?.('shippingaddresschange', (ev: unknown) => onShippingAddressChange(ev));
        prWithOff.off?.('paymentmethod', (ev: unknown) => onPaymentMethod(ev));
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
    unit,
    handleConfirmResult,
  ]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!stripe || !elements) {
      setError('Stripe is not loaded yet.');
      return;
    }

    const newErrors: Partial<Record<FieldKey, string>> = {};

    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!isValidEmail(email)) newErrors.email = 'Please enter a valid email address';
    if (!phone.trim()) newErrors.phone = 'Phone number is required';
    else if (!isValidUkPhone(normalizePhoneDigits(phone))) newErrors.phone = 'Please enter a valid UK phone number.';
    if (!address.trim()) newErrors.address = 'Street address is required';
    if (!city.trim()) newErrors.city = 'City is required';
    if (!postcode.trim()) newErrors.postcode = 'Postcode is required';
    else if (!isValidUkPostcode(postcode)) newErrors.postcode = 'Please enter a valid UK postcode.';

    if (!billingSame) {
      if (!billingFirstName.trim()) newErrors.billingFirstName = 'Billing first name is required';
      if (!billingLastName.trim()) newErrors.billingLastName = 'Billing last name is required';
      if (!billingAddress.trim()) newErrors.billingAddress = 'Billing address is required';
      if (!billingCity.trim()) newErrors.billingCity = 'Billing city is required';
      if (!billingPostcode.trim()) newErrors.billingPostcode = 'Billing postcode is required';
      else if (!isValidUkPostcode(billingPostcode)) newErrors.billingPostcode = 'Please enter a valid UK postcode for billing.';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...newErrors }));
      setError('Please fill in all required shipping fields.');
      return;
    }

    const normalizedPostcode = normalizeUkPostcode(postcode);
    setPostcode(normalizedPostcode);

    if (!billingSame) {
      setBillingPostcode(normalizeUkPostcode(billingPostcode));
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
        line1: address,
        city,
        postcode: normalizeUkPostcode(postcode),
        country,
      };
      const clientPayload = { name: `${firstName} ${lastName}`.trim(), email, phone };

      const billingPayload = billingSame
        ? {
            firstName,
            lastName,
            unit,
            line1: address,
            city,
            postcode: normalizeUkPostcode(postcode),
            country,
            sameAsShipping: true,
          }
        : {
            firstName: billingFirstName,
            lastName: billingLastName,
            unit: billingUnit,
            address: billingAddress,
            city: billingCity,
            postcode: normalizeUkPostcode(billingPostcode),
            country: billingCountry,
            sameAsShipping: false,
          };

      try {
        if (isSubscriptionCheckout) {
          await saveSubscriptionShipping({
            paymentIntentId,
            shippingAddress: shippingPayload,
            client: clientPayload,
          });
        } else {
          await saveShipping({
            paymentIntentId,
            shippingAddress: shippingPayload,
            billingAddress: billingPayload,
            client: clientPayload,
          });
        }
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
              postal_code: normalizeUkPostcode(postcode),
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
              postal_code: normalizeUkPostcode(billingPostcode),
              country: billingCountry,
            },
          };

      const result = (await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: billingDetails,
        },
      })) as LocalConfirmResult;

      const ok = await handleConfirmResult(result);

      if (!ok) {
        setProcessing(false);
        return;
      }

      // Subscriptions don't create an Order — there's nothing to "finalize" here.
      // The Subscription record itself was already created before this page loaded,
      // and the webhook flips its status to active once Stripe confirms the invoice.
      if (!isSubscriptionCheckout) {
        const finalizeResp = await finalizeOrder({ paymentIntentId });
        if (!finalizeResp.ok) {
          const serverMsg =
            (finalizeResp.body as Record<string, unknown>)?.message ||
            `Order finalization failed (status ${finalizeResp.status})`;
          setError(String(serverMsg));
          setProcessing(false);
          return;
        }
      }

      // Basket had one-off items and/or more than one subscription — the primary payment above
      // is paid (and, if it was an order, finalized); now charge every remaining subscription
      // too, one at a time, using the same card.
      for (const [index, secretToConfirm] of (secondaryClientSecrets ?? []).entries()) {
        const secondaryPaymentIntentId = extractPaymentIntentId(secretToConfirm);

        try {
          await saveSubscriptionShipping({
            paymentIntentId: secondaryPaymentIntentId,
            shippingAddress: shippingPayload,
            client: clientPayload,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(
            `Some of your order went through, but we couldn't save shipping details for subscription ${
              index + 1
            }: ${msg}. Please contact us.`
          );
          setProcessing(false);
          return;
        }

        const secondaryResult = (await stripe.confirmCardPayment(secretToConfirm, {
          payment_method: {
            card: elements.getElement(CardElement)!,
            billing_details: billingDetails,
          },
        })) as LocalConfirmResult;

        if (secondaryResult.error) {
          setError(
            `Some of your order went through, but subscription ${index + 1} failed: ${
              secondaryResult.error.message || 'please try subscribing again.'
            }`
          );
          setProcessing(false);
          return;
        }
      }

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

  const inputBaseClass =
    'w-full px-3 sm:px-4 py-2 sm:py-3 text-base rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all border-2';

  const errorBorder = 'border-red-400';
  const normalBorder = 'border-gray-300';

  return (
    <form onSubmit={handleSubmit} method="POST" autoComplete="on" noValidate className="space-y-4 sm:space-y-6">
      {/* Apple Pay / Google Pay isn't offered for subscriptions in this phase — the express-pay
          confirmation path below assumes a single one-off charge and isn't wired up to also
          confirm a second (subscription) charge the way the normal card form below is. */}
      {!isSubscriptionCheckout && !secondaryClientSecrets?.length && canUsePaymentRequest && paymentRequest && isValidEmail(email) && (
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

      {!isSubscriptionCheckout && !secondaryClientSecrets?.length && canUsePaymentRequest && paymentRequest && !isValidEmail(email) && (
        <div className="mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          Enter a valid email address above to use Apple Pay or Google Pay
        </div>
      )}

      {(isSubscriptionCheckout || !!secondaryClientSecrets?.length) && subscriptionDescriptions?.length && (
        <div className="mb-2 p-3 bg-black/5 border border-gray-200 rounded-lg text-sm text-black">
          {secondaryClientSecrets?.length
            ? `Your card will be charged ${
                secondaryClientSecrets.length + 1
              } times today: once for your one-off items and once per subscription below.`
            : "You're subscribing — you'll be billed on the schedule below."}{" "}
          Cancel anytime from the link in your confirmation email.
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
              onChange={(e) => {
                setFirstName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, firstName: null }));
              }}
              required
              className={`${inputBaseClass} ${fieldErrors.firstName ? errorBorder : normalBorder}`}
              placeholder="John"
            />
            {fieldErrors.firstName && <div className="text-xs text-red-600 mt-1">{fieldErrors.firstName}</div>}
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
              onChange={(e) => {
                setLastName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, lastName: null }));
              }}
              required
              className={`${inputBaseClass} ${fieldErrors.lastName ? errorBorder : normalBorder}`}
              placeholder="Doe"
            />
            {fieldErrors.lastName && <div className="text-xs text-red-600 mt-1">{fieldErrors.lastName}</div>}
          </div>

          <div className="relative">
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
                onChange={(e) => {
                  const val = e.target.value;
                  onEmailChange(val);
                  setFieldErrors((prev) => ({ ...prev, email: null }));
                }}
                onBlur={handleEmailBlur}
                required
                className={`${inputBaseClass} pl-8 sm:pl-10 pr-3 sm:pr-4 ${fieldErrors.email ? errorBorder : normalBorder}`}
                placeholder="you@example.com"
              />
            </div>
            {fieldErrors.email && <div className="text-xs text-red-600 mt-1">{fieldErrors.email}</div>}
          </div>

          <div className="relative">
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
                onChange={(e) => {
                  setPhone(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, phone: null }));
                }}
                onBlur={handlePhoneBlur}
                required
                className={`${inputBaseClass} pl-8 sm:pl-10 pr-3 sm:pr-4 ${fieldErrors.phone ? errorBorder : normalBorder}`}
                placeholder="+44 7700 900000"
              />
            </div>
            {fieldErrors.phone ? (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.phone}</div>
            ) : (
              <div className="text-xs text-gray-500 mt-1">Enter a UK phone number</div>
            )}
          </div>

          {lookupLoading && (
            <div className="text-xs text-gray-400 col-span-full mt-1">Checking for existing details…</div>
          )}

          {lookupError && <div className="text-sm text-yellow-700 col-span-full mt-1">{lookupError}</div>}

          {showAutofillPreview && foundClient && (
            <div className="col-span-full mt-2 p-3 bg-white border rounded-md flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{foundClient.name ?? foundClient.email}</div>
                <div className="text-xs text-gray-600">
                  {foundClient.email ?? ''} {foundClient.phone ? `• ${foundClient.phone}` : ''}
                </div>
                {foundClient.address && (
                  <div className="text-xs text-gray-500 mt-1">
                    {(foundClient.address.line1 || foundClient.address.address) ?? ''}
                    <br />
                    {foundClient.address.unit ? `${foundClient.address.unit}<br/>` : null}
                    {foundClient.address.city || ''} {foundClient.address.postcode ? `• ${foundClient.address.postcode}` : ''}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={applyFoundClient}
                  className="px-3 py-1 bg-black text-white rounded-md text-sm hover:bg-gray-800 transition-colors"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={discardFoundClient}
                  className="px-3 py-1 border rounded-md text-sm hover:bg-gray-50 transition-colors"
                >
                  Ignore
                </button>
              </div>
            </div>
          )}
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
              onChange={(e) => {
                setUnit(e.target.value);
                setFieldErrors((prev) => ({ ...prev, unit: null }));
              }}
              className={`${inputBaseClass} ${fieldErrors.unit ? errorBorder : normalBorder}`}
              placeholder="Flat 4 / Apt 2B"
            />
          </div>

          <div className="relative">
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
              onFocus={handleAddressFocus}
              required
              className={`${inputBaseClass} ${fieldErrors.address ? errorBorder : normalBorder}`}
              placeholder="123 High Street or SW1A 1AA"
            />
            {fieldErrors.address && <div className="text-xs text-red-600 mt-1">{fieldErrors.address}</div>}

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
                onChange={(e) => {
                  setCity(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, city: null }));
                }}
                required
                className={`${inputBaseClass} ${fieldErrors.city ? errorBorder : normalBorder}`}
                placeholder="London"
              />
              {fieldErrors.city && <div className="text-xs text-red-600 mt-1">{fieldErrors.city}</div>}
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
                  setFieldErrors((prev) => ({ ...prev, postcode: null }));
                }}
                onBlur={() => {
                  const normalized = normalizeUkPostcode(postcode);
                  setPostcode(normalized);
                  if (normalized && !isValidUkPostcode(normalized)) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      postcode: 'Please enter a valid UK postcode (e.g. EC1A 1BB).',
                    }));
                  } else {
                    setFieldErrors((prev) => ({ ...prev, postcode: null }));
                  }
                }}
                required
                className={`${inputBaseClass} ${fieldErrors.postcode ? errorBorder : normalBorder}`}
                placeholder="SW1A 1AA"
              />
              {fieldErrors.postcode ? (
                <div className="text-xs text-red-600 mt-1">{fieldErrors.postcode}</div>
              ) : (
                <div className="text-xs text-gray-500 mt-1">Enter a UK postcode</div>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Country <span className="text-black">*</span></label>
              <select
                name="country"
                autoComplete="country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, country: null }));
                }}
                required
                className={`${inputBaseClass} ${fieldErrors.country ? errorBorder : normalBorder}`}
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
                  onChange={(e) => {
                    setBillingFirstName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, billingFirstName: null }));
                  }}
                  required
                  className={`${inputBaseClass} ${fieldErrors.billingFirstName ? errorBorder : normalBorder}`}
                  placeholder="John"
                />
                {fieldErrors.billingFirstName && <div className="text-xs text-red-600 mt-1">{fieldErrors.billingFirstName}</div>}
              </div>

              <div>
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">Last Name <span className="text-black">*</span></label>
                <input
                  name="billing-family-name"
                  autoComplete="billing family-name"
                  type="text"
                  value={billingLastName}
                  onChange={(e) => {
                    setBillingLastName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, billingLastName: null }));
                  }}
                  required
                  className={`${inputBaseClass} ${fieldErrors.billingLastName ? errorBorder : normalBorder}`}
                  placeholder="Doe"
                />
                {fieldErrors.billingLastName && <div className="text-xs text-red-600 mt-1">{fieldErrors.billingLastName}</div>}
              </div>
            </div>

            <div>
              <label className="block text-base font-medium text-black mb-1 sm:mb-2">Apt, suite, unit (optional)</label>
              <input
                name="billing-address-line2"
                autoComplete="billing address-line2"
                type="text"
                value={billingUnit}
                onChange={(e) => {
                  setBillingUnit(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, billingUnit: null }));
                }}
                className={`${inputBaseClass} ${fieldErrors.billingUnit ? errorBorder : normalBorder}`}
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
                onChange={(e) => {
                  setBillingAddress(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, billingAddress: null }));
                }}
                required
                className={`${inputBaseClass} ${fieldErrors.billingAddress ? errorBorder : normalBorder}`}
                placeholder="123 High Street"
              />
              {fieldErrors.billingAddress && <div className="text-xs text-red-600 mt-1">{fieldErrors.billingAddress}</div>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">City <span className="text-black">*</span></label>
                <input
                  name="billing-address-level2"
                  autoComplete="billing address-level2"
                  type="text"
                  value={billingCity}
                  onChange={(e) => {
                    setBillingCity(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, billingCity: null }));
                  }}
                  required
                  className={`${inputBaseClass} ${fieldErrors.billingCity ? errorBorder : normalBorder}`}
                  placeholder="London"
                />
                {fieldErrors.billingCity && <div className="text-xs text-red-600 mt-1">{fieldErrors.billingCity}</div>}
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
                    setFieldErrors((prev) => ({ ...prev, billingPostcode: null }));
                  }}
                  onBlur={() => {
                    const normalized = normalizeUkPostcode(billingPostcode);
                    setBillingPostcode(normalized);
                    if (normalized && !isValidUkPostcode(normalized)) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        billingPostcode: 'Please enter a valid UK postcode (e.g. EC1A 1BB).',
                      }));
                    } else {
                      setFieldErrors((prev) => ({ ...prev, billingPostcode: null }));
                    }
                  }}
                  required
                  className={`${inputBaseClass} ${fieldErrors.billingPostcode ? errorBorder : normalBorder}`}
                  placeholder="EC1A 1BB"
                />
                {fieldErrors.billingPostcode ? (
                  <div className="text-xs text-red-600 mt-1">{fieldErrors.billingPostcode}</div>
                ) : (
                  <div className="text-xs text-gray-500 mt-1">Enter a UK postcode</div>
                )}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-base font-medium text-black mb-1 sm:mb-2">Country <span className="text-black">*</span></label>
                <select
                  name="billing-country"
                  autoComplete="billing country"
                  value={billingCountry}
                  onChange={(e) => {
                    setBillingCountry(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, billingCountry: null }));
                  }}
                  required
                  className={`${inputBaseClass} ${fieldErrors.billingCountry ? errorBorder : normalBorder}`}
                >
                  <option value="GB">United Kingdom</option>
                </select>
                {fieldErrors.billingCountry && <div className="text-xs text-red-600 mt-1">{fieldErrors.billingCountry}</div>}
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
        {typeof shippingPence === 'number' && (
          <div className="text-xs text-gray-500 mt-2">Shipping: £{(shippingPence / 100).toFixed(2)}</div>
        )}
        {!!subscriptionDescriptions?.length && (
          <div className="mt-3 p-3 bg-black/5 border border-gray-200 rounded-lg text-sm text-black space-y-1">
            <span className="font-semibold block">
              Subscription{subscriptionDescriptions.length > 1 ? "s" : ""}:
            </span>
            {subscriptionDescriptions.map((desc, i) => (
              <div key={i}>{desc}</div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4 text-red-800">{error}</div>}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-base"
      >
        {processing ? (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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