'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Check } from 'lucide-react';

/**
 * Create New Client — Classic white & black theme
 * - Minimal form (no marketing fields)
 * - POSTs to /api/admin/clients
 * - Redirects to /admin/clients on success
 */

export default function CreateClientPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) return setError('Name is required');
    if (email && !validateEmail(email)) return setError('Please enter a valid email address');

    const payload = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: {
        line1: line1.trim() || null,
        unit: unit.trim() || null,
        city: city.trim() || null,
        postcode: postcode.trim() || null,
        country: country.trim() || null,
      },
    };

    setLoading(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error || `Failed to create client (${res.status})`;
        throw new Error(msg);
      }

      const created = await res.json();
      setSuccess('Client created successfully');
      setTimeout(() => {
        router.push('/admin/customers');
      }, 600);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black p-6">
      <div className="max-w-3xl mx-auto border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-5 flex items-center justify-between bg-white border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-black text-white">
              <UserPlus />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Create New Client</h1>
              <p className="text-sm text-gray-600">Add a new client record (classic theme).</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="px-3 py-2 rounded-md border border-gray-200 text-sm hover:bg-gray-50"
              title="Back"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6 bg-white">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 p-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-800 bg-green-50 border border-green-100 p-3 rounded flex items-center gap-2">
              <Check /> <span>{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full name</label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7123 456789"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Created (read-only)</label>
              <input
                className="w-full rounded border border-gray-200 px-3 py-2 bg-gray-50 text-gray-500"
                value={''}
                readOnly
                placeholder="Set by system"
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Address line 1"
              />
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Unit / Apt"
              />
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode"
              />
              <input
                className="w-full sm:col-span-2 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-0 focus:border-black"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country (e.g. GB)"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded bg-black text-white text-sm font-medium hover:opacity-95 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}