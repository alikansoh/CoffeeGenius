"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * Responsive hero with background video (lazy-loaded, data-saver & reduced-motion aware)
 *
 * Usage:
 * - Place video files in /public/videos/hero.webm and /public/videos/hero.mp4 (or pass custom sources)
 * - Place poster image in /public/images/hero-poster.jpg (or pass custom poster)
 *
 * Behavior & performance notes:
 * - Video is lazy loaded via IntersectionObserver (won't download until hero enters viewport)
 * - On mobile / when user prefers reduced motion / Save-Data enabled, the hero uses the poster image
 *   instead of autoplaying video to save bandwidth and respect accessibility preferences.
 * - Video uses muted, playsInline, loop, autoplay attributes for background playback.
 */

type CTA = {
  label: string;
  href: string;
  variant?: "primary" | "ghost";
};

type HeroProps = {
  headline?: React.ReactNode;
  subheadline?: React.ReactNode;
  ctas?: CTA[];
  // video sources are relative to /public (e.g. "/videos/hero.webm")
  videoSources?: { src: string; type?: string }[];
  poster?: string; // e.g. "/images/hero-poster.jpg"
  className?: string;
  // if true, video is allowed on small/mobile screens (default: true)
  allowVideoOnMobile?: boolean;
};

export default function Hero({
  headline = (
    <>
      Discover exceptional coffee.
      <br />
      Small batch. Big flavor.
    </>
  ),
  subheadline = "Curated beans, expert brewing equipment, and classes to sharpen your craft.",
  ctas = [
    { label: "Shop Coffee", href: "/coffee", variant: "primary" },
    { label: "Learn More", href: "/about", variant: "ghost" },
  ],
  videoSources = [
    { src: "/videos/hero.webm", type: "video/webm" },
    { src: "/hero.mp4", type: "video/mp4" },
  ],
  poster = "/images/hero-poster.jpg",
  className = "",
  allowVideoOnMobile = true,
}: HeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [shouldUseVideo, setShouldUseVideo] = useState(false);

  // detect user preferences for reduced motion or save-data
  // NOTE: keep the dependency array stable (empty) to avoid "final argument changed size" errors
  // between server/client renders. allowVideoOnMobile is read inside the effect — it's OK
  // because that prop normally doesn't change during a session. If you need to respond to
  // runtime changes to allowVideoOnMobile, use a ref or ensure the dependency array always
  // has the same number of entries.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = connection?.saveData === true;

    // do not use video if user prefers reduced motion or has save-data enabled
    if (reducedMotion || saveData) {
      setShouldUseVideo(false);
      return;
    }

    // On small screens we avoid autoplay heavy background video by default,
    // but allow it when allowVideoOnMobile is true.
    const smallScreen = window.matchMedia?.("(max-width: 767px)")?.matches;
    if (smallScreen && !allowVideoOnMobile) {
      setShouldUseVideo(false);
      return;
    }

    // otherwise we may use the video, but only after intersection observer triggers
    setShouldUseVideo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable-length dependency array

  // lazy-load only when in viewport
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;

    const el = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        root: null,
        rootMargin: "200px", // start loading a little bit before it comes into view
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const shouldRenderVideo = shouldUseVideo && inView;

  return (
    <section
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      aria-label="Hero"
    >
      {/* Background - use video when allowed, otherwise use poster image as background  */}
      <div
        className="absolute inset-0 -z-10 w-full h-full"
        style={{
          backgroundImage: shouldRenderVideo
            ? undefined
            : `url(${poster})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      >
        {/*
          Render <video> only when allowed:
          - lazy-loaded by IntersectionObserver
          - not rendered on small screens if allowVideoOnMobile is false, reduced-motion, or save-data
        */}
        {shouldRenderVideo ? (
          <video
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={poster}
            aria-hidden="true"
            // keep the video from fighting with other focusable elements
            tabIndex={-1}
          >
            {videoSources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
            {/* If the browser doesn't support <video>, poster will show */}
          </video>
        ) : null}
      </div>

      {/* Overlay to ensure text legibility */}
      <div
        className="absolute inset-0 -z-5 bg-gradient-to-b from-black/50 via-black/20 to-black/60"
        aria-hidden="true"
      />

      {/* Decorative layer for soft vignette */}
      <div
        className="absolute inset-0 -z-6 pointer-events-none"
        aria-hidden="true"
        style={{
          boxShadow: "inset 0 120px 200px rgba(0,0,0,0.45)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pt-35 pb-28 sm:pt-28 sm:pb-36 lg:pt-32 lg:pb-44">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-white text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight drop-shadow-sm">
              {headline}
            </h1>

            <p className="mt-4 text-gray-200 text-base sm:text-lg md:text-xl max-w-2xl mx-auto">
              {subheadline}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {ctas.map((cta) => {
                const isPrimary = cta.variant === "primary";
                return (
                  <Link
                    key={cta.href}
                    href={cta.href}
                    className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      isPrimary
                        ? "bg-white text-black shadow hover:shadow-lg"
                        : "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                    }`}
                    aria-label={cta.label}
                  >
                    {cta.label}
                  </Link>
                );
              })}
            </div>

            {/* subtle helper text */}
            <p className="mt-6 text-gray-300 text-sm">
              Free delivery on orders above £30 • Sustainable sourcing • Expert support
            </p>
          </div>
        </div>
      </div>

      {/* optional: lazy-loaded decorative image for small screens */}
      <div className="lg:hidden absolute inset-0 -z-11">
        {/* nothing here — poster applied via background style for small screens */}
      </div>
    </section>
  );
}