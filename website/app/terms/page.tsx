import React from "react";
import Link from "next/link";

/**
 * app/terms/page.tsx
 *
 * Simple Terms of Service (Server Component)
 * - Reads COMPANY_* env vars server-side to avoid hydration mismatches.
 * - Adds top margin so content sits below a fixed navbar.
 *
 * Drop this file into app/terms/page.tsx
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

export default function TermsPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen py-12 mt-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-sm text-gray-600 mt-1">Effective date: {EFFECTIVE_DATE}</p>
          <p className="mt-4 text-gray-700">
            These Terms of Service (&quot;Terms&quot;) govern your use of the website and services provided by {COMPANY_NAME}. By using our website, placing orders, or otherwise interacting with {COMPANY_NAME}, you agree to these Terms.
          </p>
        </header>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">1. Using our site</h2>
          <p className="text-gray-700">
            You must be at least 16 years old (or the minimum age in your jurisdiction) to use our site. You agree to use the site in a lawful manner and not to interfere with the site or other users.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">2. Account & security</h2>
          <p className="text-gray-700">
            When you create an account you are responsible for keeping your login details secure. You must notify us immediately of any unauthorized use or security breach.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">3. Orders and payments</h2>
          <p className="text-gray-700">
            All orders are subject to product availability and acceptance by {COMPANY_NAME}. Prices and availability may change. Payment is processed through our payment provider (we do not store full card details). By placing an order you authorize us to charge the payment method provided.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">4. Shipping, returns & refunds</h2>
          <p className="text-gray-700">
            Shipping terms, return windows and refund eligibility are described on our Shipping & Returns page. Where refunds are due, we will process them to the original payment method. Certain items (perishable or made-to-order) may be non-returnable.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">5. Intellectual property</h2>
          <p className="text-gray-700">
            All content on the site (text, images, logos, designs) is owned or licensed by {COMPANY_NAME}. You may not copy, reproduce or use site content for commercial purposes without our written permission.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">6. User content</h2>
          <p className="text-gray-700">
            If you submit reviews, comments or other content you grant {COMPANY_NAME} a perpetual, worldwide, royalty-free license to use, reproduce and display that content in connection with the site and our business.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">7. Prohibited conduct</h2>
          <p className="text-gray-700">
            You must not use the site for unlawful purposes, post harmful content, attempt to breach security, or interfere with other users. We reserve the right to remove content and suspend or terminate accounts for breach of these Terms.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">8. Disclaimers</h2>
          <p className="text-gray-700">
            The site and its content are provided &quot;as is&quot; and &quot;as available&quot; without warranties to the fullest extent permitted by law. While we strive for accuracy, {COMPANY_NAME} makes no guarantees regarding product descriptions, pricing, or availability.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">9. Limitation of liability</h2>
          <p className="text-gray-700">
            To the maximum extent permitted by law, {COMPANY_NAME} and its officers, employees and suppliers will not be liable for indirect, incidental, special, punitive or consequential damages arising from your use of the site or purchase of products. Our aggregate liability for direct damages will not exceed the amount you paid for the product or service that gave rise to the claim.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">10. Indemnification</h2>
          <p className="text-gray-700">
            You agree to indemnify and hold {COMPANY_NAME} harmless from any claims, losses, liabilities, damages, and expenses arising from your breach of these Terms or your violation of any law or rights of a third party.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">11. Termination</h2>
          <p className="text-gray-700">
            We may suspend or terminate access to the site or your account if you breach these Terms or where required by law. Sections that by their nature survive termination will continue to apply.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">12. Governing law</h2>
          <p className="text-gray-700">
            These Terms are governed by the laws of the country in which {COMPANY_NAME} operates (unless a different jurisdiction is required by law). Disputes will be subject to the exclusive jurisdiction of the courts in that jurisdiction.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">13. Changes</h2>
          <p className="text-gray-700">
            We may update these Terms from time to time. When we make material changes we will update the effective date above and, where appropriate, notify you.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">14. Contact</h2>
          <p className="text-gray-700 mb-4">
            If you have questions about these Terms, please contact us:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-sm font-medium text-gray-900">Email</div>
              <div className="text-sm text-gray-700"><a href={`mailto:${COMPANY_EMAIL}`} className="hover:underline">{COMPANY_EMAIL}</a></div>
            </div>

            <div className="flex items-start gap-3">
              <div className="text-sm font-medium text-gray-900">Address</div>
              <div className="text-sm text-gray-700">{COMPANY_ADDRESS}</div>
            </div>
          </div>
        </section>

        <footer className="mt-10 text-sm text-gray-600">
          <p>
            Last updated: {EFFECTIVE_DATE}. If you don&apos;t agree with these Terms, please stop using the site.
          </p>

          <p className="mt-3">
            Back to <Link href="/" className="text-indigo-600 hover:underline">home</Link>.
          </p>
        </footer>
      </div>
    </main>
  );
}