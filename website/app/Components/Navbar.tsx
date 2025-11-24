"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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
import { useEffect, useState, useRef } from "react";
import EspressoMachinesIcon from "../../public/EspressoMachinesIcon";
import CartDrawer from "./CartDrawer";
import useCart from "../store/CartStore";

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

const logoSrc = "/logo.png";

// placeholder text (non-layout animated - fade + blinking caret for best performance on iOS Safari)
const PLACEHOLDER_TEXT = "Search coffee, beans, equipment...";

export default function Navbar() {
  const router = useRouter();
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw ?? "/");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);

  // Hydration guard for dynamic UI (cart badge)
  const [mounted, setMounted] = useState(false);

  // Cart hooks (Zustand)
  const openCart = useCart((s) => s.open);
  const totalCount = useCart((s) => s.totalCount());

  // User-controlled expanded search (desktop)
  const [searchOpen, setSearchOpen] = useState(false);

  // scroll helpers
  const lastScrollY = useRef(0);
  const scrollTicking = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.body.style.overflow = mobileOpen || mobileSearchOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, mobileSearchOpen]);

  // Focus mobile search overlay input when it opens
  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileSearchOpen]);

  // Scroll listener: if user scrolls on large screens, close the expanded search immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isLargeScreen = () => window.innerWidth >= 1024;

    function handleScroll() {
      const currentY = window.scrollY || 0;

      if (scrollTicking.current) return;
      scrollTicking.current = true;

      window.requestAnimationFrame(() => {
        const delta = currentY - lastScrollY.current;

        // If search is open by user and there's any scroll movement, close it.
        if (searchOpen && Math.abs(delta) > 0) {
          setSearchOpen(false);
        }

        lastScrollY.current = currentY;
        scrollTicking.current = false;
      });
    }

    if (!isLargeScreen()) return;

    lastScrollY.current = window.scrollY || 0;
    window.addEventListener("scroll", handleScroll, { passive: true });

    function handleResize() {
      if (!isLargeScreen()) {
        setSearchOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [searchOpen]);

  // Toggle the desktop search open/closed. When opened, focus the input.
  function toggleDesktopSearch() {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          desktopInputRef.current?.focus();
        }, 50);
      }
      return next;
    });
  }

  // keyboard handlers (Escape closes, "/" opens)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
      if (
        e.key === "/" &&
        !searchOpen &&
        (document.activeElement?.tagName ?? "") !== "INPUT" &&
        (document.activeElement?.tagName ?? "") !== "TEXTAREA"
      ) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => desktopInputRef.current?.focus(), 50);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  function handleSearchSubmit(e?: React.FormEvent, closeMenu = false) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    if (closeMenu) setMobileOpen(false);
    setMobileSearchOpen(false);
    setSearchOpen(false);
  }

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
    <nav className=" sticky top-0 z-40 bg-white " aria-label="Main navigation">
      {/* Inline styles for the performant CSS placeholder (no layout animation) */}
      <style jsx>{`
        /* We avoid animating width (layout). Instead we animate opacity and use a blinking caret via a pseudo element.
           Animating opacity + transform (composited) is usually smooth on iOS Safari. */
        .search-wrapper {
          position: relative;
        }

        .animated-placeholder {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af; /* placeholder gray */
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
          display: inline-block;
          font-size: 0.875rem; /* match input text-sm */
          line-height: 1;
          opacity: 1;
          will-change: opacity, transform;
        }

        /* caret implemented as pseudo-element and animated only via opacity (composited) */
        .animated-placeholder::after {
          content: "";
          display: inline-block;
          width: 1px;
          height: 1em;
          margin-left: 6px;
          vertical-align: middle;
          background-color: rgba(156, 163, 175, 0.95);
          animation: blink-caret 1s steps(1, start) infinite;
          will-change: opacity, transform;
        }

        /* simple fade loop for the placeholder to draw attention without layout changes */
        .animated-placeholder {
          animation: placeholder-fade 3.5s ease-in-out infinite;
        }

        /* hide placeholder when input has value or is focused */
        .search-wrapper:focus-within .animated-placeholder,
        .search-wrapper.has-value .animated-placeholder {
          opacity: 0;
          transform: translateY(-50%) translateX(6px);
          transition: opacity 140ms ease-out, transform 140ms ease-out;
          animation: none;
        }

        @keyframes placeholder-fade {
          0% {
            opacity: 0;
            transform: translateY(-50%) translateX(2px);
          }
          10% {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
          85% {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-50%) translateX(2px);
          }
        }

        @keyframes blink-caret {
          0%,
          100% {
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
        }

        /* Respect prefers-reduced-motion */
        @media (prefers-reduced-motion: reduce) {
          .animated-placeholder,
          .animated-placeholder::after {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>

      {/* Top announcement bar */}
      <div
        className="text-center py-2 text-xs lg:font-medium text-white"
        style={{ backgroundColor: COLORS.primary }}
      >
        ☕ Free delivery on orders above £30 — Order now
      </div>

      {/* MAIN NAV */}
      <div className="border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* MOBILE / TABLET HEADER (visible up to lg) */}
          <div className="relative flex lg:hidden items-center justify-between w-full h-25">
            {/* Burger (left) */}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(!mobileOpen);
                setMobileSearchOpen(false);
              }}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="relative flex items-center justify-center w-10 h-10 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 z-50 group"
            >
              <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>

              {mobileOpen ? (
                <X size={26} color={COLORS.primary} />
              ) : (
                <div className="flex flex-col items-start justify-center w-6 h-6 gap-1.5">
                  <span
                    className={`block h-0.5 bg-black transform transition-all duration-300 ease-in-out origin-left w-6 group-hover:translate-x-1`}
                  />
                  <span
                    className={`block h-0.5 bg-black transition-all duration-300 ease-in-out w-5 group-hover:translate-x-0.5`}
                  />
                  <span
                    className={`block h-0.5 bg-black transform transition-all duration-300 ease-in-out origin-left w-4 group-hover:translate-x-0`}
                  />
                </div>
              )}
            </button>

            {/* Centered Logo (absolute center) - slightly bigger on mobile */}
            <Link
              href="/"
              className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center"
              aria-label="Homepage"
            >
              <Image
                src={logoSrc}
                alt="Logo"
                width={96}
                height={96}
                className="object-contain"
                priority={false}
              />
            </Link>

            <div className="flex items-center gap-2">
              {/* Search (opens a full-width mobile search input overlay) */}
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen(true);
                  setMobileOpen(false);
                }}
                aria-label="Open search"
                className="relative flex items-center justify-center w-10 h-10 group rounded-full transition-colors"
              >
                <span className="absolute inset-0 rounded-full bg-transparent group-hover:bg-gray-100 transition-colors duration-300 -z-10" />
                <Search
                  size={20}
                  style={{ color: COLORS.black }}
                  className="transition-transform duration-300 group-hover:scale-110"
                />
              </button>

              {/* Cart (opens drawer) */}
              <button
                type="button"
                onClick={() => openCart()}
                aria-label="Open cart"
                className="relative flex items-center justify-center w-10 h-10"
              >
                <ShoppingCart size={24} style={{ color: COLORS.black }} />
                {mounted && totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* DESKTOP HEADER (only visible at lg and above) */}
          <div className="hidden lg:flex items-center justify-between h-30">
            {/* Left: Logo */}
            <Link href="/" className="flex items-center" aria-label="Homepage">
              <Image
                src={logoSourceSafe(logoSrc)}
                alt="Logo"
                width={120}
                height={120}
                className="object-contain"
                priority={false}
              />
            </Link>

            {/* Center: Nav */}
            <nav className="flex items-center gap-1" aria-label="Primary">
              {navLinks.map((link) => {
                const active = isLinkActive(link.href, pathname);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-150 ${
                      active ? "bg-gray-100 font-semibold" : ""
                    }`}
                    style={{ color: COLORS.primary }}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right actions (search icon before cart on desktop) */}
            <div className="flex items-center gap-4">
              {/* Desktop search button (toggles the search section) */}
              <button
                type="button"
                onClick={() => toggleDesktopSearch()}
                aria-label="Toggle search"
                aria-expanded={searchOpen}
                className="relative flex items-center justify-center w-10 h-10"
              >
                <Search size={20} style={{ color: COLORS.black }} />
              </button>

              <button
                type="button"
                onClick={() => openCart()}
                aria-label="Open cart"
                className="relative flex items-center justify-center w-10 h-10"
              >
                <ShoppingCart size={24} style={{ color: COLORS.black }} />
                {mounted && totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH ROW */}
      {searchOpen && (
        <div className="hidden lg:flex justify-center border-b border-gray-200 bg-white transition-all duration-200">
          <div className="w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-3">
            <form
              onSubmit={(e) => handleSearchSubmit(e)}
              className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-4 py-3 shadow-sm"
              role="search"
              aria-label="Site search"
            >
              <Search size={18} className="text-gray-500 mr-3" />
              <div
                className={`search-wrapper flex items-center flex-1 ${query ? "has-value" : ""}`}
              >
                <input
                  ref={desktopInputRef}
                  type="search"
                  name="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search"
                  className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
                />
                {/* Animated placeholder overlay (fade + blinking caret only) */}
                <span
                  className="animated-placeholder"
                  aria-hidden="true"
                  onClick={() => desktopInputRef.current?.focus()}
                >
                  {PLACEHOLDER_TEXT}
                </span>
              </div>

              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    desktopInputRef.current?.focus();
                  }}
                  className="ml-3 text-gray-500 hover:text-gray-700"
                >
                  <X size={16} />
                </button>
              ) : null}
              <button
                type="submit"
                className="ml-3 bg-black text-white px-4 py-2 rounded-full font-semibold hover:opacity-95"
                aria-label="Search"
              >
                Search
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MOBILE SEARCH OVERLAY */}
      <div
        className={`fixed inset-0 z-50 lg:hidden bg-black/40  transition-opacity ${
          mobileSearchOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!mobileSearchOpen}
        onClick={() => setMobileSearchOpen(false)}
      >
        <div
          className="absolute left-0 right-0 top-0 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <form
            onSubmit={(e) => handleSearchSubmit(e)}
            className="mx-auto max-w-3xl flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 shadow"
            role="search"
            aria-label="Mobile search form"
          >
            <Search size={18} className="text-gray-500" />
            <div className={`search-wrapper flex items-center flex-1 ${query ? "has-value" : ""}`}>
              <input
                ref={mobileInputRef}
                type="search"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search"
                className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
              />
              <span
                className="animated-placeholder"
                aria-hidden="true"
                onClick={() => mobileInputRef.current?.focus()}
              >
                {PLACEHOLDER_TEXT}
              </span>
            </div>

            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  mobileInputRef.current?.focus();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Close search"
                onClick={() => setMobileSearchOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* MOBILE / TABLET MENU (anchored under the nav) */}
      <div
        className={`absolute left-0 right-0 top-full z-30 lg:hidden transform transition-all duration-200 bg-white shadow-lg ${
          mobileOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="flex flex-col p-4 pb-6 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Image src={logoSrc} alt="Logo" width={64} height={64} className="object-contain" />
              <div className="font-semibold" style={{ color: COLORS.primary }}>
                Coffee Genius
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Close menu"
            >
              <X size={24} color={COLORS.primary} aria-hidden={false} />
            </button>
          </div>

          {/* Search row inside mobile menu */}
          <form
            onSubmit={(e) => handleSearchSubmit(e, true)}
            className="flex items-center gap-2 w-full text-left py-3 px-2 rounded-lg font-medium transition-colors duration-150"
            style={{ color: COLORS.primary }}
            role="search"
            aria-label="Mobile menu search"
          >
            <div className="flex items-center flex-1 bg-gray-50 border border-gray-200 rounded-full px-3 py-2">
              <Search size={18} className="text-gray-500 mr-2" />
              <input
                ref={mobileInputRef}
                type="search"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={""} // placeholder handled by animated overlay
                aria-label="Search"
                className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
              />
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  mobileInputRef.current?.focus();
                }}
                className="ml-2 text-gray-500 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>

            <button
              type="submit"
              className="ml-2 bg-black text-white px-4 py-2 rounded-full font-semibold hover:opacity-95"
              aria-label="Search"
            >
              Search
            </button>
          </form>

          <div className="mt-2 space-y-1">
            {navLinks.map((link) => {
              const active = isLinkActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 w-full text-left py-3 px-4 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-150 ${
                    active ? "bg-gray-100 font-semibold" : ""
                  }`}
                  style={{ color: COLORS.primary }}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart Drawer (reads/writes Zustand store) */}
      <CartDrawer />
    </nav>
  );
}

/* Helpers */

function normalizePath(p: string) {
  // Remove trailing slash except when root "/"
  if (!p) return "/";
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function isLinkActive(href: string, currentPath: string) {
  const nh = normalizePath(href);
  const cp = normalizePath(currentPath);

  if (nh === "/") {
    return cp === "/";
  }

  // exact match or parent of a deeper route (so /coffee matches /coffee/espresso)
  return cp === nh || cp.startsWith(nh + "/");
}

/* Small helper to avoid Next/Image warnings in some environments */
function logoSourceSafe(src: string) {
  // Next/Image accepts string path; return original for now.
  return src;
}