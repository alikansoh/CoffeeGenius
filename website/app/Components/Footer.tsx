"use client"
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Twitter,
  Instagram,
  Facebook,
  Youtube,
  Mail,
  CreditCard,
  MapPin,
  Phone,
} from "lucide-react";

/**
 * Footer component designed to be more responsive and have improved
 * positioning behavior across breakpoints.
 *
 * Notes:
 * - For a sticky-bottom layout across the whole page, wrap your app root
 *   (e.g., <html><body>) content in a container with `min-h-screen flex flex-col`
 *   and place the footer as the last child. The footer already plays nicely
 *   with that pattern because it doesn't force fixed positioning.
 * - If you explicitly want the footer fixed to the viewport bottom, you can
 *   pass a prop (not implemented here) or replace the outermost footer class
 *   with `fixed bottom-0 left-0 right-0` — but be careful as it will overlay
 *   page content.
 *
 * Changes made to "enhance responsiveness and positioning":
 * - Improved grid breakpoints and column spans for predictable stacking.
 * - Stacked and tuned the newsletter form on small screens and inline on larger.
 * - Fixed minor bugs (typo in mapping, spacing around getFullYear).
 * - Added aria-live for subscription feedback and role/contentinfo for accessibility.
 * - Made icons & text scale better across breakpoints.
 */

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
};

export default function Footer() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    // Replace with your real subscription logic (API call)
    setSent(true);
    setTimeout(() => {
      setEmail("");
      setSent(false);
    }, 3000);
  }

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/coffee", label: "Coffee" },
    { href: "/equipment", label: "Equipment" },
    { href: "/classes", label: "Classes" },
    { href: "/wholesale", label: "Wholesale" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

  const legalLinks = [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/shipping", label: "Shipping and Returns" },
  ];

  return (
    <footer
      role="contentinfo"
      className="bg-white border-t border-gray-200 text-sm text-gray-700 w-full print:hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 md:py-12 lg:py-16">
        {/* Grid: 1 col on xs, 2 on sm, 3 on md, 4 on lg */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 md:gap-6 lg:gap-8">
          {/* Brand & Contact */}
          <div className="col-span-1 sm:col-span-2 md:col-span-1 lg:col-span-1 space-y-4">
            <Link href="/" aria-label="Homepage" className="inline-flex items-center">
              <Image
                src="/logo.png"
                alt="Coffee Genius logo"
                width={160}
                height={64}
                sizes="(max-width: 640px) 120px, (max-width: 1024px) 160px, 200px"
                className="object-contain w-28 sm:w-32 md:w-36 lg:w-40"
                priority={false}
              />
            </Link>
            <p className="text-xs sm:text-sm md:text-sm text-gray-600 max-w-xs leading-relaxed">
              Coffee Genius — small-batch roastery and equipment shop. Ethically sourced beans,
              expert classes, and curated gear for home baristas.
            </p>

            <div className="space-y-2">
              <div className="flex items-start sm:items-center gap-3 text-gray-600">
                <MapPin size={16} className="flex-shrink-0 mt-0.5 sm:mt-0" />
                <span className="text-xs sm:text-sm leading-snug">73 High St, Staines TW18 4PA</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone size={16} className="flex-shrink-0" />
                <a
                  href="tel:+447444724389"
                  className="text-xs sm:text-sm hover:underline"
                  aria-label="Call Coffee Genius"
                >
                  +44 7444 724389
                </a>
              </div>
              <div className="flex items-start sm:items-center gap-3 text-gray-600">
                <Mail size={16} className="flex-shrink-0 mt-0.5 sm:mt-0" />
                <a
                  href="mailto:hello@coffee-genius.example"
                  className="text-xs sm:text-sm hover:underline break-words"
                  aria-label="Email Coffee Genius"
                >
                  hello@coffee-genius.example
                </a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="col-span-1">
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Explore</h4>
            <ul className="space-y-2">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-xs sm:text-sm md:text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal / Help */}
          <div className="col-span-1">
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Help and Policy</h4>
            <ul className="space-y-2">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-xs sm:text-sm md:text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/faq"
                  className="text-xs sm:text-sm md:text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-xs sm:text-sm md:text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Contact support
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter + Social */}
          <div className="col-span-1 sm:col-span-2 md:col-span-1 lg:col-span-1">
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Join our newsletter</h4>
            <p className="text-xs sm:text-sm md:text-sm text-gray-600 mb-3 leading-relaxed">
              Subscribe for new roasts, exclusive discounts, and upcoming classes.
            </p>

            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="footer_email" className="sr-only">
                Email address
              </label>
              <input
                id="footer_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-xs sm:text-sm outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all"
                aria-label="Email address"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-md text-xs sm:text-sm font-semibold hover:bg-gray-800 active:opacity-90 transition-colors whitespace-nowrap"
                aria-label="Subscribe"
              >
                {sent ? "Thanks!" : "Subscribe"}
              </button>
            </form>

            {/* feedback for screen readers / users */}
            <p
              aria-live="polite"
              className="mt-2 text-xs text-green-600 min-h-[1.25rem]"
              role="status"
            >
              {sent ? "Thanks for subscribing!" : ""}
            </p>

            <div className="mt-6">
              <h5 className="font-medium text-gray-900 mb-3 text-xs sm:text-sm">We&apos;re social</h5>
              <div className="flex items-center gap-4 sm:gap-3">
                <a
                  href="https://twitter.com/"
                  aria-label="Twitter"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="https://instagram.com/"
                  aria-label="Instagram"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://facebook.com/"
                  aria-label="Facebook"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Facebook size={18} />
                </a>
                <a
                  href="https://youtube.com/"
                  aria-label="YouTube"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Youtube size={18} />
                </a>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 text-gray-600">
              <CreditCard size={18} />
              <span className="text-xs sm:text-sm">Secure payments</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 sm:mt-10 md:mt-12 border-t border-gray-100 pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500 order-2 sm:order-1">
            © {new Date().getFullYear()} Coffee Genius — All rights reserved.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 order-1 sm:order-2">
            <nav aria-label="Footer secondary" className="flex flex-wrap items-center gap-3 md:gap-4">
              <Link href="/sitemap.xml" className="text-xs text-gray-500 hover:underline transition-colors">
                Sitemap
              </Link>
              <span className="hidden sm:inline text-gray-300">•</span>
              <Link href="/careers" className="text-xs text-gray-500 hover:underline transition-colors">
                Careers
              </Link>
            </nav>

            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Designed for home baristas</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}