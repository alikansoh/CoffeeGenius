"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertCircle,
  UploadCloud,
  Star,
  Trash2,
  Film,
} from "lucide-react";

type RoastLevel = "light" | "medium" | "dark";

interface CoffeeFormData {
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
}

// ✅ Interface for temporary files before upload
interface PendingFile {
  file: File;
  preview: string;  // Local blob URL for preview
}

const ROAST_LEVELS: { value: RoastLevel; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
];

function validateSlug(value: string) {
  return /^[a-z0-9-_]+$/.test(value);
}

function Toast({ message, type, onClose }: { message: string; type: "error" | "success"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4 ${
        type === "error" ?   "bg-red-600 text-white" : "bg-green-600 text-white"
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

export default function AdminCreateCoffeeForm({ sendCookies = true }: { sendCookies?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [autoSlugEnabled, setAutoSlugEnabled] = useState(true);

  // ✅ Store pending files (not yet uploaded)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mainImageIndex, setMainImageIndex] = useState<number>(-1);  // ✅ Track which image is main

  const [formData, setFormData] = useState<CoffeeFormData>({
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
  });

  // ✅ Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles. forEach(pf => URL.revokeObjectURL(pf. preview));
    };
  }, [pendingFiles]);

  useEffect(() => {
    if (! autoSlugEnabled) return;
    const generated = formData.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/-+/g, "-");
    setFormData((p) => ({ ...p, slug: generated }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, autoSlugEnabled]);

  const setField = (k: keyof CoffeeFormData, v: string | number | string[] | boolean) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === "cupping_score") {
      const n = value === "" ? "" : Math.min(100, Math.max(0, parseInt(value || "0")));
      setField("cupping_score", n);
      setErrors((s) => ({ ...s, cupping_score: "" }));
      return;
    }

    if (name === "slug") {
      setAutoSlugEnabled(false);
      setField("slug", value. toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, ""));
      setErrors((s) => ({ ...s, slug: "" }));
      return;
    }

    setField(name as keyof CoffeeFormData, value);
    setErrors((s) => ({ ... s, [name]: "" }));
  };

  const addNote = () => {
    const parts = noteInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (! parts.length) return;
    setFormData((p) => ({
      ...p,
      notes: Array.from(new Set([...p.notes, ...parts])). slice(0, 12),
    }));
    setNoteInput("");
  };

  const removeNote = (n: string) => setFormData((p) => ({ ... p, notes: p.notes. filter((x) => x !== n) }));

  // ✅ Helper to check if file is video
  const isVideoFile = (file: File): boolean => {
    return file.type.startsWith('video/');
  };

  // ✅ Store files locally (don't upload yet)
  const handleFiles = async (files: FileList | null) => {
    if (!files?. length) return;

    const newPendingFiles: PendingFile[] = [];

    Array.from(files).forEach(file => {
      const preview = URL.createObjectURL(file);
      newPendingFiles.push({ file, preview });
    });

    setPendingFiles(prev => [...prev, ...newPendingFiles]);

    // ✅ Set first IMAGE as main (skip videos)
    if (mainImageIndex === -1) {
      const firstImageIndex = newPendingFiles.findIndex(pf => ! isVideoFile(pf.file));
      if (firstImageIndex !== -1) {
        setMainImageIndex(pendingFiles.length + firstImageIndex);
      }
    }
  };

  // ✅ Remove pending file
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      
      // Revoke blob URL
      URL.revokeObjectURL(prev[index].preview);
      
      // ✅ Adjust main image index
      if (mainImageIndex === index) {
        // Find next available image (not video)
        const nextImageIndex = updated.findIndex(pf => !isVideoFile(pf.file));
        setMainImageIndex(nextImageIndex);
      } else if (mainImageIndex > index) {
        setMainImageIndex(mainImageIndex - 1);
      }
      
      return updated;
    });
  };

  // ✅ Set main image (only if it's an image, not video)
  const handleSetMainImage = (index: number) => {
    if (isVideoFile(pendingFiles[index]. file)) {
      setToast({ type: "error", message: "Videos cannot be set as main image" });
      return;
    }
    setMainImageIndex(index);
  };

  const handlePasteURL = () => {
    const publicId = prompt("Paste Cloudinary public ID (e.g., coffee-shop/ethiopian-main):");
    if (publicId) {
      setFormData((p) => ({
        ...p,
        images: [...p.images, publicId. trim()],
        img: p.img || publicId.trim(),
      }));
    }
  };

  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = "Coffee name is required";
    if (!formData.slug.trim()) next.slug = "Slug is required";
    else if (!validateSlug(formData.slug)) next.slug = "Slug can only contain lowercase letters, numbers, - and _";
    if (!formData.origin.trim()) next. origin = "Origin is required";
    if (formData.cupping_score !== "" && (formData.cupping_score < 0 || formData.cupping_score > 100))
      next.cupping_score = "Cupping score must be between 0 and 100";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ✅ Upload files to Cloudinary (only when saving)
  const uploadPendingFiles = async (): Promise<string[]> => {
    if (pendingFiles.length === 0) return [];

    const formDataUpload = new FormData();
    pendingFiles.forEach(pf => {
      formDataUpload. append('files', pf.file);
    });
    formDataUpload.append('folder', 'coffee-shop');

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formDataUpload,...(sendCookies ?  { credentials: "include" as RequestCredentials } : {}),
    });

    if (!res.ok) {
      throw new Error('Failed to upload files to Cloudinary');
    }

    const data = await res.json();

    if (! data.success || !data.files) {
      throw new Error('Upload failed');
    }

    return data. files. map((f: { publicId: string }) => f.publicId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);

    if (!validateAll()) {
      setToast({ type: "error", message: "Please fix the highlighted fields" });
      return;
    }

    // ✅ Check if at least one image exists
    const hasAtLeastOneImage = pendingFiles.some(pf => !isVideoFile(pf.file));
    if (!hasAtLeastOneImage && ! formData.img) {
      setToast({ type: "error", message: "Please add at least one image (videos cannot be main image)" });
      return;
    }

    setIsSaving(true);
    try {
      // ✅ Step 1: Upload pending files to Cloudinary
      let uploadedPublicIds: string[] = [];
      
      if (pendingFiles.length > 0) {
        setToast({ type: "success", message: "Uploading to Cloudinary..." });
        uploadedPublicIds = await uploadPendingFiles();
      }

      // ✅ Step 2: Determine main image (must be an image, not video)
      let mainImagePublicId = formData.img;
      
      if (mainImageIndex >= 0 && mainImageIndex < uploadedPublicIds.length) {
        // Use the selected main image from uploaded files
        mainImagePublicId = uploadedPublicIds[mainImageIndex];
      } else if (! mainImagePublicId && uploadedPublicIds.length > 0) {
        // Find first image (not video) as fallback
        for (let i = 0; i < uploadedPublicIds.length; i++) {
          if (!isVideoFile(pendingFiles[i].file)) {
            mainImagePublicId = uploadedPublicIds[i];
            break;
          }
        }
      }

      // ✅ Step 3: Combine all images
      const allImages = [...formData.images, ... uploadedPublicIds];

      // ✅ Step 4: Create coffee in database
      const payload = {
        slug: formData.slug,
        name: formData.name,
        origin: formData.origin,
        notes: formData.notes. join(", "),
        img: mainImagePublicId,  // ✅ Guaranteed to be an image
        images: allImages,
        roastLevel: formData.roastLevel || undefined,
        process: formData. process || undefined,
        altitude: formData.altitude || undefined,
        harvest: formData.harvest || undefined,
        cupping_score: formData.cupping_score === "" ? undefined : formData.cupping_score,
        variety: formData.variety || undefined,
        brewing: formData.brewing || undefined,
        bestSeller: formData.bestSeller,
      };

      const res = await window.fetch("/api/coffee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      const body = await res.json(). catch(() => ({}));
      if (!res.ok) throw new Error(body?. message || `Failed to create coffee (${res.status})`);

      setToast({ type: "success", message: "Coffee created successfully!" });
      
      // Cleanup blob URLs
      pendingFiles.forEach(pf => URL. revokeObjectURL(pf.preview));
      
      setTimeout(() => router.push("/admin/coffee"), 1200);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create coffee",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (formData.name || formData.origin || formData.notes.length > 0 || pendingFiles.length > 0) {
      setShowCancelConfirm(true);
      return;
    }
    router.push("/admin/coffee");
  };

  return (
    <>
      <style jsx global>{`
        input,
        select,
        textarea {
          font-size: 16px ! important;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-12">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Coffee</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Add a new coffee to your catalog</p>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8"
        >
          {/* LEFT: Form Fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Coffee Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Signature Espresso Blend"
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                      errors.name ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors. name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Slug (URL) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      name="slug"
                      value={formData.slug}
                      onChange={handleInputChange}
                      placeholder="signature-espresso-blend"
                      className={`flex-1 px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                        errors. slug ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAutoSlugEnabled(true);
                        const g = formData.name
                          .toLowerCase()
                          .trim()
                          . replace(/\s+/g, "-")
                          .replace(/[^\w-]/g, "")
                          .replace(/-+/g, "-");
                        setField("slug", g);
                      }}
                      className="px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-all"
                    >
                      Auto
                    </button>
                  </div>
                  {errors.slug && <p className="text-xs text-red-600 mt-1">{errors.slug}</p>}
                  <p className="text-xs text-gray-500 mt-1">Lowercase only; letters, numbers, - and _ allowed</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Origin <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="origin"
                    value={formData.origin}
                    onChange={handleInputChange}
                    placeholder="e.g., Yirgacheffe, Ethiopia"
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                      errors. origin ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.origin && <p className="text-xs text-red-600 mt-1">{errors.origin}</p>}
                </div>

                {/* Best Seller Toggle */}
                <div className="pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.bestSeller}
                        onChange={(e) => setField("bestSeller", e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-7 bg-gray-300 rounded-full peer peer-checked:bg-gray-900 transition-all duration-300"></div>
                      <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5 shadow-md"></div>
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
                  <p className="text-xs text-gray-500 mt-2 ml-15">This coffee will be featured in the best sellers section</p>
                </div>
              </div>
            </section>

            {/* Tasting Notes */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Tasting Notes</h2>
              <div className="flex gap-2 mb-3">
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e. target.value)}
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
                  {formData.notes.map((note) => (
                    <span
                      key={note}
                      className="inline-flex items-center gap-2 px-3 py-1. 5 rounded-full bg-gray-100 border-2 border-gray-200 text-gray-900 text-sm font-medium"
                    >
                      {note}
                      <button
                        type="button"
                        onClick={() => removeNote(note)}
                        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">Press Enter or comma to add.   Maximum 12 tags.</p>
            </section>

            {/* Roast & Details */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Roast & Details</h2>
              <div className="space-y-6">
                {/* Roast Level */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-3">Roast Level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {ROAST_LEVELS.map((roast) => (
                      <button
                        key={roast. value}
                        type="button"
                        onClick={() => setField("roastLevel", roast. value)}
                        className={`px-4 py-3 rounded-xl border-2 font-bold transition-all ${
                          formData.roastLevel === roast. value ?  "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-900 text-gray-700"
                        }`}
                      >
                        {roast.label}
                      </button>
                    ))}
                  </div>
                  {formData.roastLevel && (
                    <button type="button" onClick={() => setField("roastLevel", "")} className="mt-2 text-xs text-gray-500 hover:text-gray-700 font-medium">
                      Clear selection
                    </button>
                  )}
                </div>

                {/* Other Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Process</label>
                    <input name="process" value={formData. process} onChange={handleInputChange} placeholder="Washed, Natural, Honey" className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Variety</label>
                    <input name="variety" value={formData.variety} onChange={handleInputChange} placeholder="Typica, Bourbon, SL28" className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Altitude</label>
                    <input name="altitude" value={formData. altitude} onChange={handleInputChange} placeholder="1,500 - 2,000m" className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Harvest Season</label>
                    <input name="harvest" value={formData.harvest} onChange={handleInputChange} placeholder="November - January" className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-bold text-gray-900 mb-2">Cupping Score (0-100)</label>
                    <input name="cupping_score" type="number" min="0" max="100" value={formData.cupping_score ??  ""} onChange={handleInputChange} placeholder="85" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${errors.cupping_score ? "border-red-400" : "border-gray-300"}`} />
                    {errors.cupping_score && <p className="text-xs text-red-600 mt-1">{errors.cupping_score}</p>}
                  </div>
                </div>
              </div>
            </section>

            {/* Brewing Guide */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Brewing Guide</h2>
              <p className="text-sm text-gray-600 mb-3">Add brewing instructions per line (e.g., Method: Instructions)</p>
              <textarea name="brewing" value={formData.brewing} onChange={handleInputChange} placeholder="Espresso: 18-20g dose, 25-30s&#10;Pour Over: 1:16 ratio, 3-4 minute brew" rows={5} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all" />
            </section>
          </div>

          {/* RIGHT: Images & Actions */}
          <aside className="space-y-6">
            {/* Images */}
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
                {mainImageIndex >= 0 && pendingFiles[mainImageIndex] ?  (
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden ring-2 ring-gray-300">
                    <Image 
                      src={pendingFiles[mainImageIndex]. preview} 
                      alt="Main image preview" 
                      fill 
                      className="object-cover" 
                    />
                    <button 
                      type="button" 
                      onClick={() => {
                        removePendingFile(mainImageIndex);
                      }} 
                      className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all"
                    >
                      <X size={16} />
                    </button>
                    <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                      MAIN IMAGE
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud size={40} className="mx-auto text-gray-400 mb-3" />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop images or videos here</div>
                    <div className="text-xs text-gray-500 mb-4">Supports: JPG, PNG, MP4, MOV</div>
                    <div className="flex justify-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => fileRef.current?.click()} 
                        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium"
                      >
                        Upload
                      </button>
                      <button type="button" onClick={handlePasteURL} className="px-4 py-2 text-sm border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium">Paste ID</button>
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

              {pendingFiles.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    Selected Files ({pendingFiles.length})
                    <span className="ml-2 text-xs font-normal text-amber-600">⚠️ Not uploaded yet</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {pendingFiles.map((pf, i) => {
                      const isVideo = isVideoFile(pf.file);
                      const isMain = mainImageIndex === i;
                      
                      return (
                        <div
                          key={i}
                          onClick={() => handleSetMainImage(i)}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                            isVideo 
                              ? "cursor-not-allowed border-gray-200 opacity-60" 
                              : isMain 
                                ? "border-green-600 ring-2 ring-green-300 cursor-pointer" 
                                : "border-gray-300 hover:border-gray-900 cursor-pointer"
                          }`}
                        >
                          {isVideo ?  (
                            <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center">
                              <Film size={24} className="text-gray-500 mb-1" />
                              <span className="text-xs text-gray-600 font-medium">VIDEO</span>
                            </div>
                          ) : (
                            <Image 
                              src={pf. preview} 
                              alt={`Preview ${i + 1}`} 
                              fill 
                              className="object-cover" 
                            />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePendingFile(i);
                            }}
                            className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"
                          >
                            <Trash2 size={12} className="text-red-600" />
                          </button>
                          {isMain && (
                            <div className="absolute top-1 left-1 p-1 bg-green-600 rounded-full shadow-md">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                          {isVideo && (
                            <div className="absolute bottom-1 left-1 right-1 text-center">
                              <span className="text-xs bg-black/70 text-white px-2 py-0.5 rounded">
                                Cannot be main
                              </span>
                            </div>
                          )}
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
                    <span className="font-semibold text-green-600">Click an image to set as main. </span> Videos cannot be main image.  
                    <span className="font-semibold text-amber-600"> Files will upload when you click &quot;Create Coffee&quot;</span>
                  </p>
                </div>
              )}
            </section>

            {/* Actions */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <button type="button" onClick={handleCancel} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className={`w-full px-4 py-3 rounded-xl font-bold transition-all text-white shadow-md ${
                    isSaving ?  "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                  }`}
                >
                  {isSaving ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading & Creating...
                    </div>
                  ) : (
                    "Create Coffee"
                  )}
                </button>
                {pendingFiles.length > 0 && (
                  <p className="text-xs text-center text-amber-600">
                    ⚠️ {pendingFiles.length} file(s) will be uploaded when you save
                  </p>
                )}
              </div>
            </section>
          </aside>
        </form>

        {/* Cancel Confirmation Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Discard changes? </h3>
              <p className="text-sm text-gray-600 mt-2">You have unsaved changes. Are you sure you want to leave?</p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all">Continue Editing</button>
                <button 
                  type="button" 
                  onClick={() => {
                    // Cleanup blob URLs before leaving
                    pendingFiles.forEach(pf => URL.revokeObjectURL(pf.preview));
                    router.push("/admin/coffee");
                  }} 
                  className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}