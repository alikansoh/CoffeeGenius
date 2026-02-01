"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Globe,
  Heart,
  CheckCircle,
  BarChart,
  MapPin,
  Star,
  Clock,
  Phone,
  ChevronDown,
  Coffee,
  Award,
  Users,
  Sparkles,
  ArrowRight,
  ShoppingCart,
} from "lucide-react";

interface Review {
  author_name: string;
  author_url?: string;
  language?: string;
  profile_photo_url?: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
}

interface GoogleReviewsResponse {
  reviews: Review[];
  rating: number;
  user_ratings_total: number;
}

/*
  ReviewAvatar
  - Uses a normal <img> element for external profile photos (avoids next/image domain config issues).
  - Falls back to a initials avatar when the image fails to load or isn't provided.
  - Keeps size flexible and accessible.
*/
function ReviewAvatar({ src, name, size = 48 }: { src?: string; name: string; size?: number }) {
  const [imgSrc, setImgSrc] = useState<string | null>(src || null);

  const initials = (name || "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sizeStyle = { width: size, height: size };

  if (!imgSrc) {
    return (
      <div
        style={sizeStyle}
        className="rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-amber-900 font-bold text-sm md:text-base flex-shrink-0 overflow-hidden border-2 border-amber-900/20"
        aria-hidden
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={name}
      style={sizeStyle}
      className="rounded-full object-cover flex-shrink-0 border-2 border-amber-900/20"
      onError={() => setImgSrc(null)}
    />
  );
}

function QuoteCarousel({ reviews }: { reviews: Review[] }) {
  const [index, setIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReducedMotion || !reviews || reviews.length === 0) return;
    const interval = 6000;
    const tick = () => {
      setIndex((i) => (i + 1) % reviews.length);
      rafRef.current = window.setTimeout(tick, interval) as number;
    };
    rafRef.current = window.setTimeout(tick, interval) as number;
    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current as number);
    };
  }, [reviews, prefersReducedMotion]);

  if (!reviews || reviews.length === 0) return null;

  const currentReview = reviews[index];

  return (
    <div className="relative max-w-2xl mx-auto mt-6 px-5 py-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-900/20 shadow-md">
      <div className="flex items-start gap-4 mb-4">
        <ReviewAvatar src={currentReview.profile_photo_url} name={currentReview.author_name} size={48} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-bold text-gray-900 text-sm md:text-base">{currentReview.author_name}</h4>
            <div className="flex" aria-hidden>
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 md:w-4 md:h-4 ${
                    i < currentReview.rating ? "text-amber-600 fill-amber-600" : "text-gray-300 fill-gray-300"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-sm md:text-base text-gray-800 italic leading-relaxed">
            &ldquo;{currentReview.text.length > 180 ? currentReview.text.slice(0, 180) + "..." : currentReview.text}&rdquo;
          </p>
        </div>
      </div>
      <div className="flex justify-center gap-1.5 mt-4">
        {reviews.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-8 bg-amber-900" : "w-1.5 bg-amber-900/30 hover:bg-amber-900/50"
            }`}
            aria-label={`View review ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function AboutPage() {
  const [reviewsData, setReviewsData] = useState<GoogleReviewsResponse | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/google-reviews")
      .then((res) => res.json())
      .then((data: GoogleReviewsResponse) => {
        setReviewsData(data);
        setLoadingReviews(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load reviews:", err);
        setLoadingReviews(false);
      });
  }, []);

  const VALUES = useMemo(
    () => [
      {
        id: "quality",
        title: "Quality First",
        desc: "We taste every roast & partner with producers who share our standards.",
        icon: CheckCircle,
        color: "amber",
      },
      {
        id: "sustainability",
        title: "Sustainable Sourcing",
        desc: "Direct trade, humane practices and traceable supply chains.",
        icon: Globe,
        color: "brown",
      },
      {
        id: "community",
        title: "People & Community",
        desc: "Training, events and partnerships that strengthen local coffee communities.",
        icon: Users,
        color: "orange",
      },
      {
        id: "care",
        title: "Service with Heart",
        desc: "We treat every order and student like a guest in our café.",
        icon: Heart,
        color: "rose",
      },
    ],
    []
  );

  const OPENING_HOURS = useMemo(
    () => [
      { days: "Monday – Friday", hours: "07:00 – 16:00" },
      { days: "Saturday", hours: "08:30 – 16:00" },
      { days: "Sunday", hours: "Closed" },
    ],
    []
  );

  const address = "173 High Street, Staines, TW18 4PA, United Kingdom";
  const mapsUrlFallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const mapsEmbedUrlAlt = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(!!mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (prefersReducedMotion) {
      vid.pause();
      return;
    }

    vid.muted = true;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
            const playPromise = vid.play();
            if (playPromise && typeof playPromise.then === "function") {
              playPromise.catch(() => {});
            }
          } else {
            vid.pause();
          }
        });
      },
      { threshold: [0.25] }
    );

    obs.observe(vid);

    return () => {
      obs.disconnect();
      try {
        vid.pause();
      } catch {}
    };
  }, [prefersReducedMotion]);

  const headline = "Coffee Genius";
  const shortDescription =
    "A cozy coffee haven in Staines. Artisanal drinks, crafted filter coffee and homemade treats — served with warmth and expertise.";

  return (
    <main className="bg-gradient-to-b from-gray-50 via-white to-gray-50 text-gray-900">
      {/* HERO: two-column layout with description + video */}
      <section className="pt-20 sm:pt-8 md:pt-16 lg:pt-20 pb-8 md:pb-16 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left: clean header + description + CTAs */}
            <div className="order-2 lg:order-1 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-900/20 rounded-full">
                <Coffee size={16} className="text-amber-900" />
                <span className="text-xs md:text-sm font-semibold tracking-wide uppercase text-amber-900">
                  Welcome to
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight tracking-tight">
                {headline}
              </h1>

              <p className="text-base md:text-lg lg:text-xl text-gray-700 leading-relaxed max-w-xl">
                {shortDescription}
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
                <Link
                  href="/equipment"
                  className="group inline-flex items-center gap-2 rounded-full px-6 md:px-8 py-3 md:py-4 text-sm md:text-base font-bold bg-gradient-to-r from-amber-900 to-amber-800 text-white shadow-lg hover:shadow-xl hover:from-amber-800 hover:to-amber-700 transition-all duration-300 transform hover:scale-105"
                >
                  <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
                  Shop Equipment
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  href="/coffee"
                  className="inline-flex items-center gap-2 rounded-full px-6 md:px-8 py-3 md:py-4 text-sm md:text-base font-bold border-2 border-gray-300 bg-white text-gray-900 shadow-sm hover:shadow-md hover:border-amber-900/30 transition-all duration-300 transform hover:scale-105"
                >
                  <Coffee className="w-4 h-4 md:w-5 md:h-5" />
                  Shop Coffee
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="tel:+447444724389"
                  className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-full text-xs md:text-sm font-semibold shadow-md hover:bg-gray-800 hover:shadow-lg transition-all duration-300"
                >
                  <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">+44 7444 724389</span>
                  <span className="sm:hidden">Call Now</span>
                </a>

                <a
                  href={mapsUrlFallback}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-full text-xs md:text-sm font-semibold border-2 border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-300"
                >
                  <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  Directions
                </a>

                {reviewsData && (
                  <div className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-amber-50 border border-amber-900/20 rounded-full text-xs md:text-sm font-semibold text-amber-900">
                    <Star className="w-3.5 h-3.5 md:w-4 md:h-4 fill-amber-600 text-amber-600" />
                    {reviewsData.rating.toFixed(1)} ({reviewsData.user_ratings_total} reviews)
                  </div>
                )}
              </div>

              {/* Reviews Carousel in Hero */}
              {!loadingReviews && reviewsData && reviewsData.reviews && reviewsData.reviews.length > 0 && (
                <QuoteCarousel reviews={reviewsData.reviews} />
              )}
            </div>

            {/* Right: video card with increased height for tablets */}
            <div className="order-1 lg:order-2">
              <div
                className="relative rounded-3xl overflow-hidden shadow-2xl bg-black ring-1 ring-gray-900/10"
                role="img"
                aria-label="Interior of Coffee Genius"
              >
                {!prefersReducedMotion ? (
                  <video
                    ref={videoRef}
                    className="w-full h-80 sm:h-[28rem] md:h-[36rem] lg:h-[38rem] xl:h-[44rem] object-cover block"
                    poster="/about-hero.jpg"
                    playsInline
                    muted
                    loop
                    autoPlay
                    preload="auto"
                    aria-hidden="true"
                  >
                    <source src="/about-hero.MP4" type="video/mp4" />
                    <img src="/about-hero.jpg" alt="Coffee Genius interior" className="w-full h-full object-cover" />
                  </video>
                ) : (
                  <div className="relative w-full h-80 sm:h-[28rem] md:h-[36rem] lg:h-[38rem] xl:h-[44rem]">
                    <Image
                      src="/about-hero.JPG"
                      alt="Coffee Genius interior"
                      fill
                      className="object-cover"
                      priority
                    />
                  </div>
                )}

                {/* Gradient overlay only */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SECTION WITH READ MORE */}
      <section className="py-12 md:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 md:mb-16">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles size={18} className="text-amber-900" />
              <p className="text-xs md:text-sm font-bold tracking-widest uppercase text-amber-900">
                Discover
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 mb-4 md:mb-6">
              About Coffee Genius
            </h2>
            <div className="h-1.5 w-20 md:w-24 rounded-full bg-gradient-to-r from-amber-900 to-amber-700 shadow-sm" />
          </div>

          <article className="bg-white rounded-3xl p-6 sm:p-8 md:p-12 lg:p-16 shadow-lg border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
            <div className="prose prose-base md:prose-lg prose-gray max-w-none">
              <p className="text-lg md:text-xl text-gray-600 leading-relaxed mb-6">
                Welcome to the delightful world of Coffee Genius, a hidden gem nestled at 173 High St, Staines, TW18 4PA, United Kingdom. This charming coffee shop offers a sanctuary for all coffee lovers and those seeking a cozy spot to unwind. With its inviting atmosphere and attentive staff, Coffee Genius has quickly become a local favorite.
              </p>

              <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                At Coffee Genius, the menu is a treasure trove of thoughtfully crafted beverages that cater to every palate. Their signature drinks, notably the &ldquo;Bananarama&rdquo; and &ldquo;Power Fit&rdquo;, invite you to savor unique flavors that delight the senses. For those who appreciate the classics, indulge in their rich &ldquo;Hot Chocolate&rdquo;, or opt for the aromatic &ldquo;Chai Latte&rdquo; and &ldquo;Matcha Latte&rdquo;.
              </p>

              {aboutExpanded && (
                <>
                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                    If you&apos;re after something special, the filtered crafted coffees like the &ldquo;V60&rdquo; and &ldquo;Chemex&rdquo; showcase the owner&apos;s passion for quality coffee and dedication to the craft.
                  </p>

                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                    Visitors consistently rave about their experiences, often highlighting the barista&apos;s enthusiasm and expertise. One customer noted the friendly atmosphere, observing that many patrons appeared to be regulars—a testament to the shop&apos;s strong connection with the community. The inviting space is equally conducive for those wanting to grab a drink on the go or sit down to enjoy a moment of tranquility.
                  </p>

                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                    Coffee aficionados recognize Coffee Genius for its exceptional quality, with many declaring it serves &ldquo;the best coffee I&apos;ve ever had.&rdquo; It&apos;s not just the brews that shine—delicious snacks like homemade flapjacks and banana bread perfectly complement the experience, adding to the café&apos;s warm, welcoming charm.
                  </p>

                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                    The praise for their matcha is particularly noteworthy. Customers declare it &ldquo;the best matcha I&apos;ve had,&rdquo; highlighting the café&apos;s commitment to using high-quality ingredients, expertly whisked for an authentic flavor profile. The friendly staff enhances an already wonderful atmosphere, making every visit feel like a reunion with good friends.
                  </p>

                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-6">
                    Each visit to Coffee Genius is greeted by a setting that radiates warmth and creativity. Whether indulging in a perfectly brewed cappuccino—its rich and velvety texture embodying the true essence of a superb coffee experience—or savoring a slice of their moist, flavorful homemade cake, every moment is a celebration of craftsmanship and care.
                  </p>
                </>
              )}

              <button
                onClick={() => setAboutExpanded(!aboutExpanded)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-900 to-amber-800 text-white rounded-full font-bold text-sm md:text-base shadow-lg hover:shadow-xl hover:from-amber-800 hover:to-amber-700 transition-all duration-300 transform hover:scale-105"
              >
                {aboutExpanded ? "Read Less" : "Read More"}
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${aboutExpanded ? "rotate-180" : ""}`} />
              </button>

              <div className="mt-8 p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-900/20">
                <p className="text-lg md:text-xl font-bold text-gray-900">
                  Coffee Genius is a must-visit destination for anyone in Staines or those passing through. With a blend of artisanal drinks, delightful snacks, and an atmosphere that feels like home, this coffee haven ensures you&apos;ll leave with a smile and a craving for more. Don&apos;t miss the chance to experience your new favorite coffee shop—call us at{" "}
                  <a href="tel:+447444724389" className="text-amber-900 hover:text-amber-800 transition-colors underline decoration-2 underline-offset-2">
                    +44 7444 724389
                  </a>{" "}
                  to arrange your visit!
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* VALUES */}
      <section className="py-12 md:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <div className="flex items-center gap-3 mb-4 justify-center">
              <Heart size={18} className="text-rose-500" />
              <p className="text-xs md:text-sm font-bold tracking-widest uppercase text-amber-900">
                Our Values
              </p>
            </div>
            <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 md:mb-6">What we stand for</h3>
            <div className="h-1.5 w-20 md:w-24 rounded-full bg-gradient-to-r from-amber-900 to-amber-700 shadow-sm mx-auto mb-4" />
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Core values that guide every decision — from seed selection to the customer experience.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {VALUES.map((v) => {
              const Icon = v.icon;
              const colorClasses = {
                amber: "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900",
                brown: "bg-gradient-to-br from-amber-900/10 to-amber-900/20 text-amber-900",
                orange: "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-900",
                rose: "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700",
              };

              return (
                <div
                  key={v.id}
                  className="relative group bg-white border-2 border-gray-200 rounded-3xl p-6 md:p-8 shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:border-amber-900/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className={`inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl ${colorClasses[v.color as keyof typeof colorClasses]} mb-4 md:mb-6 group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                      <Icon className="w-7 h-7 md:w-8 md:h-8" />
                    </div>
                    <h4 className="font-bold text-lg md:text-xl text-gray-900 mb-2 md:mb-3">{v.title}</h4>
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed">{v.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* APPROACH WITH IMAGE */}
      <section className="py-12 md:py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-3 mb-4">
                <BarChart size={18} className="text-amber-900" />
                <p className="text-xs md:text-sm font-bold tracking-widest uppercase text-amber-900">
                  Our Method
                </p>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-4 md:mb-6">
                Our approach
              </h2>
              <div className="h-1.5 w-20 md:w-24 rounded-full bg-gradient-to-r from-amber-900 to-amber-700 shadow-sm mb-6" />
              <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-8">
                We combine craftsmanship and hospitality. From carefully sourced beans to considered brewing, everything is done with attention to detail and a desire to delight.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                {[
                  { icon: Globe, title: "Traceable Sourcing", desc: "Direct relationships and careful selection." },
                  { icon: CheckCircle, title: "Artisanal Preparation", desc: "Baristas trained to serve with consistency and care." },
                  { icon: BarChart, title: "Community", desc: "A welcoming space where regulars and newcomers meet." },
                  { icon: Heart, title: "Care", desc: "Attention to every order, every time." },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 md:gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex-shrink-0 p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-900/20">
                      <item.icon className="w-5 h-5 md:w-6 md:h-6 text-amber-900" />
                    </div>
                    <div>
                      <div className="font-bold text-sm md:text-base text-gray-900 mb-1">{item.title}</div>
                      <div className="text-xs md:text-sm text-gray-600 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 lg:order-2 relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-gray-900/10 group">
              <Image
                src="/post1.jpg"
                alt="Our approach to coffee"
                width={1200}
                height={800}
                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* LOCATION WITH REAL MAP */}
      <section className="py-12 md:py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <div className="flex items-center gap-3 mb-4 justify-center">
              <MapPin size={18} className="text-amber-900" />
              <p className="text-xs md:text-sm font-bold tracking-widest uppercase text-amber-900">
                Location
              </p>
            </div>
            <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 md:mb-6">Find us</h3>
            <div className="h-1.5 w-20 md:w-24 rounded-full bg-gradient-to-r from-amber-900 to-amber-700 shadow-sm mx-auto mb-4" />
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Visit Coffee Genius in the heart of Staines — we&apos;d love to see you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
            {/* Address Card */}
            <div className="bg-white rounded-3xl border-2 border-gray-200 p-6 md:p-8 lg:p-10 shadow-lg hover:shadow-2xl transition-shadow">
              <h4 className="font-bold text-2xl md:text-3xl text-gray-900 mb-4 md:mb-6">Visit Us</h4>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-6 md:mb-8">{address}</p>

              <div className="flex flex-wrap gap-3 mb-8">
                <a
                  href="tel:+447444724389"
                  className="inline-flex items-center gap-2 px-5 md:px-6 py-3 md:py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-full font-bold text-sm md:text-base shadow-lg hover:shadow-xl hover:from-gray-800 hover:to-gray-700 transition-all transform hover:scale-105"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">Call +44 7444 724389</span>
                  <span className="sm:hidden">Call Now</span>
                </a>
                <a
                  href={mapsUrlFallback}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 md:px-6 py-3 md:py-4 border-2 border-gray-300 bg-white rounded-full font-bold text-sm md:text-base hover:bg-gray-50 hover:border-amber-900/30 transition-all transform hover:scale-105 shadow-sm hover:shadow-md"
                >
                  <MapPin className="w-4 h-4 md:w-5 md:h-5" />
                  Get Directions
                </a>
              </div>

              <div className="border-t-2 border-gray-200 pt-6 md:pt-8">
                <h5 className="font-bold text-lg md:text-xl text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-900" />
                  Opening Hours
                </h5>
                <ul className="space-y-3 md:space-y-4">
                  {OPENING_HOURS.map((slot, i) => (
                    <li key={i} className="flex justify-between items-center p-3 md:p-4 bg-gradient-to-r from-gray-50 to-transparent rounded-xl border border-gray-200">
                      <span className="font-semibold text-sm md:text-base text-gray-900">{slot.days}</span>
                      <span className={`text-sm md:text-base font-bold ${slot.hours === "Closed" ? "text-red-600" : "text-amber-900"}`}>
                        {slot.hours}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Google Maps Embed */}
            <div className="rounded-3xl overflow-hidden border-2 border-gray-200 shadow-2xl ring-1 ring-gray-900/5 h-full min-h-[400px] md:min-h-[500px]">
              <iframe
                src={mapsEmbedUrlAlt}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: "400px" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Coffee Genius Location Map"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-12 md:py-20 lg:py-24 bg-gradient-to-b from-gray-50 via-amber-50/30 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-white to-amber-50 rounded-3xl p-8 md:p-12 lg:p-16 shadow-2xl border-2 border-amber-900/20 overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-100/50 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-orange-100/50 to-transparent rounded-full blur-3xl" />
            
            <div className="relative text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-amber-900 to-amber-800 text-white mb-6 md:mb-8 shadow-xl">
                <Coffee className="w-8 h-8 md:w-10 md:h-10" />
              </div>
              
              <h3 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 md:mb-6">
                Visit Coffee Genius
              </h3>
              <div className="h-1.5 w-20 md:w-24 rounded-full bg-gradient-to-r from-amber-900 to-amber-700 shadow-sm mx-auto mb-6" />
              
              <p className="text-lg md:text-xl text-gray-700 font-semibold mb-2 md:mb-3">{address}</p>
              <p className="text-sm md:text-base text-gray-600 mb-8 md:mb-10 leading-relaxed">
                Open Monday–Friday 07:00–16:00 | Saturday 08:30–16:00 | Sunday Closed
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 md:mb-10">
                <a
                  href="tel:+447444724389"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 md:px-8 py-3 md:py-4 rounded-full font-bold text-base md:text-lg shadow-xl hover:shadow-2xl hover:from-gray-800 hover:to-gray-700 transition-all transform hover:scale-105"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5" />
                  Call +44 7444 724389
                </a>
                <Link
                  href="/coffee"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border-2 border-gray-300 bg-white px-6 md:px-8 py-3 md:py-4 rounded-full font-bold text-base md:text-lg hover:bg-gray-50 hover:border-amber-900/30 transition-all transform hover:scale-105 shadow-md hover:shadow-lg"
                >
                  <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
                  Shop Coffee beans
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-900" />
                  <span>173 High Street, Staines</span>
                </div>
                <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-gray-300" />
                {reviewsData && (
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 fill-amber-600 text-amber-600" />
                    <span className="font-semibold">{reviewsData.rating.toFixed(1)} Rating</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}