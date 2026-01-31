"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { CreditCard, MapPin, Phone, Mail } from "lucide-react";
// Install: npm install react-icons
import { FaInstagram, FaCcVisa, FaCcMastercard, FaCcAmex } from "react-icons/fa";
import { SiApplepay } from "react-icons/si";

/**
 * Footer with colored brand icons
 *
 * - Uses react-icons for payment brand marks and Instagram.
 * - Each brand is shown with appropriate brand color / background.
 * - Make sure to install `react-icons` in your project.
 */

/* Small presentational wrapper for a colored payment badge */
function PaymentBadge({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      title={label}
      className={`flex items-center justify-center w-11 h-7 rounded-md shadow-sm ${className}`}
      aria-hidden
    >
      {children}
    </div>
  );
}

export default function Footer() {
  const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/coffee", label: "Coffee" },
    { href: "/equipment", label: "Equipment" },
    { href: "/classes", label: "Classes" },
    { href: "/wholesale", label: "Wholesale" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

  const LEGAL_LINKS = [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/shipping", label: "Shipping and Returns" },
  ];

  return (
    <footer role="contentinfo" className="bg-white border-t border-gray-200 text-sm text-gray-700 w-full print:hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 md:py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 md:gap-6 lg:gap-8">
          {/* Brand & Contact */}
          <div className="col-span-1 sm:col-span-2 md:col-span-1 lg:col-span-1 space-y-4">
            <Link href="/" aria-label="Coffee Genius homepage" className="inline-flex items-center">
              <Image src="/logo.png" alt="Coffee Genius" width={160} height={64} className="object-contain w-28 sm:w-32 md:w-36 lg:w-40" priority={false} />
            </Link>

            <p className="text-xs sm:text-sm text-gray-600 max-w-xs leading-relaxed">
              Coffee Genius — small-batch roastery and equipment shop. Ethically sourced beans, expert classes, and curated gear for home baristas.
            </p>

            <div className="space-y-2">
              <div className="flex items-start sm:items-center gap-3 text-gray-600">
                <MapPin size={16} className="flex-shrink-0 mt-0.5 sm:mt-0" />
                <span className="text-xs sm:text-sm leading-snug">73 High St, Staines TW18 4PA</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone size={16} className="flex-shrink-0" />
                <a href="tel:+447444724389" className="text-xs sm:text-sm hover:underline" aria-label="Call Coffee Genius">+44 7444 724389</a>
              </div>
              <div className="flex items-start sm:items-center gap-3 text-gray-600">
                <Mail size={16} className="flex-shrink-0 mt-0.5 sm:mt-0" />
                <a href="mailto:hello@coffee-genius.example" className="text-xs sm:text-sm hover:underline break-words" aria-label="Email Coffee Genius">hello@coffee-genius.example</a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Explore</h4>
            <ul className="space-y-2">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help & Policy */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Help & Policy</h4>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 transition-colors">{l.label}</Link>
                </li>
              ))}
              <li><Link href="/faq" className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 transition-colors">FAQ</Link></li>
              <li><Link href="/contact" className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 transition-colors">Contact support</Link></li>
            </ul>
          </div>

          {/* Payments & Social (colored icons) */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 text-sm md:text-base">Payments</h4>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed">Secure payments powered by Stripe. We accept:</p>

            <div className="flex items-center gap-3 mb-4" aria-hidden>
              {/* Visa: blue rectangle with white icon */}
              <PaymentBadge label="Visa" className="bg-[#1a1f71]">
                <FaCcVisa size={20} color="#ffffff" />
              </PaymentBadge>

              {/* Mastercard: circular red/orange pair — approximate with gradient bg */}
              <PaymentBadge label="Mastercard" className="bg-gradient-to-r from-[#ff5f00] to-[#eb001b]">
                <FaCcMastercard size={20} color="#ffffff" />
              </PaymentBadge>

              {/* Amex: teal background */}
              <PaymentBadge label="American Express" className="bg-[#2e77bd]">
                <FaCcAmex size={20} color="#ffffff" />
              </PaymentBadge>

              {/* Apple Pay: black rounded */}
              <PaymentBadge label="Apple Pay" className="bg-black">
                <SiApplepay size={18} color="#ffffff" />
              </PaymentBadge>
            </div>

            <div className="flex items-center gap-3 text-gray-600 mb-4">
              <CreditCard size={18} />
              <div>
                <div className="text-xs">Secure payments</div>
                <div className="text-xs font-semibold">Stripe (PCI-compliant)</div>
              </div>
            </div>

            <div className="mt-2">
              <h5 className="font-medium text-gray-900 mb-2 text-xs sm:text-sm">Follow us on Instagram</h5>
              <a
                href="https://www.instagram.com/coffeegeniuscg"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                aria-label="Follow Coffee Genius on Instagram"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 via-orange-400 to-yellow-400">
                  <FaInstagram size={18} color="white" />
                </span>
                <span className="hidden sm:inline">@coffeegenius</span>
                <span className="sm:hidden">Instagram</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 sm:mt-10 md:mt-12 border-t border-gray-100 pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Coffee Genius — All rights reserved.</p>

          <div className="flex items-center gap-4">
            <nav aria-label="Footer secondary" className="flex items-center gap-3">
              <Link href="/sitemap.xml" className="text-xs text-gray-500 hover:underline">Sitemap</Link>
              <span className="hidden sm:inline text-gray-300">•</span>
              <Link href="/careers" className="text-xs text-gray-500 hover:underline">Careers</Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* Note:
   - This component uses `react-icons`. Install with `npm install react-icons`.
   - Colors used:
     Visa: #1a1f71
     Mastercard: gradient orange->red
     Amex: #2e77bd
     Apple Pay: black
     Instagram: pink->orange gradient
*/