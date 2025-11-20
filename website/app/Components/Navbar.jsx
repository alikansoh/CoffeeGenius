"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ShoppingCart,
  Coffee,
  BookOpen,
  Users,
  Info,
  Mail,
  Search,
  Home,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import EspressoMachinesIcon from "../../public/EspressoMachinesIcon";


const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

const logoSrc = "/logo.png";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartCount] = useState(3);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => (document.body.style.overflow = "");
  }, [mobileOpen]);

  const navLinks = [
    { href: "/", label: "Home", icon: <Home size={18} /> },
    { href: "/coffee", label: "Coffee", icon: <Coffee size={18} /> },

    {
      href: "/equipment",
      label: "Equipment",
      icon: <EspressoMachinesIcon width={18} height={18} />,
    },
    { href: "/classes", label: "Classes", icon: <BookOpen size={18} /> },
    { href: "/wholesale", label: "Wholesale", icon: <Users size={18} /> },
    { href: "/about", label: "About", icon: <Info size={18} /> },
    { href: "/contact", label: "Contact", icon: <Mail size={18} /> },
  ];

  return (
    <nav className="relative sticky top-0 z-40 bg-white shadow-sm" aria-label="Main navigation">
      {/* Top announcement bar */}
      <div
        className="text-center py-2  text-xs lg:font-medium text-white"
        style={{ backgroundColor: COLORS.primary }}
      >
        ☕ Free delivery on orders above £30 — Order now
      </div>

      {/* MAIN NAV */}
      <div className="border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* MOBILE / TABLET HEADER (visible up to lg) */}
          <div className="relative flex lg:hidden items-center justify-between w-full h-20">
            {/* Burger (left) */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="relative flex items-center justify-center w-10 h-10 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 z-50 group"
            >
              <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
              <div className="flex flex-col items-start justify-center w-6 h-6 gap-1.5">
                <span
                  className={`block h-0.5 bg-black transform transition-all duration-300 ease-in-out origin-left ${
                    mobileOpen ? "rotate-45 translate-y-2 w-6" : "w-6 group-hover:translate-x-1"
                  }`}
                />
                <span
                  className={`block h-0.5 bg-black transition-all duration-300 ease-in-out ${
                    mobileOpen ? "opacity-0 translate-x-4 w-5" : "w-5 group-hover:translate-x-0.5"
                  }`}
                />
                <span
                  className={`block h-0.5 bg-black transform transition-all duration-300 ease-in-out origin-left ${
                    mobileOpen ? "-rotate-45 -translate-y-2 w-6" : "w-4 group-hover:translate-x-0"
                  }`}
                />
              </div>
            </button>

            {/* Centered Logo (absolute center) */}
            <Link
              href="/"
              className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center"
              aria-label="Homepage"
            >
              <Image
                src={logoSrc}
                alt="Logo"
                width={80}
                height={80}
                className="object-contain"
                priority={false}
              />
            </Link>

            <div className="flex items-center gap-2">
              {/* Search (clickable) */}
              <Link
                href="/search"
                aria-label="Search"
                className="relative flex items-center justify-center w-10 h-10 group rounded-full transition-colors"
              >
                {/* background uses smooth color transition instead of scaling so it doesn't "flash" */}
                <span className="absolute inset-0 rounded-full bg-transparent group-hover:bg-gray-100 transition-colors duration-300 -z-10" />
                <Search size={20} style={{ color: COLORS.black }} className="transition-transform duration-300 group-hover:scale-110" />
              </Link>

              {/* Cart */}
              <Link
                href="/cart"
                className="relative flex items-center justify-center w-10 h-10"
                aria-label="View cart"
              >
                <ShoppingCart size={24} style={{ color: COLORS.black }} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* DESKTOP HEADER (only visible at lg and above) */}
          <div className="hidden lg:flex items-center justify-between h-20">
            {/* Left: Logo */}
            <Link href="/" className="flex items-center" aria-label="Homepage">
              <Image
                src={logoSrc}
                alt="Logo"
                width={80}
                height={80}
                className="object-contain"
                priority={false}
              />
            </Link>

            {/* Center: Nav */}
            <nav className="flex items-center gap-1" aria-label="Primary">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-150"
                  style={{ color: COLORS.primary }}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-4">
              <div className="hidden lg:block text-sm" style={{ color: COLORS.accent }}>
                Explore single-origin, beans & gear
              </div>

              {/* Search */}
              <Link
                href="/search"
                aria-label="Search"
                className="relative flex items-center justify-center w-10 h-10 group rounded-full transition-colors"
              >
                <span className="absolute inset-0 rounded-full bg-transparent group-hover:bg-gray-100 transition-colors duration-300 -z-10" />
                <Search size={20} style={{ color: COLORS.black }} className="transition-transform duration-300 group-hover:scale-110" />
              </Link>

              <Link
                href="/cart"
                className="relative flex items-center justify-center w-10 h-10"
                aria-label="View cart"
              >
                <ShoppingCart size={24} style={{ color: COLORS.black }} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE / TABLET MENU (anchored under the nav, no weird hard-coded top) */}
      <div
        className={`absolute left-0 right-0 top-full z-30 lg:hidden transform transition-all duration-200 bg-white shadow-lg ${
          mobileOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="flex flex-col p-4 pb-6 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Image src={logoSrc} alt="Logo" width={48} height={48} className="object-contain" />
              <div className="font-semibold" style={{ color: COLORS.primary }}>
                Coffee Store
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Close menu"
            >
              {/* Replaced the text "×" with a proper SVG icon (lucide-react X) so it's crisp and accessible */}
              <X size={20} color={COLORS.primary} aria-hidden={false} />
            </button>
          </div>

          {/* Search row inside mobile menu for quick access */}
          <Link
            href="/search"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 w-full text-left py-3 px-4 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-150"
            style={{ color: COLORS.primary }}
            aria-label="Search"
          >
            <Search size={18} />
            <span>Search</span>
          </Link>

          <div className="mt-2 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 w-full text-left py-3 px-4 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-150"
                style={{ color: COLORS.primary }}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ))}
          </div>

          <div className="mt-4">
            <Link
              href="/contact"
              onClick={() => setMobileOpen(false)}
              className="block text-center py-3 rounded-lg border border-black font-semibold hover:bg-black hover:text-white transition-colors duration-150"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}