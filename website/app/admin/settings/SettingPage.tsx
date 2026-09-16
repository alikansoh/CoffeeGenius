'use client';

import { useEffect, useState } from 'react';
import { poundsToPence, penceToPounds, formatPenceToGBP } from '@/lib/currency';

/**
 * Simple admin page to view/edit delivery settings.
 * - Values shown in pounds; stored in pence in DB.
 *
 * Route: /admin/settings
 *
 * NOTE: No auth here — add protection in production.
 */

export default function AdminSettingsPage() {
  const [deliveryPounds, setDeliveryPounds] = useState<number>(4.99);
  const [thresholdPounds, setThresholdPounds] = useState<number>(30);
  const [enabled, setEnabled] = useState<boolean>(true);

  // Subscription delivery — separate rules from the one-off order settings above. Checked
  // against the per-delivery subscription price itself (no cart to sum), and baked into the
  // subscription's Stripe Price at signup/frequency-change time.
  const [subDeliveryPounds, setSubDeliveryPounds] = useState<number>(4.99);
  const [subThresholdPounds, setSubThresholdPounds] = useState<number>(30);
  const [subEnabled, setSubEnabled] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const json = await res.json();
        // convert from pence to pounds
        setDeliveryPounds((json.deliveryPricePence ?? 499) / 100);
        setThresholdPounds((json.freeDeliveryThresholdPence ?? 3000) / 100);
        setEnabled(Boolean(json.freeDeliveryEnabled ?? true));
        setSubDeliveryPounds((json.subscriptionDeliveryPricePence ?? 499) / 100);
        setSubThresholdPounds((json.subscriptionFreeDeliveryThresholdPence ?? 3000) / 100);
        setSubEnabled(Boolean(json.subscriptionFreeDeliveryEnabled ?? true));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        deliveryPricePence: poundsToPence(Number(deliveryPounds || 0)),
        freeDeliveryThresholdPence: poundsToPence(Number(thresholdPounds || 0)),
        freeDeliveryEnabled: Boolean(enabled),
        subscriptionDeliveryPricePence: poundsToPence(Number(subDeliveryPounds || 0)),
        subscriptionFreeDeliveryThresholdPence: poundsToPence(Number(subThresholdPounds || 0)),
        subscriptionFreeDeliveryEnabled: Boolean(subEnabled),
      };
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to save settings');
      }
      setSuccess('Settings saved');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-3">Delivery settings</h1>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="space-y-4 bg-white p-6 rounded border">
          {error && <div className="text-sm text-red-700">{error}</div>}
          {success && <div className="text-sm text-green-700">{success}</div>}

          <div>
            <label className="block text-sm font-medium mb-1">Delivery price (GBP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={deliveryPounds}
              onChange={(e) => setDeliveryPounds(Number(e.target.value))}
              className="w-48 border px-3 py-2 rounded"
            />
            <div className="text-xs text-gray-500 mt-1">{formatPenceToGBP(poundsToPence(deliveryPounds))} stored</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Free delivery threshold (GBP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={thresholdPounds}
              onChange={(e) => setThresholdPounds(Number(e.target.value))}
              className="w-48 border px-3 py-2 rounded"
            />
            <div className="text-xs text-gray-500 mt-1">
              {formatPenceToGBP(poundsToPence(thresholdPounds))} stored
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input id="enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <label htmlFor="enabled" className="text-sm">Enable free delivery threshold</label>
          </div>

        </div>
      )}

      {!loading && (
        <div className="space-y-4 bg-white p-6 rounded border mt-6">
          <div>
            <h2 className="text-lg font-bold">Subscription delivery</h2>
            <p className="text-xs text-gray-500 mt-1">
              Separate delivery rule for coffee subscriptions — checked against each delivery&apos;s
              own price, not a cart total. A price change here only applies to new subscribers or
              existing subscribers who change their delivery frequency; it never changes what
              someone already on a plan is charged.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subscription delivery price (GBP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={subDeliveryPounds}
              onChange={(e) => setSubDeliveryPounds(Number(e.target.value))}
              className="w-48 border px-3 py-2 rounded"
            />
            <div className="text-xs text-gray-500 mt-1">{formatPenceToGBP(poundsToPence(subDeliveryPounds))} stored</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Free delivery threshold (GBP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={subThresholdPounds}
              onChange={(e) => setSubThresholdPounds(Number(e.target.value))}
              className="w-48 border px-3 py-2 rounded"
            />
            <div className="text-xs text-gray-500 mt-1">
              {formatPenceToGBP(poundsToPence(subThresholdPounds))} stored — a subscription whose
              per-delivery price is at or above this gets free delivery.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="subEnabled"
              type="checkbox"
              checked={subEnabled}
              onChange={(e) => setSubEnabled(e.target.checked)}
            />
            <label htmlFor="subEnabled" className="text-sm">Enable free delivery threshold for subscriptions</label>
          </div>
        </div>
      )}

      {!loading && (
        <div className="flex items-center gap-3 mt-6">
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-black text-white rounded">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
    </div>
  );
}