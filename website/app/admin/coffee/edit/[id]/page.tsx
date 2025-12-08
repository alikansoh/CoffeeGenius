"use client";

import { useEffect, useState, useRef } from "react";
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
  Coffee as CoffeeIcon,
} from "lucide-react";

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

export default function AdminEditCoffeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?. id as string;
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteInput, setNoteInput] = useState("");

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
  });

  const [originalData, setOriginalData] = useState<CoffeeData | null>(null);

  useEffect(() => {
    if (! id) return;
    const fetchCoffee = async () => {
      try {
        setLoading(true);
        const res = await window.fetch(`/api/coffee/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load coffee");
        const data = await res.json();
        const c = data?. data || data;

        const formatted: CoffeeData = {
          _id: c._id || "",
          slug: c.slug || "",
          name: c. name || "",
          origin: c.origin || "",
          notes: c.notes ?  c.notes.split(","). map((n: string) => n.trim()) : [],
          img: c.img || "",
          images: c.images || (c.img ? [c.img] : []),
          roastLevel: c.roastLevel || "",
          process: c.process || "",
          altitude: c.altitude || "",
          harvest: c.harvest || "",
          cupping_score: c.cupping_score ??  "",
          variety: c.variety || "",
          brewing: c. brewing || "",
          bestSeller: c.bestSeller || false,
        };

        setFormData(formatted);
        setOriginalData(formatted);
      } catch (err) {
        setToast({ type: "error", message: "Failed to load coffee" });
      } finally {
        setLoading(false);
      }
    };
    fetchCoffee();
  }, [id]);

  const setField = (k: keyof CoffeeData, v: CoffeeData[keyof CoffeeData]) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    if (name === "cupping_score") {
      const n = value === "" ? "" : Math.min(100, Math.max(0, parseInt(value || "0")));
      setField("cupping_score", n);
      setErrors((s) => ({ ...s, cupping_score: "" }));
      return;
    }

    // ✅ Auto-update slug when name changes
    if (name === "name") {
      const newSlug = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")
        .replace(/-+/g, "-");
      setFormData((p) => ({ ...p, name: value, slug: newSlug }));
      setErrors((s) => ({ ...s, name: "" }));
      return;
    }

    setField(name as keyof CoffeeData, value);
    setErrors((s) => ({ ...s, [name]: "" }));
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

  const removeNote = (n: string) =>
    setFormData((p) => ({ ...p, notes: p.notes.filter((x) => x !== n) }));

  const handleFiles = async (files: FileList | null) => {
    if (!files?. length) return;
    const arr = Array.from(files);
    const read = await Promise.all(
      arr.map(
        (f) =>
          new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(f);
          })
      )
    );
    setFormData((p) => ({ ...p, images: [... p.images, ...read], img: p.img || read[0] }));
  };

  const removeImage = (idx: number) => {
    setFormData((p) => {
      const images = p.images.filter((_, i) => i !== idx);
      const img = p.img && images.includes(p.img) ? p. img : images[0] ??  "";
      return { ...p, images, img };
    });
  };

  const handlePasteURL = () => {
    const url = prompt("Paste image URL:");
    if (url) setFormData((p) => ({ ... p, images: [...p.images, url], img: p.img || url }));
  };

  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = "Name is required";
    if (!formData. origin.trim()) next.origin = "Origin is required";
    if (
      formData.cupping_score !== "" &&
      (formData.cupping_score < 0 || formData.cupping_score > 100)
    )
      next.cupping_score = "Score must be 0-100";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) {
      setToast({ type: "error", message: "Fix errors before saving" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: formData.slug, // ✅ Include updated slug
        name: formData. name,
        origin: formData.origin,
        notes: formData.notes. join(", "),
        img: formData.img,
        images: formData.images,
        roastLevel: formData.roastLevel || undefined,
        process: formData. process || undefined,
        altitude: formData.altitude || undefined,
        harvest: formData.harvest || undefined,
        cupping_score: formData.cupping_score === "" ? undefined : formData.cupping_score,
        variety: formData.variety || undefined,
        brewing: formData.brewing || undefined,
        bestSeller: formData.bestSeller,
      };
      const res = await window.fetch(`/api/coffee/${encodeURIComponent(formData._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setToast({ type: "success", message: "Coffee updated!" });
      setTimeout(() => router.push("/admin/coffee"), 1200);
    } catch (err) {
      setToast({ type: "error", message: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const res = await window.fetch(`/api/coffee/${encodeURIComponent(formData._id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setToast({ type: "success", message: "Coffee deleted!" });
      setTimeout(() => router.push("/admin/coffee"), 1200);
    } catch (err) {
      setToast({ type: "error", message: "Failed to delete" });
      setDeleting(false);
    }
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

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
                  onClick={() => router. push("/admin/coffee")}
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
                  <div className="px-3 py-1. 5 bg-yellow-100 text-yellow-900 rounded-full text-xs sm:text-sm font-medium">
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
          {/* Left: Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic */}
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
                      errors. name ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors. name}</p>}
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
                  <p className="text-xs text-gray-500 mt-1">
                    Slug automatically updates when you change the name
                  </p>
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
                  <p className="text-xs text-gray-500 mt-2 ml-15">
                    This coffee will be featured in the best sellers section
                  </p>
                </div>
              </div>
            </section>

            {/* Notes */}
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
                  {formData.notes. map((n) => (
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

            {/* Details */}
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
                          formData.roastLevel === roast. value
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

                {/* Other Details */}
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
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Cupping Score (0-100)
                    </label>
                    <input
                      name="cupping_score"
                      type="number"
                      min={0}
                      max={100}
                      value={formData.cupping_score}
                      onChange={handleInputChange}
                      placeholder="85"
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all ${
                        errors.cupping_score ?  "border-red-400" : "border-gray-300"
                      }`}
                    />
                    {errors.cupping_score && (
                      <p className="text-xs text-red-600 mt-1">{errors.cupping_score}</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Brewing */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Brewing Guide</h2>
              <p className="text-sm text-gray-600 mb-3">
                Add brewing instructions per line (e.g., Method: Instructions)
              </p>
              <textarea
                name="brewing"
                rows={5}
                value={formData. brewing}
                onChange={handleInputChange}
                placeholder="Espresso: 18-20g dose, 25-30s&#10;Pour Over: 1:16 ratio, 3-4 minute brew"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all"
              />
            </section>
          </div>

          {/* Right: Images + Actions */}
          <aside className="space-y-6">
            {/* Images */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Images</h3>
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
                    <Image src={formData.img} alt="main" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => setField("img", "")}
                      className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="mx-auto text-gray-400 mb-3" size={40} />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop image here</div>
                    <div className="text-xs text-gray-500 mb-4">or</div>
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
                        Paste URL
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => handleFiles(e. target.files)}
                />
              </div>

              {formData.images.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">
                    Gallery ({formData.images.length})
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {formData. images.map((img, i) => (
                      <div
                        key={i}
                        onClick={() => setField("img", img)}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          formData.img === img
                            ?  "border-gray-900 ring-2 ring-gray-300"
                            : "border-gray-300 hover:border-gray-900"
                        }`}
                      >
                        <Image src={img} alt={`img-${i}`} fill className="object-cover" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(i);
                          }}
                          className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
                        >
                          <Trash2 size={12} className="text-red-600" />
                        </button>
                        {formData.img === img && (
                          <div className="absolute top-1 left-1 p-1 bg-gray-900 rounded-full shadow-md">
                            <Check size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <Plus size={24} className="text-gray-400" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Click image to set as main.  Click trash to remove.
                  </p>
                </div>
              )}
            </section>

            {/* Actions */}
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
                    saving
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                  }`}
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </div>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </section>
          </aside>
        </form>

        {/* Delete Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Delete coffee? </h3>
              <p className="text-sm mt-2 text-gray-600">
                Are you sure you want to delete <strong>{formData.name}</strong>? This cannot be
                undone.
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
                    deleting ?  "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
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
      </main>

      {/* Toast */}
      {toast && <Toast message={toast. message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}