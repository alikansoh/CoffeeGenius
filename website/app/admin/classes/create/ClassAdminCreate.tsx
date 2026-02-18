"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertCircle,
  UploadCloud,
  Play,
  Trash2,
  Film,
} from "lucide-react";

type Level = "beginner" | "intermediate" | "advanced";

interface PendingFile {
  file: File;
  preview: string;
}

interface SessionInput {
  id: string;
  date: string; // yyyy-mm-dd
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

interface ClassFormData {
  slug: string;
  title: string;
  subtitle: string;
  price: number | "";
  summary: string;
  description: string;
  durationMinutes: number | "";
  capacity: number | "";
  instructorName: string;
  instructorAvatar?: string;
  image: string; // main image public id (optional until upload)
  images: string[]; // gallery public ids (optional)
  featured: boolean;
  thingsToNote: string[];
  furtherInformation: string;
  location: string;
  level?: Level | "";
}

interface UploadFile {
  publicId: string;
  secureUrl: string;
  resource_type: string;
}

interface UploadResponse {
  success: boolean;
  files: UploadFile[];
}

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function validateSlug(value: string) {
  return /^[a-z0-9-_]+$/.test(value);
}

function Toast({ message, type, onClose }: { message: string; type: "error" | "success"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 ${type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
      {type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
      <span className="text-sm font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/20 rounded-lg" aria-label="Close">
        <X size={16} />
      </button>
    </div>
  );
}

export default function AdminCreateClassForm({ sendCookies = true }: { sendCookies?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState<ClassFormData>({
    slug: "",
    title: "",
    subtitle: "",
    price: "",
    summary: "",
    description: "",
    durationMinutes: "",
    capacity: "",
    instructorName: "",
    instructorAvatar: "",
    image: "",
    images: [],
    featured: false,
    thingsToNote: [],
    furtherInformation: "",
    location: "173 High St, Staines TW18 4PA",
    level: "",
  });

  const [sessions, setSessions] = useState<SessionInput[]>([
    { id: uid("s_"), date: "", startTime: "", endTime: "" },
  ]);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mainImageIndex, setMainImageIndex] = useState<number>(-1); // index into pendingFiles
  const [noteInput, setNoteInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    return () => pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
  }, [pendingFiles]);

  // Auto-generate slug from title
  useEffect(() => {
    if (formData.title.trim()) {
      const generatedSlug = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "") // remove special chars except spaces and hyphens
        .replace(/\s+/g, "-") // replace spaces with hyphens
        .replace(/-+/g, "-") // replace multiple hyphens with single
        .replace(/^-|-$/g, ""); // remove leading/trailing hyphens
      setFormData((prev) => ({ ...prev, slug: generatedSlug }));
    }
  }, [formData.title]);

  const setField = (k: keyof ClassFormData, v: ClassFormData[typeof k]) => setFormData((p) => ({ ...p, [k]: v }));

  const isVideoFile = (file: File) => file.type.startsWith("video/");

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newPending: PendingFile[] = Array.from(files).map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setPendingFiles((p) => {
      const next = [...p, ...newPending];
      // set first image (non-video) as main if none
      if (mainImageIndex === -1) {
        const idx = next.findIndex((pf) => !isVideoFile(pf.file));
        if (idx !== -1) setMainImageIndex(idx);
      }
      return next;
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      const updated = prev.filter((_, i) => i !== index);
      if (mainImageIndex === index) {
        const nextImg = updated.findIndex((pf) => !isVideoFile(pf.file));
        setMainImageIndex(nextImg);
      } else if (mainImageIndex > index) {
        setMainImageIndex(mainImageIndex - 1);
      }
      return updated;
    });
  };

  const handleSetMainImage = (index: number) => {
    if (isVideoFile(pendingFiles[index].file)) {
      setToast({ type: "error", message: "Videos cannot be set as main image" });
      return;
    }
    setMainImageIndex(index);
  };

  const handlePasteURL = () => {
    const publicId = prompt("Paste Cloudinary public ID (e.g., origin/classes/latte-hero):");
    if (publicId) {
      setFormData((p) => ({ ...p, images: [...p.images, publicId.trim()], image: p.image || publicId.trim() }));
    }
  };

  // Sessions management
  const addSession = () => setSessions((s) => [...s, { id: uid("s_"), date: "", startTime: "", endTime: "" }]);
  const updateSession = (id: string, patch: Partial<SessionInput>) => setSessions((s) => s.map((si) => (si.id === id ? { ...si, ...patch } : si)));
  const removeSession = (id: string) => setSessions((s) => s.filter((si) => si.id !== id));

  const addNote = () => {
    const parts = noteInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setFormData((p) => ({ ...p, thingsToNote: Array.from(new Set([...p.thingsToNote, ...parts])).slice(0, 12) }));
    setNoteInput("");
  };

  const removeNote = (n: string) => setFormData((p) => ({ ...p, thingsToNote: p.thingsToNote.filter((x) => x !== n) }));

  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.title.trim()) next.title = "Title is required";
    if (!formData.slug.trim()) next.slug = "Slug is required";
    else if (!validateSlug(formData.slug)) next.slug = "Slug may contain lowercase letters, numbers, - and _ only";
    if (formData.price === "" || Number.isNaN(Number(formData.price))) next.price = "Price is required";
    if (formData.durationMinutes === "" || Number.isNaN(Number(formData.durationMinutes))) next.durationMinutes = "Duration is required";
    if (formData.capacity === "" || Number.isNaN(Number(formData.capacity))) next.capacity = "Capacity is required";
    const validSessions = sessions.filter((s) => s.date && s.startTime && s.endTime);
    if (validSessions.length === 0) next.sessions = "Add at least one session";
    // At least one image: either existing formData.image or an uploaded image pending
    const hasImage = !!formData.image || pendingFiles.some((pf) => !isVideoFile(pf.file));
    if (!hasImage) next.image = "Add at least one image (videos cannot be main image)";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Upload pending files to /api/upload (same contract as coffee form)
  const uploadPendingFiles = async (): Promise<string[]> => {
    if (pendingFiles.length === 0) return [];
    const fd = new FormData();
    pendingFiles.forEach((pf) => fd.append("files", pf.file));
    fd.append("folder", "origin-classes");
    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
    });
    if (!res.ok) throw new Error("Failed to upload files");
    const data: UploadResponse = await res.json();
    if (!data.success || !data.files) throw new Error("Upload failed");
    // Expect files: [{ publicId, secureUrl, resource_type }]
    return data.files.map((f: UploadFile) => f.publicId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    if (!validateAll()) {
      setToast({ type: "error", message: "Please fix the highlighted fields" });
      return;
    }

    setIsSaving(true);
    try {
      let uploadedPublicIds: string[] = [];
      if (pendingFiles.length > 0) {
        setToast({ type: "success", message: "Uploading files..." });
        uploadedPublicIds = await uploadPendingFiles();
      }

      // Determine main image public id
      let mainImagePublicId = formData.image || "";
      if (mainImagePublicId === "" && uploadedPublicIds.length > 0) {
        // pick first uploaded image that's not a video
        for (let i = 0; i < uploadedPublicIds.length; i++) {
          if (!isVideoFile(pendingFiles[i].file)) {
            mainImagePublicId = uploadedPublicIds[i];
            break;
          }
        }
      } else if (mainImageIndex >= 0 && mainImageIndex < uploadedPublicIds.length) {
        mainImagePublicId = uploadedPublicIds[mainImageIndex];
      }

      // Combine images array
      const allImages = [...formData.images, ...uploadedPublicIds];

      // Convert sessions to start/end ISO strings
      const mappedSessions = sessions
        .filter((s) => s.date && s.startTime && s.endTime)
        .map((s) => {
          const start = new Date(`${s.date}T${s.startTime}`);
          const end = new Date(`${s.date}T${s.endTime}`);
          return { start: start.toISOString(), end: end.toISOString() };
        });

      const payload = {
        slug: formData.slug,
        title: formData.title,
        subtitle: formData.subtitle,
        price: Number(formData.price),
        summary: formData.summary,
        description: formData.description,
        durationMinutes: Number(formData.durationMinutes),
        capacity: Number(formData.capacity),
        instructor: { name: formData.instructorName, avatar: formData.instructorAvatar },
        image: mainImagePublicId || undefined,
        images: allImages,
        featured: !!formData.featured,
        sessions: mappedSessions,
        thingsToNote: formData.thingsToNote,
        furtherInformation: formData.furtherInformation,
        location: formData.location,
        level: formData.level || undefined,
      };

      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        ...(sendCookies ? { credentials: "include" as RequestCredentials } : {}),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || `Failed to create class (${res.status})`);

      setToast({ type: "success", message: "Class created successfully!" });
      // cleanup previews
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
      setTimeout(() => router.push("/admin/classes"), 900);
    } catch (err: unknown) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Failed to create class" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    const hasChanges =
      formData.title ||
      formData.summary ||
      pendingFiles.length > 0 ||
      formData.images.length > 0 ||
      sessions.some((s) => s.date || s.startTime || s.endTime);
    if (hasChanges) {
      setShowCancelConfirm(true);
      return;
    }
    router.push("/admin/classes");
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
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <button onClick={handleCancel} className="inline-flex items-center justify-center p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-900" aria-label="Back">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Class / Course</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Add a new class for customers to book</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Basic</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Title *</label>
                  <input name="title" value={formData.title} onChange={(e) => setField("title", e.target.value)} className={`w-full px-4 py-3 border-2 rounded-xl ${errors.title ? "border-red-400" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-gray-900`} />
                  {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Slug *</label>
                  <input name="slug" value={formData.slug} onChange={(e) => setField("slug", e.target.value)} className={`w-full px-4 py-3 border-2 rounded-xl ${errors.slug ? "border-red-400" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-gray-900`} />
                  {errors.slug && <p className="text-xs text-red-600 mt-1">{errors.slug}</p>}
                  <p className="text-xs text-gray-500 mt-1">Auto-generated from title; edit if needed</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Price (£) *</label>
                    <input type="number" name="price" value={formData.price === "" ? "" : formData.price.toString()} onChange={(e) => setField("price", e.target.value === "" ? "" : Number(e.target.value))} className={`w-full px-4 py-3 border-2 rounded-xl ${errors.price ? "border-red-400" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-gray-900`} />
                    {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Duration (minutes) *</label>
                    <input type="number" name="durationMinutes" value={formData.durationMinutes === "" ? "" : formData.durationMinutes.toString()} onChange={(e) => setField("durationMinutes", e.target.value === "" ? "" : Number(e.target.value))} className={`w-full px-4 py-3 border-2 rounded-xl ${errors.durationMinutes ? "border-red-400" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-gray-900`} />
                    {errors.durationMinutes && <p className="text-xs text-red-600 mt-1">{errors.durationMinutes}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Capacity *</label>
                    <input type="number" name="capacity" value={formData.capacity === "" ? "" : formData.capacity.toString()} onChange={(e) => setField("capacity", e.target.value === "" ? "" : Number(e.target.value))} className={`w-full px-4 py-3 border-2 rounded-xl ${errors.capacity ? "border-red-400" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-gray-900`} />
                    {errors.capacity && <p className="text-xs text-red-600 mt-1">{errors.capacity}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Level</label>
                    <select value={formData.level} onChange={(e) => setField("level", e.target.value || "")} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900">
                      <option value="">Any</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Instructor name</label>
                  <input value={formData.instructorName} onChange={(e) => setField("instructorName", e.target.value)} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Subtitle / Location short label</label>
                  <input value={formData.subtitle} onChange={(e) => setField("subtitle", e.target.value)} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Summary</label>
                  <input value={formData.summary} onChange={(e) => setField("summary", e.target.value)} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Description</label>
                  <textarea value={formData.description} onChange={(e) => setField("description", e.target.value)} rows={5} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
                </div>
              </div>
            </section>

            {/* Sessions */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Sessions</h2>
                <button type="button" onClick={addSession} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white hover:bg-gray-800">
                  <Plus size={14} /> Add session
                </button>
              </div>

              <p className="text-sm text-gray-600 mt-2">Add dates and start/end times. Each session is added as a separate date/time pair.</p>

              <div className="space-y-3 mt-4">
                {sessions.map((s, i) => (
                  <div key={s.id} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="text-xs text-gray-600">Date</label>
                      <input type="date" value={s.date} onChange={(e) => updateSession(s.id, { date: e.target.value })} className="w-full px-3 py-2 border-2 rounded-xl border-gray-300" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Start</label>
                      <input type="time" value={s.startTime} onChange={(e) => updateSession(s.id, { startTime: e.target.value })} className="w-full px-3 py-2 border-2 rounded-xl border-gray-300" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">End</label>
                      <input type="time" value={s.endTime} onChange={(e) => updateSession(s.id, { endTime: e.target.value })} className="w-full px-3 py-2 border-2 rounded-xl border-gray-300" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => removeSession(s.id)} className="px-3 py-2 rounded-xl border-2 border-gray-200 hover:bg-gray-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {errors.sessions && <p className="text-xs text-red-600 mt-2">{errors.sessions}</p>}
            </section>

            {/* Things to note */}
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Things to note</h2>
              <div className="flex gap-2 mb-3">
                <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addNote(); } }} placeholder="e.g., Bring comfortable shoes" className="flex-1 px-4 py-3 border-2 rounded-xl border-gray-300" />
                <button type="button" onClick={addNote} className="px-4 py-3 bg-gray-900 text-white rounded-xl">Add</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {formData.thingsToNote.map((n) => (
                  <span key={n} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border-2 border-gray-200">
                    {n}
                    <button type="button" onClick={() => removeNote(n)} className="p-0.5 rounded hover:bg-gray-200">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT */}
          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Images & Videos</h3>

              <div onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 hover:bg-gray-100 transition-all min-h-[220px] flex items-center justify-center">
                {mainImageIndex >= 0 && pendingFiles[mainImageIndex] ? (
                  <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden ring-2 ring-gray-300">
                    <Image src={pendingFiles[mainImageIndex].preview} alt="Main preview" fill className="object-cover" />
                    <button type="button" onClick={() => removePendingFile(mainImageIndex)} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg">
                      <X size={16} />
                    </button>
                    <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full">MAIN</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud size={40} className="mx-auto text-gray-400 mb-3" />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop files here</div>
                    <div className="text-xs text-gray-500 mb-4">JPG, PNG, MP4, MOV supported</div>
                    <div className="flex justify-center gap-2">
                      <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl">Upload</button>
                      <button type="button" onClick={handlePasteURL} className="px-4 py-2 text-sm border-2 border-gray-300 rounded-xl">Paste ID</button>
                    </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {pendingFiles.length > 0 && (
                <>
                  <label className="block text-sm font-bold text-gray-900 mt-4 mb-2">Selected files ({pendingFiles.length}) <span className="ml-2 text-xs text-amber-600">Not uploaded yet</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    {pendingFiles.map((pf, i) => {
                      const isVideo = isVideoFile(pf.file);
                      const isMain = mainImageIndex === i;
                      return (
                        <div key={i} onClick={() => handleSetMainImage(i)} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${isVideo ? "border-gray-200 opacity-70 cursor-not-allowed" : isMain ? "border-green-600 ring-2 ring-green-300 cursor-pointer" : "border-gray-300 hover:border-gray-900 cursor-pointer"}`}>
                          {isVideo ? (
                            <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center">
                              <Play size={24} className="text-gray-500 mb-1" />
                              <span className="text-xs text-gray-600 font-medium">VIDEO</span>
                            </div>
                          ) : (
                            <Image src={pf.preview} alt={`preview-${i}`} fill className="object-cover" />
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); removePendingFile(i); }} className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md">
                            <Trash2 size={12} className="text-red-600" />
                          </button>
                          {isMain && <div className="absolute top-1 left-1 p-1 bg-green-600 rounded-full"><Check size={12} className="text-white" /></div>}
                          {isVideo && <div className="absolute bottom-1 left-1 right-1 text-center"><span className="text-xs bg-black/70 text-white px-2 py-0.5 rounded">Cannot be main</span></div>}
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100">
                      <Plus size={24} className="text-gray-400" />
                    </button>
                  </div>
                </>
              )}
              {errors.image && <p className="text-xs text-red-600 mt-2">{errors.image}</p>}
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <button type="button" onClick={handleCancel} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSaving} className={`w-full px-4 py-3 rounded-xl font-bold text-white ${isSaving ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"}`}>
                  {isSaving ? "Uploading & Creating..." : "Create Class"}
                </button>
                <p className="text-xs text-gray-500 text-center mt-1">Images will be uploaded when you save</p>
              </div>
            </section>
          </aside>
        </form>

        {showCancelConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md border-2 border-gray-200 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-900">Discard changes?</h3>
              <p className="text-sm text-gray-600 mt-2">You have unsaved changes. Are you sure you want to leave?</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900">Continue Editing</button>
                <button onClick={() => { pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview)); router.push("/admin/classes"); }} className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl">Discard</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}