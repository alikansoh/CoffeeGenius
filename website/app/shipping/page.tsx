import React from "react";
import Link from "next/link";
import { Mail, MapPin, Truck, RotateCcw, Package, Clock } from "lucide-react";

const COMPANY_NAME = String(process.env.COMPANY_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "Coffee Genius");
const COMPANY_EMAIL = String(process.env.COMPANY_EMAIL || process.env.NEXT_PUBLIC_COMPANY_EMAIL || "info@coffeegenius.co.uk");
const COMPANY_ADDRESS = String(
  process.env.COMPANY_ADDRESS ||
    [process.env.COMPANY_ADDRESS, process.env.COMPANY_CITY, process.env.COMPANY_POSTCODE].filter(Boolean).join(", ") ||
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
    "173 High Street, Staines, TW18 4PA, United Kingdom"
);

const EFFECTIVE_DATE = "2026-03-16";

export const metadata = {
  title: "Shipping & Returns | Coffee Genius",
  description:
    "Everything you need to know about delivery times, shipping costs, returns and refunds at Coffee Genius.",
};

export default function ShippingPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen py-12 mt-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold">Shipping &amp; Returns</h1>
          <p className="text-sm text-gray-600 mt-1">Effective date: {EFFECTIVE_DATE}</p>
          <p className="mt-4 text-gray-700">
            We want every order to arrive perfectly. Below you will find everything you need to know about how we ship,
            what happens if something goes wrong, and how returns and refunds work.
          </p>
        </header>

        {/* 1. Order Processing */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold">1. Order Processing</h2>
          </div>
          <p className="text-gray-700">
            Because our coffee is roasted fresh to order, please allow <strong>1–3 business days</strong> for your
            order to be prepared and dispatched. Equipment and merchandise orders are usually dispatched within{" "}
            <strong>1–2 business days</strong>. You will receive a shipping confirmation email with tracking
            information as soon as your parcel leaves us.
          </p>
        </section>

        {/* 2. UK Delivery */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold">2. UK Delivery</h2>
          </div>
          <p className="text-gray-700 mb-4">
            We currently ship within the United Kingdom only. A flat shipping rate applies to all orders:
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Estimated Delivery</th>
                  <th className="px-4 py-3 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="px-4 py-3">Standard Delivery</td>
                  <td className="px-4 py-3">2–4 business days</td>
                  <td className="px-4 py-3 font-semibold">£5.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Delivery times are estimates and may vary during busy periods or due to carrier delays. Business days
            exclude weekends and UK public holidays.
          </p>
        </section>

        {/* 3. Returns — Coffee */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold">3. Returns — Coffee Beans</h2>
          </div>
          <p className="text-gray-700 mb-3">
            Due to the perishable and made-to-order nature of roasted coffee,{" "}
            <strong>we are unable to accept returns on coffee beans for change-of-mind reasons</strong>. Each bag is
            roasted fresh for your order, which means we cannot resell returned coffee.
          </p>
          <p className="text-gray-700">
            <strong>However, we always make it right.</strong> If any of the following apply, please contact us within{" "}
            <strong>7 days of delivery</strong> and we will send a free replacement or issue a full refund — no need
            to return the product:
          </p>
          <ul className="list-disc list-inside text-gray-700 mt-3 space-y-1">
            <li>Your order arrived damaged or the bag was ripped or leaking.</li>
            <li>You received the wrong coffee (wrong origin, roast, or grind).</li>
            <li>Your parcel arrived with a missing item.</li>
          </ul>
        </section>

        {/* 4. Returns — Equipment & Merchandise */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold">4. Returns — Equipment &amp; Merchandise</h2>
          </div>
          <p className="text-gray-700 mb-3">
            If you are not satisfied with a piece of equipment or merchandise, you may return it within{" "}
            <strong>30 days of purchase</strong>, provided the item is:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 mb-3">
            <li>Unused and in its original condition.</li>
            <li>In the original, undamaged packaging.</li>
            <li>Accompanied by proof of purchase (order confirmation email).</li>
          </ul>
          <p className="text-gray-700">
            To start a return, please email us at{" "}
            <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">
              {COMPANY_EMAIL}
            </a>{" "}
            with your order number and reason for return. We will provide a return address.{" "}
            <strong>Return shipping costs are the responsibility of the customer</strong> unless the item arrived
            faulty or incorrect.
          </p>
        </section>

        {/* 5. Refunds */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Refunds</h2>
          <p className="text-gray-700 mb-2">
            Once your return is received and inspected (or your claim is approved for coffee/damaged items), we will
            notify you by email. Approved refunds are processed back to your original payment method within{" "}
            <strong>5–10 business days</strong>.
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Original shipping charges are non-refundable unless the return is due to our error.</li>
            <li>Refunds are issued in GBP to the original payment method only.</li>
            <li>There is no restocking fee.</li>
          </ul>
        </section>

        {/* 6. Lost or Delayed Parcels */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Lost or Delayed Parcels</h2>
          <p className="text-gray-700">
            If your order has not arrived within the estimated delivery window, please check your tracking link first.
            If your parcel appears lost or has not moved for more than 5 business days, contact us at{" "}
            <a href={`mailto:${COMPANY_EMAIL}`} className="text-indigo-600 hover:underline">
              {COMPANY_EMAIL}
            </a>{" "}
            within <strong>10 business days of the dispatch date</strong> and we will investigate with the carrier
            and arrange a replacement or refund as appropriate.
          </p>
        </section>

        {/* 7. Contact */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Contact Us</h2>
          <p className="text-gray-700 mb-4">
            Have a question about your order, delivery or a return? We&apos;re happy to help:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <Mail className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Email</div>
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-sm text-gray-700 hover:underline">
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
          <p>Last updated: {EFFECTIVE_DATE}.</p>
          <p className="mt-3">
            Back to{" "}
            <Link href="/" className="text-indigo-600 hover:underline">
              home
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}