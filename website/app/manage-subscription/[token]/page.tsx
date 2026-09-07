"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Ban,
  PlayCircle,
  Loader2,
  Coffee,
  Truck,
  RefreshCw,
  Check,
  CreditCard,
} from "lucide-react";
import { getCloudinaryUrl } from "@/app/utils/cloudinary";

type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "unpaid";

type Subscription = {
  _id: string;
  variantLabel: string;
  subscriptionPrice: number;
  frequencyWeeks: number;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  introActive?: boolean;
  introDiscountPercent?: number;
  currentPeriodEnd?: string;
  createdAt: string;
  image?: string;
};

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "incomplete":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "past_due":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "unpaid":
      return "bg-red-50 text-red-700 border-red-200";
    case "canceled":
      return "bg-white/15 text-white border-white/20";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle size={13} />;
    case "incomplete":
      return <Clock size={13} />;
    case "past_due":
    case "unpaid":
      return <AlertCircle size={13} />;
    case "canceled":
      return <Ban size={13} />;
    default:
      return null;
  }
}

function frequencyBlurb(weeks: number) {
  if (weeks === 1) return "A fresh bag every week — for daily drinkers.";
  if (weeks === 2) return "Our most popular pace, every fortnight.";
  if (weeks === 3) return "A relaxed pace, every three weeks.";
  return "For the slow sippers — once a month.";
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ManageSubscriptionByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [frequencyOptions, setFrequencyOptions] = useState<number[]>([1, 2, 3, 4]);
  const [actioning, setActioning] = useState(false);
  const [changingFrequency, setChangingFrequency] = useState(false);
  const [pendingFrequency, setPendingFrequency] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "cancel" | "cancel_at_period_end" | "resume" | null
  >(null);
  const [frequencyToConfirm, setFrequencyToConfirm] = useState<number | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/token/${token}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "This link is invalid or has expired");
      }
      setSub(data.subscription);
      if (Array.isArray(data.frequencyOptions)) setFrequencyOptions(data.frequencyOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This link is invalid or has expired");
      setSub(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const runAction = async (action: "cancel" | "cancel_at_period_end" | "resume") => {
    setActioning(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/token/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "That didn't work");
      }
      setSub((prev) =>
        prev
          ? { ...prev, status: data.subscription.status, cancelAtPeriodEnd: data.subscription.cancelAtPeriodEnd }
          : prev
      );
      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setActioning(false);
    }
  };

  const changeFrequency = async (weeks: number) => {
    if (!sub || weeks === sub.frequencyWeeks) return;
    setChangingFrequency(true);
    setPendingFrequency(weeks);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/subscriptions/token/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_frequency", frequencyWeeks: weeks }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Couldn't change your delivery frequency");
      }
      // Apply everything the server gives back — including the recalculated next-delivery
      // date — so the UI reflects the real new billing cycle immediately, no refresh needed.
      setSub((prev) =>
        prev
          ? {
              ...prev,
              frequencyWeeks: data.subscription.frequencyWeeks,
              currentPeriodEnd: data.subscription.currentPeriodEnd ?? prev.currentPeriodEnd,
            }
          : prev
      );
      setNotice(`Delivery frequency updated to every ${weeks} week${weeks > 1 ? "s" : ""}.`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your delivery frequency");
    } finally {
      setChangingFrequency(false);
      setPendingFrequency(null);
      setFrequencyToConfirm(null);
    }
  };

  const openBillingPortal = async () => {
    setOpeningPortal(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/token/${token}/portal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || "Couldn't open payment settings");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open payment settings");
      setOpeningPortal(false);
    }
  };

  const canEditFrequency = sub && sub.status !== "canceled" && !sub.cancelAtPeriodEnd;
  const needsPaymentUpdate = sub && (sub.status === "past_due" || sub.status === "unpaid");
  const bagImageUrl = sub?.image && !imgFailed ? getCloudinaryUrl(sub.image, "medium") : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-100 to-zinc-50 pt-16 sm:pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-zinc-200 shadow-sm text-zinc-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading your subscription…
          </div>
        ) : error && !sub ? (
          <div className="text-center py-14 bg-white rounded-3xl border border-zinc-200 shadow-sm px-6">
            <AlertCircle size={30} className="mx-auto text-red-400 mb-3" />
            <p className="text-sm text-zinc-600">{error}</p>
          </div>
        ) : sub ? (
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-lg shadow-zinc-200/50 overflow-hidden">
            {/* Hero header */}
            <div className="relative bg-zinc-900 px-6 sm:px-7 pt-7 pb-8 text-white overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
              <div className="absolute top-16 -left-8 w-24 h-24 rounded-full bg-white/5" />

              <div className="relative flex items-center gap-2 text-white/50 text-[11px] font-semibold uppercase tracking-widest mb-4">
                <Coffee size={13} />
                Your subscription
              </div>

              <div className="relative flex items-start gap-4">
                {/* Bag image */}
                <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/10 overflow-hidden flex items-center justify-center">
                  {bagImageUrl ? (
                    <Image
                      src={bagImageUrl}
                      alt={sub.variantLabel}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      onError={() => setImgFailed(true)}
                    />
                  ) : (
                    <Coffee size={26} className="text-white/40" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg leading-snug">{sub.variantLabel}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-2.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getStatusColor(
                        sub.status
                      )}`}
                    >
                      <StatusIcon status={sub.status} />
                      {sub.status.replace("_", " ")}
                    </span>
                    {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        Ending soon
                      </span>
                    )}
                    {sub.introActive && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-400/20 text-purple-300 border border-purple-400/30">
                        Intro {sub.introDiscountPercent}% off
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative flex items-center justify-between mt-5">
                <div>
                  <p className="text-2xl font-bold">£{sub.subscriptionPrice.toFixed(2)}</p>
                  <p className="text-[11px] text-white/50">per delivery</p>
                </div>

                {sub.currentPeriodEnd && sub.status !== "canceled" && (
                  <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3.5 py-2.5">
                    <Calendar size={14} className="text-white/60" />
                    <span className="text-xs text-white/80">
                      Next delivery
                      <br />
                      <strong key={sub.currentPeriodEnd} className="text-white font-semibold text-[13px]">
                        {formatDate(sub.currentPeriodEnd)}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="relative flex items-center gap-1.5 mt-4">
                <Truck size={13} className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-semibold">Delivery is always free</span>
              </div>
            </div>

            <div className="px-6 sm:px-7 py-6">
              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}
              {notice && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
                  <Check size={15} />
                  {notice}
                </div>
              )}

              {needsPaymentUpdate && (
                <div className="mb-6 px-4 py-4 rounded-2xl bg-red-50 border border-red-200">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle size={17} className="text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-red-800">Payment failed</p>
                      <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                        We couldn&apos;t take payment for your last delivery. Update your card to keep this
                        subscription active.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={openBillingPortal}
                    disabled={openingPortal}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                  >
                    {openingPortal ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Opening…
                      </>
                    ) : (
                      <>
                        <CreditCard size={14} /> Update payment method
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Delivery frequency */}
              {sub.status !== "canceled" && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <RefreshCw size={14} className="text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-900">Delivery frequency</p>
                  </div>

                  {!canEditFrequency ? (
                    <p className="text-xs text-zinc-400 -mt-1 mb-2">
                      {sub.cancelAtPeriodEnd
                        ? "Resume your subscription to change how often it ships."
                        : "This subscription can't be changed right now."}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2.5">
                    {frequencyOptions.map((weeks) => {
                      const isCurrent = weeks === sub.frequencyWeeks;
                      const isPending = changingFrequency && pendingFrequency === weeks;
                      const isAwaitingConfirm = frequencyToConfirm === weeks;
                      return (
                        <button
                          key={weeks}
                          type="button"
                          disabled={!canEditFrequency || changingFrequency}
                          onClick={() => setFrequencyToConfirm(weeks)}
                          className={`relative text-left rounded-2xl border-2 px-4 py-3.5 transition-all duration-200 ${
                            isCurrent
                              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                              : isAwaitingConfirm
                              ? "border-zinc-900 bg-zinc-50"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 disabled:hover:border-zinc-200"
                          } ${!canEditFrequency ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${
                            changingFrequency && !isPending ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold">
                              Every {weeks} wk{weeks > 1 ? "s" : ""}
                            </p>
                            {isPending ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : isCurrent ? (
                              <Check size={14} strokeWidth={3} />
                            ) : null}
                          </div>
                          <p
                            className={`text-[11px] mt-0.5 leading-snug ${
                              isCurrent ? "text-zinc-300" : "text-zinc-400"
                            }`}
                          >
                            {frequencyBlurb(weeks)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {frequencyToConfirm !== null && (
                    <div className="mt-3 px-4 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                      <p className="text-xs text-zinc-600 mb-3">
                        Change delivery to every {frequencyToConfirm} week
                        {frequencyToConfirm > 1 ? "s" : ""}? Your next delivery date will update.
                      </p>
                      <div className="flex gap-2">
                        <button
                          disabled={changingFrequency}
                          onClick={() => changeFrequency(frequencyToConfirm)}
                          className="px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                        >
                          {changingFrequency ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Updating…
                            </>
                          ) : (
                            "Confirm change"
                          )}
                        </button>
                        <button
                          disabled={changingFrequency}
                          onClick={() => setFrequencyToConfirm(null)}
                          className="px-3.5 py-2 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-white cursor-pointer"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payment method */}
              {sub.status !== "canceled" && !needsPaymentUpdate && (
                <div className="mb-6 pt-5 border-t border-zinc-100">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard size={14} className="text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-900">Payment method</p>
                  </div>
                  <button
                    onClick={openBillingPortal}
                    disabled={openingPortal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                  >
                    {openingPortal ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Opening…
                      </>
                    ) : (
                      <>
                        <CreditCard size={13} /> Update payment method
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Cancel / resume actions */}
              {sub.status !== "canceled" && (
                <div className="pt-5 border-t border-zinc-100">
                  {confirmAction ? (
                    <div>
                      <p className="text-xs text-zinc-600 mb-3">
                        {confirmAction === "resume"
                          ? "Resume this subscription so it keeps renewing?"
                          : confirmAction === "cancel"
                          ? "Cancel this subscription right now? You won't be charged again."
                          : "Cancel at the end of the current period? You'll keep this delivery, then it stops."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          disabled={actioning}
                          onClick={() => runAction(confirmAction)}
                          className="px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                        >
                          {actioning ? "Working…" : "Confirm"}
                        </button>
                        <button
                          disabled={actioning}
                          onClick={() => setConfirmAction(null)}
                          className="px-3.5 py-2 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sub.cancelAtPeriodEnd ? (
                        <button
                          onClick={() => setConfirmAction("resume")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                        >
                          <PlayCircle size={13} />
                          Resume
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction("cancel_at_period_end")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                        >
                          <Clock size={13} />
                          Cancel at period end
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmAction("cancel")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 cursor-pointer"
                      >
                        <Ban size={13} />
                        Cancel now
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
