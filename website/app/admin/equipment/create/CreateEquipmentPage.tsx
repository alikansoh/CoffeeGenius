"use client";
import React, { useEffect, useRef, useState } from "react";
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

const ALLOWED_CATEGORIES = [
  "Espresso Machines",
  "Coffee Grinders",
  "Coffee Brewers",
  "Barista Accessories",
  "Serving & Storage",
] as const;

type EquipmentFormData = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  features: string[]; // tags
  price: number | "";
  img: string; // main image public id
  images: string[]; // gallery public ids
  stock: number | "";
  notes: string;
  description: string;
  specs: { key: string; value: string }[]; // simple key/value pairs
  bestSeller: boolean;
};

interface PendingFile {
  file: File;
  preview: string;
}

function validateSlug(value: string) {
  return /^[a-z0-9-_]+$/.test(value);
}

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
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
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

export default function AdminCreateEquipmentPage({
  sendCookies = true,
}: {
  sendCookies?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mainImageIndex, setMainImageIndex] = useState<number>(-1);
  const [featureInput, setFeatureInput] = useState<string>("");

  const [formData, setFormData] = useState<EquipmentFormData>({
    slug: "",
    name: "",
    brand: "",
    category: "",
    features: [],
    price: "",
    img: "",
    images: [],
    stock: "",
    notes: "",
    description: "",
    specs: [],
    bestSeller: false,
  });

  useEffect(() => {
    return () => pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
  }, [pendingFiles]);

  const setField = <K extends keyof EquipmentFormData>(k: K, v: EquipmentFormData[K]) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "price") {
      const n = value === "" ? "" : Number(value);
      setField("price", n);
      setErrors((s) => ({ ...s, price: "" }));
      return;
    }
    if (name === "stock") {
      const n = value === "" ? "" : Math.max(0, Math.floor(Number(value)));
      setField("stock", n);
      setErrors((s) => ({ ...s, stock: "" }));
      return;
    }
    if (name === "slug") {
      setField("slug", value.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, ""));
      setErrors((s) => ({ ...s, slug: "" }));
      return;
    }
    if (name === "name") {
      setField("name", value);
      // Auto-generate slug from name
      const generatedSlug = value.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
      setField("slug", generatedSlug);
      setErrors((s) => ({ ...s, name: "", slug: "" }));
      return;
    }
    if (name === "category") {
      setField("category", value);
      setErrors((s) => ({ ...s, category: "" }));
      return;
    }
    setField(name as keyof EquipmentFormData, value);
    setErrors((s) => ({ ...s, [name]: "" }));
  };

  const addFeature = () => {
    const v = featureInput.trim();
    if (!v) return;
    setFormData((p) => ({
      ...p,
      features: Array.from(new Set([...p.features, v])).slice(0, 20),
    }));
    setFeatureInput("");
  };

  const removeFeature = (f: string) =>
    setFormData((p) => ({ ...p, features: p.features.filter((x) => x !== f) }));

  const addSpec = () =>
    setFormData((p) => ({ ...p, specs: [...p.specs, { key: "", value: "" }] }));

  const updateSpec = (i: number, keyOrValue: "key" | "value", v: string) =>
    setFormData((p) => {
      const specs = p.specs.slice();
      specs[i] = { ...specs[i], [keyOrValue]: v };
      return { ...p, specs };
    });

  const removeSpec = (i: number) =>
    setFormData((p) => ({ ...p, specs: p.specs.filter((_, idx) => idx !== i) }));

  const isVideoFile = (file: File) => file.type.startsWith("video/");

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: PendingFile[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPendingFiles((p) => {
      const merged = [...p, ...added];
      // if main not set, pick first image (not video)
      if (mainImageIndex === -1) {
        const firstImgIdx = merged.findIndex((m) => !isVideoFile(m.file));
        if (firstImgIdx !== -1) setMainImageIndex(firstImgIdx);
      }
      return merged;
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const rev = prev[index].preview;
      const updated = prev.filter((_, i) => i !== index);
      URL.revokeObjectURL(rev);
      if (mainImageIndex === index) {
        const nextImg = updated.findIndex((pf) => !isVideoFile(pf.file));
        setMainImageIndex(nextImg);
      } else if (mainImageIndex > index) {
        setMainImageIndex((s) => s - 1);
      }
      return updated;
    });
  };

  const handleSetMainImage = (index: number) => {
    if (!pendingFiles[index]) return;
    if (isVideoFile(pendingFiles[index].file)) {
      setToast({ type: "error", message: "Cannot set a video as main image" });
      return;
    }
    setMainImageIndex(index);
  };

  const handlePasteURL = () => {
    const publicId = prompt("Paste Cloudinary public ID (e.g., equipment/espresso-1):");
    if (!publicId) return;
    setFormData((p) => ({
      ...p,
      images: [...p.images, publicId.trim()],
      img: p.img || publicId.trim(),
    }));
  };

  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = "Name is required";
    if (!formData.slug.trim()) next.slug = "Slug is required";
    else if (!validateSlug(formData.slug)) next.slug = "Invalid slug (use lowercase, numbers, - and _)";
    if (!formData.brand.trim()) next.brand = "Brand is required";
    if (!formData.category.trim()) next.category = "Category is required";
    if (formData.price !== "" && (Number.isNaN(Number(formData.price)) || Number(formData.price) < 0))
      next.price = "Price must be >= 0";
    if (formData.stock !== "" && (Number.isNaN(Number(formData.stock)) || Number(formData.stock) < 0))
      next.stock = "Stock must be >= 0";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Upload pending files to /api/upload which should return { success: true, files: [{ publicId }] }
  const uploadPendingFiles = async (): Promise<string[]> => {
    if (pendingFiles.length === 0) return [];

    const fd = new FormData();
    pendingFiles.forEach((pf) => fd.append("files", pf.file));
    fd.append("folder", "equipment");

    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
    });

    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.files)) throw new Error("Upload response invalid");
    // files: [{ publicId, resourceType, ... }]
    return json.files.map((f: { publicId: string }) => f.publicId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);

    if (!validateAll()) {
      setToast({ type: "error", message: "Please fix the highlighted fields" });
      return;
    }

    // require at least one image (either existing img or pending image)
    const hasImagePending = pendingFiles.some((pf) => !isVideoFile(pf.file));
    if (!formData.img && !hasImagePending) {
      setToast({ type: "error", message: "Please provide at least one image (videos cannot be main image)" });
      return;
    }

    setIsSaving(true);
    try {
      let uploadedPublicIds: string[] = [];
      if (pendingFiles.length > 0) {
        setToast({ type: "success", message: "Uploading files..." });
        uploadedPublicIds = await uploadPendingFiles();
      }

      // determine main image public id (prefer existing formData.img, else selected pending)
      let mainImagePublicId = formData.img || "";
      if (mainImageIndex >= 0 && mainImageIndex < uploadedPublicIds.length) {
        mainImagePublicId = uploadedPublicIds[mainImageIndex];
      } else if (!mainImagePublicId && uploadedPublicIds.length > 0) {
        // pick first non-video
        for (let i = 0; i < uploadedPublicIds.length; i++) {
          if (!isVideoFile(pendingFiles[i].file)) {
            mainImagePublicId = uploadedPublicIds[i];
            break;
          }
        }
      }

      const allImages = [...formData.images, ...uploadedPublicIds];

      const payload = {
        slug: formData.slug,
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        features: formData.features,
        price: formData.price === "" ? undefined : formData.price,
        img: mainImagePublicId || undefined,
        images: allImages,
        stock: formData.stock === "" ? undefined : formData.stock,
        notes: formData.notes,
        description: formData.description,
        specs: formData.specs.reduce<Record<string, string>>((acc, s) => {
          if (s.key) acc[s.key] = s.value;
          return acc;
        }, {}),
        bestSeller: formData.bestSeller,
      };

      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || `Failed to create equipment (${res.status})`);

      setToast({ type: "success", message: "Equipment created successfully" });

      // cleanup previews
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));

      setTimeout(() => router.push("/admin/equipment"), 900);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Failed to create equipment" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (formData.name || formData.brand || pendingFiles.length > 0) {
      if (!confirm("Discard changes?")) return;
    }
    pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
    router.push("/admin/equipment");
  };

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
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Equipment</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Add a new equipment item to your catalog</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* LEFT: Fields */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Basic Info</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Name <span className="text-red-500">*</span></label>
                  <input name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g., La Spaziale Mini V" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.name ? "border-red-400" : "border-gray-300"}`} />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Slug (URL) <span className="text-red-500">*</span></label>
                  <input name="slug" value={formData.slug} onChange={handleInputChange} placeholder="la-spaziale-mini-v" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.slug ? "border-red-400" : "border-gray-300"}`} />
                  {errors.slug && <p className="text-xs text-red-600 mt-1">{errors.slug}</p>}
                  <p className="text-xs text-gray-500 mt-1">Auto-generated from name; editable</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Brand</label>
                    <input name="brand" value={formData.brand} onChange={handleInputChange} placeholder="e.g., La Spaziale" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.brand ? "border-red-400" : "border-gray-300"}`} />
                    {errors.brand && <p className="text-xs text-red-600 mt-1">{errors.brand}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Category <span className="text-red-500">*</span></label>
                    <select name="category" value={formData.category} onChange={handleInputChange} className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.category ? "border-red-400" : "border-gray-300"}`}>
                      <option value="">Select a category</option>
                      {ALLOWED_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Price (£)</label>
                    <input name="price" type="number" min="0" step="0.01" value={formData.price === "" ? "" : formData.price} onChange={handleInputChange} placeholder="2299" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.price ? "border-red-400" : "border-gray-300"}`} />
                    {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Stock</label>
                    <input name="stock" type="number" min="0" step="1" value={formData.stock === "" ? "" : formData.stock} onChange={handleInputChange} className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.stock ? "border-red-400" : "border-gray-300"}`} />
                    {errors.stock && <p className="text-xs text-red-600 mt-1">{errors.stock}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Tasting / Notes</label>
                  <input name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Compact commercial-quality machine for home." className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all border-gray-300" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Short description</label>
                  <textarea name="description" value={formData.description} onChange={handleInputChange} rows={4} className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all border-gray-300" />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Inventory & Features</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Features (tags)</label>
                  <div className="flex gap-2">
                    <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} placeholder="e.g., PID" className="flex-1 px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all border-gray-300" />
                    <button type="button" onClick={addFeature} className="px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.features.map((f) => (
                      <span key={f} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border-2 border-gray-200 text-gray-900 text-sm">
                        {f}
                        <button type="button" onClick={() => removeFeature(f)} className="p-0.5 hover:bg-gray-200 rounded">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Specifications</h3>
                  <div className="space-y-2">
                    {formData.specs.map((s, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2 items-center">
                        <input value={s.key} onChange={(e) => updateSpec(i, "key", e.target.value)} placeholder="e.g., Boiler" className="col-span-1 px-3 py-2 border-2 rounded-xl border-gray-300" />
                        <input value={s.value} onChange={(e) => updateSpec(i, "value", e.target.value)} placeholder="e.g., Dual 0.5L" className="col-span-1 px-3 py-2 border-2 rounded-xl border-gray-300" />
                        <button type="button" onClick={() => removeSpec(i)} className="col-span-1 px-4 py-2 bg-red-50 text-red-600 rounded-xl border border-red-100">Remove</button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <button type="button" onClick={addSpec} className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition">Add spec</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: Images & Actions */}
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
                {mainImageIndex >= 0 && pendingFiles[mainImageIndex] ? (
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden ring-2 ring-gray-300">
                    <Image src={pendingFiles[mainImageIndex].preview} alt="Main preview" fill className="object-cover" />
                    <button type="button" onClick={() => removePendingFile(mainImageIndex)} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all">
                      <X size={16} />
                    </button>
                    <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full">MAIN IMAGE</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud size={40} className="mx-auto text-gray-400 mb-3" />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop images or videos here</div>
                    <div className="text-xs text-gray-500 mb-4">Supports: JPG, PNG, MP4, MOV</div>
                    <div className="flex justify-center gap-2">
                      <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium">Upload</button>
                      <button type="button" onClick={handlePasteURL} className="px-4 py-2 text-sm border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium">Paste ID</button>
                    </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {pendingFiles.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">Selected Files ({pendingFiles.length})
                    <span className="ml-2 text-xs font-normal text-amber-600">⚠️ Not uploaded yet</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {pendingFiles.map((pf, i) => {
                      const isVideo = isVideoFile(pf.file);
                      const isMain = mainImageIndex === i;
                      return (
                        <div key={i} onClick={() => handleSetMainImage(i)} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${isVideo ? "cursor-not-allowed border-gray-200 opacity-60" : isMain ? "border-green-600 ring-2 ring-green-300 cursor-pointer" : "border-gray-300 hover:border-gray-900 cursor-pointer"}`}>
                          {isVideo ? (
                            <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center">
                              <Film size={24} className="text-gray-500 mb-1" />
                              <span className="text-xs text-gray-600 font-medium">VIDEO</span>
                            </div>
                          ) : (
                            <Image src={pf.preview} alt={`Preview ${i + 1}`} fill className="object-cover" />
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); removePendingFile(i); }} className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10">
                            <Trash2 size={12} className="text-red-600" />
                          </button>
                          {isMain && <div className="absolute top-1 left-1 p-1 bg-green-600 rounded-full shadow-md"><Check size={12} className="text-white" /></div>}
                          {isVideo && <div className="absolute bottom-1 left-1 right-1 text-center"><span className="text-xs bg-black/70 text-white px-2 py-0.5 rounded">Cannot be main</span></div>}
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all">
                      <Plus size={24} className="text-gray-400" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2"><span className="font-semibold text-green-600">Click an image to set as main. </span>Videos cannot be main image. <span className="font-semibold text-amber-600"> Files will upload when you click &quot;Create Equipment&quot;</span></p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <button type="button" onClick={handleCancel} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all">Cancel</button>
                <button type="submit" disabled={isSaving} className={`w-full px-4 py-3 rounded-xl font-bold transition-all text-white shadow-md ${isSaving ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"}`}>
                  {isSaving ? (
                    <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading & Creating...</div>
                  ) : (
                    "Create Equipment"
                  )}
                </button>

                {pendingFiles.length > 0 && <p className="text-xs text-amber-600 text-center">⚠️ {pendingFiles.length} file(s) will be uploaded when you save</p>}
              </div>
            </section>
          </aside>
        </form>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </main>
    </>
  );
}