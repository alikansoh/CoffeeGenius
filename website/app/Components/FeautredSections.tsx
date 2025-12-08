"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { Coffee, GraduationCap, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

const EspressoMachinesIcon = dynamic(() => import("../../public/EspressoMachinesIcon"), {
  ssr: false,
});

type FeatureSection = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  image: string;
  ctaText: string;
  ctaLink: string;
  icon: React.ReactNode;
  imagePosition: "left" | "right";
};

const SECTIONS: FeatureSection[] = [
  {
    id: "coffee",
    title: "Exceptional Coffee",
    subtitle: "Sourced from the world's finest farms",
    description:
      "Every bean is carefully selected from sustainable farms across the globe. We work directly with farmers to ensure exceptional quality and fair practices, bringing you coffee that tells a story in every cup.",
    features: [
      "Direct trade partnerships",
      "Single-origin selections",
      "Freshly roasted to order",
      "Tasting notes included",
    ],
    image: "/coffee.jpg",
    ctaText: "Explore Our Coffee",
    ctaLink: "/coffee",
    icon: <Coffee className="w-5 h-5" />,
    imagePosition: "left",
  },
  {
    id: "machines",
    title: "Premium Machines",
    subtitle: "Professional-grade equipment for your home",
    description:
      "Transform your kitchen into a world-class café with our curated selection of espresso machines and brewing equipment. From beginner-friendly models to professional setups, we have everything you need.",
    features: [
      "Expert recommendations",
      "Installation support",
      "Warranty & maintenance",
      "Trade-in program available",
    ],
    image: "/machine.jpg",
    ctaText: "Shop Machines",
    ctaLink: "/machines",
    icon: <EspressoMachinesIcon className="w-5 h-5" />,
    imagePosition: "right",
  },
  {
    id: "classes",
    title: "Barista Classes",
    subtitle: "Master the art of coffee making",
    description:
      "Learn from award-winning baristas in our hands-on classes. Whether you're a beginner or looking to refine your skills, our expert-led sessions will elevate your coffee game to the next level.",
    features: [
      "Small group sessions",
      "Hands-on practice",
      "Certificate included",
      "Beginner to advanced levels",
    ],
    image: "/classes.jpg",
    ctaText: "Book a Class",
    ctaLink: "/classes",
    icon: <GraduationCap className="w-5 h-5" />,
    imagePosition: "left",
  },
];

function FeatureCard({
  section,
  index,
  isVisible,
  setRef,
}: {
  section: FeatureSection;
  index: number;
  isVisible: boolean;
  setRef: (id: string) => (el: HTMLElement | null) => void;
}) {
  const isImageLeft = section.imagePosition === "left";

  return (
    <div
      ref={setRef(section.id)}
      className={`relative mb-8 transition-all duration-700 transform will-change-transform
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}
      `}
      aria-labelledby={`${section.id}-title`}
      role="article"
      data-section-id={section.id}
    >
      <div
        // Group allows coordinated hover effects between image and content.
        className={`group flex flex-col md:flex-row items-center gap-6 bg-white border rounded-2xl p-5 md:p-7 lg:p-8
          ${!isImageLeft ? "md:flex-row-reverse" : ""}
          border-slate-200/80 shadow-sm md:shadow`}
      >
        {/* Image */}
        {/* Adjusted widths and heights for tablet (md) screens to be more prominent */}
        <div className="relative md:w-[48%] lg:w-[45%] w-full overflow-hidden rounded-xl md:rounded-2xl md:-mt-4">
          <div className="relative h-72 md:h-[460px] lg:h-[420px] w-full transition-transform duration-500 ease-out transform group-hover:scale-105">
            <Image
              src={section.image}
              alt={section.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 52vw, 45vw"
              priority={index === 0}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/6 to-transparent pointer-events-none" />
          </div>
        </div>

        {/* Content */}
        <div className="md:w-[52%] lg:w-[55%] w-full space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-xl text-slate-700 border border-slate-100">
              {section.icon}
            </div>
            <p className="text-slate-500 uppercase tracking-wider text-xs md:text-sm font-bold">
              {section.subtitle}
            </p>
          </div>

          <h3
            id={`${section.id}-title`}
            className="text-2xl md:text-3xl lg:text-4xl font-serif text-slate-900 leading-tight"
          >
            {section.title}
          </h3>

          <div className="flex items-center gap-2">
            <div className="h-0.5 w-12 bg-gradient-to-r from-slate-800 to-slate-300 rounded-full" />
            <div className="w-1 h-1 bg-slate-400 rounded-full" />
          </div>

          <p className="text-slate-600 text-base md:text-lg leading-relaxed">{section.description}</p>

          <div className="bg-slate-50 rounded-lg p-3 md:p-4 border border-slate-100">
            {/* Make features display in two columns on tablet for better use of space */}
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {section.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-slate-700">
                  <div className="p-1 bg-white rounded-full border border-emerald-100">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <span className="text-sm md:text-sm font-medium leading-relaxed">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <a
              href={section.ctaLink}
              className="inline-flex items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 bg-slate-900 text-white text-sm md:text-sm rounded-lg hover:bg-slate-800 transition-colors"
              aria-label={section.ctaText}
            >
              {section.ctaText}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeatureSections() {
  // memoize sections so they are stable across renders
  const sections = useMemo(() => SECTIONS, []);

  // store DOM refs by id
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedSet = useRef<WeakSet<HTMLElement>>(new WeakSet());

  // callback ref setter that also manages observer subscribe/unsubscribe
  const setRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      const prev = refs.current[id];
      // unobserve previous element if present
      if (prev && observerRef.current && observedSet.current.has(prev)) {
        observerRef.current.unobserve(prev);
        observedSet.current.delete(prev);
      }

      refs.current[id] = el ?? null;

      if (el && observerRef.current && !observedSet.current.has(el)) {
        observerRef.current.observe(el);
        observedSet.current.add(el);
      }
    },
    []
  );

  // visible ids for intersection observer state
  const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const updates: Record<string, boolean> = {};
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          const id = target.dataset.sectionId;
          if (!id) return;
          if (entry.isIntersecting) updates[id] = true;
        });
        if (Object.keys(updates).length) {
          setVisibleIds((prev) => ({ ...prev, ...updates }));
        }
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    // observe already-attached refs (callback refs may have run before effect)
    Object.values(refs.current).forEach((el) => {
      if (el && observerRef.current && !observedSet.current.has(el)) {
        observerRef.current.observe(el);
        observedSet.current.add(el);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedSet.current = new WeakSet();
    };
  }, []);

  return (
    <section className="py-10 md:py-14 px-4 md:px-6 bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 space-y-3">
          <div className="inline-block">
            <p className="text-slate-500 uppercase tracking-[0.2em] text-xs md:text-sm font-bold px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
              What We Offer
            </p>
          </div>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-slate-900 max-w-3xl mx-auto font-bold">
            Everything You Need for Perfect Coffee
          </h2>

          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse" />
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
            <div className="w-2 h-2 bg-slate-800 rounded-full" />
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse" />
          </div>

          <p className="text-slate-600 text-base md:text-lg max-w-2xl mx-auto leading-relaxed pt-2">
            From premium beans to professional equipment and expert training, we provide a complete coffee experience.
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((section, index) => (
            <div key={section.id} data-section-id={section.id}>
              <FeatureCard
                section={section}
                index={index}
                isVisible={!!visibleIds[section.id]}
                setRef={setRef}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}