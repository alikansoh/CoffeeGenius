'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Trash2, Mail, User, Phone } from 'lucide-react';

type Enquiry = {
  _id: string;
  business?: string;
  contact?: string;
  email?: string;
  phone?: string;
  interest?: string;
  message?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ApiListResponse = {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  data: Enquiry[];
};

/**
 * Admin Enquiries page — simplified (no selection)
 *
 * - Single-item delete only (no selection / bulk actions).
 * - Dynamic contact actions (mailto / tel) when email/phone present.
 * - Search (debounced), pagination, and a clean modal to view each enquiry.
 *
 * Endpoints used:
 * - GET  /api/enquiry?page=&limit=&q=
 * - DELETE /api/enquiry/:id
 */

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [expanded, setExpanded] = useState<Enquiry | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const fetchSignalRef = useRef<AbortController | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1); // reset page when searching
  }, [debouncedQuery]);

  useEffect(() => {
    fetchEnquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery]);

  async function fetchEnquiries() {
    setLoading(true);
    setError(null);
    if (fetchSignalRef.current) fetchSignalRef.current.abort();
    const ac = new AbortController();
    fetchSignalRef.current = ac;

    try {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('limit', String(limit));
      if (debouncedQuery) qs.set('q', debouncedQuery);
      const res = await fetch(`/api/enquiry?${qs.toString()}`, { signal: ac.signal });
      if (!res.ok) throw new Error(`Failed to load enquiries (${res.status})`);
      const json: ApiListResponse = await res.json();
      setEnquiries(json.data || []);
      setTotal(json.meta?.total ?? 0);
      setTotalPages(json.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load enquiries');
      setEnquiries([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return enquiries;
    return enquiries.filter((e) =>
      (e.business || '').toLowerCase().includes(q) ||
      (e.contact || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.interest || '').toLowerCase().includes(q) ||
      (e.message || '').toLowerCase().includes(q)
    );
  }, [enquiries, debouncedQuery]);

  async function confirmAndDelete(id: string) {
    if (!confirm('Delete this enquiry? This cannot be undone.')) return;
    setDeleteLoadingId(id);
    try {
      const res = await fetch(`/api/enquiry/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to delete (${res.status})`);
      }
      setEnquiries((prev) => prev.filter((p) => p._id !== id));
      if (expanded?._id === id) setExpanded(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteLoadingId(null);
    }
  }

  // Build mailto link for an enquiry (subject + body prefilled)
  function buildMailTo(enq: Enquiry) {
    const to = enq.email || '';
    const subject = `Re: Enquiry ${enq._id}${enq.business ? ` — ${enq.business}` : ''}`;
    const lines = [
      `Hi ${enq.contact ?? ''},`,
      '',
      `Regarding your enquiry${enq.interest ? ` (${enq.interest})` : ''}:`,
      '',
      enq.message ? `${enq.message}` : '(no message provided)',
      '',
      '---',
      `Enquiry reference: ${enq._id}`,
      '',
      'Best regards,',
      '',
    ];
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${body}`;
  }

  // Build tel link (tel:)
  function buildTel(enq: Enquiry) {
    if (!enq.phone) return '#';
    // sanitize phone number (keep digits, + and , ; pause chars)
    const tel = enq.phone.replace(/[^\d+,;+*#\s]/g, '').trim();
    return `tel:${tel}`;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Wholesale Enquiries</h1>
            <p className="text-sm text-gray-600">View and delete incoming wholesale enquiries</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search business, contact, email, phone or message..."
                className="pl-10 pr-12 py-2 border rounded-lg w-96 focus:outline-none focus:ring-1 focus:ring-black"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={16} />
                </button>
              )}
            </div>

            <button onClick={() => { setPage(1); fetchEnquiries(); }} className="px-4 py-2 bg-white border rounded-lg">Refresh</button>
          </div>
        </div>

        {/* Info toolbar */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="text-sm text-gray-600">
            {total} enquiries — Page {page} of {totalPages}
          </div>
          <div className="text-sm text-gray-500">Tip: click &quot;View&quot; to open details and contact the enquirer.</div>
        </div>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white p-6 rounded-lg h-24" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg p-8 border text-center">
            <p className="text-gray-700">No enquiries found.</p>
            <p className="text-sm text-gray-500 mt-2">Try adjusting your search or refresh the list.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((e) => {
              const deleting = deleteLoadingId === e._id;
              const hasEmail = !!e.email;
              const hasPhone = !!e.phone;
              return (
                <article key={e._id} className="bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate">{e.business || '—'}</h3>
                      <p className="text-sm text-gray-600 mt-1 truncate">{e.contact || '—'}</p>
                      <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-2">
                        {hasEmail && <span className="flex items-center gap-2"><Mail size={14} />{e.email}</span>}
                        {hasPhone && <span className="flex items-center gap-2"><Phone size={14} />{e.phone}</span>}
                      </div>
                    </div>

                    <div className="ml-3 flex flex-col items-end gap-2">
                      <span className="text-xs text-gray-400">{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>

                  <div className="text-sm text-gray-700 mb-4 line-clamp-3">{e.message || '—'}</div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setExpanded(e)} className="flex-1 px-3 py-2 bg-black text-white rounded-lg text-sm">View</button>

                    {/* Dynamic contact actions */}
                    {hasEmail ? (
                      <a
                        href={buildMailTo(e)}
                        className="px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-2"
                        title={`Email ${e.contact || e.email}`}
                      >
                        <Mail size={14} /> Email
                      </a>
                    ) : (
                      <button disabled className="px-3 py-2 border rounded-lg text-sm text-gray-300">Email</button>
                    )}

                    {hasPhone ? (
                      <a
                        href={buildTel(e)}
                        className="px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-2"
                        title={`Call ${e.contact || e.phone}`}
                      >
                        <Phone size={14} /> Call
                      </a>
                    ) : (
                      <button disabled className="px-3 py-2 border rounded-lg text-sm text-gray-300">Call</button>
                    )}

                    <button
                      onClick={() => confirmAndDelete(e._id)}
                      disabled={deleting}
                      className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"
                    >
                      {deleting ? 'Deleting…' : <Trash2 size={16} />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6 bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-600">
            Showing page {page} of {totalPages} — {total} enquiry{total !== 1 ? 'ies' : ''}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 border rounded-lg disabled:opacity-50">Previous</button>
            <div className="px-4 py-2 bg-black text-white rounded-lg">{page}</div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-2 border rounded-lg disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{expanded.business}</h2>
                <div className="text-sm text-gray-600">
                  {expanded.contact} • {expanded.email || '—'} {expanded.phone ? `• ${expanded.phone}` : ''}
                </div>
                <div className="text-xs text-gray-400 mt-1">{expanded.interest ? `Interest: ${expanded.interest}` : ''}</div>
              </div>
              <button onClick={() => setExpanded(null)} className="p-2 rounded hover:bg-gray-100"><X /></button>
            </div>

            <div className="p-6">
              <h4 className="text-sm text-gray-500 mb-2">Message</h4>
              <div className="bg-gray-50 p-4 rounded text-sm text-gray-800 whitespace-pre-wrap">{expanded.message || '—'}</div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-xs text-gray-500">Submitted</p>
                  <p className="text-sm font-medium text-gray-900">{expanded.createdAt ? new Date(expanded.createdAt).toLocaleString() : '—'}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="text-sm font-medium text-gray-900">{expanded.status || 'new'}</p>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                {expanded.email ? (
                  <a href={buildMailTo(expanded)} className="px-4 py-2 border rounded-lg inline-flex items-center gap-2"><Mail size={16} /> Email</a>
                ) : (
                  <button disabled className="px-4 py-2 border rounded-lg text-sm text-gray-400">No email</button>
                )}

                {expanded.phone ? (
                  <a href={buildTel(expanded)} className="px-4 py-2 border rounded-lg inline-flex items-center gap-2"><Phone size={16} /> Call</a>
                ) : (
                  <button disabled className="px-4 py-2 border rounded-lg text-sm text-gray-400">No phone</button>
                )}

                <button onClick={() => { confirmAndDelete(expanded._id); setExpanded(null); }} className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50">
          <div className="flex items-start gap-4">
            <div><X /></div>
            <div>
              <div className="font-semibold">Error</div>
              <div className="text-sm">{error}</div>
            </div>
            <div className="ml-4">
              <button onClick={() => setError(null)} className="underline">Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}