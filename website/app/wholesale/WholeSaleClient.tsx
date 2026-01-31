'use client';

import React, { useRef, useState } from "react";

/**
 * SimpleWholesaleEnquirySteps.tsx (static options)
 *
 * This version uses a static list of interest options (no runtime fetch).
 * It posts enquiries to /api/enquiry (the API you already added).
 */

type ContactPref = "email" | "phone";

const INTEREST_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "roasted", label: "Roasted beans" },
  { value: "green", label: "Green beans" },
  { value: "equipment", label: "Equipment" },
  { value: "training", label: "Training" },
];

export default function SimpleWholesaleEnquirySteps() {
  const [step, setStep] = useState(1);
  const [business, setBusiness] = useState("");
  const [contact, setContact] = useState("");
  const [contactPref, setContactPref] = useState<ContactPref>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);
  const businessInputRef = useRef<HTMLInputElement | null>(null);
  const contactInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const resetErrors = () => setErrors({});

  const validateStep = (s = step) => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!business.trim()) e.business = "Business name is required";
      if (!contact.trim()) e.contact = "Contact name is required";
    } else if (s === 2) {
      if (contactPref === "email") {
        if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) e.email = "A valid email is required";
      } else {
        if (!phone.trim() || phone.trim().length < 6) e.phone = "A valid phone number is required";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    resetErrors();
    if (validateStep(step)) {
      setStep((s) => Math.min(3, s + 1));
      setTimeout(() => {
        if (step === 1) {
          if (contactPref === "email") emailInputRef.current?.focus();
          if (contactPref === "phone") phoneInputRef.current?.focus();
        }
      }, 120);
    }
  };

  const back = () => {
    resetErrors();
    setStep((s) => Math.max(1, s - 1));
    setTimeout(() => {
      if (step === 2) {
        businessInputRef.current?.focus();
      } else if (step === 3) {
        contactInputRef.current?.focus();
      }
    }, 120);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    resetErrors();
    const ok1 = validateStep(1);
    const ok2 = validateStep(2);
    if (!ok1) {
      setStep(1);
      businessInputRef.current?.focus();
      return;
    }
    if (!ok2) {
      setStep(2);
      if (contactPref === "email") emailInputRef.current?.focus();
      else phoneInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        business: business.trim(),
        contact: contact.trim(),
        contactPref,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        interest: interest || undefined,
        message: message.trim() || undefined,
      };

      const resp = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        // Attempt to parse structured validation errors
        if (json && Array.isArray(json.errors)) {
          const serverErrors: Record<string, string> = {};
          for (const err of json.errors) {
            if (err.field && err.message) serverErrors[err.field] = err.message;
          }
          setErrors(serverErrors);
        } else {
          setErrors({ server: json.message || "Submission failed. Please try again later." });
        }
        window.scrollTo({ top: formRef.current?.getBoundingClientRect().top ?? 0, behavior: "smooth" });
        return;
      }

      // success
      setSent(true);
      setStep(1);

      // optionally reset fields (or keep them — here we clear)
      setBusiness("");
      setContact("");
      setContactPref("email");
      setEmail("");
      setPhone("");
      setInterest("");
      setMessage("");

      // hide message after 6s
      setTimeout(() => setSent(false), 6000);
    } catch (err) {
      console.error("Enquiry submit error:", err);
      setErrors({ server: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  // Mobile action: scroll to form and focus first input
  const openFormOnMobile = () => {
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setStep(1);
      setTimeout(() => businessInputRef.current?.focus(), 550);
    }
  };

  return (
    <section className="bg-white pt-32 pb-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Left: description */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-2">
              Wholesale
            </p>

            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">
              Straightforward wholesale for cafés, retailers and offices
            </h1>

            <div className="mt-5 space-y-4 text-slate-700 max-w-xl">
              <p>
                We partner with producers and roasters to deliver specialty-grade coffee with clear pricing and reliable supply.
                From single-origin roasted lots to custom blends, we work with businesses to provide sample options and scalable plans.
              </p>

              <p>
                Complete this short enquiry to tell us what you need — include any sample requests or notes.
                A dedicated account manager will contact you with tailored pricing and next steps within 1–2 business days.
              </p>
            </div>
          </div>

          {/* Right: form card */}
          <div>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Quick enquiry</div>
                    <div className="text-xs text-slate-500">Three simple steps — minimal fields</div>
                  </div>
                  <div className="text-xs text-slate-500">Step {step} of 3</div>
                </div>

                <div className="mt-3 flex items-center gap-2" aria-hidden>
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full border ${step >= 1 ? "bg-slate-900 text-white" : "bg-white text-slate-700 border-slate-200"}`}>1</div>
                  <div className={`h-[2px] flex-1 ${step > 1 ? "bg-slate-900" : "bg-slate-200"}`}></div>
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full border ${step >= 2 ? "bg-slate-900 text-white" : "bg-white text-slate-700 border-slate-200"}`}>2</div>
                  <div className={`h-[2px] flex-1 ${step > 2 ? "bg-slate-900" : "bg-slate-200"}`}></div>
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full border ${step >= 3 ? "bg-slate-900 text-white" : "bg-white text-slate-700 border-slate-200"}`}>3</div>
                </div>
              </div>

              <form ref={formRef} onSubmit={handleSubmit} className="px-6 py-6" aria-label="Wholesale enquiry form" noValidate>
                {/* Server error */}
                {errors.server && (
                  <div className="mb-4 text-sm text-rose-600">
                    {errors.server}
                  </div>
                )}

                {/* Step 1 */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="business" className="block text-xs font-medium text-slate-700 mb-1">Business name</label>
                      <input
                        id="business"
                        ref={businessInputRef}
                        value={business}
                        onChange={(e) => setBusiness(e.target.value)}
                        className={`w-full rounded-md border px-3 py-2 text-slate-900 ${errors.business ? "border-rose-400" : "border-slate-200"}`}
                        placeholder="e.g. Sunrise Café"
                        autoComplete="organization"
                      />
                      {errors.business && <p className="mt-1 text-xs text-rose-500">{errors.business}</p>}
                    </div>

                    <div>
                      <label htmlFor="contact" className="block text-xs font-medium text-slate-700 mb-1">Contact name</label>
                      <input
                        id="contact"
                        ref={contactInputRef}
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        className={`w-full rounded-md border px-3 py-2 text-slate-900 ${errors.contact ? "border-rose-400" : "border-slate-200"}`}
                        placeholder="e.g. Jamie Smith"
                        autoComplete="name"
                      />
                      {errors.contact && <p className="mt-1 text-xs text-rose-500">{errors.contact}</p>}
                    </div>
                  </div>
                )}

                {/* Step 2 */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-medium text-slate-700 mb-2">Preferred method of contact</div>

                      <div
                        role="radiogroup"
                        aria-label="Preferred method of contact"
                        className="inline-flex rounded-md bg-white border border-slate-200 p-1"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={contactPref === "email"}
                          onClick={() => {
                            setContactPref("email");
                            setTimeout(() => emailInputRef.current?.focus(), 80);
                          }}
                          className={`px-4 py-2 rounded-md text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition ${contactPref === "email" ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          Email
                        </button>

                        <button
                          type="button"
                          role="radio"
                          aria-checked={contactPref === "phone"}
                          onClick={() => {
                            setContactPref("phone");
                            setTimeout(() => phoneInputRef.current?.focus(), 80);
                          }}
                          className={`ml-2 px-4 py-2 rounded-md text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition ${contactPref === "phone" ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          Phone
                        </button>
                      </div>

                      <input type="hidden" name="contactPref" value={contactPref} />
                    </div>

                    {contactPref === "email" ? (
                      <div>
                        <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                        <input
                          id="email"
                          ref={emailInputRef}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full rounded-md border px-3 py-2 text-slate-900 ${errors.email ? "border-rose-400" : "border-slate-200"}`}
                          placeholder="you@business.com"
                          autoComplete="email"
                        />
                        {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email}</p>}
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="phone" className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                        <input
                          id="phone"
                          ref={phoneInputRef}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={`w-full rounded-md border px-3 py-2 text-slate-900 ${errors.phone ? "border-rose-400" : "border-slate-200"}`}
                          placeholder="+44 20 1234 5678"
                          autoComplete="tel"
                        />
                        {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone}</p>}
                      </div>
                    )}

                    <div>
                      <label htmlFor="interest" className="block text-xs font-medium text-slate-700 mb-1">Interest (optional)</label>
                      <select
                        id="interest"
                        value={interest}
                        onChange={(e) => setInterest(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-slate-900 border-slate-200 bg-white"
                      >
                        <option value="">Choose an option (optional)</option>
                        {INTEREST_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Step 3 */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="message" className="block text-xs font-medium text-slate-700 mb-1">Optional note</label>
                      <textarea
                        id="message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border px-3 py-2 text-slate-900 border-slate-200"
                        placeholder="Any specifics (samples, roast preference, delivery notes)"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-md p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Review</div>
                      <div className="mt-2 space-y-1">
                        <div><strong>Business:</strong> {business || "—"}</div>
                        <div><strong>Contact:</strong> {contact || "—"}</div>
                        <div><strong>Contact preference:</strong> {contactPref === "email" ? "Email" : "Phone"}</div>
                        <div><strong>{contactPref === "email" ? "Email" : "Phone"}:</strong> {contactPref === "email" ? (email || "—") : (phone || "—")}</div>
                        <div><strong>Interest:</strong> {interest ? INTEREST_OPTIONS.find(o => o.value === interest)?.label ?? interest : "—"}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={back}
                      disabled={step === 1 || submitting}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-slate-200 bg-white text-slate-700 text-sm disabled:opacity-50"
                    >
                      Back
                    </button>
                  </div>

                  {step < 3 && (
                    <button
                      type="button"
                      onClick={next}
                      disabled={submitting}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-slate-900 text-white text-sm"
                    >
                      Next
                    </button>
                  )}

                  {step === 3 && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-slate-900 text-white text-sm"
                    >
                      {submitting ? "Sending…" : "Send enquiry"}
                    </button>
                  )}
                </div>

                <div aria-live="polite" className="mt-4 min-h-[1.25rem]">
                  {sent && <p className="text-sm text-slate-700">Thanks — your enquiry has been sent. We will respond within 1–2 business days.</p>}
                </div>
              </form>

              <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500">
                We will only use your information to respond to this enquiry.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed mobile button — visible only on small screens */}
      <button
        onClick={openFormOnMobile}
        aria-label="Open wholesale enquiry form"
        className="lg:hidden fixed bottom-6 right-4 z-50 inline-flex items-center gap-3 px-4 py-3 rounded-full bg-slate-900 text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        Quick enquiry
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}