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

// typing placeholder text (you can add more phrases to rotate)
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

  // Typing animation state
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [showCaret, setShowCaret] = useState(true);

  // Refs to manage timers so we can clear them when user types or component unmounts
  const typingIntervalRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Hydration guard for dynamic UI (cart badge)
  const [mounted, setMounted] = useState(false);

  // Cart hooks (Zustand)
  const openCart = useCart((s) => s.open);
  const totalCount = useCart((s) => s.totalCount());

  useEffect(() => {
    // mark component as mounted on client so we don't render client-only badges during SSR
    setMounted(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTypingTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // restart typing loop when overlay opens (only if user hasn't typed)
      if (query === "") startLoopTyping();
    }
  }, [mobileSearchOpen, query]);

  // restart typing when mobile menu opens (so inline mobile search types)
  useEffect(() => {
    if (mobileOpen && query === "") {
      startLoopTyping();
    }
  }, [mobileOpen, query]);

  // Start typing on mount (infinite loop) unless user typed
  useEffect(() => {
    if (query === "") startLoopTyping();

    // caret blink
    const caretInterval = window.setInterval(() => {
      setShowCaret((s) => !s);
    }, 500);
    return () => window.clearInterval(caretInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user starts typing (query becomes non-empty) stop the animation immediately
  useEffect(() => {
    if (query !== "") {
      clearTypingTimers();
      setTypedPlaceholder(""); // remove animated placeholder while user types
    } else {
      // restart the loop if query was cleared
      startLoopTyping();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function clearTypingTimers() {
    if (typingIntervalRef.current) {
      window.clearTimeout(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }

  // Typing animation implementation (infinite loop unless user types)
  function startLoopTyping() {
    // Respect prefers-reduced-motion — don't animate if user prefers reduced motion
    if (typeof window !== "undefined") {
      const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        setTypedPlaceholder(PLACEHOLDER_TEXT);
        return;
      }
    }

    clearTypingTimers();

    const text = PLACEHOLDER_TEXT;
    const typingSpeed = 30; // ms per character
    const pauseAfterFinish = 1400; // ms to wait after full text before clearing and restarting
    let idx = 0;

    function step() {
      // stop if component unmounted or user started typing
      if (!mountedRef.current || query !== "") return;

      idx += 1;
      setTypedPlaceholder(text.slice(0, idx));

      if (idx < text.length) {
        typingIntervalRef.current = window.setTimeout(step, typingSpeed);
      } else {
        // finished typing, wait then clear and restart
        typingTimeoutRef.current = window.setTimeout(() => {
          if (!mountedRef.current || query !== "") return;
          setTypedPlaceholder("");
          idx = 0;
          // short pause before typing again
          typingTimeoutRef.current = window.setTimeout(() => {
            if (!mountedRef.current || query !== "") return;
            step();
          }, 300);
        }, pauseAfterFinish);
      }
    }

    // start the loop
    step();
  }

  function getPlaceholderWithCaret() {
    // When user has typed, we don't show placeholder; when animation is running show caret
    if (query !== "") return "";
    return typedPlaceholder + (showCaret && typedPlaceholder.length < PLACEHOLDER_TEXT.length ? "|" : "");
  }

  function handleSearchSubmit(e?: React.FormEvent, closeMenu = false) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    if (closeMenu) setMobileOpen(false);
    setMobileSearchOpen(false);
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
    <nav className="relative sticky top-0 z-40 bg-white shadow-sm" aria-label="Main navigation">
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
                src={logoSrc}
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

            {/* Right actions (only cart on desktop; search moved to its own row below) */}
            <div className="flex items-center gap-4">
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

      {/* SEARCH ROW (separate line below main nav on large screens) */}
      <div className="hidden lg:flex justify-center border-b border-gray-200 bg-white">
        <div className="w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-3">
          <form
            onSubmit={(e) => handleSearchSubmit(e)}
            className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-4 py-3 shadow-sm"
            role="search"
            aria-label="Site search"
          >
            <Search size={18} className="text-gray-500 mr-3" />
            <input
              ref={desktopInputRef}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={getPlaceholderWithCaret()}
              aria-label="Search"
              className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
            />
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

      {/* MOBILE SEARCH OVERLAY */}
      <div
        className={`fixed inset-0 z-50 lg:hidden bg-black/40 backdrop-blur-sm transition-opacity ${
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
            <input
              ref={mobileInputRef}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={getPlaceholderWithCaret()}
              aria-label="Search"
              className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
            />
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
                placeholder={getPlaceholderWithCaret()}
                aria-label="Search"
                className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
              />
              {query && (
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
              )}
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