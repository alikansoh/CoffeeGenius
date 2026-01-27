"use client";

import React, { useEffect, useState } from "react";
import UserForm, { UserFormData } from "./UserForm";
import UserList from "./UserList";

/**
 * UsersAdmin (client)
 *
 * Responsibilities:
 * - Fetch user list (GET /api/users)
 * - Create user (POST /api/users)
 * - Edit user (PUT /api/users/:id)
 * - Delete user (DELETE /api/users/:id)
 *
 * Notes:
 * - If your API requires authentication, paste a token in the "Auth token" input and it will be sent as Bearer.
 */

type User = {
  _id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: any;
};

export default function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string>("");

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "GET",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load users (${res.status})`);
      }
      const data = await res.json();
      // Expect an array or object
      const list = Array.isArray(data) ? data : data?.data ?? data;
      setUsers(list || []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function createUser(payload: UserFormData) {
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Create failed (${res.status})`);
      }
      const json = await res.json();
      // refresh list
      await fetchUsers();
      return json;
    } catch (err: any) {
      setError(err?.message || String(err));
      throw err;
    }
  }

  async function updateUser(id: string, payload: UserFormData) {
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
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
      await fetchUsers();
    } catch (err: any) {
      setError(err?.message || String(err));
      throw err;
    }
  }

  async function deleteUser(id: string) {
    setError(null);
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-700">Auth token (optional)</label>
        <input
          type="text"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder="Paste Bearer token if API is secured"
          className="ml-2 px-3 py-2 border rounded-md w-full max-w-xl"
        />
        <button
          onClick={() => fetchUsers()}
          className="ml-2 bg-sky-600 text-white px-3 py-2 rounded-md"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Create user</h2>
          <UserForm
            submitLabel="Create user"
            onSubmit={async (data) => {
              try {
                await createUser(data);
                alert("User created");
              } catch {
                /* error shown above */
              }
            }}
          />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Users</h2>
          {loading ? (
            <div className="text-sm text-gray-500">Loading users…</div>
          ) : error ? (
            <div className="text-sm text-red-600">Error: {error}</div>
          ) : (
            <UserList
              users={users}
              onEdit={(u) => setEditing(u)}
              onDelete={(u) => deleteUser(u._id)}
            />
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setEditing(null)}
          />
          <div className="relative bg-white rounded-lg shadow p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium mb-4">Edit user</h3>
            <UserForm
              initialData={{
                name: editing.name ?? "",
                email: editing.email ?? "",
                phone: editing.phone ?? "",
              }}
              submitLabel="Save changes"
              onSubmit={async (data) => {
                try {
                  await updateUser(editing._id, data);
                  setEditing(null);
                  alert("User updated");
                } catch {
                  // error handled globally
                }
              }}
            />
            <div className="mt-4 text-right">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-2 rounded-md border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}