"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertCircle,
  UploadCloud,
  Trash2,
  Star,
  Play,
} from "lucide-react";
import {
  getCloudinaryUrl,
  getCloudinaryVideo,
  getVideoThumbnail,
  isVideo,
} from "@/app/utils/cloudinary";

type RoastLevel = "light" | "medium" | "dark";

interface CoffeeData {
  _id: string;
  slug: string;
  name: string;
  origin: string;
  notes: string[];
  img: string;
  images: string[];
  roastLevel: RoastLevel | "";
  process: string;
  altitude: string;
  harvest: string;
  cupping_score: number | "";
  variety: string;
  brewing: string;
  bestSeller: boolean;
  story: string; // <-- added story
}

interface PendingFile {
  file: File;
  preview: string;
}

interface UploadedServerFile {
  publicId: string;
  resourceType?: string;
  url?: string;
  format?: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  bytes?: number | null;
}

interface UploadApiResponse {
  success: boolean;
  files: Array<{
    publicId?: string;
    public_id?: string;
    resourceType?: string;
    resource_type?: string;
    url?: string;
    secure_url?: string;
    format?: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    bytes?: number | null;
  }>;
  message?: string;
}

const ROAST_LEVELS: { value: RoastLevel; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
];

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "error" | "success";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4 ${
        type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
      }`}
    >
      {type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
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

// Helper to ensure main image is first in the array (preferring non-video)
const computeMainAndImages = (
  images: string[],
  preferredMain: string | undefined,
  isVideoChecker: (id: string) => boolean
) => {
  const unique = Array.from(new Set(images.filter(Boolean)));
  let main =
    preferredMain && unique.includes(preferredMain) && !isVideoChecker(preferredMain)
      ? preferredMain
      : undefined;

  if (!main) {
    main = unique.find((id) => !isVideoChecker(id));
  }
  if (!main) {
    main = unique[0] ?? "";
  }

  if (main) {
    const rest = unique.filter((id) => id !== main);
    return { main, orderedImages: [main, ...rest] };
  }
  return { main: "", orderedImages: unique };
};

// Pure helper (no state deps): pass the map you want to use
const pickMain = (
  images: string[],
  preferredMain: string | undefined,
  map: Record<string, boolean> | undefined
) => computeMainAndImages(images, preferredMain, (pid) => (map?.[pid] ?? isVideo(pid)));

export default function AdminEditCoffeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const [formData, setFormData] = useState<CoffeeData>({
    _id: "",
    slug: "",
    name: "",
    origin: "",
    notes: [],
    img: "",
    images: [],
    roastLevel: "",
    process: "",
    altitude: "",
    harvest: "",
    cupping_score: "",
    variety: "",
    brewing: "",
    bestSeller: false,
    story: "", // initialize story
  });

  const [originalData, setOriginalData] = useState<CoffeeData | null>(null);

  // Map publicId -> isVideo boolean
  const [videoMap, setVideoMap] = useState<Record<string, boolean>>({});

  const [playingVideoSrc, setPlayingVideoSrc] = useState<string | null>(null);

  // Detect a single publicId - returns true if video, false otherwise
  const detectSinglePublicId = useCallback(async (publicId: string): Promise<boolean> => {
    if (!publicId) return false;

    // First check by extension
    if (isVideo(publicId)) return true;

    // Then try HEAD request
    try {
      const url = getCloudinaryVideo(publicId);
      const res = await fetch(url, { method: "HEAD" });
      const ct = res.headers.get("content-type") || "";
      return ct.startsWith("video/");
    } catch {
      return false;
    }
  }, []);

  // Detect all publicIds and return a map
  const detectAllPublicIds = useCallback(
    async (publicIds: string[]): Promise<Record<string, boolean>> => {
      const results: Record<string, boolean> = {};

      await Promise.all(
        publicIds.map(async (publicId) => {
          if (publicId) {
            results[publicId] = await detectSinglePublicId(publicId);
          }
        })
      );

      return results;
    },
    [detectSinglePublicId]
  );

  // Fetch coffee record and detect video types BEFORE setting state
  const fetchCoffee = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/coffee/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load coffee");
      const data = await res.json();
      const c = data?.data || data;

      const images: string[] = c.images || (c.img ? [c.img] : []);

      // Detect video types BEFORE setting formData
      const detectedVideoMap = await detectAllPublicIds(images);

      const formatted: CoffeeData = {
        _id: c._id || "",
        slug: c.slug || "",
        name: c.name || "",
        origin: c.origin || "",
        notes: c.notes ? c.notes.split(",").map((n: string) => n.trim()) : [],
        img: c.img || "",
        images: images,
        roastLevel: c.roastLevel || "",
        process: c.process || "",
        altitude: c.altitude || "",
        harvest: c.harvest || "",
        cupping_score: c.cupping_score ?? "",
        variety: c.variety || "",
        brewing: c.brewing || "",
        bestSeller: c.bestSeller || false,
        story: c.story || "", // include story from server
      };

      // Choose main and order images with detected map
      const { main, orderedImages } = pickMain(images, formatted.img, detectedVideoMap);

      // Set videoMap FIRST, then formData
      setVideoMap(detectedVideoMap);
      const normalized = { ...formatted, img: main, images: orderedImages };
      setFormData(normalized);
      setOriginalData(normalized);
    } catch (err) {
      setToast({ type: "error", message: "Failed to load coffee" });
    } finally {
      setLoading(false);
    }
  }, [id, detectAllPublicIds]);

  useEffect(() => {
    void fetchCoffee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
    };
  }, [pendingFiles]);

  // Local-file video detection (MIME then extension)
  const isLocalVideo = (file: File) => {
    if (!file) return false;
    if (file.type && file.type.startsWith("video/")) return true;
    return /\.(mp4|mov|webm|avi|m4v|mkv|flv|mts|m2ts|3gp|ogv)$/i.test(file.name);
  };

  // Check if a publicId is a video using our videoMap
  const isVideoId = useCallback(
    (publicId: string) => {
      if (!publicId) return false;
      if (videoMap[publicId] !== undefined) return videoMap[publicId];
      return isVideo(publicId);
    },
    [videoMap]
  );

  // generic setField to avoid 'any'
  const setField = <K extends keyof CoffeeData>(k: K, v: CoffeeData[K]) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "cupping_score") {
      // Accept decimals: parseFloat, allow empty string, clamp between 0 and 100
      const parsed = parseFloat(value);
      const n = value === "" || Number.isNaN(parsed) ? "" : Math.min(100, Math.max(0, parsed));
      setField("cupping_score", n as CoffeeData["cupping_score"]);
      setErrors((s) => ({ ...s, cupping_score: "" }));
      return;
    }

    if (name === "name") {
      const newSlug = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")
        .replace(/-+/g, "-");
      // update name and slug together
      setFormData((p) => ({ ...p, name: value, slug: newSlug }));
      setErrors((s) => ({ ...s, name: "" }));
      return;
    }

    // Generic handler: includes "story" textarea (name="story")
    const key = name as keyof CoffeeData;
    // cast via unknown to avoid explicit any
    setField(key, value as unknown as CoffeeData[typeof key]);
    setErrors((s) => ({ ...s, [name]: "" }));
  };

  const addNote = () => {
    const parts = noteInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setFormData((p) => ({
      ...p,
      notes: Array.from(new Set([...p.notes, ...parts])).slice(0, 12),
    }));
    setNoteInput("");
  };

  const removeNote = (n: string) => setFormData((p) => ({ ...p, notes: p.notes.filter((x) => x !== n) }));

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const newPending: PendingFile[] = [];
    Array.from(files).forEach((file) => {
      newPending.push({ file, preview: URL.createObjectURL(file) });
    });
    setPendingFiles((p) => [...p, ...newPending]);
  };

  const removeExistingImage = (publicId: string) => {
    setFormData((p) => {
      const images = p.images.filter((imgId) => imgId !== publicId);
      const { main, orderedImages } = pickMain(images, p.img, videoMap);
      return { ...p, images: orderedImages, img: main };
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const copy = prev.slice();
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSetMainImage = (publicId: string) => {
    if (isVideoId(publicId)) {
      setToast({ type: "error", message: "Videos cannot be set as main image" });
      return;
    }
    const { main, orderedImages } = pickMain(formData.images, publicId, videoMap);
    setFormData((prev) => ({ ...prev, img: main, images: orderedImages }));
  };

  const handlePasteURL = () => {
    const publicId = prompt("Paste Cloudinary public ID (e.g., coffee-shop/ethiopian-main):");
    if (publicId) {
      const trimmed = publicId.trim();
      setFormData((p) => {
        const { main, orderedImages } = pickMain([...p.images, trimmed], p.img || trimmed, videoMap);
        return { ...p, images: orderedImages, img: main };
      });
    }
  };

  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = "Name is required";
    if (!formData.origin.trim()) next.origin = "Origin is required";
    if (formData.cupping_score !== "" && (formData.cupping_score < 0 || formData.cupping_score > 100))
      next.cupping_score = "Score must be 0-100";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const uploadPendingFiles = async (): Promise<UploadedServerFile[]> => {
    if (pendingFiles.length === 0) return [];
    const fd = new FormData();
    pendingFiles.forEach((pf) => fd.append("files", pf.file));
    fd.append("folder", "coffee-shop");

    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to upload files to Cloudinary");
    }

    const data = (await res.json()) as UploadApiResponse;

    if (!data.success || !Array.isArray(data.files)) {
      throw new Error("Upload failed");
    }

    const mapped: UploadedServerFile[] = data.files.map((f) => ({
      publicId: f.publicId ?? f.public_id ?? "",
      resourceType: f.resourceType ?? f.resource_type,
      url: f.url ?? f.secure_url,
      format: f.format,
      width: f.width ?? null,
      height: f.height ?? null,
      duration: f.duration ?? null,
      bytes: f.bytes ?? null,
    }));

    return mapped;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) {
      setToast({ type: "error", message: "Fix errors before saving" });
      return;
    }

    setSaving(true);
    try {
      let uploaded: UploadedServerFile[] = [];

      if (pendingFiles.length > 0) {
        setToast({ type: "success", message: "Uploading new files to Cloudinary..." });
        uploaded = await uploadPendingFiles();
      }

      const newPublicIds = uploaded.map((u) => u.publicId).filter(Boolean);

      // Build new videoMap entries from upload response
      const newVideoMapEntries: Record<string, boolean> = {};
      uploaded.forEach((u) => {
        if (u.publicId && u.resourceType) {
          newVideoMapEntries[u.publicId] = u.resourceType === "video";
        }
      });

      // For any uploaded IDs without resourceType, detect them
      const needDetect = newPublicIds.filter((pid) => newVideoMapEntries[pid] === undefined);
      if (needDetect.length > 0) {
        const detected = await detectAllPublicIds(needDetect);
        Object.assign(newVideoMapEntries, detected);
      }

      // Update videoMap immediately
      setVideoMap((prev) => ({ ...prev, ...newVideoMapEntries }));

      // Prepare merged images list
      const mergedImages = Array.from(new Set([...formData.images, ...newPublicIds]));

      // Determine main image and ordered list (main first)
      const mergedMap = { ...videoMap, ...newVideoMapEntries };
      const { main: mainImage, orderedImages } = pickMain(mergedImages, formData.img, mergedMap);

      const payload = {
        slug: formData.slug,
        name: formData.name,
        origin: formData.origin,
        notes: formData.notes.join(", "),
        story: formData.story || undefined, // <-- include story in PATCH payload
        img: mainImage,
        images: orderedImages,
        roastLevel: formData.roastLevel || undefined,
        process: formData.process || undefined,
        altitude: formData.altitude || undefined,
        harvest: formData.harvest || undefined,
        cupping_score: formData.cupping_score === "" ? undefined : formData.cupping_score,
        variety: formData.variety || undefined,
        brewing: formData.brewing || undefined,
        bestSeller: formData.bestSeller,
      };

      const res = await fetch(`/api/coffee/${encodeURIComponent(formData._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Save failed");

      // Clear pending files
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
      setPendingFiles([]);

      // Re-fetch from server (this will also re-detect all video types)
      await fetchCoffee();

      setToast({ type: "success", message: "Coffee updated!" });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/coffee/${encodeURIComponent(formData._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setToast({ type: "success", message: "Coffee deleted!" });
      setTimeout(() => router.push("/admin/coffee"), 1200);
    } catch (err) {
      setToast({ type: "error", message: "Failed to delete" });
      setDeleting(false);
    }
  };

  const hasChanges =
    JSON.stringify(
      // Normalize ordering for deterministic comparison (main first)
      { ...formData, images: formData.images || [] }
    ) !==
      JSON.stringify(
        originalData
          ? { ...originalData, images: originalData.images || [] }
          : null
      ) || pendingFiles.length > 0;

  const getPendingVideoPosterDataUrl = (label = "NEW VIDEO") => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 800 800'>
      <rect width='100%' height='100%' fill='#111827' />
      <g fill='#f59e0b' font-family='Arial, Helvetica, sans-serif' font-size='36' text-anchor='middle'>
        <text x='50%' y='45%' fill='#f59e0b' font-weight='700'>${label}</text>
      </g>
      <g transform='translate(350,340)' fill='#ffffff'>
        <path d='M0 0 L80 40 L0 80 Z' />
      </g>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading coffee...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px !important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/admin/coffee")}
                  className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Coffee</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{formData.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {hasChanges && (
                  <div className="px-3 py-1.5 bg-yellow-100 text-yellow-900 rounded-full text-xs sm:text-sm font-medium">
                    Unsaved changes
                  </div>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-red-600 border-2 border-red-200 rounded-xl hover:bg-red-50 transition-all font-medium text-sm"
                >
                  <Trash2 size={16} />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8"
        >
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                      errors.name ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Slug (URL) <span className="text-gray-500 text-xs font-normal">• Auto-updates with name</span>
                  </label>
                  <input
                    value={formData.slug}
                    disabled
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Slug automatically updates when you change the name</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Origin <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="origin"
                    value={formData.origin}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                      errors.origin ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.origin && <p className="text-xs text-red-600 mt-1">{errors.origin}</p>}
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.bestSeller}
                        onChange={(e) => setField("bestSeller", e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-7 bg-gray-300 rounded-full peer peer-checked:bg-gray-900 transition-all duration-300" />
                      <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5 shadow-md" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Star
                        size={18}
                        className={`transition-all ${
                          formData.bestSeller ? "text-yellow-500 fill-yellow-500" : "text-gray-400"
                        }`}
                      />
                      <span className="text-sm font-bold text-gray-900">Mark as Best Seller</span>
                    </div>
                  </label>
                  <p className="text-xs text-gray-500 mt-2 ml-15">
                    This coffee will be featured in the best sellers section
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Tasting Notes</h2>
              <div className="flex gap-2 mb-3">
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addNote();
                    }
                  }}
                  placeholder="e.g., chocolate, caramel, floral"
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={addNote}
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Add</span>
                </button>
              </div>
              {formData.notes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.notes.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border-2 border-gray-200 text-gray-900 text-sm font-medium"
                    >
                      {n}
                      <button
                        type="button"
                        onClick={() => removeNote(n)}
                        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Story - long form description (added) */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Story / Description</h2>
              <p className="text-sm text-gray-600 mb-3">Add a longer narrative about this coffee (markdown or plain text).</p>
              <textarea
                name="story"
                value={formData.story}
                onChange={handleInputChange}
                placeholder="e.g., Farm story, processing notes, tasting context, recommended recipes..."
                rows={6}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                This field can include markdown. Consider sanitizing on the server or escaping when rendering.
              </p>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Roast & Details</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-3">Roast Level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {ROAST_LEVELS.map((roast) => (
                      <button
                        key={roast.value}
                        type="button"
                        onClick={() => setField("roastLevel", roast.value)}
                        className={`px-4 py-3 rounded-xl border-2 font-bold transition-all ${
                          formData.roastLevel === roast.value
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 hover:border-gray-900 text-gray-700"
                        }`}
                      >
                        {roast.label}
                      </button>
                    ))}
                  </div>
                  {formData.roastLevel && (
                    <button
                      type="button"
                      onClick={() => setField("roastLevel", "")}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Process</label>
                    <input
                      name="process"
                      value={formData.process}
                      onChange={handleInputChange}
                      placeholder="Washed, Natural, Honey"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Variety</label>
                    <input
                      name="variety"
                      value={formData.variety}
                      onChange={handleInputChange}
                      placeholder="Typica, Bourbon, SL28"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Altitude</label>
                    <input
                      name="altitude"
                      value={formData.altitude}
                      onChange={handleInputChange}
                      placeholder="1,500 - 2,000m"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Harvest Season</label>
                    <input
                      name="harvest"
                      value={formData.harvest}
                      onChange={handleInputChange}
                      placeholder="November - January"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-bold text-gray-900 mb-2">Cupping Score (0-100)</label>
                    <input
                      name="cupping_score"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={formData.cupping_score === "" ? "" : formData.cupping_score}
                      onChange={handleInputChange}
                      placeholder="85.5"
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                        errors.cupping_score ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                    {errors.cupping_score && <p className="text-xs text-red-600 mt-1">{errors.cupping_score}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Brewing Guide</h2>
              <p className="text-sm text-gray-600 mb-3">Add brewing instructions per line (e.g., Method: Instructions)</p>
              <textarea
                name="brewing"
                rows={5}
                value={formData.brewing}
                onChange={handleInputChange}
                placeholder="Espresso: 18-20g dose, 25-30s&#10;Pour Over: 1:16 ratio, 3-4 minute brew"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all"
              />
            </section>
          </div>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Images & Videos</h3>

              <div
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 hover:bg-gray-100 transition-all min-h-[240px] flex items-center justify-center"
              >
                {formData.img ? (
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden ring-2 ring-gray-300">
                    {isVideoId(formData.img) ? (
                      <>
                        <Image
                          src={getVideoThumbnail(formData.img)}
                          alt="Main video poster"
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPlayingVideoSrc(getCloudinaryVideo(formData.img))}
                          className="absolute inset-0 flex items-center justify-center"
                          aria-label="Play main video"
                        >
                          <div className="bg-black/40 rounded-full p-3">
                            <Play size={40} className="text-white" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setField("img", "")}
                          className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all z-10"
                          aria-label="Clear main"
                        >
                          <X size={16} />
                        </button>
                        <div className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full">
                          VIDEO
                        </div>
                      </>
                    ) : (
                      <>
                        <Image src={getCloudinaryUrl(formData.img, "medium")} alt="Main image" fill className="object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const firstImage = formData.images.find(
                              (imgId) => imgId !== formData.img && !isVideoId(imgId)
                            );
                            const { main, orderedImages } = pickMain(formData.images, firstImage, videoMap);
                            setFormData((p) => ({ ...p, img: main, images: orderedImages }));
                          }}
                          className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all z-10"
                          aria-label="Clear main"
                        >
                          <X size={16} />
                        </button>
                        <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                          MAIN IMAGE
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="mx-auto text-gray-400 mb-3" size={40} />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop images/videos here</div>
                    <div className="text-xs text-gray-500 mb-4">Supports: JPG, PNG, MP4, MOV</div>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium"
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={handlePasteURL}
                        className="px-4 py-2 text-sm border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium"
                      >
                        Paste ID
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {(formData.images.length > 0 || pendingFiles.length > 0) && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    Gallery ({formData.images.length + pendingFiles.length})
                    {pendingFiles.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        ⚠️ {pendingFiles.length} new file(s) not uploaded yet
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {formData.images.map((publicId, i) => {
                      const isVideoItem = isVideoId(publicId);
                      const isMain = formData.img === publicId;

                      return (
                        <div
                          key={`existing-${publicId}-${i}`}
                          onClick={() => {
                            if (!isVideoItem) {
                              handleSetMainImage(publicId);
                            } else {
                              setPlayingVideoSrc(getCloudinaryVideo(publicId));
                            }
                          }}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                            isVideoItem
                              ? "cursor-pointer border-gray-300 hover:border-blue-500"
                              : isMain
                              ? "border-green-600 ring-2 ring-green-300 cursor-pointer"
                              : "border-gray-300 hover:border-gray-900 cursor-pointer"
                          }`}
                        >
                          {isVideoItem ? (
                            <>
                              <Image
                                src={getVideoThumbnail(publicId)}
                                alt={`Video ${i + 1} poster`}
                                fill
                                className="object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-black/40 rounded-full p-2">
                                  <Play size={28} className="text-white" />
                                </div>
                              </div>
                              <div className="absolute top-1 left-1 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
                                Video
                              </div>
                            </>
                          ) : (
                            <Image
                              src={getCloudinaryUrl(publicId, "thumbnail")}
                              alt={`Image ${i + 1}`}
                              fill
                              className="object-cover"
                            />
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeExistingImage(publicId);
                            }}
                            className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"
                          >
                            <Trash2 size={12} className="text-red-600" />
                          </button>

                          {isMain && !isVideoItem && (
                            <div className="absolute top-1 left-1 p-1 bg-green-600 rounded-full shadow-md">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {pendingFiles.map((pf, i) => {
                      const isVideoItem = isLocalVideo(pf.file);

                      return (
                        <div
                          key={`pending-${i}`}
                          className="relative aspect-square rounded-xl overflow-hidden border-2 border-amber-400 bg-amber-50"
                        >
                          {isVideoItem ? (
                            <>
                              <Image
                                src={getPendingVideoPosterDataUrl("NEW VIDEO")}
                                alt={`New video ${i + 1}`}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                              <button
                                type="button"
                                onClick={() => setPlayingVideoSrc(pf.preview)}
                                className="absolute inset-0 flex items-center justify-center"
                              >
                                <div className="bg-black/40 rounded-full p-2">
                                  <Play size={28} className="text-white" />
                                </div>
                              </button>
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="bg-amber-600 text-white px-3 py-1 rounded font-bold text-sm">
                                  NEW VIDEO
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <Image
                                src={pf.preview}
                                alt={`New ${i + 1}`}
                                fill
                                className="object-cover opacity-75"
                                unoptimized
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <span className="text-xs font-bold text-white bg-amber-600 px-2 py-1 rounded">NEW</span>
                              </div>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => removePendingFile(i)}
                            className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"
                          >
                            <Trash2 size={12} className="text-red-600" />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <Plus size={24} className="text-gray-400" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    <span className="font-semibold text-green-600">Click an image to set as main. </span>
                    <span className="font-semibold text-blue-600">Click videos to play.</span>
                    <span className="font-semibold text-red-600"> Videos cannot be main image.</span>
                    {pendingFiles.length > 0 && (
                      <span className="font-semibold text-amber-600"> New files will upload when you save.</span>
                    )}
                  </p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/admin/coffee")}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`w-full px-4 py-3 rounded-xl font-bold transition-all text-white shadow-md ${
                    saving ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                  }`}
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {pendingFiles.length > 0 ? "Uploading & Saving..." : "Saving..."}
                    </div>
                  ) : (
                    "Save Changes"
                  )}
                </button>
                {pendingFiles.length > 0 && (
                  <p className="text-xs text-center text-amber-600">
                    ⚠️ {pendingFiles.length} new file(s) will be uploaded when you save
                  </p>
                )}
              </div>
            </section>
          </aside>
        </form>

        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Delete coffee? </h3>
              <p className="text-sm mt-2 text-gray-600">
                Are you sure you want to delete <strong>{formData.name}</strong>? This cannot be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all text-white ${
                    deleting ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {deleting ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Deleting...
                    </div>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {playingVideoSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setPlayingVideoSrc(null)}
          >
            <div className="relative w-full max-w-3xl aspect-video bg-black" onClick={(e) => e.stopPropagation()}>
              <video src={playingVideoSrc} controls autoPlay playsInline className="w-full h-full" />
              <button
                onClick={() => setPlayingVideoSrc(null)}
                className="absolute top-2 right-2 p-2 bg-white rounded-full shadow"
                aria-label="Close video"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}