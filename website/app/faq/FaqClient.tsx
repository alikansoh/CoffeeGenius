import React from "react";
import Link from "next/link";

/**
 * app/faq/page.tsx
 *
 * Simple, accessible FAQ page using native <details> so it works without client JS.
 * Server component — reads env vars server-side to avoid hydration mismatches.
 *
 * Drop this file into app/faq/page.tsx
 */

const COMPANY_NAME = String(process.env.COMPANY_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "Coffee Genius");
const COMPANY_EMAIL = String(process.env.COMPANY_EMAIL || process.env.NEXT_PUBLIC_COMPANY_EMAIL || "hello@coffeegenius.example");
const EFFECTIVE_DATE = "2026-01-25";

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "Do you ship internationally?",
    a: (
      <>
        We ship within the UK. For international shipping, please contact us with your country and postal code and we’ll confirm
        availability and costs. For quick questions email <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a>.
      </>
    ),
  },
  {
    q: "What are your opening hours?",
    a: (
      <>
        Monday–Friday: 08:00–18:00
        <br />
        Saturday: 09:00–17:00
        <br />
        Sunday: 10:00–16:00
      </>
    ),
  },
  {
    q: "Can I book a private or corporate class?",
    a: (
      <>
        Yes — we offer bespoke private and corporate classes. Tell us the number of guests, preferred dates, and any skill level or focus
        (espresso, latte art, filter brewing) and we’ll prepare a proposal. Contact us at{" "}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a>.
      </>
    ),
  },
  {
    q: "Do you offer wholesale or bulk coffee for businesses?",
    a: (
      <>
        We supply restaurants, shops and offices with roasted coffee and barista training. For wholesale pricing and minimum order
        information, please visit our <Link href="/wholesale" className="text-indigo-600 hover:underline">Wholesale page</Link> and complete the wholesale form — we will contact you directly.
      </>
    ),
  },
  {
    q: "What is your returns and refund policy?",
    a: (
      <>
        Perishable items (roasted coffee, fresh food) cannot usually be returned, but if there is a problem with your order contact us
        within 48 hours and we will do our best to make it right. Non-perishable items follow our returns procedure — please include your
        order number and reason for return when contacting us.
      </>
    ),
  },
  {
    q: "How do you source your coffee?",
    a: (
      <>
        We work directly with producers and trusted importers focused on traceability, quality and fair treatment. We pay premiums for
        high-quality lots and prioritise sustainable practices in our sourcing.
      </>
    ),
  },
  {
    q: "Are payments secure?",
    a: (
      <>
        Yes — we use Stripe to process payments securely. Card details are handled directly by Stripe&apos;s PCI-compliant infrastructure, and
        we never store full card numbers on our servers. All payment interactions occur over HTTPS and use Stripe&apos;s recommended integrations
        (Stripe Checkout or Elements) to keep sensitive data out of our systems.
        <br />
        <br />
        For more information about Stripe security, see{" "}
        <a href="https://stripe.com/docs/security" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
          Stripe documentation on security
        </a>
        . If you have concerns about a payment or need a receipt, email <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a>.
      </>
    ),
  },
  {
    q: "How can I exercise my data privacy rights?",
    a: (
      <>
        To request access, correction, deletion or portability of your personal data, contact us at{" "}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a>. We may ask you to verify your identity
        before fulfilling requests.
      </>
    ),
  },
];

export default function FAQPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen py-12 mt-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Frequently Asked Questions</h1>
          <p className="text-sm text-gray-600 mt-1">Last updated: {EFFECTIVE_DATE}</p>
          <p className="mt-4 text-gray-700">
            Answers to common questions about {COMPANY_NAME}: orders, classes, wholesale and more. If you don&apos;t find what you&apos;re looking for,
            contact us at <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a>.
          </p>
        </header>

        <section className="space-y-3">
          {FAQS.map((f, i) => (
            <details key={i} className="bg-white border border-gray-100 rounded-lg p-4" aria-labelledby={`faq-${i}`}>
              <summary id={`faq-${i}`} className="cursor-pointer font-medium text-gray-900 list-none">
                {f.q}
              </summary>
              <div className="mt-3 text-gray-700">{f.a}</div>
            </details>
          ))}
        </section>

        <footer className="mt-10 text-sm text-gray-600">
          <p>
            Still need help? Email us at <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">{COMPANY_EMAIL}</a> or visit our{" "}
            <Link href="/contact" className="text-indigo-600 hover:underline">contact page</Link>.
          </p>
        </footer>
      </div>
    </main>
  );
}