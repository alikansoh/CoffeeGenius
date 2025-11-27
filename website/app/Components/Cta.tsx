"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import React from "react";

type CoffeeCTAProps = {
  href?: string;
  title?: string;
  description?: React.ReactNode;
  ctaText?: string;
  className?: string;
};

export default function CoffeeCTA({
  href = "/coffee",
  title = "Ready to Experience Our Coffee?",
  description = (
    <>
      Join hundreds of satisfied customers who&apos;ve discovered their perfect cup. Explore our premium selection of beans, machines, and barista classes.
    </>
  ),
  ctaText = "Discover Our Coffee",
  className = "",
}: CoffeeCTAProps) {
  return (
    <div className={`mt-12 bg-gradient-to-br from-slate-50 to-white border-2 border-slate-200 rounded-2xl p-8 shadow-lg ${className}`}>
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <h3 className="text-2xl lg:text-3xl font-serif text-slate-900 font-bold">{title}</h3>
        <p className="text-slate-600 leading-relaxed">{description}</p>
        <div className="pt-2">
          <Link
            href={href}
            className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 group border-2 border-slate-900 hover:border-slate-800"
            aria-label={ctaText}
          >
            {ctaText}
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}