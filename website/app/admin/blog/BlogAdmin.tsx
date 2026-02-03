"use client";

import React, { JSX, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Plus,
  PencilIcon,
  Trash2,
  X,
  Check,
  UploadCloud,
  Loader2,
  ArrowLeft,
  ZoomIn,
} from "lucide-react";

// Type for posts
type PostItem = {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  image?: string | null;
  tags?: string[] | null;
  date?: string | null;
  createdAt?: string | null;
};

type ToastType = "error" | "success";

const COLORS = {
  primary: "#111827",
};

function slugify(str: string): string {
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function encodePublicId(publicId: string): string {
  return publicId
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function cloudinaryUrlFromPublicId(publicId: string | null | undefined, width = 800): string {
  if (!publicId) return "";
  if (/^https?:\/\//i.test(publicId)) return publicId;
  const cloud =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ""
      : "";
  if (!cloud) return publicId; // fallback: return as-is
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${width},c_limit,q_auto:good,f_auto,dpr_auto/${id}`;
}

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
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50 ${
        type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
      }`}
    >
      {type === "error" ? <Trash2 size={18} /> : <Check size={18} />}
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

function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  // Responsive modal:
  // - On small screens: full-screen sheet (no large rounded corners)
  // - On md+ screens: centered dialog with max width
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className={`bg-white overflow-hidden w-full sm:w-[95%] ${
          wide ? "sm:max-w-4xl" : "sm:max-w-2xl"
        } ${/* on small screens use full height */ ""} sm:rounded-2xl sm:shadow-2xl`}
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            {/* On small screens show a close 'X' and on larger keep it too */}
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100"
              aria-label="Close"
            >
              <X />
            </button>
          </div>
        </div>

        {/* Body: scrollable if content too tall */}
        <div className="overflow-y-auto p-4 sm:p-6" style={{ maxHeight: "calc(100vh - 7rem)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PostsAdminPage(): JSX.Element {
  const router = useRouter();

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sendCookies] = useState<boolean>(true);

  // modal / form state
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<PostItem | null>(null);

  const [title, setTitle] = useState<string>("");
  const [slug, setSlug] = useState<string>(""); // SLUG
  const [description, setDescription] = useState<string>("");

  // New: whether the slug was manually edited (breaks live sync)
  const [slugEdited, setSlugEdited] = useState<boolean>(false);

  // Enhanced tag management
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // load posts
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/posts?sort=-createdAt", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          ...(sendCookies
            ? { credentials: "include" as RequestCredentials }
            : {}),
        });
        if (!res.ok) throw new Error("Failed to fetch posts");
        const json = await res.json();
        const data: PostItem[] = json?.data ?? [];
        if (mounted) setPosts(data);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load posts");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [sendCookies]);

  // cleanup preview object URLs
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3500);
      return () => clearTimeout(t);
    }
    return;
  }, [error, success]);

  // Live-sync slug with title unless the user has manually edited the slug.
  useEffect(() => {
    if (!slugEdited) {
      // Let slug be exactly the slugified title (empty when title is empty)
      setSlug(slugify(title));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slugEdited]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setSlug("");
    setDescription("");
    setTags([]);
    setTagInput("");
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
    setSlugEdited(false); // start with live-sync enabled
    setEditOpen(true);
  }

  function openEdit(p: PostItem) {
    setEditing(p);
    const initialTitle = p.title ?? "";
    const initialSlug = p.slug ?? "";
    setTitle(initialTitle);
    setSlug(initialSlug);
    // If the stored slug differs from slugified title, assume it was manually edited before.
    setSlugEdited(initialSlug !== slugify(initialTitle));
    setDescription(p.description ?? "");
    setTags(p.tags && Array.isArray(p.tags) ? p.tags.filter(Boolean) : []);
    setTagInput("");
    setSelectedFile(null);
    const src = p.image ? cloudinaryUrlFromPublicId(p.image, 1200) : "";
    setPreviewUrl(src || null);
    if (fileRef.current) fileRef.current.value = "";
    setEditOpen(true);
    setTimeout(() => {
      tagInputRef.current?.focus();
    }, 220);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  function resetForm() {
    setEditing(null);
    setTitle("");
    setSlug("");
    setDescription("");
    setTags([]);
    setTagInput("");
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
    setSlugEdited(false);
  }

  // default date: today as ISO string (used if server expects date)
  function isoToday(): string {
    const d = new Date();
    return d.toISOString();
  }

  // Enhanced tag handler
  function addTag() {
    const cleanTag = tagInput.trim();
    if (!cleanTag || tags.includes(cleanTag)) return;
    setTags([...tags, cleanTag]);
    setTagInput("");
    tagInputRef.current?.focus();
  }
  function removeTag(index: number) {
    setTags(tags.filter((_, i) => i !== index));
    tagInputRef.current?.focus();
  }
  function onTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      addTag();
      e.preventDefault();
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      // Remove last tag
      setTags(tags.slice(0, -1));
    }
  }

  // Handle manual slug edits:
  // - If user types a slug (non-empty), we mark slugEdited = true (break live-sync).
  // - If user clears slug to empty string, re-enable live-sync (slugEdited = false).
  function onSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const normalized = slugify(raw);
    setSlug(normalized);
    if (normalized === "") {
      // Clearing slug should re-enable live-sync so title updates it again.
      setSlugEdited(false);
    } else {
      // User is manually editing slug; stop auto-sync.
      setSlugEdited(true);
    }
  }

  async function savePost() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }

    setUploading(true);
    try {
      // If creating a new post with a file selected
      if (!editing && selectedFile) {
        const form = new FormData();
        form.append("files", selectedFile);
        form.append("title", title.trim());
        form.append("slug", slug);
        form.append("description", description || "");
        if (tags.length) form.append("tags", tags.join(","));
        form.append("date", isoToday());
        const res = await fetch("/api/posts", {
          method: "POST",
          body: form,
          ...(sendCookies
            ? { credentials: "include" as RequestCredentials }
            : {}),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => null);
          throw new Error(`Create failed: ${res.status} ${txt ?? ""}`);
        }
        const json = await res.json();
        const created: PostItem = Array.isArray(json.data)
          ? json.data[0]
          : json.data;
        setPosts((prev) => [created, ...prev]);
        setSuccess("Post created");
        resetForm();
        setEditOpen(false);
        return;
      }

      // If editing and a file is selected -> PUT multipart/form-data
      if (editing && selectedFile) {
        const form = new FormData();
        form.append("files", selectedFile);
        form.append("title", title.trim());
        form.append("slug", slug);
        form.append("description", description || "");
        if (tags.length) form.append("tags", tags.join(","));
        form.append("date", editing.date ?? isoToday());

        const res = await fetch(
          `/api/posts/${encodeURIComponent(editing._id)}`,
          {
            method: "PUT",
            body: form,
            ...(sendCookies
              ? { credentials: "include" as RequestCredentials }
              : {}),
          }
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => null);
          throw new Error(`Update failed: ${res.status} ${txt ?? ""}`);
        }
        const json = await res.json();
        const updated: PostItem = json.data;
        setPosts((prev) =>
          prev.map((p) => (p._id === updated._id ? updated : p))
        );
        setSuccess("Post updated");
        resetForm();
        setEditOpen(false);
        return;
      }

      // For create without file => JSON POST
      if (!editing && !selectedFile) {
        const bodyObj = {
          title: title.trim(),
          slug,
          description: description || "",
          tags: tags.length ? tags : undefined,
          date: isoToday(),
        };
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
          ...(sendCookies
            ? { credentials: "include" as RequestCredentials }
            : {}),
        });
        if (!res.ok) throw new Error("Create failed");
        const json = await res.json();
        const created: PostItem = json.data;
        setPosts((prev) => [created, ...prev]);
        setSuccess("Post created");
        resetForm();
        setEditOpen(false);
        return;
      }

      // For edit without file => JSON PUT
      if (editing && !selectedFile) {
        const bodyObj = {
          title: title.trim(),
          slug,
          description: description || "",
          tags: tags.length ? tags : undefined,
        };
        const res = await fetch(
          `/api/posts/${encodeURIComponent(editing._id)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
            ...(sendCookies
              ? { credentials: "include" as RequestCredentials }
              : {}),
          }
        );
        if (!res.ok) throw new Error("Update failed");
        const json = await res.json();
        const updated: PostItem = json.data;
        setPosts((prev) =>
          prev.map((p) => (p._id === updated._id ? updated : p))
        );
        setSuccess("Post updated");
        resetForm();
        setEditOpen(false);
        return;
      }
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? "Failed to save post");
    } finally {
      setUploading(false);
    }
  }

  async function deletePost(id: string, titlePreview?: string) {
    if (!confirm(`Delete this post?\n\n"${titlePreview ?? ""}"`)) return;
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        ...(sendCookies
          ? { credentials: "include" as RequestCredentials }
          : {}),
      });
      if (!res.ok) throw new Error("Delete failed");
      setPosts((prev) => prev.filter((p) => p._id !== id));
      setSuccess("Post deleted");
    } catch (err) {
      console.error(err);
      setError("Failed to delete post");
    }
  }

  return (
    <>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pb-24">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin")}
                  className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 transition text-gray-900"
                  aria-label="Back to admin"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Manage Posts
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                    Image, title, tags, slug, and full description only.
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition shadow-sm"
                >
                  <Plus size={14} /> <span className="hidden sm:inline">New Post</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="bg-white rounded-2xl p-8 flex items-center justify-center shadow-sm">
              <Loader2 className="animate-spin" />{" "}
              <span className="ml-3 text-sm text-gray-600">Loading posts…</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm">
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                <Plus />
              </div>
              <div className="text-gray-700 font-medium">No posts yet</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {posts.map((p) => (
                <article
                  key={p._id}
                  className="relative bg-white rounded-2xl overflow-hidden shadow hover:shadow-lg transition transform hover:-translate-y-1"
                >
                  <div
                    className="w-full h-48 sm:h-44 md:h-48 bg-black/5 relative cursor-pointer"
                    onClick={() => openEdit(p)}
                  >
                    {p.image ? (
                      <Image
                        src={cloudinaryUrlFromPublicId(p.image, 600)}
                        alt={p.title ?? "Post image"}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        style={{ objectFit: "cover" }}
                        priority={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                        No image
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex gap-2 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                        title="Edit"
                        className="p-2 bg-white/95 rounded-full shadow text-gray-900 hover:scale-105 transform transition"
                      >
                        <PencilIcon size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePost(p._id, p.title);
                        }}
                        title="Delete"
                        className="p-2 bg-red-600 text-white rounded-full shadow hover:scale-105 transform transition"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          window.open(
                            p.image
                              ? cloudinaryUrlFromPublicId(p.image, 1200)
                              : "#",
                            "_blank",
                            "noopener"
                          );
                        }}
                        title="Preview"
                        className="p-2 bg-white/95 rounded-full shadow text-gray-900 hover:scale-105 transform transition"
                      >
                        <ZoomIn size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {p.title}
                    </h3>
                    <div className="text-xs text-gray-500 mt-2 line-clamp-4 whitespace-pre-wrap">
                      {p.description}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-gray-400">
                        {p.createdAt
                          ? new Date(p.createdAt).toLocaleDateString()
                          : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {(p.tags ?? []).slice(0, 3).join(", ")}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-400 font-mono font-semibold">
                      {p.slug && `Slug: ${p.slug}`}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? "Edit Post" : "Create Post"}
        wide
      >
        {/* Improved responsive layout:
            - Single column stack on small screens
            - Two column layout on md+, with form above image preview for narrow screens
            - Footer actions stack on small screens
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                placeholder="Post title"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Slug</label>
              <input
                value={slug}
                onChange={onSlugChange}
                className="mt-2 w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                placeholder="post-title-as-slug"
              />
              <p className="text-xs text-gray-400 mt-1">
                Automatically follows the title while you type. Edit the slug to take control; clear it to re-enable auto-sync.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Full Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="mt-2 w-full border-2 border-gray-200 rounded-lg px-3 py-2 resize-none"
              />
            </div>
          </div>

          <aside className="space-y-4 md:col-span-1">
            <div>
              <label className="text-sm font-medium text-gray-700">Image</label>
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="post-image"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-gray-900 to-black text-white rounded-lg cursor-pointer text-sm"
                  >
                    <UploadCloud size={16} />
                    <span className="max-w-[10rem] truncate">
                      {selectedFile ? selectedFile.name : "Choose file"}
                    </span>
                  </label>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="px-3 py-2 rounded-lg border text-sm"
                  >
                    Reset
                  </button>
                </div>
                <input
                  id="post-image"
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={onFileChange}
                  className="hidden"
                />
              </div>

              {previewUrl ? (
                <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 relative w-full h-40 sm:h-48">
                  <Image
                    src={previewUrl}
                    alt="Preview"
                    fill
                    style={{ objectFit: "cover" }}
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
                  <div className="w-full h-40 flex items-center justify-center bg-gray-50 text-gray-400">
                    No image
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Tags</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag, i) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-200 text-xs text-gray-700 font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      className="ml-2 p-1 rounded-full bg-gray-300 hover:bg-gray-400 text-gray-700"
                      onClick={() => removeTag(i)}
                      aria-label={`Remove tag ${tag}`}
                      tabIndex={0}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={onTagInputKeyDown}
                  className="inline-block px-3 py-1 rounded-full border-2 border-gray-200 text-xs bg-white"
                  placeholder="Type tag..."
                  style={{ minWidth: 70 }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="inline-block px-2 py-1 ml-1 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition"
                  aria-label="Add tag"
                  disabled={tagInput.length === 0 || tags.includes(tagInput.trim())}
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Press Enter or click &quot;Add&quot; to append a tag. Click X or Backspace to remove.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-2">
              <button
                onClick={() => {
                  setEditOpen(false);
                  resetForm();
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border text-sm"
              >
                Cancel
              </button>
              <button
                onClick={savePost}
                disabled={uploading}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm text-white"
                style={{ backgroundColor: COLORS.primary }}
              >
                {uploading ? (
                  <Loader2 className="animate-spin inline mr-2" />
                ) : (
                  <Check className="inline mr-2" />
                )}{" "}
                Save
              </button>
            </div>
          </aside>
        </div>
      </Modal>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}
    </>
  );
}