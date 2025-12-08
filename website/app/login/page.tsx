"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";

const logoSrc = "/logo.png";

interface LoginForm {
  username: string;
  password: string;
}

interface LoginResponseSuccess {
  token: string;
  role?: string;
}

interface LoginResponseError {
  error: string;
}

export default function AdminLogin() {
  const router = useRouter();
  const [form, setForm] = useState<LoginForm>({ username: "", password: "" });
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const data: LoginResponseSuccess = await res.json();
        setMessage("Admin login successful. Redirecting to admin area…");
        localStorage.setItem("username", form.username);
        setTimeout(() => {
          router.push("/admin");
        }, 900);
      } else {
        const data: LoginResponseError = await res.json();
        setMessage(data.error || "Invalid admin credentials.");
      }
    } catch {
      setMessage("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4"
      style={{
        background: "linear-gradient(135deg, #111827 0%, #6b7280 100%)",
      }}
    >
      <div className="w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl bg-white/5 backdrop-blur-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left - Admin Brand Panel (desktop only) */}
          <div className="hidden lg:flex flex-col items-start justify-center gap-6 p-12 text-white">
            <div>
              <h3 className="text-2xl font-bold">Coffee Genius — Admin</h3>
              <p className="text-sm text-white/80">Administrative Portal</p>
            </div>

            <div className="mt-6">
              <h2 className="text-3xl font-extrabold">Admin Portal</h2>
              <p className="mt-2 text-sm text-white/80 max-w-sm">
                Authorized personnel only. Manage orders, inventories, wholesale accounts, and site settings from here.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm text-white/90">
              <span className="inline-flex items-center justify-center p-2 rounded-full bg-white/10">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="font-medium">Secure access</div>
                <div className="text-xs text-white/80">Account protection recommended (MFA, strong passwords)</div>
              </div>
            </div>

            <div className="mt-8 text-xs text-white/60">
              If you lost access, contact the store owner or system administrator.
            </div>
          </div>

          {/* Right - Form */}
          <div className="bg-white p-8 sm:p-10">
            {/* Plain logo centered above heading and paragraph */}
            <div className="flex items-center justify-center mb-4">
              <Image src={logoSrc} alt="Coffee Genius logo" width={72} height={72} priority />
            </div>

            <h1 className="text-2xl font-semibold text-slate-900 mb-1">Admin sign in</h1>
            <p className="text-sm text-slate-500 mb-6">
              Use your administrator account to access the admin dashboard.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                  Admin username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    placeholder="admin"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:border-[#111827] transition"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    className="block w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:border-[#111827] transition"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-500">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                  <span>Remember this device</span>
                </label>
              
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white font-semibold shadow-sm transition ${
                    loading
                      ? "bg-slate-400 cursor-not-allowed"
                      : "bg-linear-to-r from-[#111827] to-[#6b7280] hover:from-[#0b1020] hover:to-[#575b62] transform hover:-translate-y-0.5"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    "Sign in to admin"
                  )}
                </button>
              </div>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className="text-sm text-center font-medium px-4 py-3 rounded-lg"
                  style={{
                    backgroundColor: message.toLowerCase().includes("successful") ? "#ecfdf5" : "#fff1f2",
                    color: message.toLowerCase().includes("successful") ? "#065f46" : "#9f1239",
                    border: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  {message}
                </div>
              )}
            </form>

            <div className="mt-6 text-xs text-slate-400">
              Admin access only. All activity is logged and monitored.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}