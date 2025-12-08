"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  PencilIcon,
  Trash2,
  Search,
  Plus,
  Coffee as CoffeeIcon,
  X,
  ArrowLeft,
} from "lucide-react";
import { getCloudinaryThumbnail } from "@/app/utils/cloudinary";  // ✅ Import helper

export interface Coffee {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  img?: string;
  images?: string[];
  roastLevel?: "light" | "medium" | "dark";
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
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50 ${
        type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
      }`}
    >
      {type === "error" ? <Trash2 size={20} /> : <PencilIcon size={20} />}
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

interface AdminCoffeeListProps {
  sendCookies?: boolean;
}

export default function AdminCoffeeList({ sendCookies = true }: AdminCoffeeListProps) {
  const router = useRouter();
  const [coffees, setCoffees] = useState<Coffee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoffees = async () => {
      setLoading(true);
      try {
        const res = await window.fetch("/api/coffee? limit=100", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },...(sendCookies ?  { credentials: "include" as RequestCredentials } : {}),
        });

        if (!res.ok) {
          const text = await res.text(). catch(() => null);
          throw new Error(`Fetch failed: ${res.status} ${text ??  ""}`);
        }

        const data = await res.json();
        setCoffees(data?. data || data?. coffees || data || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load coffees");
      } finally {
        setLoading(false);
      }
    };
    fetchCoffees();
  }, [sendCookies]);

  const filtered = coffees.filter(
    (c) =>
      c.name. toLowerCase().includes(search.toLowerCase()) ||
      c.origin.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string, name: string) => {
    if (! confirm(`Delete "${name}"?  This action cannot be undone.`)) return;

    try {
      const res = await window.fetch(`/api/coffee/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      if (!res.ok) {
        const text = await res.text(). catch(() => null);
        throw new Error(`Delete failed: ${res.status} ${text ?? ""}`);
      }

      setCoffees((prev) => prev.filter((c) => c._id !== id));
      setSuccess(`"${name}" deleted successfully`);
    } catch (err) {
      console.error(err);
      setError("Failed to delete coffee");
    }
  };

  return (
    <>
      <style jsx global>{`
        input {
          font-size: 16px ! important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router. push("/admin")}
                  className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                  aria-label="Back to admin"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Manage Coffees
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                    View, edit, and manage your coffee products
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push("/admin/coffee/create")}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md hover:shadow-lg font-medium text-sm"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Create Coffee</span>
                <span className="sm:hidden">Create</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, origin, or slug..."
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

          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Image</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Origin</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Roast</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wide">Slug</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-900 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                          <p className="text-sm text-gray-600">Loading coffees...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <CoffeeIcon size={48} className="text-gray-300" />
                          <p className="text-gray-900 font-medium">
                            {search ?  "No coffees match your search" : "No coffees found"}
                          </p>
                          {! search && (
                            <button
                              onClick={() => router.push("/admin/coffee/create")}
                              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium text-sm"
                            >
                              <Plus size={16} />
                              Create Your First Coffee
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((coffee) => (
                      <tr key={coffee._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-gray-200">
                            {coffee.img ?  (
                              <Image
                                src={getCloudinaryThumbnail(coffee.img, 200)}  
                                alt={coffee.name}
                                width={64}
                                height={64}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <CoffeeIcon size={24} className="text-gray-400" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{coffee.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600">{coffee.origin}</div>
                        </td>
                        <td className="px-6 py-4">
                          {coffee.roastLevel ?  (
                            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-900 text-xs font-medium rounded-full capitalize">
                              {coffee.roastLevel}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500 font-mono">{coffee.slug}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(`/admin/coffee/edit/${encodeURIComponent(coffee._id)}`)}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-all font-medium"
                            >
                              <PencilIcon size={14} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(coffee._id, coffee. name)}
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

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {loading ? (
              <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                  <p className="text-sm text-gray-600">Loading coffees...</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
                <div className="flex flex-col items-center justify-center gap-3">
                  <CoffeeIcon size={48} className="text-gray-300" />
                  <p className="text-gray-900 font-medium">
                    {search ? "No coffees match your search" : "No coffees found"}
                  </p>
                  {!search && (
                    <button
                      onClick={() => router.push("/admin/coffee/create")}
                      className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium text-sm"
                    >
                      <Plus size={16} />
                      Create Your First Coffee
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filtered.map((coffee) => (
                <div
                  key={coffee._id}
                  className="bg-white rounded-2xl border-2 border-gray-200 p-4 hover:border-gray-300 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-gray-200 flex-shrink-0">
                      {coffee.img ? (
                        <Image
                          src={getCloudinaryThumbnail(coffee.img, 200)} 
                          alt={coffee.name}
                          width={80}
                          height={80}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <CoffeeIcon size={32} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 mb-1 truncate">{coffee.name}</h3>
                      <p className="text-sm text-gray-600 mb-2">{coffee.origin}</p>
                      {coffee.roastLevel && (
                        <span className="inline-block px-2 py-1 bg-gray-100 text-gray-900 text-xs font-medium rounded-full capitalize mb-2">
                          {coffee.roastLevel}
                        </span>
                      )}
                      <p className="text-xs text-gray-500 font-mono truncate">{coffee.slug}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t-2 border-gray-100">
                    <button
                      onClick={() => router.push(`/admin/coffee/edit/${encodeURIComponent(coffee._id)}`)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-all font-medium"
                    >
                      <PencilIcon size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(coffee._id, coffee.name)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-xl border-2 border-red-200 hover:bg-red-100 transition-all font-medium"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stats */}
          {! loading && coffees.length > 0 && (
            <div className="mt-6 p-4 bg-white border-2 border-gray-200 rounded-xl">
              <div className="text-sm text-gray-600">
                Showing <span className="font-bold text-gray-900">{filtered. length}</span> of{" "}
                <span className="font-bold text-gray-900">{coffees.length}</span> coffees
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