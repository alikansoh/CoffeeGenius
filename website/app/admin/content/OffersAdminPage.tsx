"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Plus,
  PencilIcon,
  Trash2,
  X,
  Check,
  Image as ImageIcon,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
  UploadCloud,
  Loader2,
  ZoomIn,
  Play,
} from "lucide-react";

type Offer = {
  _id: string;
  text: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type GalleryItem = {
  _id: string;
  publicId?: string;
  url: string;
  resourceType?: string;
  poster?: string;
  title?: string;
  description?: string;
  createdAt?: string;
  active?: boolean;
};

type ToastType = "error" | "success";

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

/* -------------------------
   Helpers
   ------------------------- */

/**
 * Creates a small SVG data URL to use as a video poster when the item doesn't provide one.
 * Lightweight and readable — matches the theme and shows the title.
 */
function svgPosterDataUrl(title = "Video", width = 1280, height = 720) {
  const safe = (title || "Video")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='#111827'/>
        <stop offset='100%' stop-color='#374151'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)' rx='20'/>
    <g transform='translate(${width / 2 - 40}, ${height / 2 - 48})' fill='white' opacity='0.95'>
      <path d='M0 0 L64 40 L0 80 Z' />
    </g>
    <rect x='40' y='${height - 110}' width='${width - 80}' height='72' rx='8' fill='rgba(0,0,0,0.28)'/>
    <text x='60' y='${height - 60}' font-family='Inter, system-ui, -apple-system, "Segoe UI", Roboto' font-size='36' fill='white' font-weight='600'>${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Attempt to capture the first visible frame of a video and return a dataURL (png).
 * - This respects CORS (sets crossOrigin='anonymous') but will fail if remote server doesn't allow cross-origin canvas.
 * - It seeks to a small time (0.05s) to increase chance of a non-black frame.
 * - Times out after ~2.5s.
 */
async function createPosterFromVideo(url: string, width = 640, height = 360): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let resolved = false;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const cleanup = () => {
      try {
        video.pause();
        // remove src to free memory
        video.removeAttribute("src");
        video.load();
      } catch {}
      video.onloadeddata = null;
      video.onerror = null;
      video.onseeked = null;
    };

    const fail = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    // timeout if taking too long
    const timeout = window.setTimeout(() => {
      fail();
    }, 2500);

    video.onloadeddata = async () => {
      try {
        // try seek to a small time to get a real frame
        const target = 0.05;
        const onSeeked = () => {
          try {
            const canvas = document.createElement("canvas");
            const aspect = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : width / height;
            canvas.width = width;
            canvas.height = Math.round(width / aspect) || height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("No canvas context");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL("image/jpeg", 0.8);
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            cleanup();
            resolve(data);
          } catch (err) {
            // canvas draw failed (likely CORS), fallback
            clearTimeout(timeout);
            fail();
          }
        };

        // If currentTime is already >= target, call onSeeked immediately after a micro delay
        if (video.currentTime >= target) {
          setTimeout(onSeeked, 50);
        } else {
          video.onseeked = onSeeked;
          try {
            video.currentTime = target;
          } catch {
            // seeking might throw on some browsers; fallback
            setTimeout(onSeeked, 100);
          }
        }
      } catch {
        fail();
      }
    };

    video.onerror = () => {
      fail();
    };

    // Try loading
    try {
      video.load();
    } catch {
      fail();
    }
  });
}

/* -------------------------
   Small UI components
   ------------------------- */

function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
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
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/20 rounded-lg transition" aria-label="Close">
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-4xl" : "max-w-xl"} overflow-hidden animate-in slide-in-from-bottom-2`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100" aria-label="Close">
            <X />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/* Gallery edit/upload form used in modal */
function GalleryEditForm({
  item,
  onCancel,
  onSave,
  uploading,
  allowFile,
  onFileSelect,
  selectedFileName,
}: {
  item?: GalleryItem | null;
  onCancel: () => void;
  onSave: (file?: File | null, title?: string, description?: string) => void;
  uploading?: boolean;
  allowFile?: boolean;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedFileName?: string | null;
}) {
  const [title, setTitle] = useState(() => item?.title ?? "");
  const [description, setDescription] = useState(() => item?.description ?? "");

  return (
    <div className="space-y-4">
      {allowFile && (
        <>
          <label className="text-xs font-medium text-gray-700">File</label>
          <div className="flex items-center gap-3">
            <label
              htmlFor="file-input-form"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-900 to-black text-white rounded-xl cursor-pointer shadow hover:opacity-95 transition text-sm"
            >
              <UploadCloud size={16} />
              <span>{selectedFileName ?? "Choose file"}</span>
            </label>
            <div className="text-xs text-gray-500">{selectedFileName ?? "No file selected"}</div>
          </div>
          <input id="file-input-form" type="file" accept="image/*,video/*" onChange={onFileSelect} className="hidden" />
        </>
      )}

      <div>
        <label className="text-xs font-medium text-gray-700">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border-2 border-gray-200 rounded-xl px-3 py-2" placeholder="Optional title" />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full border-2 border-gray-200 rounded-xl px-3 py-2 resize-none" rows={3} placeholder="Optional description" />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl border text-sm">
          Cancel
        </button>
        <button
          onClick={() => onSave(undefined, title, description)}
          disabled={uploading}
          className="px-4 py-2 rounded-xl text-sm text-white bg-gray-900"
        >
          {uploading ? <Loader2 className="animate-spin inline mr-2" /> : <Check className="inline mr-2" />}
          Save
        </button>
      </div>
    </div>
  );
}

/* -------------------------
   Main page component
   ------------------------- */

export default function OffersAdminPage() {
  const router = useRouter();

  // Offers state
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendCookies] = useState(true);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerText, setOfferText] = useState("");
  const [offerActive, setOfferActive] = useState(true);

  // Gallery state (under offers)
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);

  // Upload/Edit gallery
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [galleryUploadOpen, setGalleryUploadOpen] = useState(false);
  const [galleryEditOpen, setGalleryEditOpen] = useState(false);
  const [editingGallery, setEditingGallery] = useState<GalleryItem | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const videoLightRef = useRef<HTMLVideoElement | null>(null);

  // messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* -------------------------
     Data fetching
     ------------------------- */

  useEffect(() => {
    let mounted = true;
    async function fetchOffers() {
      setLoading(true);
      try {
        const res = await fetch("/api/offers?sort=createdAt:desc", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => null);
          throw new Error(`Fetch failed: ${res.status} ${txt ?? ""}`);
        }
        const json = await res.json();
        const data: Offer[] = json?.data ?? json ?? [];
        if (mounted) setOffers(data);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load offers");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    async function fetchGallery() {
      setGalleryLoading(true);
      try {
        const res = await fetch("/api/gallery?active=true", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => null);
          throw new Error(`Gallery fetch failed: ${res.status} ${txt ?? ""}`);
        }
        const json = await res.json();
        const data: GalleryItem[] = json?.data ?? [];

        // Attach posters for videos when missing by attempting to capture first frame.
        const processed = await Promise.all(
          data.map(async (g) => {
            const isVideo = (g.resourceType ?? "").startsWith("video") || /\.(mp4|webm|mov|avi|m4v)$/i.test(g.publicId ?? "");
            if (!isVideo) return g;
            if (g.poster && g.poster.length > 8) return g;
            try {
              const poster = await createPosterFromVideo(g.url, 640, 360);
              return { ...g, poster: poster ?? svgPosterDataUrl(g.title ?? "Video", 640, 360) };
            } catch {
              return { ...g, poster: svgPosterDataUrl(g.title ?? "Video", 640, 360) };
            }
          })
        );

        if (mounted) setGalleryItems(processed);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load gallery items");
      } finally {
        if (mounted) setGalleryLoading(false);
      }
    }

    fetchOffers();
    fetchGallery();

    return () => {
      mounted = false;
    };
  }, [sendCookies]);

  /* -------------------------
     Helpers & UX
     ------------------------- */

  function clearMessagesAfter(ms = 3500) {
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, ms);
  }
  useEffect(() => {
    if (error || success) clearMessagesAfter();
  }, [error, success]);

  /* -------------------------
     Offer CRUD
     ------------------------- */

  function openCreateOffer() {
    setEditingOffer(null);
    setOfferText("");
    setOfferActive(true);
    setOfferModalOpen(true);
  }

  function openEditOffer(o: Offer) {
    setEditingOffer(o);
    setOfferText(o.text);
    setOfferActive(o.active);
    setOfferModalOpen(true);
  }

  async function saveOffer() {
    if (!offerText.trim()) {
      setError("Offer text cannot be empty");
      return;
    }
    try {
      if (editingOffer) {
        const res = await fetch(`/api/offers/${encodeURIComponent(editingOffer._id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: offerText.trim(), active: offerActive }),
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) throw new Error("Update failed");
        const json = await res.json();
        setOffers((prev) => prev.map((p) => (p._id === editingOffer._id ? json.data : p)));
        setSuccess("Offer updated");
      } else {
        const res = await fetch("/api/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: offerText.trim(), active: offerActive }),
          ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
        });
        if (!res.ok) throw new Error("Create failed");
        const json = await res.json();
        setOffers((prev) => [json.data, ...prev]);
        setSuccess("Offer created");
      }
      setOfferModalOpen(false);
      setEditingOffer(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save offer");
    }
  }

  async function deleteOffer(id: string, textPreview = "") {
    if (!confirm(`Delete this offer?\n\n"${textPreview}"`)) return;
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });
      if (!res.ok) throw new Error("Delete failed");
      setOffers((prev) => prev.filter((o) => o._id !== id));
      setSuccess("Offer deleted");
    } catch (err) {
      console.error(err);
      setError("Failed to delete offer");
    }
  }

  async function toggleOfferActive(id: string) {
    const o = offers.find((x) => x._id === id);
    if (!o) return;
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !o.active }),
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });
      if (!res.ok) throw new Error("Toggle failed");
      const json = await res.json();
      setOffers((prev) => prev.map((p) => (p._id === id ? json.data : p)));
      setSuccess(json.data.active ? "Offer activated" : "Offer deactivated");
    } catch (err) {
      console.error(err);
      setError("Failed to toggle");
    }
  }

  /* -------------------------
     Gallery: upload, edit, delete, preview
     ------------------------- */

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (!f) {
      setPreviewUrl(null);
      setSelectedFileName(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setSelectedFileName(f.name);
  }

  function resetUploadForm() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setGalleryTitle("");
    setGalleryDescription("");
    setSelectedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadGalleryItem() {
    if (!selectedFile) {
      setError("Please pick one file to upload");
      return;
    }
    setGalleryUploading(true);
    try {
      const form = new FormData();
      form.append("files", selectedFile);
      if (galleryTitle) form.append("title", galleryTitle);
      if (galleryDescription) form.append("description", galleryDescription);

      const res = await fetch("/api/gallery", {
        method: "POST",
        body: form,
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      const created = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
      if (created.length > 0) setGalleryItems((prev) => [...created.map((c: object) => ({ ...c })), ...prev]);
      else {
        // fallback: refresh
        const g = await fetch("/api/gallery?active=true");
        const gj = await g.json();
        setGalleryItems(gj?.data ?? []);
      }

      setSuccess("Upload successful");
      resetUploadForm();
      setGalleryUploadOpen(false);
    } catch (err) {
      console.error(err);
      setError("Failed to upload gallery item");
    } finally {
      setGalleryUploading(false);
    }
  }

  function openGalleryEdit(item: GalleryItem) {
    setEditingGallery(item);
    setGalleryEditOpen(true);
  }

  async function saveGalleryEdit(id: string, title: string, description: string) {
    try {
      const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });
      if (!res.ok) throw new Error("Update failed");
      const json = await res.json();
      setGalleryItems((prev) => prev.map((g) => (g._id === id ? json.data : g)));
      setSuccess("Gallery item updated");
      setGalleryEditOpen(false);
      setEditingGallery(null);
    } catch (err) {
      console.error(err);
      setError("Failed to update gallery item");
    }
  }

  async function deleteGalleryItem(id: string) {
    if (!confirm("Delete this gallery item? This will attempt to remove it from Cloudinary.")) return;
    try {
      const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`, {
        method: "DELETE",
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });
      if (!res.ok) throw new Error("Delete failed");
      setGalleryItems((prev) => prev.filter((g) => g._id !== id));
      setSuccess("Gallery item deleted");
    } catch (err) {
      console.error(err);
      setError("Failed to delete gallery item");
    }
  }

  function openLightbox(item: GalleryItem) {
    setLightboxItem(item);
    setLightboxOpen(true);
  }

  // EFFECT: when lightbox opens for a video, ensure first frame is visible (use poster if available; otherwise attempt play/pause)
  useEffect(() => {
    if (!lightboxOpen || !lightboxItem) return;

    const isVideo =
      (lightboxItem.resourceType ?? "").startsWith("video") ||
      /\.(mp4|webm|mov|avi|m4v)$/i.test(lightboxItem.publicId ?? "");
    if (!isVideo) return;

    const v = videoLightRef.current;
    if (!v) return;

    // If poster is present and browser shows it, we're good.
    // Otherwise attempt a short play/pause to render first frame.
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";

    const tryShowFrame = async () => {
      try {
        // load metadata first
        v.load();
        // attempt autoplay muted; catch errors
        const playPromise = v.play();
        if (playPromise !== undefined) {
          await playPromise.catch(() => {});
        }
        // small delay to allow frame to render, then pause so it stays visible
        setTimeout(() => {
          try {
            v.pause();
            // seek to 0 to ensure first frame (some browsers may require a tiny time)
            try {
              v.currentTime = 0;
            } catch {}
          } catch {}
        }, 120);
      } catch {
        // ignore
      }
    };

    // If poster exists, browser will likely show it; still attempt to ensure a frame is rendered
    tryShowFrame();
  }, [lightboxOpen, lightboxItem]);

  /* -------------------------
     Render
     ------------------------- */

  return (
    <>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pb-24">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin")}
                  className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 transition text-gray-900"
                  aria-label="Back to admin"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Content</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Create announcements and curate gallery assets.</p>
                </div>
              </div>

              {/* intentionally no top action buttons / no search */}
              <div />
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Offers section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Offers</h2>
                <p className="text-xs text-gray-500 mt-1">Active announcements appear in your site header.</p>
              </div>

              {/* Add Offer button next to section */}
              <div>
                <button onClick={openCreateOffer} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition shadow-sm">
                  <Plus size={14} /> Add Offer
                </button>
              </div>
            </div>

            {/* Offer cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                <div className="col-span-full bg-white rounded-2xl p-8 flex items-center justify-center shadow-sm">
                  <Loader2 className="animate-spin" /> <span className="ml-3 text-sm text-gray-600">Loading offers…</span>
                </div>
              ) : offers.length === 0 ? (
                <div className="col-span-full bg-white rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm">
                  <ImageIcon size={48} className="text-gray-300 mb-2" />
                  <div className="text-gray-700 font-medium">No offers yet</div>
                </div>
              ) : (
                offers.map((o) => (
                  <article
                    key={o._id}
                    className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow hover:shadow-lg transition transform hover:-translate-y-1"
                    style={{
                      borderColor: o.active ? "#dff6ea" : undefined,
                      boxShadow: o.active ? "0 8px 30px rgba(16,24,40,0.06)" : undefined,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0`}
                        style={{
                          background: o.active ? "linear-gradient(180deg, rgba(52,211,153,0.08), rgba(52,211,153,0.02))" : "rgba(243,244,246,0.6)",
                        }}
                      >
                        <span className={`text-sm font-bold ${o.active ? "text-emerald-700" : "text-gray-400"}`}>{o.active ? "ON" : "OFF"}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 leading-tight">{o.text}</h3>
                        <p className="text-xs text-gray-400 mt-1">{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button onClick={() => openEditOffer(o)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-800 transition">
                        <PencilIcon size={14} /> Edit
                      </button>
                      <button onClick={() => deleteOffer(o._id, o.text)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-100 text-sm hover:bg-red-100 transition">
                        <Trash2 size={14} /> Delete
                      </button>
                      <button
                        onClick={() => toggleOfferActive(o._id)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${o.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                        title={o.active ? "Deactivate" : "Activate"}
                        aria-pressed={o.active}
                      >
                        {o.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        <span className="text-xs">{o.active ? "Active" : "Inactive"}</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Gallery section (under offers) */}
          <section className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Gallery</h2>
                <p className="text-xs text-gray-500 mt-1">High-quality thumbnails, always-visible actions and refined preview.</p>
              </div>

              {/* Add Gallery button same style as Add Offer */}
              <div>
                <button
                  onClick={() => setGalleryUploadOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition shadow-sm"
                >
                  <Plus size={14} /> Add Item
                </button>
              </div>
            </div>

            {/* Enhanced gallery grid */}
            {galleryLoading ? (
              <div className="bg-white rounded-2xl p-8 flex items-center justify-center shadow-sm">
                <Loader2 className="animate-spin" /> <span className="ml-3 text-sm text-gray-600">Loading gallery…</span>
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm">
                <ImageIcon size={48} className="text-gray-300 mb-2" />
                <div className="text-gray-700 font-medium">No gallery items yet</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {galleryItems.map((g) => {
                  const isVideo = (g.resourceType ?? "").startsWith("video") || /\.(mp4|webm|mov|avi|m4v)$/i.test(g.publicId ?? "");
                  // prefer poster field if available, otherwise generate a small SVG poster
                  const poster = (g.poster && g.poster.length > 0) ? g.poster : (isVideo ? svgPosterDataUrl(g.title ?? "Video", 640, 360) : undefined);
                  return (
                    <div
                      key={g._id}
                      className="relative bg-white rounded-2xl overflow-hidden shadow hover:shadow-lg transition transform hover:-translate-y-1"
                    >
                      {/* Image / video PREVIEW (use poster or generated poster so no black screen) */}
                      <div className="w-full h-56 bg-black/5 relative cursor-pointer" onClick={() => openLightbox(g)}>
                        {isVideo ? (
                          <div className="relative w-full h-full">
                            {/* render poster via next/image for consistent first-frame display */}
                            <Image src={poster!} alt={g.title ?? "Video poster"} fill style={{ objectFit: "cover" }} unoptimized />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/85 text-gray-900 shadow">
                                <Play size={18} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full h-full">
                            <Image src={g.url} alt={g.title ?? "Gallery image"} fill style={{ objectFit: "cover" }} unoptimized />
                          </div>
                        )}

                        {/* Always-visible action buttons (top-right) */}
                        <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openGalleryEdit(g);
                            }}
                            className="p-2 bg-white/95 rounded-full shadow text-gray-900 hover:scale-105 transform transition"
                            title="Edit"
                            aria-label="Edit gallery item"
                          >
                            <PencilIcon size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteGalleryItem(g._id);
                            }}
                            className="p-2 bg-red-600 text-white rounded-full shadow hover:scale-105 transform transition"
                            title="Delete"
                            aria-label="Delete gallery item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Always-visible preview CTA (bottom-left) */}
                        <button
                          onClick={() => openLightbox(g)}
                          className="absolute left-3 bottom-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 text-white text-sm shadow transition hover:scale-105"
                          aria-label="Preview"
                        >
                          <ZoomIn size={14} />
                          Preview
                        </button>

                        {/* subtle overlay on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition pointer-events-none" />
                      </div>

                      {/* meta */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{g.title || "Untitled"}</div>
                            <div className="text-xs text-gray-500 truncate mt-1">{g.description || ""}</div>
                          </div>
                          <div className="text-xs text-gray-400 whitespace-nowrap">{g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Offer modal */}
      <Modal open={offerModalOpen} onClose={() => setOfferModalOpen(false)} title={editingOffer ? "Edit Offer" : "Create Offer"}>
        <div className="space-y-4">
          <label className="text-xs font-medium text-gray-700">Offer text</label>
          <textarea
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            maxLength={80}
            rows={3}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            placeholder="Write announcement text (short & sweet)"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={offerActive} onChange={() => setOfferActive((v) => !v)} className="rounded" />
              Active
            </label>
            <div className="text-xs text-gray-500">{offerText.length}/80</div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setOfferModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm">
              Cancel
            </button>
            <button onClick={saveOffer} className="px-4 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: COLORS.primary }}>
              <Check size={14} className="inline mr-2" /> Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Gallery upload modal */}
      <Modal open={galleryUploadOpen} onClose={() => setGalleryUploadOpen(false)} title="Upload Gallery Item" wide>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="text-xs font-medium text-gray-700">File</label>
            <div className="mt-2">
              {/* Attractive choose file button always visible */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="upload-file"
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-900 to-black text-white rounded-xl cursor-pointer shadow-lg hover:opacity-95 transition text-sm"
                >
                  <UploadCloud size={16} />
                  <span>{selectedFileName ?? "Choose file"}</span>
                </label>
                <button
                  onClick={() => {
                    resetUploadForm();
                    if (fileInputRef.current) fileInputRef.current.click();
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  Reset
                </button>
              </div>
              <input id="upload-file" ref={fileInputRef} type="file" accept="image/*,video/*" onChange={onFileSelect} className="hidden" />
            </div>

            {previewUrl && (
              <div className="mt-4 rounded-xl overflow-hidden border border-gray-200">
                {selectedFile?.type.startsWith("video/") ? (
                  <video src={previewUrl} className="w-full h-64 object-cover" controls muted playsInline />
                ) : (
                  <img src={previewUrl} alt="Preview" className="w-full h-64 object-cover" />
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Title</label>
            <input value={galleryTitle} onChange={(e) => setGalleryTitle(e.target.value)} className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2" placeholder="Optional title" />
            <label className="text-xs font-medium text-gray-700 mt-4 block">Description</label>
            <textarea value={galleryDescription} onChange={(e) => setGalleryDescription(e.target.value)} rows={4} className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2 resize-none" placeholder="Optional description" />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { resetUploadForm(); setGalleryUploadOpen(false); }} className="px-4 py-2 rounded-lg border text-sm">
                Cancel
              </button>
              <button onClick={uploadGalleryItem} disabled={galleryUploading || !selectedFile} className="px-4 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: COLORS.primary }}>
                {galleryUploading ? <Loader2 className="animate-spin inline mr-2" /> : <UploadCloud className="inline mr-2" />} Upload
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Gallery edit modal */}
      <Modal open={galleryEditOpen} onClose={() => { setGalleryEditOpen(false); setEditingGallery(null); }} title="Edit Gallery Item">
        {editingGallery ? (
          <GalleryEditForm
            item={editingGallery}
            onCancel={() => { setGalleryEditOpen(false); setEditingGallery(null); }}
            onSave={(file, title, description) => saveGalleryEdit(editingGallery._id, title ?? "", description ?? "")}
            uploading={false}
            allowFile={false}
            onFileSelect={onFileSelect}
            selectedFileName={selectedFileName}
          />
        ) : null}
      </Modal>

      {/* Lightbox modal */}
      <Modal open={lightboxOpen} onClose={() => setLightboxOpen(false)} title={lightboxItem?.title ?? "Preview"} wide>
        {lightboxItem && (
          <div className="w-full">
            {(lightboxItem.resourceType ?? "").startsWith("video") || /\.(mp4|webm|mov|avi|m4v)$/i.test(lightboxItem.publicId ?? "") ? (
              // Use poster to avoid black screen, and programmatically play/pause to render a frame.
              <video
                ref={videoLightRef}
                src={lightboxItem.url}
                controls
                className="w-full h-[60vh] object-contain bg-black rounded"
                poster={lightboxItem.poster ?? svgPosterDataUrl(lightboxItem.title ?? "Video", 1280, 720)}
                preload="metadata"
              />
            ) : (
              <div className="relative w-full h-[60vh]">
                <Image src={lightboxItem.url} alt={lightboxItem.title ?? "Preview"} fill style={{ objectFit: "contain" }} unoptimized />
              </div>
            )}
            {lightboxItem.description && <div className="mt-4 text-sm text-gray-600">{lightboxItem.description}</div>}
          </div>
        )}
      </Modal>

      {/* Toasts */}
      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}
    </>
  );
}