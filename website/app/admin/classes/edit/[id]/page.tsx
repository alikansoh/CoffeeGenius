"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Play,
  Calendar,
  Clock,
  MapPin,
  Tag,
} from "lucide-react";
import {
  getCloudinaryUrl,
  getCloudinaryVideo,
  getVideoThumbnail,
  isVideo,
} from "@/app/utils/cloudinary";

/* ------------------------- Types ------------------------- */

type SessionItem = {
  id?: string;
  // store both ISO style fields (legacy) and separate date/time fields for edit UI
  start?: string; // ISO (fallback)
  end?: string; // ISO (fallback)
  startDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endDate?: string; // YYYY-MM-DD
  endTime?: string; // HH:MM
};

type SessionFromApi = {
  id?: string;
  start?: string;
  end?: string;
};

type ClassData = {
  _id: string;
  slug: string;
  title: string;
  subtitle: string;
  price: number | "";
  summary: string;
  description: string;
  durationMinutes: number | "";
  capacity: number | "";
  minPeople: number | "";
  maxPeople: number | "";
  instructor: { name?: string; avatar?: string; bio?: string } | null;
  image: string; // main publicId
  images: string[]; // gallery publicIds
  featured: boolean;
  sessions: SessionItem[];
  thingsToNote: string[];
  furtherInformation: string;
  location: string;
};

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

type ApiUploadFile = {
  publicId?: string;
  public_id?: string;
  resourceType?: string;
  resource_type?: string;
  url?: string;
  secure_url?: string;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
};

/* ------------------------- Helpers ------------------------- */

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

  if (!main) main = unique.find((id) => !isVideoChecker(id));
  if (!main) main = unique[0] ?? "";

  if (main) {
    const rest = unique.filter((id) => id !== main);
    return { main, orderedImages: [main, ...rest] };
  }
  return { main: "", orderedImages: unique };
};

const pickMain = (
  images: string[],
  preferredMain: string | undefined,
  map: Record<string, boolean> | undefined
) => computeMainAndImages(images, preferredMain, (pid) => (map?.[pid] ?? isVideo(pid)));

function isoToLocalDateTimeParts(iso?: string) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  // YYYY-MM-DD
  const date = d.toISOString().slice(0, 10);
  // Use locale time (HH:MM) from local Date
  const local = new Date(iso);
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm}` };
}

function combineDateTimeToIso(date?: string, time?: string) {
  if (!date || !time) return undefined;
  // Create a local Date from the date/time and convert to ISO
  const localIso = new Date(`${date}T${time}`);
  if (Number.isNaN(localIso.getTime())) return undefined;
  return localIso.toISOString();
}

/* ------------------------- Component ------------------------- */

export default function AdminEditClassPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [videoMap, setVideoMap] = useState<Record<string, boolean>>({});
  const [playingVideoSrc, setPlayingVideoSrc] = useState<string | null>(null);

  const [formData, setFormData] = useState<ClassData>({
    _id: "",
    slug: "",
    title: "",
    subtitle: "",
    price: "",
    summary: "",
    description: "",
    durationMinutes: "",
    capacity: "",
    minPeople: "",
    maxPeople: "",
    instructor: { name: "", avatar: "", bio: "" },
    image: "",
    images: [],
    featured: false,
    sessions: [],
    thingsToNote: [],
    furtherInformation: "",
    location: "",
  });

  const [originalData, setOriginalData] = useState<ClassData | null>(null);

  // Detect single Cloudinary publicId being a video
  const detectSinglePublicId = useCallback(async (publicId: string): Promise<boolean> => {
    if (!publicId) return false;
    if (isVideo(publicId)) return true;
    try {
      const url = getCloudinaryVideo(publicId);
      const res = await fetch(url, { method: "HEAD" });
      const ct = res.headers.get("content-type") || "";
      return ct.startsWith("video/");
    } catch {
      return false;
    }
  }, []);

  const detectAllPublicIds = useCallback(
    async (publicIds: string[]) => {
      const results: Record<string, boolean> = {};
      await Promise.all(
        publicIds.map(async (pid) => {
          if (!pid) return;
          results[pid] = await detectSinglePublicId(pid);
        })
      );
      return results;
    },
    [detectSinglePublicId]
  );

  /* fetch class */
  const fetchClass = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load class");
      const payload: unknown = await res.json();
      const c: ClassData = ((payload as { data?: ClassData }).data ?? (payload as ClassData));

      const imgs: string[] = c.images?.length ? c.images : c.image ? [c.image] : [];

      const detected = await detectAllPublicIds(imgs);

      const formatted: ClassData = {
        _id: c._id || "",
        slug: c.slug || "",
        title: c.title || "",
        subtitle: c.subtitle || "",
        price: c.price ?? "",
        summary: c.summary || "",
        description: c.description || "",
        durationMinutes: c.durationMinutes ?? "",
        capacity: c.capacity ?? "",
        minPeople: c.minPeople ?? "",
        maxPeople: c.maxPeople ?? "",
        instructor: c.instructor || { name: "", avatar: "", bio: "" },
        image: c.image || "",
        images: imgs,
        featured: !!c.featured,
        // sessions: map ISO -> split date/time fields for inputs
        sessions: ((c as { sessions?: SessionFromApi[] }).sessions || []).map((s: SessionFromApi) => {
          const { date: startDate, time: startTime } = isoToLocalDateTimeParts(s.start);
          const { date: endDate, time: endTime } = isoToLocalDateTimeParts(s.end);
          return {
            id: s.id ?? undefined,
            start: s.start ?? undefined,
            end: s.end ?? undefined,
            startDate,
            startTime,
            endDate,
            endTime,
          } as SessionItem;
        }),
        thingsToNote: c.thingsToNote || [],
        furtherInformation: c.furtherInformation || "",
        location: c.location || "",
      };

      const { main, orderedImages } = pickMain(imgs, formatted.image || undefined, detected);

      setVideoMap(detected);
      const normalized = { ...formatted, image: main, images: orderedImages };
      setFormData(normalized);
      setOriginalData(normalized);
    } catch (err: unknown) {
      console.error(err);
      setToast({ type: "error", message: "Failed to load class" });
    } finally {
      setLoading(false);
    }
  }, [id, detectAllPublicIds]);

  useEffect(() => {
    void fetchClass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
    };
  }, [pendingFiles]);

  /* helpers */
  const setField = <K extends keyof ClassData>(k: K, v: ClassData[K]) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === "title") {
      const slug = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")
        .replace(/-+/g, "-");
      setFormData((p) => ({ ...p, title: value, slug }));
      setErrors((s) => ({ ...s, title: "" }));
      return;
    }
    if (["price", "durationMinutes", "capacity", "minPeople", "maxPeople"].includes(name)) {
      const num = value === "" ? "" : Number(value);
      setFormData((p) => ({ ...p, [name]: num } as ClassData));
      setErrors((s) => ({ ...s, [name]: "" }));
      return;
    }
    setFormData((p) => ({ ...p, [name]: value } as ClassData));
    setErrors((s) => ({ ...s, [name]: "" }));
  };

  /* notes */
  const [noteInput, setNoteInput] = useState("");
  const addNote = () => {
    const parts = noteInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setFormData((p) => ({ ...p, thingsToNote: Array.from(new Set([...p.thingsToNote, ...parts])).slice(0, 12) }));
    setNoteInput("");
  };
  const removeNote = (n: string) => setFormData((p) => ({ ...p, thingsToNote: p.thingsToNote.filter((x) => x !== n) }));

  /* session handling (now includes separate date/time) */
  const addSession = () => {
    // default to now + 7 days for start, +2 hours for end
    const now = new Date();
    const startDefault = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endDefault = new Date(startDefault.getTime() + 2 * 60 * 60 * 1000);
    const sd = startDefault.toISOString().slice(0, 10);
    const st = `${String(startDefault.getHours()).padStart(2, "0")}:${String(startDefault.getMinutes()).padStart(2, "0")}`;
    const ed = endDefault.toISOString().slice(0, 10);
    const et = `${String(endDefault.getHours()).padStart(2, "0")}:${String(endDefault.getMinutes()).padStart(2, "0")}`;

    setFormData((p) => ({
      ...p,
      sessions: [...p.sessions, { id: `${Date.now()}`, startDate: sd, startTime: st, endDate: ed, endTime: et }],
    }));
  };

  const updateSession = (idx: number, key: keyof SessionItem, value: string) => {
    setFormData((p) => {
      const s = p.sessions.slice();
      s[idx] = { ...s[idx], [key]: value };

      // if both date & time present, update ISO start/end for consistency
      const startDate = s[idx].startDate ?? "";
      const startTime = s[idx].startTime ?? "";
      const endDate = s[idx].endDate ?? "";
      const endTime = s[idx].endTime ?? "";

      const startIso = combineDateTimeToIso(startDate, startTime);
      const endIso = combineDateTimeToIso(endDate, endTime);

      s[idx].start = startIso ?? s[idx].start;
      s[idx].end = endIso ?? s[idx].end;

      return { ...p, sessions: s };
    });
  };

  const removeSession = (idx: number) => {
    setFormData((p) => ({ ...p, sessions: p.sessions.filter((_, i) => i !== idx) }));
  };

  /* file handling */
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const arr: PendingFile[] = Array.from(files).map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setPendingFiles((p) => [...p, ...arr]);
  };

  const removeExistingImage = (publicId: string) => {
    setFormData((p) => {
      const imgs = p.images.filter((id) => id !== publicId);
      const { main, orderedImages } = pickMain(imgs, p.image, videoMap);
      return { ...p, images: orderedImages, image: main };
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

  const setMainImage = (publicId: string) => {
    if (videoMap[publicId]) {
      setToast({ type: "error", message: "Videos cannot be set as main image" });
      return;
    }
    const { main, orderedImages } = pickMain(formData.images, publicId, videoMap);
    setFormData((p) => ({ ...p, image: main, images: orderedImages }));
  };

  const pastePublicId = () => {
    const pid = prompt("Paste Cloudinary public ID (e.g. classes/latte-art-1):")?.trim();
    if (!pid) return;
    setFormData((p) => {
      const { main, orderedImages } = pickMain([...p.images, pid], p.image || pid, videoMap);
      return { ...p, images: orderedImages, image: main };
    });
  };

  /* validation */
  const validateAll = () => {
    const next: Record<string, string> = {};
    if (!formData.title.trim()) next.title = "Title is required";
    if (!formData.location?.trim()) next.location = "Location is required";
    if (formData.durationMinutes !== "" && Number(formData.durationMinutes) < 0) next.durationMinutes = "Invalid duration";
    // validate sessions: require both startDate/startTime and endDate/endTime if any are present
    formData.sessions.forEach((s, i) => {
      const hasAny = s.startDate || s.startTime || s.endDate || s.endTime || s.start || s.end;
      if (hasAny) {
        const startIso = s.startDate && s.startTime ? combineDateTimeToIso(s.startDate, s.startTime) : s.start;
        const endIso = s.endDate && s.endTime ? combineDateTimeToIso(s.endDate, s.endTime) : s.end;
        if (!startIso) next[`session-${i}`] = "Session start date & time are required";
        if (!endIso) next[`session-${i}`] = "Session end date & time are required";
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* upload pending files to server (/api/upload similar to coffee page) */
  const uploadPendingFiles = async (): Promise<UploadedServerFile[]> => {
    if (!pendingFiles.length) return [];
    const fd = new FormData();
    pendingFiles.forEach((pf) => fd.append("files", pf.file));
    fd.append("folder", "classes");
    const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) throw new Error("Failed to upload files");
    const data = await res.json();
    if (!data.success || !Array.isArray(data.files)) throw new Error(data.message || "Upload failed");
    return data.files.map((f: ApiUploadFile) => ({
      publicId: f.publicId ?? f.public_id ?? "",
      resourceType: f.resourceType ?? f.resource_type,
      url: f.url ?? f.secure_url,
      format: f.format,
      width: f.width ?? null,
      height: f.height ?? null,
      duration: f.duration ?? null,
      bytes: f.bytes ?? null,
    }));
  };

  /* save */
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateAll()) {
      setToast({ type: "error", message: "Fix errors before saving" });
      return;
    }
    setSaving(true);
    try {
      let uploaded: UploadedServerFile[] = [];
      if (pendingFiles.length > 0) {
        setToast({ type: "success", message: "Uploading files..." });
        uploaded = await uploadPendingFiles();
      }

      const newPublicIds = uploaded.map((u) => u.publicId).filter(Boolean);
      const newVideoMapEntries: Record<string, boolean> = {};
      uploaded.forEach((u) => {
        if (u.publicId && u.resourceType) newVideoMapEntries[u.publicId] = u.resourceType === "video";
      });

      const needDetect = newPublicIds.filter((pid) => newVideoMapEntries[pid] === undefined);
      if (needDetect.length > 0) {
        const detected = await detectAllPublicIds(needDetect);
        Object.assign(newVideoMapEntries, detected);
      }

      setVideoMap((prev) => ({ ...prev, ...newVideoMapEntries }));

      const mergedImages = Array.from(new Set([...formData.images, ...newPublicIds]));
      const mergedMap = { ...videoMap, ...newVideoMapEntries };
      const { main, orderedImages } = pickMain(mergedImages, formData.image || undefined, mergedMap);

      // Convert sessions back into ISO start/end for payload
      const sessionsPayload = formData.sessions.map((s) => {
        const startIso = s.startDate && s.startTime ? combineDateTimeToIso(s.startDate, s.startTime) : s.start;
        const endIso = s.endDate && s.endTime ? combineDateTimeToIso(s.endDate, s.endTime) : s.end;
        return {
          id: s.id,
          start: startIso,
          end: endIso,
        };
      });

      const payload = {
        slug: formData.slug,
        title: formData.title,
        subtitle: formData.subtitle || undefined,
        price: formData.price === "" ? undefined : Number(formData.price),
        summary: formData.summary || undefined,
        description: formData.description || undefined,
        durationMinutes: formData.durationMinutes === "" ? undefined : Number(formData.durationMinutes),
        capacity: formData.capacity === "" ? undefined : Number(formData.capacity),
        minPeople: formData.minPeople === "" ? undefined : Number(formData.minPeople),
        maxPeople: formData.maxPeople === "" ? undefined : Number(formData.maxPeople),
        instructor: formData.instructor,
        image: main || undefined,
        images: orderedImages,
        featured: !!formData.featured,
        sessions: sessionsPayload,
        thingsToNote: formData.thingsToNote,
        furtherInformation: formData.furtherInformation,
        location: formData.location,
      };

      const res = await fetch(`/api/classes/${encodeURIComponent(formData._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        throw new Error(`Save failed: ${res.status} ${text ?? ""}`);
      }

      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
      setPendingFiles([]);
      await fetchClass();
      setToast({ type: "success", message: "Class updated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setToast({ type: "error", message: message });
    } finally {
      setSaving(false);
    }
  };

  /* delete */
  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(formData._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => null);
        throw new Error(`Delete failed: ${res.status} ${text ?? ""}`);
      }
      setToast({ type: "success", message: "Class deleted" });
      setTimeout(() => router.push("/admin/classes"), 900);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setToast({ type: "error", message: message });
    } finally {
      setDeleting(false);
    }
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData) || pendingFiles.length > 0;

  const isLocalVideo = (file: File) => {
    if (!file) return false;
    if (file.type && file.type.startsWith("video/")) return true;
    return /\.(mp4|mov|webm|mkv|flv|avi|m4v)$/i.test(file.name);
  };

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
          <p className="mt-4 text-gray-600 font-medium">Loading class...</p>
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
                  onClick={() => router.push("/admin/classes")}
                  className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-900"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Class</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{formData.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hasChanges && <div className="px-3 py-1.5 bg-yellow-100 text-yellow-900 rounded-full text-xs sm:text-sm font-medium">Unsaved changes</div>}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-red-600 border-2 border-red-200 rounded-xl hover:bg-red-50 transition-all font-medium text-sm"
                >
                  <Trash2 size={16} /> <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Basic Info</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Title <span className="text-red-500">*</span></label>
                  <input name="title" value={formData.title} onChange={handleInput} className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.title ? "border-red-400" : "border-gray-300"}`} />
                  {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Subtitle</label>
                  <input name="subtitle" value={formData.subtitle} onChange={handleInput} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Price (GBP)</label>
                    <input name="price" value={formData.price === "" ? "" : String(formData.price)} onChange={handleInput} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Duration (minutes)</label>
                    <input name="durationMinutes" value={formData.durationMinutes === "" ? "" : String(formData.durationMinutes)} onChange={handleInput} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Capacity</label>
                    <input name="capacity" value={formData.capacity === "" ? "" : String(formData.capacity)} onChange={handleInput} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Location <span className="text-red-500">*</span></label>
                  <input name="location" value={formData.location} onChange={handleInput} className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all ${errors.location ? "border-red-400" : "border-gray-300"}`} />
                  {errors.location && <p className="text-xs text-red-600 mt-1">{errors.location}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Summary</label>
                  <input name="summary" value={formData.summary} onChange={handleInput} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Description</label>
                  <textarea name="description" value={formData.description} onChange={handleInput} rows={6} className="w-full px-4 py-3 border-2 rounded-xl border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all resize-none" />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Sessions</h2>
              <p className="text-sm text-gray-600 mb-3">Add, edit or remove sessions (date + time)</p>

              <div className="space-y-3">
                {formData.sessions.map((s, i) => (
                  <div key={s.id ?? i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="text-xs text-gray-500">Start date</label>
                      <input
                        type="date"
                        value={s.startDate ?? ""}
                        onChange={(e) => updateSession(i, "startDate", e.target.value)}
                        className="px-3 py-2 border-2 rounded-xl border-gray-300 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Start time</label>
                      <input
                        type="time"
                        value={s.startTime ?? ""}
                        onChange={(e) => updateSession(i, "startTime", e.target.value)}
                        className="px-3 py-2 border-2 rounded-xl border-gray-300 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">End date</label>
                      <input
                        type="date"
                        value={s.endDate ?? ""}
                        onChange={(e) => updateSession(i, "endDate", e.target.value)}
                        className="px-3 py-2 border-2 rounded-xl border-gray-300 w-full"
                      />
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">End time</label>
                        <input
                          type="time"
                          value={s.endTime ?? ""}
                          onChange={(e) => updateSession(i, "endTime", e.target.value)}
                          className="px-3 py-2 border-2 rounded-xl border-gray-300 w-full"
                        />
                      </div>
                      <div>
                        <button type="button" onClick={() => removeSession(i)} className="px-3 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50">Remove</button>
                      </div>
                    </div>

                    {errors[`session-${i}`] && <div className="col-span-full text-xs text-red-600 mt-1">{errors[`session-${i}`]}</div>}
                  </div>
                ))}

                <div>
                  <button type="button" onClick={addSession} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all">
                    <Plus size={16} /> Add session
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Things to note</h2>

              <div className="flex gap-2 mb-3">
                <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addNote(); } }} placeholder="e.g., bring an apron, arrive 10 min early" className="flex-1 px-4 py-3 border-2 rounded-xl border-gray-300" />
                <button type="button" onClick={addNote} className="px-4 py-3 bg-gray-900 text-white rounded-xl"><Plus size={16} /></button>
              </div>

              <div className="flex flex-wrap gap-2">
                {formData.thingsToNote.map((n) => (
                  <span key={n} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border-2 border-gray-200 text-gray-900 text-sm">
                    {n}
                    <button type="button" onClick={() => removeNote(n)} className="p-0.5 rounded hover:bg-gray-200"><X size={14} /></button>
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* sidebar */}
          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Images & Videos</h3>

              <div onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 hover:bg-gray-100 transition-all min-h-[220px] flex items-center justify-center">
                {formData.image ? (
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden ring-2 ring-gray-300">
                    {videoMap[formData.image] ? (
                      <>
                        <Image src={getVideoThumbnail(formData.image)} alt="Main video poster" fill className="object-cover" />
                        <button type="button" onClick={() => setPlayingVideoSrc(getCloudinaryVideo(formData.image!))} className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/40 rounded-full p-3"><Play size={40} className="text-white" /></div>
                        </button>
                        <button type="button" onClick={() => setField("image", "")} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg"><X size={16} /></button>
                        <div className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full">VIDEO</div>
                      </>
                    ) : (
                      <>
                        <Image src={getCloudinaryUrl(formData.image || "", "medium")} alt="Main image" fill className="object-cover" />
                        <button type="button" onClick={() => { const first = formData.images.find((img) => img !== formData.image && !videoMap[img]); const { main, orderedImages } = pickMain(formData.images, first, videoMap); setFormData((p) => ({ ...p, image: main, images: orderedImages })); }} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg"><X size={16} /></button>
                        <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full">MAIN IMAGE</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="mx-auto text-gray-400 mb-3" size={40} />
                    <div className="text-sm font-medium text-gray-900 mb-1">Drag & drop images/videos here</div>
                    <div className="text-xs text-gray-500 mb-4">Supports: JPG, PNG, MP4, MOV</div>
                    <div className="flex justify-center gap-2">
                      <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl">Upload</button>
                      <button type="button" onClick={pastePublicId} className="px-4 py-2 text-sm border-2 border-gray-300 rounded-xl">Paste ID</button>
                    </div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {(formData.images.length > 0 || pendingFiles.length > 0) && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-900 mb-3">Gallery ({formData.images.length + pendingFiles.length})</label>
                  <div className="grid grid-cols-3 gap-2">
                    {formData.images.map((publicId, i) => {
                      const isVid = videoMap[publicId];
                      const isMain = formData.image === publicId;
                      return (
                        <div key={`${publicId}-${i}`} onClick={() => { if (isVid) setPlayingVideoSrc(getCloudinaryVideo(publicId)); else setMainImage(publicId); }} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${isMain ? "border-green-600 ring-2 ring-green-300 cursor-pointer" : "border-gray-300 hover:border-gray-900 cursor-pointer"}`}>
                          {isVid ? (
                            <>
                              <Image src={getVideoThumbnail(publicId)} alt={`Video ${i + 1}`} fill className="object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center"><div className="bg-black/40 rounded-full p-2"><Play size={28} className="text-white" /></div></div>
                              <div className="absolute top-1 left-1 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">Video</div>
                            </>
                          ) : (
                            <Image src={getCloudinaryUrl(publicId, "thumbnail")} alt={`Image ${i + 1}`} fill className="object-cover" />
                          )}

                          <button type="button" onClick={(e) => { e.stopPropagation(); removeExistingImage(publicId); }} className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"><Trash2 size={12} className="text-red-600" /></button>
                          {isMain && !isVid && <div className="absolute top-1 left-1 p-1 bg-green-600 rounded-full"><Check size={12} className="text-white" /></div>}
                        </div>
                      );
                    })}

                    {pendingFiles.map((pf, i) => {
                      const isVid = isLocalVideo(pf.file);
                      return (
                        <div key={`pending-${i}`} className="relative aspect-square rounded-xl overflow-hidden border-2 border-amber-400 bg-amber-50">
                          {isVid ? (
                            <>
                              <Image src={getPendingVideoPosterDataUrl("NEW VIDEO")} alt={`New video ${i + 1}`} fill className="object-cover" unoptimized />
                              <button type="button" onClick={() => setPlayingVideoSrc(pf.preview)} className="absolute inset-0 flex items-center justify-center"><div className="bg-black/40 rounded-full p-2"><Play size={28} className="text-white" /></div></button>
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-amber-600 text-white px-3 py-1 rounded text-sm font-bold">NEW VIDEO</div></div>
                            </>
                          ) : (
                            <>
                              <Image src={pf.preview} alt={`New ${i + 1}`} fill className="object-cover opacity-75" unoptimized />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="text-xs font-bold text-white bg-amber-600 px-2 py-1 rounded">NEW</span></div>
                            </>
                          )}

                          <button type="button" onClick={() => removePendingFile(i)} className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"><Trash2 size={12} className="text-red-600" /></button>
                        </div>
                      );
                    })}

                    <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all">
                      <Plus size={24} className="text-gray-400" />
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    <span className="font-semibold text-green-600">Click an image to set as main. </span>
                    <span className="font-semibold text-blue-600">Click videos to play. </span>
                    <span className="font-semibold text-red-600">Videos cannot be main image.</span>
                    {pendingFiles.length > 0 && <span className="ml-2 font-semibold text-amber-600"> New files will upload when you save.</span>}
                  </p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 shadow-sm">
              <button type="button" onClick={() => router.push("/admin/classes")} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50 transition-all">Cancel</button>

              <button type="submit" disabled={saving} onClick={handleSave} className={`w-full mt-3 px-4 py-3 rounded-xl font-bold transition-all text-white shadow-md ${saving ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"}`}>
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className={`w-full mt-3 px-4 py-3 rounded-xl font-bold transition-all ${deleting ? "bg-gray-200" : "bg-red-600 text-white hover:bg-red-700"}`}>
                {deleting ? "Deleting..." : "Delete Class"}
              </button>
            </section>
          </aside>
        </form>

        {/* delete confirm */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Delete class?</h3>
              <p className="text-sm mt-2 text-gray-600">Are you sure you want to delete <strong>{formData.title}</strong>? This cannot be undone.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-900 font-bold hover:bg-gray-50">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all text-white ${deleting ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"}`}>{deleting ? "Deleting..." : "Delete"}</button>
              </div>
            </div>
          </div>
        )}

        {/* video modal */}
        {playingVideoSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPlayingVideoSrc(null)}>
            <div className="relative w-full max-w-3xl aspect-video bg-black" onClick={(e) => e.stopPropagation()}>
              <video src={playingVideoSrc} controls autoPlay playsInline className="w-full h-full" />
              <button onClick={() => setPlayingVideoSrc(null)} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow" aria-label="Close video"><X size={18} /></button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 p-1 hover:bg-white/20 rounded-lg transition" aria-label="Close"><X size={16} /></button>
        </div>
      )}
    </>
  );
}