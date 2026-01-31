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
import { useEffect, useRef, useState } from "react";
import EspressoMachinesIcon from "../../public/EspressoMachinesIcon";
import CartDrawer from "./CartDrawer";
import useCart from "../store/CartStore";

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  black: "#000000",
};

const DEFAULT_OFFERS = [
  "☕ Free delivery on orders above £30 — Order now",
  "🥤 Buy 1 Get 1 Free on selected coffees!",
  "🎉 10% off your first order with code WELCOME10",
  "📦 Next-day delivery available for orders placed before 3 PM",
];

const logoSrc = "/logo.png";
const PLACEHOLDER_TEXT = "Search coffee, beans, equipment...";

interface SearchItem {
  id: string;
  collection: string;
  title: string;
  subtitle: string;
  url: string;
}

interface SearchGroup {
  collection: string;
  label: string;
  items: SearchItem[];
}

export default function Navbar() {
  const router = useRouter();
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw ?? "/");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Typing placeholder refs/timers (for search input animation)
  const typingIntervalRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const caretIntervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const caretVisibleRef = useRef(true);
  const currentTypedRef = useRef("");

  // Hydration guard for dynamic UI (cart badge)
  const [mounted, setMounted] = useState(false);

  // Cart hooks (Zustand)
  const openCart = useCart((s) => s.open);
  const totalCount = useCart((s) => s.getTotalItems());

  // Desktop search expanded
  const [searchOpen, setSearchOpen] = useState(false);

  // Scroll helpers
  const lastScrollY = useRef(0);
  const scrollTicking = useRef(false);

  // Offers (fetched from API). We keep a ref for the array to avoid recreating loops.
  // NOTE: start with empty array so we can show a "loading" state instead of immediately falling
  // back to DEFAULT_OFFERS. We'll set offersLoadedRef when the fetch completes (success or failure).
  const offersRef = useRef<string[]>([]);
  const offersLoadedRef = useRef(false);

  // Announcement DOM ref (we update this element directly to avoid frequent React renders)
  const announcementEl = useRef<HTMLSpanElement | null>(null);

  // Typing loop refs/timers
  const offerIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const offerTypingTimer = useRef<number | null>(null);
  const offerPauseTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTypingTimers();
      clearOfferTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prevent body scroll when mobile overlays open
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
      setTimeout(() => mobileInputRef.current?.focus(), 120);
      if (query === "") startLoopTyping();
    }
  }, [mobileSearchOpen, query]);

  useEffect(() => {
    if (mobileOpen && query === "") {
      startLoopTyping();
    }
  }, [mobileOpen, query]);

  // Start typing placeholder on mount for search inputs
  useEffect(() => {
    if (query === "") startLoopTyping();
    return () => clearTypingTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query !== "") {
      clearTypingTimers();
      setPlaceholderText("", false);
    } else {
      startLoopTyping();
      setSearchResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Search API on query change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setSearchResults(data.groups || []);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
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
    if (caretIntervalRef.current) {
      window.clearInterval(caretIntervalRef.current);
      caretIntervalRef.current = null;
    }
    if (query !== "") {
      setPlaceholderText("", false);
    }
  }

  function setPlaceholderText(text: string, useCaret = true) {
    currentTypedRef.current = text;
    const caret = useCaret && caretVisibleRef.current ? "|" : "";
    const val = text ? text + (useCaret ? caret : "") : "";
    const updateIfAllowed = (el: HTMLInputElement | null) => {
      if (!el) return;
      if (document.activeElement === el) {
        el.placeholder = "";
      } else {
        el.placeholder = val;
      }
    };
    updateIfAllowed(desktopInputRef.current);
    updateIfAllowed(mobileInputRef.current);
  }

  function startLoopTyping() {
    if (typeof window !== "undefined") {
      const prefersReduced =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        setPlaceholderText(PLACEHOLDER_TEXT, false);
        return;
      }
    }

    clearTypingTimers();

    const text = PLACEHOLDER_TEXT;
    const typingSpeed = 30;
    const pauseAfterFinish = 1400;
    let idx = 0;

    caretVisibleRef.current = true;
    caretIntervalRef.current = window.setInterval(() => {
      caretVisibleRef.current = !caretVisibleRef.current;
      if (currentTypedRef.current && query === "") {
        setPlaceholderText(currentTypedRef.current, true);
      }
    }, 500);

    function step() {
      if (!mountedRef.current || query !== "") return;
      idx += 1;
      const current = text.slice(0, idx);
      setPlaceholderText(current, true);
      if (idx < text.length) {
        typingIntervalRef.current = window.setTimeout(step, typingSpeed);
      } else {
        typingTimeoutRef.current = window.setTimeout(() => {
          if (!mountedRef.current || query !== "") return;
          setPlaceholderText("", false);
          idx = 0;
          typingTimeoutRef.current = window.setTimeout(() => {
            if (!mountedRef.current || query !== "") return;
            step();
          }, 300);
        }, pauseAfterFinish);
      }
    }

    setPlaceholderText("", false);
    step();
  }

  function getPlaceholderWithCaret() {
    if (query !== "") return "";
    return undefined as unknown as string;
  }

  function handleResultClick(url: string) {
    setQuery("");
    setSearchResults([]);
    setMobileOpen(false);
    setMobileSearchOpen(false);
    setSearchOpen(false);
    router.push(url);
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
        setQuery("");
        setSearchResults([]);
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

  // --- Fetch offers (reads DB via API) ---
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function fetchOffers() {
      try {
        const res = await fetch("/api/offers?active=true&sort=createdAt:desc", {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch offers: ${res.status}`);
        }
        const json = await res.json();
        interface Offer {
          text: string;
        }
        const data: Offer[] = json?.data ?? [];
        const texts = data.map((d) => String(d.text).trim()).filter(Boolean);
        if (mounted && texts.length > 0) {
          offersRef.current = texts;
        } else if (mounted) {
          // No offers returned — fall back to defaults
          offersRef.current = DEFAULT_OFFERS;
        }
      } catch (err) {
        // On any error, fall back to defaults
        offersRef.current = DEFAULT_OFFERS;
      } finally {
        // Mark that fetch completed and start the typing loop (or restart it)
        offersLoadedRef.current = true;
        // Start the offers loop once data (or fallback) is available.
        // startOffersTypingLoop has guards to avoid double-starting timers.
        try {
          startOffersTypingLoop();
        } catch (e) {
          // ignore; defensive
        }
      }
    }

    fetchOffers();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  // Offer timers helpers (direct DOM updates)
  function clearOfferTimers() {
    if (offerTypingTimer.current) {
      window.clearTimeout(offerTypingTimer.current);
      offerTypingTimer.current = null;
    }
    if (offerPauseTimer.current) {
      window.clearTimeout(offerPauseTimer.current);
      offerPauseTimer.current = null;
    }
  }

  function startOffersTypingLoop() {
    // Guard: don't start twice
    if (offerTypingTimer.current || offerPauseTimer.current) return;

    // If offers haven't loaded yet, show a loading placeholder and don't start typing
    if (!offersLoadedRef.current && offersRef.current.length === 0) {
      if (announcementEl.current) announcementEl.current.textContent = "Loading offers...";
      return;
    }

    if (typeof window !== "undefined") {
      const prefersReduced =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        if (announcementEl.current)
          announcementEl.current.textContent = offersRef.current[0] ?? DEFAULT_OFFERS[0];
        return;
      }
    }

    clearOfferTimers();
    offerIndexRef.current = 0;
    charIndexRef.current = 0;
    if (announcementEl.current) announcementEl.current.textContent = "";

    const typingSpeed = 40;
    const deletingSpeed = 25;
    const pauseAfterTyped = 2500;
    const pauseAfterDeleted = 300;

    function typeStep() {
      if (typeof document !== "undefined" && document.hidden) {
        offerTypingTimer.current = window.setTimeout(typeStep, 1000);
        return;
      }

      const idx = offerIndexRef.current % Math.max(1, offersRef.current.length);
      const line = offersRef.current[idx] ?? DEFAULT_OFFERS[0];
      const chIdx = charIndexRef.current;

      if (!announcementEl.current) return;

      if (chIdx < line.length) {
        charIndexRef.current = chIdx + 1;
        announcementEl.current.textContent = line.slice(0, charIndexRef.current);
        offerTypingTimer.current = window.setTimeout(typeStep, typingSpeed);
      } else {
        offerPauseTimer.current = window.setTimeout(() => {
          offerTypingTimer.current = window.setTimeout(deleteStep, deletingSpeed);
        }, pauseAfterTyped);
      }
    }

    function deleteStep() {
      if (typeof document !== "undefined" && document.hidden) {
        offerTypingTimer.current = window.setTimeout(deleteStep, 1000);
        return;
      }

      if (!announcementEl.current) return;

      const chIdx = charIndexRef.current;
      if (chIdx > 0) {
        charIndexRef.current = chIdx - 1;
        const idx = offerIndexRef.current % Math.max(1, offersRef.current.length);
        const line = offersRef.current[idx] ?? DEFAULT_OFFERS[0];
        announcementEl.current.textContent = line.slice(0, charIndexRef.current);
        offerTypingTimer.current = window.setTimeout(deleteStep, deletingSpeed);
      } else {
        offerPauseTimer.current = window.setTimeout(() => {
          offerIndexRef.current = (offerIndexRef.current + 1) % Math.max(1, offersRef.current.length);
          charIndexRef.current = 0;
          offerTypingTimer.current = window.setTimeout(typeStep, pauseAfterDeleted);
        }, 200);
      }
    }

    offerTypingTimer.current = window.setTimeout(typeStep, 300);
  }

  useEffect(() => {
    // Show a loading message immediately while offers are being fetched.
    if (announcementEl.current && (!offersLoadedRef.current || offersRef.current.length === 0)) {
      announcementEl.current.textContent = "Loading offers...";
    }

    // Also try to start the typing loop if offers were already loaded (rare case).
    const t = window.setTimeout(() => {
      if (offersLoadedRef.current) startOffersTypingLoop();
    }, 400);
    return () => {
      window.clearTimeout(t);
      clearOfferTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normalizePath(p: string) {
    if (!p) return "/";
    if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
    return p;
  }

  function isLinkActive(href: string, currentPath: string) {
    const nh = normalizePath(href);
    const cp = normalizePath(currentPath);
    if (nh === "/") return cp === "/";
    return cp === nh || cp.startsWith(nh + "/");
  }

  const hasResults = searchResults.length > 0;

  return (
    <>
      <style>{`
        @keyframes caretBlink {
          0% { opacity: 1; }
          50% { opacity: 0; }
          100% { opacity: 1; }
        }
        .announcement-caret {
          display: inline-block;
          width: 10px;
          margin-left: 4px;
          font-family: monospace;
          line-height: 1;
          animation: caretBlink 1s steps(1, end) infinite;
        }
      `}</style>

      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow" aria-label="Main navigation">
        {/* Announcement Bar */}
        <div
          className="text-center py-2 text-xs lg:font-medium text-white overflow-hidden"
          style={{ backgroundColor: COLORS.primary }}
          aria-live="polite"
        >
          <span className="inline-flex items-center justify-center">
            <span
              aria-hidden="true"
              ref={announcementEl}
              className="mr-1"
            />
            <span aria-hidden="true" className="announcement-caret">|</span>
            <span className="sr-only">{offersRef.current[offerIndexRef.current % Math.max(1, offersRef.current.length)]}</span>
          </span>
        </div>

        {/* MAIN NAV */}
        <div className="border-b border-gray-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* MOBILE / TABLET HEADER */}
            <div className="relative flex lg:hidden items-center justify-between w-full h-25">
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
                    <span className="block h-0.5 bg-black transform transition-all duration-300 origin-left w-6 group-hover:translate-x-1" />
                    <span className="block h-0.5 bg-black transition-all duration-300 w-5 group-hover:translate-x-0.5" />
                    <span className="block h-0.5 bg-black transform transition-all duration-300 origin-left w-4 group-hover:translate-x-0" />
                  </div>
                )}
              </button>

              <Link
                href="/"
                className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center"
                aria-label="Homepage"
              >
                <Image src={logoSrc} alt="Logo" width={96} height={96} className="object-contain" priority={false} />
              </Link>

              <div className="flex items-center gap-2">
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
                  <Search size={20} style={{ color: COLORS.black }} className="transition-transform duration-300 group-hover:scale-110" />
                </button>

                <button type="button" onClick={() => openCart()} aria-label="Open cart" className="relative flex items-center justify-center w-10 h-10">
                  <ShoppingCart size={24} style={{ color: COLORS.black }} />
                  {mounted && totalCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {totalCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* DESKTOP HEADER */}
            <div className="hidden lg:flex items-center justify-between h-30">
              <Link href="/" className="flex items-center" aria-label="Homepage">
                <Image src={logoSrc} alt="Logo" width={120} height={120} className="object-contain" priority={false} />
              </Link>

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

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => toggleDesktopSearch()}
                  aria-label="Toggle search"
                  aria-expanded={searchOpen}
                  className="relative flex items-center justify-center w-10 h-10"
                >
                  <Search size={20} style={{ color: COLORS.black }} />
                </button>

                <button type="button" onClick={() => openCart()} aria-label="Open cart" className="relative flex items-center justify-center w-10 h-10">
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

        {/* DESKTOP SEARCH ROW */}
        {searchOpen && (
          <div className="hidden lg:block border-b border-gray-200 bg-white transition-all duration-200">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-3">
              <div className="relative">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-4 py-3 shadow-sm">
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
                  {query && (
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
                  )}
                </div>

                {/* Desktop Search Results */}
                {query && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                    {isSearching ? (
                      <div className="p-4 text-center text-gray-500">Searching...</div>
                    ) : hasResults ? (
                      <div className="py-2">
                        {searchResults.map((group) => (
                          <div key={group.collection} className="mb-4 last:mb-0">
                            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {group.label}
                            </div>
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => handleResultClick(item.url)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150"
                              >
                                <div className="font-medium text-gray-900">{item.title}</div>
                                {item.subtitle && (
                                  <div className="text-sm text-gray-500 mt-1 line-clamp-1">{item.subtitle}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500">No results found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MOBILE SEARCH OVERLAY */}
        <div
          className={`fixed inset-0 z-50 lg:hidden bg-black/40 transition-opacity ${
            mobileSearchOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!mobileSearchOpen}
          onClick={() => setMobileSearchOpen(false)}
        >
          <div className="absolute left-0 right-0 top-0 p-4 max-h-screen overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 shadow">
                <Search size={18} className="text-gray-500" />
                <input
                  ref={mobileInputRef}
                  type="search"
                  name="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={getPlaceholderWithCaret()}
                  aria-label="Search"
                  // Prevent iOS zoom on focus by ensuring font-size >= 16px
                  style={{ fontSize: 16 }}
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
              </div>

              {/* Mobile Search Results */}
              {query && (
                <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[70vh] overflow-y-auto">
                  {isSearching ? (
                    <div className="p-4 text-center text-gray-500">Searching...</div>
                  ) : hasResults ? (
                    <div className="py-2">
                      {searchResults.map((group) => (
                        <div key={group.collection} className="mb-4 last:mb-0">
                          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {group.label}
                          </div>
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleResultClick(item.url)}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150"
                            >
                              <div className="font-medium text-gray-900">{item.title}</div>
                              {item.subtitle && (
                                <div className="text-sm text-gray-500 mt-1 line-clamp-2">{item.subtitle}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500">No results found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MOBILE / TABLET MENU */}
        <div
          className={`absolute left-0 right-0 top-full z-40 lg:hidden transform transition-all duration-200 bg-white shadow-lg ${
            mobileOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
          aria-hidden={!mobileOpen}
        >
          <div className="flex flex-col p-4 pb-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
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

            <div className="mb-4">
              <div className="relative">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-3 py-2">
                  <Search size={18} className="text-gray-500 mr-2" />
                  <input
                    type="search"
                    name="q"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={getPlaceholderWithCaret()}
                    aria-label="Search"
                    // Prevent iOS zoom on focus by ensuring font-size >= 16px
                    style={{ fontSize: 16 }}
                    className="bg-transparent placeholder-gray-400 text-sm w-full outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                      className="ml-2 text-gray-500 hover:text-gray-700"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Mobile Menu Search Results */}
                {query && (
                  <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
                    ) : hasResults ? (
                      <div className="py-2">
                        {searchResults.map((group) => (
                          <div key={group.collection} className="mb-3 last:mb-0">
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {group.label}
                            </div>
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => handleResultClick(item.url)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors duration-150"
                              >
                                <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                                {item.subtitle && (
                                  <div className="text-xs text-gray-500 mt-1 line-clamp-1">{item.subtitle}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500 text-sm">No results found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

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

        {/* Cart Drawer */}
        <CartDrawer />
      </nav>

      {/* Spacer to prevent content behind fixed header */}
      <div className="h-12 lg:h-12" aria-hidden="true" />
    </>
  );
}

/* Helpers */

function normalizePath(p: string) {
  if (!p) return "/";
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function isLinkActive(href: string, currentPath: string) {
  const nh = normalizePath(href);
  const cp = normalizePath(currentPath);
  if (nh === "/") return cp === "/";
  return cp === nh || cp.startsWith(nh + "/");
}