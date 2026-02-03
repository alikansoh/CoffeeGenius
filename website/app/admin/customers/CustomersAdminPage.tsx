'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Mail,
  Search,
  X,
  Package,
  UserPlus,
  Clock,
  Users,
  DollarSign,
  ShoppingBag,
  MapPin,
  Phone,
  Edit2,
  Trash2,
  User,
} from 'lucide-react';

type Address = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
};

type ClientRow = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: Address | null;
  createdAt?: string;
  updatedAt?: string;
  orderCount?: number;
  totalSpent?: number;
};

type Order = {
  _id: string;
  orderNumber?: string;
  createdAt?: string;
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  status?: string;
  items?: Array<{ name: string; qty: number; unitPrice: number; totalPrice: number }>;
};

type ApiResponse = {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  data: ClientRow[];
};

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [expandedClient, setExpandedClient] = useState<ClientRow | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Order[] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Edit modal state
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Per-client action loading (download)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Export menu
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Close export menu on outside click / Esc
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExportMenu(false);
    }
    if (showExportMenu) {
      document.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showExportMenu]);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('limit', String(limit));
      if (query.trim()) qs.set('q', query.trim());
      const res = await fetch(`/api/admin/clients?${qs.toString()}`);
      if (!res.ok) throw new Error(`Failed to load clients (${res.status})`);
      const json: ApiResponse = await res.json();
      setClients(json.data || []);
      setSelectedIds({});
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load clients');
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrdersForClient = async (clientId: string) => {
    setOrdersLoading(true);
    setExpandedOrders(null);
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(clientId)}/orders`);
      if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
      const orders: Order[] = await res.json();
      setExpandedOrders(orders || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setExpandedOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalOrders = clients.reduce((sum, c) => sum + (c.orderCount ?? 0), 0);
    const totalRevenue = clients.reduce((sum, c) => sum + (c.totalSpent ?? 0), 0);
    return { totalClients, totalOrders, totalRevenue };
  }, [clients]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address?.line1 || '').toLowerCase().includes(q) ||
      (c.address?.postcode || '').toLowerCase().includes(q)
    );
  }, [clients, query]);

  function openEditModal(client: ClientRow) {
    setEditingClient({ ...client, address: client.address || {} });
  }

  async function saveClientEdits(): Promise<void> {
    if (!editingClient) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(editingClient._id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: editingClient.name,
          email: editingClient.email,
          phone: editingClient.phone,
          address: editingClient.address,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to save (${res.status})`);
      }
      const updated = await res.json();
      setClients((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      setEditingClient(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setEditLoading(false);
    }
  }

  async function confirmAndDelete(clientId: string) {
    if (!confirm('Delete this client? This will remove the client record and unset clientId from their orders.')) return;
    setDeleteLoadingId(clientId);
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to delete (${res.status})`);
      }
      setClients((prev) => prev.filter((c) => c._id !== clientId));
      if (expandedClient?._id === clientId) setExpandedClient(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteLoadingId(null);
    }
  }

  async function downloadAll(format: 'csv' | 'json' | 'pdf') {
    setShowExportMenu(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/download-all?format=${format}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to download (${res.status})`);
      }
      const blob = await res.blob();
      const ext = format === 'csv' ? 'csv' : format === 'json' ? 'json' : 'pdf';
      const filename = `clients-all.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function downloadClientPdf(id: string) {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(id)}/download?format=pdf`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to download (${res.status})`);
      }
      const blob = await res.blob();
      const filename = `client-${id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Dashboard</h1>
              <p className="text-gray-600">Manage your clients and track orders</p>
            </div>

            <div className="flex items-center gap-3 relative" ref={exportRef}>
              {/* Export button toggles choices */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu((s) => !s)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:border-gray-400 hover:bg-gray-50 transition-all"
                  aria-expanded={showExportMenu}
                  aria-haspopup="menu"
                >
                  <Download size={18} /> Export
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => downloadAll('csv')}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={() => downloadAll('pdf')}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      Export PDF
                    </button>
                  </div>
                )}
              </div>

              <a
                href="/admin/customers/create"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-900 transition-all shadow-lg shadow-black/10"
              >
                <UserPlus size={18} /> Add Client
              </a>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">Total Clients</p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">{stats.totalClients}</p>
                </div>
                <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                  <Users size={24} className="text-blue-700" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-700">Total Orders</p>
                  <p className="text-3xl font-bold text-purple-900 mt-1">{stats.totalOrders}</p>
                </div>
                <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                  <ShoppingBag size={24} className="text-purple-700" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-5 border border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-700">Revenue</p>
                  <p className="text-3xl font-bold text-amber-900 mt-1">
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(stats.totalRevenue)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-200 rounded-full flex items-center justify-center">
                  <DollarSign size={24} className="text-amber-700" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Search */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-black transition-colors"
                placeholder="Search by name, email, phone, or address..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                  <X size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Client Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-6 h-48" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package size={48} className="text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900 mb-2">No clients found</p>
              <p className="text-gray-600 mb-6">Try adjusting your search or add a new client</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((c) => {
                const checked = !!selectedIds[c._id];
                const downloading = !!actionLoading[c._id];
                return (
                  <article key={c._id} className="group bg-white rounded-xl border-2 border-gray-200 hover:border-gray-400 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(c._id)}
                            className="mt-1 h-5 w-5 rounded border-2 border-gray-300"
                            aria-label={`Select ${c.name}`}
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold text-gray-900 truncate mb-2">{c.name || 'Unnamed Client'}</h3>

                            <div className="space-y-1.5">
                              {c.email && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Mail size={14} className="text-gray-400 flex-shrink-0" />
                                  <span className="truncate">{c.email}</span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Phone size={14} className="text-gray-400 flex-shrink-0" />
                                  <span>{c.phone}</span>
                                </div>
                              )}
                              {(c.address?.line1 || c.address?.postcode) && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                                  <span className="truncate">
                                    {c.address?.line1}{c.address?.postcode ? ` • ${c.address.postcode}` : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-4 pt-4 border-t border-gray-100">
                        <div className="flex-1 text-center">
                          <p className="text-xs text-gray-500 mb-1">Orders</p>
                          <p className="text-2xl font-bold text-gray-900">{c.orderCount ?? 0}</p>
                        </div>
                        <div className="w-px h-10 bg-gray-200"></div>
                        <div className="flex-1 text-center">
                          <p className="text-xs text-gray-500 mb-1">Spent</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(c.totalSpent ?? 0)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(c)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border-2 border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-all"
                        >
                          <Edit2 size={16} /> Edit
                        </button>

                       

                        <button
                          onClick={() => confirmAndDelete(c._id)}
                          disabled={deleteLoadingId === c._id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border-2 border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                          <Trash2 size={16} /> {deleteLoadingId === c._id ? 'Deleting...' : 'Delete'}
                        </button>

                        <button
                          onClick={() => {
                            setExpandedClient(c);
                            fetchOrdersForClient(c._id);
                          }}
                          className="px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-900 transition-all"
                          title="View order history"
                        >
                          <Clock size={20} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-6 py-4">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filtered.length}</span> of <span className="font-semibold text-gray-900">{clients.length}</span> clients
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-400 transition-colors"
              >
                Previous
              </button>
              <div className="px-5 py-2 bg-black text-white rounded-lg text-sm font-bold">{page}</div>
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <User />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Edit Client</h3>
                  <p className="text-sm text-white/80 mt-0.5">Update client information</p>
                </div>
              </div>
              <button onClick={() => setEditingClient(null)} className="p-2 text-white/80 hover:bg-white/10 rounded-lg transition-colors">
                <X />
              </button>
            </div>

            <div className="p-6 max-h-[calc(90vh-180px)] overflow-y-auto">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h4 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                      <input
                        value={editingClient.name || ''}
                        onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                        placeholder="Enter full name"
                        className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                        <input
                          type="email"
                          value={editingClient.email || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                          placeholder="email@example.com"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          value={editingClient.phone || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                          placeholder="+44 7123 456789"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div className="pt-6 border-t-2 border-gray-200">
                  <h4 className="text-lg font-bold text-gray-900 mb-4">Address Information</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">First Name</label>
                        <input
                          value={editingClient.address?.firstName || ''}
                          onChange={(e) => setEditingClient({
                            ...editingClient,
                            address: { ...(editingClient.address || {}), firstName: e.target.value }
                          })}
                          placeholder="First name"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
                        <input
                          value={editingClient.address?.lastName || ''}
                          onChange={(e) => setEditingClient({
                            ...editingClient,
                            address: { ...(editingClient.address || {}), lastName: e.target.value }
                          })}
                          placeholder="Last name"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Address Line 1</label>
                      <input
                        value={editingClient.address?.line1 || ''}
                        onChange={(e) => setEditingClient({
                          ...editingClient,
                          address: { ...(editingClient.address || {}), line1: e.target.value }
                        })}
                        placeholder="Street address"
                        className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Unit / Apartment</label>
                      <input
                        value={editingClient.address?.unit || ''}
                        onChange={(e) => setEditingClient({
                          ...editingClient,
                          address: { ...(editingClient.address || {}), unit: e.target.value }
                        })}
                        placeholder="Apt, Suite, Unit (optional)"
                        className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                        <input
                          value={editingClient.address?.city || ''}
                          onChange={(e) => setEditingClient({
                            ...editingClient,
                            address: { ...(editingClient.address || {}), city: e.target.value }
                          })}
                          placeholder="City"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Postcode</label>
                        <input
                          value={editingClient.address?.postcode || ''}
                          onChange={(e) => setEditingClient({
                            ...editingClient,
                            address: { ...(editingClient.address || {}), postcode: e.target.value }
                          })}
                          placeholder="Postcode"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                        <input
                          value={editingClient.address?.country || ''}
                          onChange={(e) => setEditingClient({
                            ...editingClient,
                            address: { ...(editingClient.address || {}), country: e.target.value }
                          })}
                          placeholder="GB"
                          className="w-full border-2 border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:border-black transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metadata (Read-only) */}
                {editingClient.createdAt && (
                  <div className="pt-6 border-t-2 border-gray-200">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">Account Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-500 font-medium mb-1">Created At</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {new Date(editingClient.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {editingClient.updatedAt && (
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <p className="text-xs text-gray-500 font-medium mb-1">Last Updated</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {new Date(editingClient.updatedAt).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl border-t-2 border-gray-200">
              <button
                onClick={() => setEditingClient(null)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg font-medium hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => saveClientEdits()}
                disabled={editLoading}
                className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders Modal */}
      {expandedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-6 flex items-start justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">Order History</div>
                <h2 className="text-2xl font-bold text-white">{expandedClient.name}</h2>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <Mail size={14} /> {expandedClient.email}
                  </span>
                  {expandedClient.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={14} /> {expandedClient.phone}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setExpandedClient(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Total Orders</p>
                    <p className="text-3xl font-bold text-gray-900">{expandedClient.orderCount ?? 0}</p>
                  </div>
                  <div className="w-px h-12 bg-gray-200" />
                  <div>
                    <p className="text-sm text-gray-500">Total Spent</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(expandedClient.totalSpent ?? 0)}
                    </p>
                  </div>
                </div>
              </div>

              {ordersLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-32" />
                  ))}
                </div>
              ) : expandedOrders && expandedOrders.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag size={40} className="text-gray-400" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mb-2">No orders yet</p>
                  <p className="text-sm text-gray-500">This client hasn&apos;t placed any orders</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expandedOrders?.map((o) => (
                    <div key={o._id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 p-6 hover:border-gray-300 transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-gray-900">{o.orderNumber || o._id}</h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              o.status === 'completed' ? 'bg-green-100 text-green-700' :
                              o.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock size={14} />
                            <span>{o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : 'Unknown date'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-gray-900">
                            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(o.total ?? 0)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {o.items?.length ?? 0} item{(o.items?.length ?? 0) !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      {o.items && o.items.length > 0 && (
                        <div className="border-t border-gray-200 pt-4 mt-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Order Items</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {o.items.map((item, idx) => (
                              <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                      <span>Qty: {item.qty}</span>
                                      <span>•</span>
                                      <span>
                                        {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(item.unitPrice)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-3 text-right">
                                    <p className="font-bold text-gray-900 text-sm">
                                      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(item.totalPrice)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="border-t border-gray-200 pt-4 mt-4">
                        <div className="flex justify-end">
                          <div className="w-64 space-y-2 text-sm">
                            {o.subtotal !== undefined && (
                              <div className="flex justify-between text-gray-600">
                                <span>Subtotal:</span>
                                <span className="font-medium">
                                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(o.subtotal)}
                                </span>
                              </div>
                            )}
                            {o.shipping !== undefined && (
                              <div className="flex justify-between text-gray-600">
                                <span>Shipping:</span>
                                <span className="font-medium">
                                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(o.shipping)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
                              <span>Total:</span>
                              <span>
                                {new Intl.NumberFormat('en-GB', { style: 'currency', currency: (o.currency || 'GBP').toUpperCase() }).format(o.total ?? 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-md z-50">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <X />
          </div>
          <div className="flex-1">
            <p className="font-semibold mb-1">Error</p>
            <p className="text-sm text-white/90">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}