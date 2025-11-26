"use client";
import React, { useRef, useEffect } from "react";
import { ArrowRight, Truck, Clock, Package, Leaf } from "lucide-react";

export default function WholesaleHeroMedium() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotionRef.current =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    const tryPlay = async () => {
      if (!videoRef.current) return;
      if (prefersReducedMotionRef.current) {
        videoRef.current.pause();
        return;
      }
      try {
        await videoRef.current.play();
      } catch {
        // autoplay failed (browser policy) — silent fallback (video will just be poster)
      }
    };

    tryPlay();
  }, []);

  // Black accents for buttons, indicators, and focus rings
  const brownBg = "bg-black"; // primary button background -> black
  const brownText = "text-black"; // icon/text accents -> black
  const brownRing = "focus-visible:ring-black"; // focus ring color -> black

  return (
    <section
      aria-label="Wholesale hero — Discover wholesale & bulk orders"
      className="relative w-full overflow-hidden"
      tabIndex={0}
    >
      {/* Video background */}
      <div className="absolute inset-0 -z-10">
        <video
          ref={videoRef}
          className="w-full h-full object-cover object-center"
          src="/bg.mp4"
          poster="/images/wholesale-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />

        {/* Slightly stronger overlay on small screens for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/30 to-black/18 sm:from-black/45 sm:via-black/25 sm:to-black/12" />

        {/* Subtle decorative glows */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.04)_0%,transparent_55%)] opacity-40" />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.03)_0%,transparent_70%)] opacity-30" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 md:py-14 lg:py-20">
        <div
          className="
            overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-12 lg:gap-16
            min-h-[260px] sm:min-h-[320px] md:min-h-[480px] lg:min-h-[520px]
            px-5 sm:px-7 md:px-8 py-6 sm:py-8 md:py-12
            rounded-2xl
            bg-white/8  border border-white/8
            shadow-lg hover:shadow-2xl transition-all duration-300
            z-10
          "
        >
          {/* Text block */}
          <div className="flex-1 max-w-3xl text-white">
            <div className={`inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/10 border border-white/8 mb-3 sm:mb-4`}>
              <span className="w-2.5 h-2.5 rounded-full bg-black animate-pulse" />
              <p className="text-sm sm:text-sm uppercase tracking-[0.18em] text-white/95 font-semibold">
                Wholesale Solutions
              </p>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif text-white font-extrabold leading-tight tracking-tight drop-shadow-sm">
              Grow faster with confident, curated wholesale
            </h2>

            <p className="text-sm sm:text-base md:text-xl text-white/90 font-medium mt-3 sm:mt-3 drop-shadow-sm">
              Direct-trade beans, tailored pricing, and rapid fulfilment for cafes, retailers, and offices.
            </p>

            <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-white/80 max-w-2xl leading-relaxed drop-shadow-sm">
              Flexible minimums, quick samples, and dedicated account support — streamlined so you can scale without friction.
            </p>

            <div className="mt-5 sm:mt-6 flex flex-wrap gap-3 items-center">
              {/* Single primary CTA */}
              <a
                href="/wholesale"
                className={`group inline-flex items-center gap-2 px-5 py-3 sm:px-6 sm:py-4 rounded-lg ${brownBg} text-white text-base sm:text-lg font-semibold shadow-md hover:brightness-105 transition-all duration-200 focus:outline-none focus-visible:ring-2 ${brownRing} focus-visible:ring-offset-2 focus-visible:ring-offset-black/40`}
                aria-label="Explore wholesale offerings"
              >
                Work With Us
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>

          {/* Features block — now visible on small screens in a stacked layout for clarity */}
          <div className="hidden sm:block w-full sm:w-full md:w-96 text-white mt-4 md:mt-0">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-start gap-3 bg-white/4 border border-white/6 rounded-lg p-3 sm:p-4">
                <div className={`flex-none w-10 h-10 rounded-md bg-white/10 grid place-items-center ${brownText}`}>
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">Fast Delivery</p>
                  <p className="text-[0.78rem] sm:text-sm text-white/80">Reliable shipping and expedited fulfilment for time-sensitive orders.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/4 border border-white/6 rounded-lg p-3 sm:p-4">
                <div className={`flex-none w-10 h-10 rounded-md bg-white/10 grid place-items-center ${brownText}`}>
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">Flexible Minimums</p>
                  <p className="text-[0.78rem] sm:text-sm text-white/80">Order the quantity that fits your business — from sample sizes to pallet loads.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/4 border border-white/6 rounded-lg p-3 sm:p-4">
                <div className={`flex-none w-10 h-10 rounded-md bg-white/10 grid place-items-center ${brownText}`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">Quick Samples</p>
                  <p className="text-[0.78rem] sm:text-sm text-white/80">Fast-tracked sample requests so you can taste before you commit.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/4 border border-white/6 rounded-lg p-3 sm:p-4">
                <div className={`flex-none w-10 h-10 rounded-md bg-white/10 grid place-items-center ${brownText}`}>
                  <Leaf className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">Sustainably Sourced</p>
                  <p className="text-[0.78rem] sm:text-sm text-white/80">Direct relationships and transparent sourcing for consistent quality and ethics.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Intentionally left out play/mute controls */}
        </div>
      </div>
    </section>
  );
}