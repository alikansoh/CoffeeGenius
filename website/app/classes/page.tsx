"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  X,
  Coffee,
  Calendar,
  Clock,
  Users,
  Tag,
  Play,
  CheckCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";

/* ----------------------------- Types ------------------------------ */
type Course = {
  id: string;
  title: string;
  subtitle?: string;
  price: number;
  summary: string;
  description: string;
  durationMinutes: number;
  capacity: number;
  minPeople?: number;
  maxPeople?: number;
  instructor: { name: string; avatar?: string; bio?: string };
  image?: string;
  featured?: boolean;
  sessions: { id: string; start: string; end: string }[];
  thingsToNote?: string[];
  furtherInformation?: string;
  location?: string;
  level?: "beginner" | "intermediate" | "advanced";
};

/* -------------------------- Utilities ----------------------------- */
function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const t1 = s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const t2 = e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${t1} - ${t2}`;
}

function money(n: number) {
  return `£${n.toFixed(2)}`;
}

function resolveImageSrc(src?: string, opts?: { w?: number; h?: number }) {
  if (!src) {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3C/svg%3E";
  }
  if (/^https?:\/\//i.test(src)) return src;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (cloudName) {
    const transformations: string[] = [];
    if (opts?.w) transformations.push(`w_${opts.w}`);
    if (opts?.h) transformations.push(`h_${opts.h}`);
    transformations.push("f_auto", "q_auto", "c_fill");
    const t = transformations.join(",");
    const encodedSrc = encodeURIComponent(src);
    return `https://res.cloudinary.com/${cloudName}/image/upload/${t}/${encodedSrc}`;
  }
  return src;
}

/* ---------------------------- Modal -------------------------------- */
function Modal({
  isOpen,
  onClose,
  label,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    requestAnimationFrame(() => {
      const container = modalRef.current;
      if (!container) return;
      const selectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea',
        'input',
        'select',
        '[tabindex]:not([tabindex="-1"])',
      ];
      const focusable = container.querySelectorAll<HTMLElement>(selectors.join(","));
      if (focusable.length > 0) focusable[0].focus();
      else container.focus();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const container = modalRef.current;
        if (!container) return;
        const selectors = [
          'a[href]',
          'button:not([disabled])',
          'textarea',
          'input',
          'select',
          '[tabindex]:not([tabindex="-1"])',
        ];
        const all = Array.from(container.querySelectorAll<HTMLElement>(selectors.join(","))).filter(
          (el) => (el.offsetParent as HTMLElement | null) !== null
        );
        if (all.length === 0) {
          e.preventDefault();
          return;
        }
        const first = all[0];
        const last = all[all.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 z-50"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden />
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white text-black shadow-2xl transform transition-all pointer-events-auto mx-2 sm:mx-4 my-2 sm:my-6"
      >
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ----------------------------- CourseCard (memoized) -------------- */
const CourseCard = React.memo(function CourseCard({
  course,
  onOpen,
}: {
  course: Course;
  onOpen: (c: Course, trigger?: HTMLElement | null) => void;
}) {
  const durationLabel = `${Math.floor(course.durationMinutes / 60)}h ${course.durationMinutes % 60}m`;
  const priceLabel = money(course.price);
  const instructor = course.instructor?.name || "Instructor";

  return (
    <article
      className="group bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-transform duration-350 ease-out border border-gray-200 flex flex-col will-change-transform"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
        {course.image ? (
          <Image
            src={resolveImageSrc(course.image, { w: 1200, h: 800 })}
            alt={course.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            style={{ objectFit: "cover", willChange: "transform, opacity" }}
            className="group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
            <Coffee className="w-12 h-12 text-gray-300" />
          </div>
        )}

        <div className="absolute left-4 bottom-4">
          <div className="px-3 py-1.5 rounded-full bg-white text-black font-bold shadow text-sm">{priceLabel}</div>
        </div>

        {course.featured && (
          <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-black text-white text-xs font-bold">Featured</div>
        )}

        {course.level && (
          <div className="absolute top-4 left-4 px-2 py-1 rounded-full bg-gray-900 text-white text-xs font-bold capitalize">{course.level}</div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h2 className="text-lg font-semibold mb-1 line-clamp-2">{course.title}</h2>
        <div className="text-xs text-gray-600 mb-3 uppercase tracking-wide">
          {instructor} • {course.subtitle}
        </div>

        <p className="text-sm text-gray-700 mb-4 flex-1 line-clamp-3">{course.summary}</p>

        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-600" />
            <span className="font-medium">{durationLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <span className="font-medium">Max {course.capacity}</span>
          </div>
        </div>

        <button
          onClick={(e) => onOpen(course, e.currentTarget as HTMLElement)}
          className="w-full mt-3 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          <Play className="w-4 h-4" />
          View & Book
        </button>
      </div>
    </article>
  );
});

/* ----------------------------- Page ------------------------------- */
export default function CoffeeClassesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [attendees, setAttendees] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ref: string; courseId: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isFlipped, setIsFlipped] = useState(false);

  const triggerRef = useRef<HTMLElement | null>(null);

  // useTransition to mark heavy UI updates as non-urgent so interaction stays smooth
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const isSessionExpired = useCallback((s: { start: string; end: string }) => {
    try {
      const endTs = new Date(s.end).getTime();
      if (Number.isNaN(endTs)) return false; // cannot determine -> treat as not expired
      return endTs <= Date.now();
    } catch {
      return false;
    }
  }, []);

  /* --------------------- Helpers for parsing unknown input --------------------- */
  function toString(v: unknown, fallback = ""): string {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return fallback;
  }
  function toNumber(v: unknown, fallback = 0): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }
  function toStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => toString(x, "")).filter((x) => x !== "");
    return [];
  }
  /* ----------------------------------------------------------------------------- */

  const fetchCourses = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/classes", window.location.origin);
        if (q) url.searchParams.set("q", q);

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text().catch(() => null);
          throw new Error(`API error ${res.status}${text ? `: ${text}` : ""}`);
        }

        const body = await res.json().catch(() => null);
        if (!body) throw new Error("Empty response from API");

        // Interpret body as an unknown structure and normalize safely
        const rawData: unknown[] = Array.isArray(body)
          ? body
          : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).data)
          ? (body as Record<string, unknown>).data as unknown[]
          : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).result)
          ? (body as Record<string, unknown>).result as unknown[]
          : [];

        const mapped: Course[] = rawData.map((c: unknown, idx: number) => {
          const rec = c && typeof c === "object" ? (c as Record<string, unknown>) : {};

          const sessions: { id: string; start: string; end: string }[] =
            (Array.isArray(rec.sessions) ? (rec.sessions as unknown[]) : [])
              .map((s: unknown, sIdx: number) => {
                const sRec = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
                const id =
                  toString(sRec.id) ||
                  toString(sRec._id) ||
                  `${toString(rec._id) || toString(rec.id) || `generated-${idx}`}-s-${sIdx}`;
                const start = toString(sRec.start) || toString(sRec.startDate) || toString(sRec.startTime) || "";
                const end = toString(sRec.end) || toString(sRec.endDate) || toString(sRec.endTime) || "";
                return { id, start, end };
              });

          // instructor normalization
          const instructor = (() => {
            const ins = rec.instructor;
            if (ins && typeof ins === "object") {
              const iRec = ins as Record<string, unknown>;
              return {
                name: toString(iRec.name, toString(rec.instructorName) || "Instructor"),
                avatar: toString(iRec.avatar),
                bio: toString(iRec.bio),
              };
            }
            // string or missing
            return { name: toString(rec.instructorName) || toString(rec.instructor) || "Instructor" };
          })();

          const minPeople = typeof rec.minPeople === "number" ? rec.minPeople : undefined;
          const maxPeople =
            typeof rec.maxPeople === "number"
              ? rec.maxPeople
              : typeof rec.capacity === "number"
              ? rec.capacity
              : undefined;

          const courseId =
            toString(rec._id) ||
            toString(rec.id) ||
            toString(rec.slug) ||
            `anon-${Math.random().toString(36).slice(2)}`;

          return {
            id: courseId,
            title: toString(rec.title) || toString(rec.name) || "Untitled class",
            subtitle: toString(rec.subtitle) || toString(rec.location) || toString(rec.venue) || undefined,
            price: toNumber(rec.price ?? rec.cost ?? 0, 0),
            summary: toString(rec.summary) || toString(rec.excerpt) || "",
            description: toString(rec.description) || toString(rec.details) || "",
            durationMinutes: toNumber(rec.durationMinutes ?? rec.duration ?? 0, 0),
            capacity: toNumber(rec.capacity ?? rec.maxCapacity ?? 0, 0),
            minPeople,
            maxPeople,
            instructor: typeof instructor === "string" ? { name: instructor } : instructor,
            image: toString(rec.image) || (Array.isArray(rec.images) ? toString((rec.images as unknown[])[0]) : toString(rec.photo) || undefined),
            featured: Boolean(rec.featured),
            sessions,
            thingsToNote: toStringArray(rec.thingsToNote || rec.notes || rec.note || rec.noteList),
            furtherInformation: toString(rec.furtherInformation || rec.additionalInfo) || "",
            location: toString(rec.location || rec.venue) || "",
            level: (toString(rec.level) as Course["level"]) || undefined,
          } as Course;
        });

        setCourses(mapped);
      } catch (err: unknown) {
        // narrow unknown to Error when possible
        if (err instanceof Error) {
          console.error("Fetch courses error", err);
          setError(err.message || "Failed to load classes from API.");
        } else {
          console.error("Fetch courses error", err);
          setError("Failed to load classes from API.");
        }
        setCourses([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCourses(debouncedQuery);
  }, [fetchCourses, debouncedQuery]);

  useEffect(() => {
    if (!selectedCourse) {
      setSelectedSessionId(null);
      setName("");
      setEmail("");
      setPhone("");
      setAttendees(1);
      setSubmitting(false);
      setConfirmation(null);
      setFormError(null);
      setIsFlipped(false);
    } else {
      // default to first upcoming session (skip expired)
      const firstFuture = selectedCourse.sessions.find((s) => !isSessionExpired(s));
      setSelectedSessionId(firstFuture && typeof firstFuture.id === "string" ? firstFuture.id : null);
      setIsFlipped(false);
    }
  }, [selectedCourse, isSessionExpired]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return courses;
    const out: Course[] = [];
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (
        c.title.toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q) ||
        (c.instructor?.name || "").toLowerCase().includes(q) ||
        (c.subtitle || "").toLowerCase().includes(q)
      ) {
        out.push(c);
      }
    }
    return out;
  }, [courses, debouncedQuery]);

  // mark opening modal as low priority to keep UI responsive
  const openCourse = useCallback((course: Course, trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? null;
    startTransition(() => {
      setSelectedCourse(course);
    });
  }, []);

  const closeModal = useCallback(() => {
    setSelectedCourse(null);
    setTimeout(() => triggerRef.current?.focus?.(), 10);
  }, []);

  function validateBooking(selectedCourseLocal: Course | null) {
    if (!selectedCourseLocal) return "No course selected.";
    if (!selectedSessionId) return "Please choose a session.";

    // ensure selected session is not expired
    const s = selectedCourseLocal.sessions.find((x) => x.id === selectedSessionId);
    if (!s) return "Selected session not found.";
    if (isSessionExpired(s)) return "Selected session has already passed. Please choose another session.";

    if (!name.trim()) return "Please enter your name.";
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (!phone.trim()) return "Please enter a contact phone number.";
    if (attendees < 1) return "Please choose at least 1 attendee.";
    if (attendees > (selectedCourseLocal.maxPeople ?? selectedCourseLocal.capacity))
      return `Maximum attendees for this course is ${selectedCourseLocal.maxPeople ?? selectedCourseLocal.capacity}.`;
    return null;
  }

  // UPDATED: persist booking via server API
  async function submitBooking() {
    const err = validateBooking(selectedCourse);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        courseId: selectedCourse!.id,
        sessionId: selectedSessionId,
        name,
        email,
        phone,
        attendees,
      };

      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          body && typeof body === "object"
            ? toString((body as Record<string, unknown>).message) || `Booking failed (${res.status})`
            : `Booking failed (${res.status})`;
        setFormError(message);
        return;
      }

      // successful booking — prefer server bookingRef
      const bookingRef =
        body && typeof body === "object" && typeof (body as Record<string, unknown>).bookingRef === "string"
          ? ((body as Record<string, unknown>).bookingRef as string)
          : `CG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      setConfirmation({ ref: bookingRef, courseId: selectedCourse!.id });

      // Refresh courses to pick up updated availability (server-side cleanup/capacity)
      await fetchCourses(debouncedQuery);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error("Booking error", e);
        setFormError(e.message || "Failed to place booking");
      } else {
        console.error("Booking error", e);
        setFormError("Failed to place booking");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const handleFlipToForm = useCallback(() => setIsFlipped(true), []);
  const handleFlipBack = useCallback(() => setIsFlipped(false), []);

  return (
    <>
      {/* Ensure buttons show pointer cursor */}
      <style jsx global>{`
        button { cursor: pointer; }
      `}</style>

      <div className="min-h-screen bg-gray-50">
        {/* Header / Hero */}
        <div className="relative overflow-hidden bg-black text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-28">
            <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm mb-6 sm:mb-8">
              <Coffee className="w-4 h-4 text-white" />
              <span className="uppercase text-xs tracking-widest font-bold text-white">Coffee Education</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black mb-4 sm:mb-6 text-white leading-tight">
              Learn with<br />
              <span className="text-white">Coffee Genius</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 max-w-2xl leading-relaxed">
              Master the art of coffee with expert-led, hands-on classes. Book your spot in minutes.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 sm:-mt-8 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-2">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search classes, instructors, or locations..."
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-transparent outline-none text-sm sm:text-base font-medium placeholder:text-gray-400 focus:ring-2 focus:ring-black/20 transition"
                aria-label="Search classes"
              />
            </div>
          </div>
        </div>

        {/* Courses grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-2xl h-80 sm:h-96 animate-pulse" />
                ))
              : filtered.length === 0
              ? (
                <div className="col-span-full p-8 bg-white rounded-2xl border border-gray-200 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                    <Search className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-lg font-bold">No classes found</p>
                  <p className="text-sm text-gray-600 mt-2">Try adjusting your search</p>
                </div>
              )
              : filtered.map((c) => (
                  <CourseCard key={c.id} course={c} onOpen={openCourse} />
                ))}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="rounded-2xl p-8 bg-gray-100 border border-gray-200 text-center">
            <h3 className="text-2xl font-bold mb-3">Need a custom session?</h3>
            <p className="text-neutral-700 mb-6 max-w-2xl mx-auto">
              Looking for specific dates or planning a private group event? Get in touch and we&apos;ll create a bespoke coffee experience just for you.
            </p>
            <Link
              href="/contact"
              className="inline-block px-8 py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>

      {/* Modal (shows after selection) */}
      {selectedCourse && (
        <Modal isOpen={true} onClose={closeModal} label={selectedCourse.title}>
          <div className="relative">
            {/* Hero (priority image only for modal to avoid loading many large images) */}
            <div className="relative h-64 sm:h-72 lg:h-80 xl:h-96 bg-black overflow-hidden">
              {selectedCourse.image ? (
                <>
                  <Image
                    src={resolveImageSrc(selectedCourse.image, { w: 2000, h: 1200 })}
                    alt={selectedCourse.title}
                    fill
                    sizes="100vw"
                    style={{ objectFit: "cover", willChange: "transform, opacity" }}
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <Coffee className="w-20 h-20 text-white/20" />
                </div>
              )}

              <button
                onClick={closeModal}
                className="absolute top-4 sm:top-6 right-4 sm:right-6 p-2.5 sm:p-3 rounded-full bg-white/95 hover:bg-white transition"
                aria-label="Close"
              >
                <X size={18} className="text-black" />
              </button>

              <div className="absolute left-4 sm:left-6 lg:left-8 bottom-6 sm:bottom-8 text-white max-w-2xl">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mb-1">{selectedCourse.title}</h2>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{selectedCourse.instructor.name}</span>
                  {selectedCourse.subtitle && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-white/60" />
                      <span className="text-white/90">{selectedCourse.subtitle}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="bg-black text-white px-4 sm:px-6 py-4 sm:py-5">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-white/80">Duration</div>
                    <div className="font-semibold">{Math.floor(selectedCourse.durationMinutes / 60)}h {selectedCourse.durationMinutes % 60}m</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-white/80">Sessions</div>
                    <div className="font-semibold">{selectedCourse.sessions.length}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-white/80">Capacity</div>
                    <div className="font-semibold">Max {selectedCourse.capacity}</div>
                  </div>
                </div>

                {selectedCourse.level && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/10">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-white/80">Level</div>
                      <div className="font-semibold capitalize">{selectedCourse.level}</div>
                    </div>
                  </div>
                )}

                <div className="ml-auto flex items-center gap-3 bg-white/10 px-4 py-2 rounded-full">
                  <Tag className="w-5 h-5" />
                  <div className="text-2xl font-black">{money(selectedCourse.price)}</div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-[1.6fr,1fr] gap-6 sm:gap-8">
              <div className="space-y-6">
                <section>
                  <h3 className="text-2xl font-black mb-4 flex items-center gap-3">
                    <Calendar className="w-5 h-5" />
                    Available Sessions
                  </h3>
                  <div className="space-y-3">
                    {selectedCourse.sessions.map((s) => {
                      const expired = isSessionExpired(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (expired) return;
                            setSelectedSessionId(typeof s.id === "string" ? s.id : null);
                          }}
                          className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                            expired
                              ? "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed"
                              : selectedSessionId === s.id
                              ? "bg-black text-white border-black"
                              : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                          aria-disabled={expired}
                          title={expired ? "This session has already passed" : undefined}
                        >
                          <div>
                            <div className={`font-semibold ${expired ? "line-through" : ""}`}>{formatDateLabel(s.start)}</div>
                            <div className={`text-sm ${expired ? "text-gray-400" : "text-gray-600"} mt-1`}>{formatTimeRange(s.start, s.end)}</div>
                          </div>

                          {expired ? (
                            <div className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">Expired</div>
                          ) : (
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <ChevronRight />
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {/* If no upcoming sessions, show message */}
                    {selectedCourse.sessions.every((s) => isSessionExpired(s)) && (
                      <div className="p-4 rounded-xl border border-gray-200 bg-yellow-50 text-sm text-yellow-800">
                        No upcoming sessions available for this class.
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-2xl font-black mb-3">About This Class</h3>
                  <p className="text-gray-700 leading-relaxed">{selectedCourse.description}</p>
                </section>

                <section className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                  <div className="grid sm:grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="text-xs font-bold text-gray-600 uppercase mb-1">Duration</div>
                      <div className="text-lg font-black">{Math.floor(selectedCourse.durationMinutes / 60)}h {selectedCourse.durationMinutes % 60}m</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-600 uppercase mb-1">Location</div>
                      <div className="text-lg font-semibold">{selectedCourse.location}</div>
                    </div>
                  </div>

                  {selectedCourse.thingsToNote && selectedCourse.thingsToNote.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-bold text-gray-900 uppercase mb-2">Important Notes</div>
                      <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                        {selectedCourse.thingsToNote.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}

                  {selectedCourse.furtherInformation && (
                    <div>
                      <div className="text-xs font-bold text-gray-900 uppercase mb-2">Further Information</div>
                      <p className="text-sm text-gray-700">{selectedCourse.furtherInformation}</p>
                    </div>
                  )}
                </section>
              </div>

              {/* Right: booking card */}
              <div className="h-fit lg:sticky lg:top-8">
                <div style={{ perspective: 1200 }} className="w-full">
                  <div
                    className="relative w-full transition-transform duration-700"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                      willChange: "transform",
                      minHeight: 420,
                    }}
                  >
                    {/* front */}
                    <div className="absolute inset-0 backface-hidden">
                      <div className="rounded-2xl border border-gray-200 p-6 bg-white shadow h-full flex flex-col">
                        <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 rounded-lg bg-black text-white"><CheckCircle /></div>
                          <div>
                            <div className="text-xs font-semibold text-gray-600 uppercase">Course Price</div>
                            <div className="text-3xl font-black">{money(selectedCourse.price)}</div>
                            <div className="text-sm text-gray-600 mt-1">per person</div>
                          </div>
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="text-sm"><div className="font-semibold">Duration</div>{Math.floor(selectedCourse.durationMinutes / 60)}h {selectedCourse.durationMinutes % 60}m</div>
                          <div className="text-sm"><div className="font-semibold">Instructor</div>{selectedCourse.instructor.name}</div>
                          <div className="text-sm"><div className="font-semibold">Capacity</div>Max {selectedCourse.capacity}</div>
                          {selectedCourse.level && <div className="text-sm"><div className="font-semibold">Level</div><span className="capitalize">{selectedCourse.level}</span></div>}
                        </div>

                        <div className="mt-6">
                          <button onClick={handleFlipToForm} className="w-full py-3 rounded-xl bg-black text-white font-bold">Reserve Your Spot</button>
                        </div>
                      </div>
                    </div>

                    {/* back */}
                    <div className="absolute inset-0" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
                      <div className="rounded-2xl border border-gray-200 p-6 bg-white shadow h-full flex flex-col overflow-y-auto">
                        {confirmation ? (
                          <div className="text-center py-8">
                            <div className="mx-auto w-20 h-20 rounded-full bg-black text-white flex items-center justify-center mb-4"><CheckCircle /></div>
                            <h4 className="text-xl font-bold mb-2">Booking Confirmed</h4>
                            <div className="font-mono text-lg font-bold">{confirmation.ref}</div>
                            <div className="mt-6"><button onClick={() => closeModal()} className="px-6 py-2 rounded border">Done</button></div>
                          </div>
                        ) : (
                          <>
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <h4 className="text-lg font-bold">Your details</h4>
                                <div className="text-sm text-gray-600">We&apos;ll contact you to confirm</div>
                              </div>
                              <button onClick={handleFlipBack} className="text-sm">Back</button>
                            </div>

                            <form onSubmit={(e) => { e.preventDefault(); submitBooking(); }} className="space-y-3 flex-1">
                              <div>
                                <label className="block text-xs font-semibold mb-1">Name</label>
                                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2" required />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2" required />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">Phone</label>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2" required />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">Attendees</label>
                                <select
                                  value={attendees}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAttendees(Number(e.target.value))}
                                  className="w-full border border-gray-200 rounded px-3 py-2"
                                >
                                  {Array.from({ length: Math.min(6, selectedCourse!.maxPeople ?? selectedCourse!.capacity) }, (_, i) => i + 1).map((n) => (
                                    <option value={n} key={n}>{n} {n === 1 ? "person" : "people"}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-semibold mb-1">Session</label>
                                <select
                                  value={selectedSessionId ?? ""}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSessionId(e.target.value || null)}
                                  className="w-full border border-gray-200 rounded px-3 py-2"
                                  required
                                >
                                  <option value="" disabled>Select a session...</option>
                                  {selectedCourse.sessions
                                    .filter((s) => !isSessionExpired(s)) // only upcoming sessions here
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {formatDateLabel(s.start)} — {formatTimeRange(s.start, s.end)}
                                      </option>
                                    ))}
                                </select>
                                {selectedCourse.sessions.every((s) => isSessionExpired(s)) && (
                                  <p className="text-xs text-red-600 mt-2">No upcoming sessions available for booking.</p>
                                )}
                              </div>

                              {formError && <div className="text-sm text-red-600">{formError}</div>}

                              <div className="mt-4 flex gap-2">
                                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded bg-black text-white">{submitting ? "Processing..." : "Confirm Booking"}</button>
                                <button type="button" onClick={handleFlipBack} className="py-2 px-3 rounded border">Cancel</button>
                              </div>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}