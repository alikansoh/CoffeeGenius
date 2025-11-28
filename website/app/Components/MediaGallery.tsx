"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Video,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Star,
  Play,
} from "lucide-react";

type ResolvedMediaItem = {
  type: "image" | "video";
  src: string;
  title: string;
  description: string;
  poster?: string;
};

type InputMediaItem = {
  type?: "image" | "video";
  src: string;
  title: string;
  description: string;
  poster?: string;
};

const COLORS = {
  primary: "#111827",
};

function inferTypeFromSrc(src: string): "image" | "video" | undefined {
  try {
    const path = new URL(src, "http://example.com").pathname;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";

    const videoExts = ["mp4", "webm", "mov", "ogg", "mkv"];
    const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp"];

    if (videoExts.includes(ext)) return "video";
    if (imageExts.includes(ext)) return "image";
  } catch {
    // ignore URL parsing errors
  }
  return undefined;
}

export default function GallerySlider() {
  const inputMedia: InputMediaItem[] = useMemo(
    () => [
      {
        src: "/gallery1.mp4",
        title: "Latte Art Mastery",
        description:
          "Watch our expert baristas create stunning latte art with precision and care.",
        // poster: "/gallery1-poster.jpg",
      },
      {
        src: "/gallery2.mp4",
        title: "Perfect Pour",
        description: "The art of pouring the perfect espresso shot, every single time.",
        // poster: "/gallery2-poster.jpg",
      },
      {
        src: "/gallery3.jpg",
        title: "Fresh Roasted Beans",
        description:
          "Carefully selected and roasted to perfection for the ultimate coffee experience.",
      },
      {
        src: "/gallery4.jpg",
        title: "Artisan Brewing",
        description: "State-of-the-art equipment meets traditional craftsmanship.",
      },
    ],
    []
  );

  const media: ResolvedMediaItem[] = useMemo(() => {
    return inputMedia.map((item) => {
      const resolvedType = item.type ?? inferTypeFromSrc(item.src);
      const type = (resolvedType ?? "image") as "image" | "video";
      const poster =
        type === "video"
          ? item.poster ?? item.src.replace(/\.\w+$/, ".jpg")
          : undefined;
      return {
        type,
        src: item.src,
        title: item.title,
        description: item.description,
        poster,
      };
    });
  }, [inputMedia]);

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  // thumbnail refs & state
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const [thumbCanScrollLeft, setThumbCanScrollLeft] = useState(false);
  const [thumbCanScrollRight, setThumbCanScrollRight] = useState(false);

  const prev = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setIndex((i) => (i - 1 + media.length) % media.length);
    setTimeout(() => setIsTransitioning(false), 700);
  }, [media.length, isTransitioning]);

  const next = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setIndex((i) => (i + 1) % media.length);
    setTimeout(() => setIsTransitioning(false), 700);
  }, [media.length, isTransitioning]);

  const goTo = (i: number) => {
    if (isTransitioning || i === index) return;
    setIsTransitioning(true);
    setIndex(Math.max(0, Math.min(media.length - 1, i)));
    setTimeout(() => setIsTransitioning(false), 700);
  };

  useEffect(() => {
    if (isPaused || isTransitioning) return;
    const id = setInterval(() => {
      setIsTransitioning(true);
      setIndex((i) => (i + 1) % media.length);
      setTimeout(() => setIsTransitioning(false), 700);
    }, 5000);
    return () => clearInterval(id);
  }, [isPaused, media.length, isTransitioning]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  useEffect(() => {
    media.forEach((m, i) => {
      if (m.type !== "video") return;
      const v = videoRefs.current[i];
      if (!v) return;

      if (i === index) {
        v.muted = true;
        v.loop = true;
        const playPromise = v.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      } else {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {}
      }
    });
  }, [index, media]);

  // touch/swipe
  const touchStartX = useRef<number | null>(null);
  const touchDelta = useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDelta.current = e.touches[0].clientX - touchStartX.current;
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(calc(-${index * (100 / media.length)}% + ${touchDelta.current}px))`;
    }
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (touchStartX.current == null) return;
    const delta = touchDelta.current;
    if (trackRef.current) trackRef.current.style.transform = "";
    if (Math.abs(delta) > 60) {
      if (delta > 0) prev();
      else next();
    }
    touchStartX.current = null;
    touchDelta.current = 0;
  };

  useEffect(() => {
    videoRefs.current.forEach((v) => {
      try {
        v?.pause();
      } catch {}
    });
  }, []);

  // Thumbnail utilities
  const updateThumbScrollState = useCallback(() => {
    const el = thumbsRef.current;
    if (!el) {
      setThumbCanScrollLeft((prev) => (prev ? false : prev));
      setThumbCanScrollRight((prev) => (prev ? false : prev));
      return;
    }
    const canLeft = el.scrollLeft > 2;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setThumbCanScrollLeft((prev) => (prev === canLeft ? prev : canLeft));
    setThumbCanScrollRight((prev) => (prev === canRight ? prev : canRight));
  }, []);

  const scrollThumbsBy = (direction: "left" | "right") => {
    const el = thumbsRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.75, 200);
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  useEffect(() => {
    let rafId: number | null = null;
    const schedule = (fn: () => void) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fn);
    };

    schedule(updateThumbScrollState);

    const el = thumbsRef.current;
    if (!el) {
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    const onScroll = () => schedule(updateThumbScrollState);
    const onResize = () => schedule(updateThumbScrollState);

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [media.length, updateThumbScrollState]);

  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;
    const thumbEl = el.querySelector<HTMLButtonElement>(`[data-thumb-index="${index}"]`);
    if (thumbEl) {
      const thumbRect = thumbEl.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      if (thumbRect.left < containerRect.left || thumbRect.right > containerRect.right) {
        const offset = thumbRect.left - containerRect.left - containerRect.width * 0.15;
        el.scrollBy({ left: offset, behavior: "smooth" });
      }
    }
  }, [index]);

  const currentItem = media[index];

  return (
    <div className="relative w-full bg-gray-50 py-8 px-4 md:py-12">
      {/* narrower container on large screens */}
      <div className="relative w-full max-w-3xl lg:max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-black" />
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 flex items-center gap-2">
                <Star size={14} />
                Gallery Highlights
              </p>
            </div>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
              style={{ color: COLORS.primary }}
            >
              Our Gallery
            </h2>

            {/* accent bar now black */}
            <div className="mb-3">
              <div className="h-1 w-20 rounded-full bg-black shadow-sm" />
            </div>

            <p className="text-neutral-500 max-w-md text-sm md:text-base leading-relaxed">
              A curated selection of images and short videos showcasing our craft and moments from the café.
            </p>
          </div>
        </div>

        {/* Slider */}
        <div
          className="relative select-none group"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            className="relative overflow-hidden rounded-xl shadow-2xl bg-black aspect-video lg:aspect-4/3"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            ref={trackRef}
          >
            <div
              className={`flex h-full transition-transform duration-700 ease-out ${isDragging ? "duration-0" : ""}`}
              style={{
                width: `${media.length * 100}%`,
                transform: `translateX(-${index * (100 / media.length)}%)`,
              }}
            >
              {media.map((m, i) => (
                <div
                  key={i}
                  className="relative shrink-0 h-full bg-black flex items-center justify-center"
                  style={{ width: `${100 / media.length}%` }}
                >
                  {m.type === "image" ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={m.src}
                        alt={m.title}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 768px, 896px"
                        priority={i === index}
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <video
                        ref={(el) => {
                          videoRefs.current[i] = el;
                        }}
                        src={m.src}
                        className="w-full h-full object-contain"
                        playsInline
                        muted
                        loop
                        poster={m.poster}
                      />
                      {/* center play badge on main slide only when NOT the active playing slide */}
                      {i !== index && (
                        <div className="absolute z-20 flex items-center justify-center">
                          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/12 backdrop-blur-sm border border-white/20 shadow-lg">
                            <Play className="w-7 h-7 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* small type badge (kept top-left) */}
                  <div className="absolute left-4 top-4 z-20">
                    <div className="inline-flex items-center gap-2 bg-black/40 text-white text-[11px] md:text-xs px-2 py-1 rounded-md">
                      {m.type === "video" ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                      <span>{m.type === "video" ? "Video" : "Image"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Prev/Next - always visible on small screens, hover-show on md+ */}
            <button
              aria-label="Previous slide"
              onClick={prev}
              disabled={isTransitioning}
              className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-30 w-12 h-12 md:w-12 md:h-12 rounded-full bg-white/95 backdrop-blur-sm shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" strokeWidth={2.5} />
            </button>
            <button
              aria-label="Next slide"
              onClick={next}
              disabled={isTransitioning}
              className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 w-12 h-12 md:w-12 md:h-12 rounded-full bg-white/95 backdrop-blur-sm shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-5 h-5 text-gray-800" strokeWidth={2.5} />
            </button>

            <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full bg-white transition-all duration-700 ease-out"
                style={{ width: `${((index + 1) / media.length) * 100}%` }}
              />
            </div>
          </div>

          {/* small title + description BELOW the media so it never covers the image/video */}
          <div className="mt-4 px-1 md:px-0">
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-1">
              {currentItem.title}
            </h3>
            <p
              className="text-neutral-500 max-w-xl text-xs md:text-sm leading-relaxed line-clamp-3"
              style={{ marginBottom: 0 }}
            >
              {currentItem.description}
            </p>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {media.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                disabled={isTransitioning}
                className={`transition-all duration-300 rounded-full ${
                  i === index
                    ? "w-10 h-2.5 bg-gray-800"
                    : "w-2.5 h-2.5 bg-gray-300 hover:bg-gray-500 hover:scale-125"
                } disabled:cursor-not-allowed`}
              />
            ))}
          </div>

          {/* Thumbnail slider - HORIZONTAL ONLY */}
          <div className="mt-4 relative">
            <button
              aria-label="Scroll thumbnails left"
              onClick={() => scrollThumbsBy("left")}
              disabled={!thumbCanScrollLeft}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center border border-gray-200 hover:scale-110 transition-transform disabled:opacity-50 md:flex"
            >
              <ChevronLeft className="w-4 h-4 text-gray-800" />
            </button>

            <div
              ref={thumbsRef}
              className="flex gap-3 overflow-x-auto overflow-y-hidden px-2 md:px-8"
              role="list"
              aria-label="Gallery thumbnails"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {media.map((m, i) => (
                <button
                  key={i}
                  data-thumb-index={i}
                  onClick={() => goTo(i)}
                  disabled={isTransitioning}
                  className={`relative shrink-0 rounded-lg transition-all duration-300 focus:outline-none ${
                    i === index
                      ? "ring-2 ring-gray-800 scale-105 shadow-md"
                      : "ring-1 ring-gray-300 opacity-70 hover:opacity-95 hover:ring-gray-500"
                  }`}
                  style={{ width: "110px", height: "74px" }}
                  aria-label={`Thumbnail ${i + 1} ${m.title}`}
                >
                  {m.type === "image" ? (
                    <Image
                      src={m.src}
                      alt={m.title}
                      fill
                      className="object-cover rounded-lg"
                      sizes="110px"
                      unoptimized
                    />
                  ) : (
                    <>
                      <video
                        src={m.src}
                        poster={m.poster}
                        className="object-cover w-full h-full rounded-lg"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      {/* center play icon for video thumbnails */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 shadow-md">
                          <Play className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </>
                  )}

                  {/* subtle dim on non-active thumbs */}
                  {i !== index && <div className="absolute inset-0 bg-black/20 rounded-lg" />}

                  <div className="absolute left-2 bottom-2 z-10 text-white text-xs px-1 py-0.5 rounded-md bg-black/40">
                    {m.title.length > 18 ? `${m.title.slice(0, 16)}…` : m.title}
                  </div>
                </button>
              ))}
            </div>

            <button
              aria-label="Scroll thumbnails right"
              onClick={() => scrollThumbsBy("right")}
              disabled={!thumbCanScrollRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center border border-gray-200 hover:scale-110 transition-transform disabled:opacity-50 md:flex"
            >
              <ChevronRight className="w-4 h-4 text-gray-800" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}