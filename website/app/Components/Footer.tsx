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
 * Footer component designed to visually and functionally complement the Navbar
 * you shared. Responsive, accessible, and built with Tailwind classes to match
 * the same design language (neutral palette, generous spacing, clear hierarchy).
 *
 * Usage: import Footer from "components/Footer"; and render inside your layout
 * (e.g., app/layout.tsx or pages/_app.tsx) right before the closing </body>.
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
    <footer className="bg-white border-t border-gray-200 text-sm text-gray-700">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Contact */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center" aria-label="Homepage">
              <Image src="/logo.png" alt="Logo" width={120} height={120} className="object-contain" />
            </Link>
            <p className="text-xs text-gray-600 max-w-xs">
              Coffee Genius — small-batch roastery and equipment shop. Ethically sourced beans, expert
              classes, and curated gear for home baristas.
            </p>

            <div className="flex items-center gap-3 text-gray-600">
              <MapPin size={16} />
              <span className="text-xs">73 High St, Staines TW18 4PA</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Phone size={16} />
              <a href="tel:+447444 724389" className="text-xs hover:underline">
                +44 7444 724389
              </a>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Mail size={16} />
              <a href="mailto:hello@coffee-genius.example" className="text-xs hover:underline">
                hello@coffee-genius.example
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Explore</h4>
            <ul className="space-y-2">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-gray-600 hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal / Help */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Help and Policy</h4>
            <ul className="space-y-2">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-gray-600 hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/faq" className="text-gray-600 hover:text-gray-900">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-600 hover:text-gray-900">
                  Contact support
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter + Social */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Join our newsletter</h4>
            <p className="text-xs text-gray-600 mb-3">
              Subscribe for new roasts, exclusive discounts, and upcoming classes.
            </p>

            <form onSubmit={handleSubscribe} className="flex gap-2">
              <label htmlFor="footer_email" className="sr-only">
                Email address
              </label>
              <input
                id="footer_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-gray-200"
                aria-label="Email address"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-95"
                aria-label="Subscribe"
              >
                {sent ? "Thanks!" : "Subscribe"}
              </button>
            </form>

            <div className="mt-6">
              <h5 className="font-medium text-gray-900 mb-2">We’re social</h5>
              <div className="flex items-center gap-3">
                <a
                  href="https://twitter.com/"
                  aria-label="Twitter"
                  className="text-gray-600 hover:text-gray-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="https://instagram.com/"
                  aria-label="Instagram"
                  className="text-gray-600 hover:text-gray-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://facebook.com/"
                  aria-label="Facebook"
                  className="text-gray-600 hover:text-gray-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Facebook size={18} />
                </a>
                <a
                  href="https://youtube.com/"
                  aria-label="YouTube"
                  className="text-gray-600 hover:text-gray-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Youtube size={18} />
                </a>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 text-gray-600">
              <CreditCard size={18} />
              <span className="text-xs">Secure payments</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-gray-100 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} Coffee Genius — All rights reserved.
          </p>

          <div className="flex items-center gap-4">
            <nav aria-label="Footer secondary" className="flex items-center gap-3">
              <Link href="/sitemap.xml" className="text-xs text-gray-500 hover:underline">
                Sitemap
              </Link>
              <Link href="/careers" className="text-xs text-gray-500 hover:underline">
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