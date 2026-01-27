"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  PencilIcon,
  Trash2,
  Search,
  Plus,
  Calendar,
  Clock,
  Users,
  Tag,
  Play,
  X,
  ArrowLeft,
  Sparkles,
  MapPin,
  CheckCircle,
} from "lucide-react";
import { getCloudinaryThumbnail } from "@/app/utils/cloudinary";

export interface ClassItem {
  _id: string;
  slug: string;
  title: string;
  subtitle?: string;
  price?: number;
  summary?: string;
  durationMinutes?: number;
  capacity?: number;
  instructor?: { name: string; avatar?: string };
  image?: string;
  featured?: boolean;
  sessions?: { id: string; start: string; end: string }[];
  location?: string;
}

export interface BookingItem {
  courseSlug: string;
  _id: string;
  bookingRef: string;
  courseId: string;
  courseTitle?: string;
  sessionId?: string;
  sessionStart?: string;
  sessionEnd?: string;
  name: string;
  email: string;
  phone: string;
  attendees: number;
  status: string;
  createdAt: string;
}

type ToastType = "error" | "success";

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: ToastType;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50 ${
        type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
      }`}
    >
      {type === "error" ? <Trash2 size={20} /> : <CheckCircle size={20} />}
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 hover:bg-white/20 rounded-lg transition"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

interface AdminClassesListProps {
  sendCookies?: boolean;
}

export default function AdminClassesList({ sendCookies = true }: AdminClassesListProps) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Bookings state
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsFilterCourse, setBookingsFilterCourse] = useState<string>(""); // courseId or empty = all
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsLimit] = useState(50);
  const [bookingsTotal, setBookingsTotal] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchClasses = async () => {
      setLoading(true);
      try {
        const res = await window.fetch("/api/classes?limit=200", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => null);
          throw new Error(`Fetch failed: ${res.status} ${text ?? ""}`);
        }

        const data = await res.json();
        // Accept flexible payload shapes similar to coffee page
        const list: ClassItem[] = data?.data || data?.classes || data || [];
        if (mounted) setClasses(list);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load classes");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchClasses();
    return () => {
      mounted = false;
    };
  }, [sendCookies]);

  const filtered = classes.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title?.toLowerCase().includes(q) ||
      (c.subtitle || "").toLowerCase().includes(q) ||
      (c.instructor?.name || "").toLowerCase().includes(q) ||
      (c.location || "").toLowerCase().includes(q) ||
      c.slug?.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string, title?: string) => {
    if (!confirm(`Delete "${title ?? id}"? This action cannot be undone.`)) return;

    try {
      const res = await window.fetch(`/api/classes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        throw new Error(`Delete failed: ${res.status} ${text ?? ""}`);
      }

      setClasses((prev) => prev.filter((p) => p._id !== id));
      setSuccess(`"${title ?? "Class"}" deleted`);
    } catch (err) {
      console.error(err);
      setError("Failed to delete class");
    }
  };

  // --- Bookings actions ---
  const fetchBookings = async (opts?: { courseId?: string; page?: number }) => {
    setBookingsLoading(true);
    try {
      const url = new URL("/api/booking", window.location.origin);
      if (opts?.courseId) url.searchParams.set("courseId", opts.courseId);
      url.searchParams.set("page", String(opts?.page ?? bookingsPage));
      url.searchParams.set("limit", String(bookingsLimit));

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        throw new Error(`Fetch bookings failed: ${res.status} ${text ?? ""}`);
      }

      const body = await res.json();
      const list: BookingItem[] = body?.data || [];
      setBookings(list);
      setBookingsTotal(body?.pagination?.total ?? 0);
      setBookingsPage(body?.pagination?.page ?? 1);
    } catch (err) {
      console.error(err);
      setError("Failed to load bookings");
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    // load bookings on mount (all bookings)
    void fetchBookings({ courseId: bookingsFilterCourse || undefined, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsFilterCourse]);

  const handleDeleteBooking = async (id: string, ref?: string) => {
    if (!confirm(`Delete booking ${ref ?? id}? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        throw new Error(`Delete booking failed: ${res.status} ${text ?? ""}`);
      }

      setBookings((prev) => prev.filter((b) => b._id !== id));
      setSuccess(`Booking ${ref ?? id} deleted`);
    } catch (err) {
      console.error(err);
      setError("Failed to delete booking");
    }
  };

  return (
    <>
      <style jsx global>{`
        input {
          font-size: 16px !important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin")}
                  className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                  aria-label="Back to admin"
                >
                  <ArrowLeft size={20} />
                </button>

                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Classes</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                    View, edit and manage your class offerings
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin/classes/create")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md hover:shadow-lg font-medium text-sm"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Create Class</span>
                  <span className="sm:hidden">Create</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
          {/* Classes list (same as before) */}
          <div>
            <h2 className="text-lg font-bold mb-3">Classes</h2>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, instructor, location or slug..."
                  className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-lg transition"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Image</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Title</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Instructor</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Location</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Sessions</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-900 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                            <p className="text-sm text-gray-600">Loading classes...</p>
                          </div>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <Play size={48} className="text-gray-300" />
                            <p className="text-gray-900 font-medium">
                              {search ? "No classes match your search" : "No classes found"}
                            </p>
                            {!search && (
                              <button
                                onClick={() => router.push("/admin/classes/create")}
                                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium text-sm"
                              >
                                <Plus size={16} />
                                Create Your First Class
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((cls) => (
                        <tr key={cls._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-gray-200">
                              {cls.image ? (
                                <Image
                                  src={getCloudinaryThumbnail(cls.image, 200)}
                                  alt={cls.title}
                                  width={64}
                                  height={64}
                                  className="object-cover w-full h-full"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Play size={24} className="text-gray-400" />
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{cls.title}</div>
                            {cls.subtitle && <div className="text-sm text-gray-500">{cls.subtitle}</div>}
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600">{cls.instructor?.name ?? "—"}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600">{cls.location ?? "—"}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600">{cls.sessions?.length ?? 0}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => router.push(`/admin/classes/edit/${encodeURIComponent(cls._id)}`)}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-all font-medium"
                              >
                                <PencilIcon size={14} />
                                Edit
                              </button>

                              <button
                                onClick={() => handleDelete(cls._id, cls.title)}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-xl border-2 border-red-200 hover:bg-red-100 transition-all font-medium"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bookings section (separate) */}
          <div>
            <h2 className="text-lg font-bold mb-3">Bookings</h2>

            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700 font-medium mr-2">Filter by class</label>
                <select
                  value={bookingsFilterCourse}
                  onChange={(e) => setBookingsFilterCourse(e.target.value)}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => void fetchBookings({ courseId: bookingsFilterCourse || undefined, page: 1 })}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800"
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    setBookingsFilterCourse("");
                    setBookingsPage(1);
                    void fetchBookings({ page: 1 });
                  }}
                  className="px-3 py-2 border rounded-xl"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Ref</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Class</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Session</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Attendee</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Created</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-900 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {bookingsLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                            <p className="text-sm text-gray-600">Loading bookings...</p>
                          </div>
                        </td>
                      </tr>
                    ) : bookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-600">
                          No bookings found
                        </td>
                      </tr>
                    ) : (
                      bookings.map((b) => (
                        <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm">{b.bookingRef}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold">{b.courseTitle ?? b.courseId}</div>
                            <div className="text-xs text-gray-500">{b.courseSlug ?? ""}</div>
                          </td>
                          <td className="px-6 py-4">
                            {b.sessionStart ? (
                              <>
                                <div className="text-sm font-medium">{new Date(b.sessionStart).toLocaleDateString()}</div>
                                <div className="text-xs text-gray-500">{new Date(b.sessionStart).toLocaleTimeString()} - {b.sessionEnd ? new Date(b.sessionEnd).toLocaleTimeString() : ""}</div>
                              </>
                            ) : (
                              <div className="text-sm text-gray-500">—</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold">{b.name}</div>
                            <div className="text-xs text-gray-500">{b.attendees} {b.attendees === 1 ? "person" : "people"}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">{b.email}</div>
                            <div className="text-xs text-gray-500">{b.phone}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{new Date(b.createdAt).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleDeleteBooking(b._id, b.bookingRef)}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-xl border-2 border-red-200 hover:bg-red-100 transition-all font-medium"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* pagination footer */}
              <div className="p-3 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {bookings.length} of {bookingsTotal} bookings
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const p = Math.max(1, bookingsPage - 1);
                      setBookingsPage(p);
                      void fetchBookings({ courseId: bookingsFilterCourse || undefined, page: p });
                    }}
                    disabled={bookingsPage === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <div className="text-sm">Page {bookingsPage} / {Math.max(1, Math.ceil(bookingsTotal / bookingsLimit))}</div>
                  <button
                    onClick={() => {
                      const max = Math.max(1, Math.ceil(bookingsTotal / bookingsLimit));
                      const p = Math.min(max, bookingsPage + 1);
                      setBookingsPage(p);
                      void fetchBookings({ courseId: bookingsFilterCourse || undefined, page: p });
                    }}
                    disabled={bookingsPage >= Math.max(1, Math.ceil(bookingsTotal / bookingsLimit))}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          {!loading && classes.length > 0 && (
            <div className="mt-6 p-4 bg-white border-2 border-gray-200 rounded-xl">
              <div className="text-sm text-gray-600">
                Showing <span className="font-bold text-gray-900">{filtered.length}</span> of{" "}
                <span className="font-bold text-gray-900">{classes.length}</span> classes
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Toasts */}
      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}
    </>
  );
}