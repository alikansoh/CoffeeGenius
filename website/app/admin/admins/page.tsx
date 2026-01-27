"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Enhanced single-file Users admin page (client component)
 *
 * Features added for improved UX:
 * - Search with debounce
 * - Pagination controls (page size + prev/next)
 * - Loading skeleton & empty state
 * - Inline form validation and friendly error messages
 * - Password strength meter & show/hide password toggle
 * - Confirm delete modal
 * - Non-blocking toast notifications
 * - Optimistic UI refresh (refresh after operations)
 *
 * Drop this into app/users/page.tsx (replaces previous).
 *
 * Notes:
 * - Expects API endpoints:
 *   GET  /api/users            -> returns array of { _id, username }
 *   POST /api/users            -> create user { username, password }
 *   PUT  /api/users/:id        -> update user { username, password? }
 *   DELETE /api/users/:id      -> delete user
 * - If your API requires auth, paste a Bearer token in the "Auth token" input.
 */

/* -------------------- Types -------------------- */
type User = {
  _id: string;
  username: string;
};

type FormState = {
  username: string;
  password: string;
};

type ApiUser = {
  _id: string;
  username: string;
};

/* -------------------- Helpers -------------------- */

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function passwordStrength(password: string) {
  if (!password) return { score: 0, label: "None" };
  let score = 0;
  if (password.length >= 6) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["Very weak", "Weak", "Okay", "Strong", "Very strong"];
  return { score, label: labels[score] ?? "Very weak" };
}

/* -------------------- Toasts -------------------- */
type Toast = { id: string; type: "success" | "error" | "info"; message: string };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function push(t: Omit<Toast, "id">) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((s) => [...s, { id, ...t }]);
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
    }, 4000);
  }
  return { toasts, push, remove: (id: string) => setToasts((s) => s.filter((x) => x.id !== id)) };
}

/* -------------------- Component -------------------- */
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [authToken, setAuthToken] = useState<string>("");

  // List controls
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(users.length / pageSize)), [users.length, pageSize]);

  // Form state (create & edit)
  const [form, setForm] = useState<FormState>({ username: "", password: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const strength = useMemo(() => passwordStrength(form.password), [form.password]);

  // Delete modal
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; username: string } | null>(null);

  // UI helpers
  const { toasts, push } = useToasts();

  useEffect(() => {
    fetchUsers(); // initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run search/pagination when debounced search changes
  useEffect(() => {
    setPage(1);
    // We refetch from server so the API can support search if desired.
    // Current implementation fetches all and filters client-side (small user set).
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, pageSize]);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      // GET /api/users — expected to return array of users
      const res = await fetch("/api/users", {
        method: "GET",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load users (${res.status})`);
      }
      const data: unknown = await res.json();
      const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.data ?? data;
      // Keep only expected shape
      const items: User[] = (list as ApiUser[]).map((u: ApiUser) => ({ _id: u._id, username: u.username }));
      // Client-side filter for search (case-insensitive substring)
      const filtered = debouncedSearch
        ? items.filter((it) => it.username.toLowerCase().includes(debouncedSearch.trim().toLowerCase()))
        : items;
      setUsers(filtered);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      push({ type: "error", message: "Failed to load users" });
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ username: "", password: "" });
    setEditingId(null);
    setShowPassword(false);
  }

  function setFormField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function handleCreateOrUpdate(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (!form.username.trim()) {
      setError("Username is required");
      return;
    }
    if (!editingId && form.password.trim().length < 6) {
      setError("Password is required and must be at least 6 characters");
      return;
    }
    if (form.password && form.password.length > 0 && form.password.length < 6) {
      setError("If changing password, it must be at least 6 characters");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update (send password only if provided)
        const payload: Record<string, unknown> = { username: form.username.trim() };
        if (form.password.trim()) payload.password = form.password.trim();

        const res = await fetch(`/api/users/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Update failed (${res.status})`);
        }
        push({ type: "success", message: "User updated" });
      } else {
        // Create
        const res = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            username: form.username.trim(),
            password: form.password.trim(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Create failed (${res.status})`);
        }
        push({ type: "success", message: "User created" });
      }

      // Refresh list and reset form
      await fetchUsers();
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      push({ type: "error", message: message });
    } finally {
      setSaving(false);
    }
  }

  async function startEdit(user: User) {
    setEditingId(user._id);
    setForm({ username: user.username || "", password: "" });
    setShowPassword(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmDeleteUser() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      push({ type: "success", message: "User deleted" });
      await fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      push({ type: "error", message: "Delete failed" });
    }
  }

  // Pagination slice
  const visibleUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page, pageSize]);

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Users — Admin</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage users (username + password). Passwords are never displayed. Use the form below to create or edit users.
          </p>
        </header>

        {/* Controls */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center md:gap-4 gap-3">
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username"
              className="w-full md:max-w-md px-3 py-2 border rounded-md shadow-sm"
            />
            <button
              onClick={() => {
                setSearch("");
                fetchUsers();
              }}
              className="px-3 py-2 bg-gray-100 rounded-md text-sm"
              title="Clear search"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Page size</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border rounded-md"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
            <button
              onClick={() => fetchUsers()}
              className="ml-2 px-3 py-2 bg-sky-600 text-white rounded-md"
            >
              Refresh
            </button>
            <input
              type="text"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Auth token (optional)"
              className="ml-2 px-3 py-2 border rounded-md w-48"
            />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleCreateOrUpdate} className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{editingId ? "Edit user" : "Create user"}</h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-500 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                value={form.username}
                onChange={(e) => setFormField("username", e.target.value)}
                className="mt-1 block w-full rounded-md border px-3 py-2"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {editingId ? "Password (leave blank to keep existing)" : "Password"}
              </label>
              <div className="mt-1 relative">
                <input
                  value={form.password}
                  onChange={(e) => setFormField("password", e.target.value)}
                  type={showPassword ? "text" : "password"}
                  className="block w-full rounded-md border px-3 py-2 pr-10"
                  placeholder={editingId ? "•••••• (enter to change)" : "At least 6 characters"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Strength meter */}
              <div className="mt-2 text-xs text-gray-600 flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    style={{ width: `${(strength.score / 4) * 100}%` }}
                    className={`h-full ${strength.score >= 3 ? "bg-green-500" : strength.score >= 2 ? "bg-yellow-400" : "bg-red-400"}`}
                  />
                </div>
                <div>{strength.label}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-sky-600 text-white px-4 py-2 rounded-md disabled:opacity-60"
            >
              {saving ? (editingId ? "Saving…" : "Creating…") : editingId ? "Save changes" : "Create user"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="px-3 py-2 rounded-md border"
              >
                Cancel
              </button>
            )}

            <div className="text-sm text-gray-500 ml-auto">
              {editingId ? "Editing mode" : "Create mode"}
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </form>

        {/* List */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Users</h2>
            <div className="text-sm text-gray-500">
              {loading ? "Loading…" : `${users.length} result${users.length !== 1 ? "s" : ""}`}
            </div>
          </div>

          {loading ? (
            // Skeleton
            <div className="space-y-3">
              {Array.from({ length: Math.min(5, pageSize) }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-sm text-gray-500">No users found. Create one above.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse">
                  <thead>
                    <tr className="text-left text-sm text-gray-600 border-b">
                      <th className="py-2 px-2 w-1/2">Username</th>
                      <th className="py-2 px-2 w-1/3">User ID</th>
                      <th className="py-2 px-2 w-1/6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((u) => (
                      <tr key={u._id} className="text-sm border-b last:border-b-0 hover:bg-gray-50">
                        <td className="py-2 px-2 font-medium">{u.username}</td>
                        <td className="py-2 px-2 break-words text-xs text-gray-500">{u._id}</td>
                        <td className="py-2 px-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(u)}
                              className="px-2 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ id: u._id, username: u.username })}
                              className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:opacity-90"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <div className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </div>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>

                <div className="text-sm text-gray-500">Showing {visibleUsers.length} of {users.length}</div>
              </div>
            </>
          )}
        </section>

        {/* Delete confirmation modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-white rounded-lg shadow p-6 w-full max-w-md">
              <h3 className="text-lg font-medium mb-2">Confirm delete</h3>
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete <strong>{confirmDelete.username}</strong>? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} className="px-3 py-2 rounded-md border">
                  Cancel
                </button>
                <button onClick={confirmDeleteUser} className="px-3 py-2 rounded-md bg-red-600 text-white">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toasts */}
        <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`max-w-sm w-full px-4 py-2 rounded shadow text-sm ${
                t.type === "success" ? "bg-green-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-gray-800 text-white"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}