"use client";
import Image from "next/image";
import { Coffee, GraduationCap, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import EspressoMachinesIcon from "../../public/EspressoMachinesIcon";

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

const sections: FeatureSection[] = [
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
    icon: <Coffee className="w-6 h-6" />,
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
    icon: <EspressoMachinesIcon className="w-6 h-6" />,
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
    icon: <GraduationCap className="w-6 h-6" />,
    imagePosition: "left",
  },
];

function FeatureCard({ section, index }: { section: FeatureSection; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, []);

  const isImageLeft = section.imagePosition === "left";

  return (
    <div
      ref={cardRef}
      className={`
        relative mb-8 transition-all duration-1000 transform
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}
      `}
    >
      <div
        className={`
          flex flex-col lg:flex-row items-center gap-8 lg:gap-10
          bg-white border border-slate-200 rounded-2xl p-8 lg:p-10
          hover:border-slate-300 hover:shadow-xl transition-all duration-500
          ${!isImageLeft ? 'lg:flex-row-reverse' : ''}
        `}
      >
        {/* Image Section */}
        <div className="relative lg:w-[45%] w-full">
          <div className="relative group overflow-hidden rounded-xl border-2 border-slate-100">
            <div className="relative h-[450px] w-full">
              <Image
                src={section.image}
                alt={section.title}
                fill
                className="object-cover transition-all duration-700 group-hover:scale-105"
                sizes="(max-width: 1024px) 100vw, 45vw"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          </div>
        </div>

        {/* Content Section */}
        <div className="lg:w-[55%] w-full space-y-5">
          {/* Icon & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl text-slate-700 border border-slate-200 transition-all duration-300 hover:shadow-md hover:scale-105">
              {section.icon}
            </div>
            <p className="text-slate-500 uppercase tracking-[0.15em] text-xs font-bold">
              {section.subtitle}
            </p>
          </div>
          
          {/* Title */}
          <h3 className="text-3xl lg:text-4xl font-serif text-slate-900 leading-tight font-bold">
            {section.title}
          </h3>
          
          {/* Decorative Divider */}
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-12 bg-gradient-to-r from-slate-800 to-slate-300 rounded-full"></div>
            <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
          </div>
          
          {/* Description */}
          <p className="text-slate-600 text-base leading-relaxed">
            {section.description}
          </p>
          
          {/* Features List */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <ul className="space-y-2.5">
              {section.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-slate-700 group/item">
                  <div className="p-1 bg-white rounded-full mt-0.5 border border-emerald-100 group-hover/item:border-emerald-200 group-hover/item:shadow-sm transition-all duration-300">
                    <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  </div>
                  <span className="text-sm font-medium leading-relaxed">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* CTA Button */}
          <div className="pt-2">
            <a
              href={section.ctaLink}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-1 group border-2 border-slate-900 hover:border-slate-800"
            >
              {section.ctaText}
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeatureSections() {
  return (
    <section className="py-3 px-4 bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-14 space-y-4">
          <div className="inline-block">
            <p className="text-slate-500 uppercase tracking-[0.2em] text-xs font-bold px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
              What We Offer
            </p>
          </div>
          <h2 className="text-4xl lg:text-5xl font-serif text-slate-900 leading-tight font-bold max-w-4xl mx-auto">
            Everything You Need for Perfect Coffee
          </h2>
          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse"></div>
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-slate-800 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse"></div>
          </div>
          <p className="text-slate-600 text-base max-w-2xl mx-auto leading-relaxed">
            From premium beans to professional equipment and expert training, we provide a complete coffee experience.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="space-y-8">
          {sections.map((section, index) => (
            <FeatureCard key={section.id} section={section} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}