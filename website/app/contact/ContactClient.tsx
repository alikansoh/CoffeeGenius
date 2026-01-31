"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { Phone, Mail, MapPin, CheckCircle } from "lucide-react";

/**
 * Contact page (client)
 *
 * - Calls POST /api/contact
 * - Honeypot spam trap (company)
 * - Shows inline validation, sending state, success and error messages
 * - Does not persist locally — server sends emails (best-effort)
 */

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  const address = "173 High Street, Staines, TW18 4PA, United Kingdom";
  const mapsUrlFallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;

  function validateEmail(e: string) {
    return /^\S+@\S+\.\S+$/.test(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // basic validation
    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMessage("Please complete all required fields.");
      setStatus("error");
      liveRef.current?.focus();
      return;
    }
    if (!validateEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      setStatus("error");
      liveRef.current?.focus();
      return;
    }
    // honeypot: if filled, treat as bot and silently return success-like response
    if (company.trim()) {
      // don't actually send — behave as if OK
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          company: "",
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          body?.message || body?.error || `Failed to send (${res.status})`;
        setErrorMessage(msg);
        setStatus("error");
        liveRef.current?.focus();
        return;
      }

      // success (server may still have partial errors but returns 200)
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      // Narrow the unknown error to Error when possible to extract message
      if (err instanceof Error) {
        console.error("Contact submit error", err);
        setErrorMessage(
          err.message || "Network error — please try again later."
        );
      } else {
        console.error("Contact submit error", err);
        setErrorMessage("Network error — please try again later.");
      }
      setStatus("error");
      liveRef.current?.focus();
    }
    // inside handleSubmit, at the top (temporary debug)
    console.log("Contact form submit clicked", {
      name,
      email,
      message,
      company,
    });
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          {/* Contact form */}
          <section className="bg-white rounded-3xl p-8 shadow-lg border border-gray-200">
            <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
              Contact us
            </h1>
            <p className="text-sm text-gray-600 mb-6">
              Have a question or want to purchase equipment? Send us a message
              and we’ll get back to you as soon as possible.
            </p>

            {/* ARIA live region for screen-reader feedback */}
            <div
              ref={liveRef}
              tabIndex={-1}
              role="status"
              aria-live="polite"
              className="sr-only"
            />

            {status === "success" && (
              <div className="flex items-start gap-4 bg-green-50 border border-green-100 rounded-lg p-4 mb-6">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-green-800">
                    Message sent
                  </div>
                  <div className="text-sm text-green-700">
                    Thanks — we’ll respond to your message shortly.
                  </div>
                </div>
              </div>
            )}

            {errorMessage && status !== "success" && (
              <div className="mb-4 text-sm text-red-800 bg-red-50 border border-red-100 rounded-md p-3">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* honeypot - visually hidden */}
              <label className="sr-only" htmlFor="company">
                Company (leave blank)
              </label>
              <input
                id="company"
                name="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                autoComplete="off"
              />

              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  placeholder="Your full name"
                  aria-invalid={status === "error" && !!errorMessage}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  placeholder="you@example.com"
                  aria-invalid={status === "error" && !!errorMessage}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  Message
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={6}
                  className="mt-1 block w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-y"
                  placeholder="How can we help?"
                  aria-invalid={status === "error" && !!errorMessage}
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-black text-white px-5 py-3 text-sm font-semibold shadow hover:bg-gray-800 transition transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === "sending" ? "Sending…" : "Send message"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setName("");
                    setEmail("");
                    setMessage("");
                    setCompany("");
                    setErrorMessage(null);
                    setStatus("idle");
                  }}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Reset
                </button>
              </div>
            </form>
          </section>

          {/* Contact details */}
          <aside className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-200">
              <h2 className="font-semibold text-lg mb-2">Visit or call</h2>
              <p className="text-sm text-gray-700 mb-4">
                We’re happy to answer questions or help you choose equipment.
              </p>

              <div className="flex items-start gap-3 mb-3">
                <Phone className="w-5 h-5 text-black mt-1 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Phone</div>
                  <a
                    href="tel:+447444724389"
                    className="text-sm text-gray-700 hover:underline"
                  >
                    +44 7444 724389
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 mb-3">
                <Mail className="w-5 h-5 text-black mt-1 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Email</div>
                  <a
                    href="mailto: info@coffeegenius.co.uk"
                    className="text-sm text-gray-700 hover:underline"
                  >
                     info@coffeegenius.co.uk
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-black mt-1 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Address</div>
                  <address className="not-italic text-sm text-gray-700">
                    173 High Street, Staines, TW18 4PA
                    <div className="mt-2">
                      <Link
                        href={mapsUrlFallback}
                        className="text-sm text-gray-900 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Google Maps
                      </Link>
                    </div>
                  </address>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-200">
              <h3 className="font-semibold text-lg mb-3">Opening hours</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex justify-between">
                  <span>Monday</span>
                  <span>7 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Tuesday</span>
                  <span>7 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Wednesday</span>
                  <span>7 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Thursday</span>
                  <span>7 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Friday</span>
                  <span>7 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Saturday</span>
                  <span>8:30 am – 4 pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Sunday</span>
                  <span className="font-semibold">Closed</span>
                </li>
              </ul>
            </div>

            <div className="text-sm text-gray-700">
              <p>
                Prefer direct email? Use{" "}
                <a
                  href="mailto:info@coffeegenius.co.uk "
                  className="text-gray-900 hover:underline"
                >
                  info@coffeegenius.co.uk{" "}
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
