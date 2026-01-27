import React from "react";
import Link from "next/link";
import { Mail, MapPin } from "lucide-react";

/**
 * app/privacy/page.tsx
 *
 * Server Component (no "use client" / "use server" directive).
 * Reads COMPANY_* env vars server-side so SSR output is stable and avoids hydration mismatches.
 *
 * Place this file at app/privacy/page.tsx and restart your dev server if you change env values.
 */

const COMPANY_NAME = String(process.env.COMPANY_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "Coffee Genius");
const COMPANY_EMAIL = String(process.env.COMPANY_EMAIL || process.env.NEXT_PUBLIC_COMPANY_EMAIL || "hello@coffeegenius.example");
const COMPANY_ADDRESS = String(
  process.env.COMPANY_ADDRESS ||
    [process.env.COMPANY_ADDRESS, process.env.COMPANY_CITY, process.env.COMPANY_POSTCODE].filter(Boolean).join(", ") ||
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
    "173 High Street, Staines, TW18 4PA, United Kingdom"
);

const EFFECTIVE_DATE = "2026-01-25";

export default function PrivacyPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen py-12 mt-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-gray-600 mt-1">Effective date: {EFFECTIVE_DATE}</p>
          <p className="mt-4 text-gray-700">
            This page explains how {COMPANY_NAME} collects, uses, and protects personal information when you use our website
            or contact us. We try to keep this short and readable — contact us if you need more details.
          </p>
        </header>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">What we collect</h2>
          <p className="text-gray-700 mb-2">We collect information that you provide and information collected automatically:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Contact details you give us (name, email, phone, address) when ordering or contacting support.</li>
            <li>Order, billing and shipping information needed to fulfil purchases.</li>
            <li>Usage and technical data (IP, browser, pages visited) for analytics and site functionality.</li>
            <li>Cookies and similar technologies — see the Cookies section below.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">How we use your information</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>To process orders, provide customer support, and handle returns.</li>
            <li>To send transactional messages such as order confirmations and shipping updates.</li>
            <li>To improve the site using analytics and to prevent fraud or abuse.</li>
            <li>To send marketing only if you opt in — you can unsubscribe at any time.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Cookies</h2>
          <p className="text-gray-700 mb-2">
            We use cookies and similar technologies for essential functionality, analytics and (if enabled) marketing. You can
            control most cookies via your browser settings, but blocking some cookies may affect the site experience.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Third parties</h2>
          <p className="text-gray-700">
            We work with third-party providers for payments, email, hosting and maps (for example: Stripe, Brevo, Cloudinary, Google).
            Each provider has its own privacy policy — we encourage you to review them if you want more information.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Your rights</h2>
          <p className="text-gray-700 mb-2">
            Depending on your location you may have rights to access, correct, delete or port your personal data, and to object to certain
            processing. To exercise your rights, contact us (details below). We may request proof of identity before acting on requests.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Security and retention</h2>
          <p className="text-gray-700">
            We use reasonable technical and organisational measures to protect your data. We keep data only as long as necessary for the
            purposes described, legal obligations, or to resolve disputes.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Contact us</h2>
          <p className="text-gray-700 mb-4">If you have questions about this policy or wish to exercise your privacy rights, please contact us:</p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <Mail className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Email</div>
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-sm text-gray-700 hover:underline" data-testid="company-email">
                  {COMPANY_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <MapPin className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Address</div>
                <div className="text-sm text-gray-700">{COMPANY_ADDRESS}</div>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-10 text-sm text-gray-600">
          <p>
            Last updated: {EFFECTIVE_DATE}. By using our site you acknowledge this policy. If we update material terms we will
            post a notice on the site or contact you if required.
          </p>

          <p className="mt-3">
            Back to <Link href="/" className="text-indigo-600 hover:underline">home</Link>.
          </p>
        </footer>
      </div>
    </main>
  );
}