import React, { JSX } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import Order from "@/models/Order";
import Coffee from "@/models/Coffee";
import Equipment from "@/models/Equipment";

/**
 * Enhanced Admin Dashboard with Modern UI/UX
 *
 * Changes in this file:
 * - Header is not sticky (removed top bar fix)
 * - Improved filter UX with visible preset buttons and a custom date form
 * - Fixed Next.js App Router searchParams Promise issue by awaiting searchParams
 * - Fixed TypeScript errors by replacing 'any' with proper interfaces and types
 * - Added casting for Mongoose lean() documents and typed refund objects
 * - Changed conditional rendering to use && to avoid empty object errors
 * - Fixed user display to handle non-string values safely
 */

/* ---------- Types ---------- */

type SearchParams = { [key: string]: string | string[] | undefined };

interface RevenueMetrics {
  gross: number;
  net: number;
  shipping: number;
  refunded: number;
  avgOrderValue: number;
  refundRate: number;
}

interface OrderItem {
  id?: string;
  productId?: string;
  name?: string;
  source?: string;
  category?: string;
  qty?: number;
  totalPrice?: number;
  unitPrice?: number;
}

interface OrderAddress {
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface OrderDoc {
  _id: string;
  total?: number;
  shipping?: number;
  createdAt?: Date;
  status?: string;
  email?: string;
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  items?: OrderItem[];
  metadata?: {
    refundedAmount?: number;
    refunds?: { amount: number }[];
  };
  refund?: {
    amount?: number;
  };
}

/* ---------- Utilities ---------- */

function formatCurrency(value = 0, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `£${Math.round(value || 0).toLocaleString()}`;
  }
}

function formatCurrencyDetailed(value = 0, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${(value || 0).toFixed(2)}`;
  }
}

function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleString("en-GB", { month: "short" });
}

function calculateGrowth(current: number, previous: number): number {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function getRefundedAmountFromDoc(order: OrderDoc): number {
  const meta = order?.metadata ?? {};
  if (typeof meta.refundedAmount === "number" && !Number.isNaN(meta.refundedAmount)) {
    return Number(meta.refundedAmount);
  }
  if (Array.isArray(meta.refunds)) {
    return meta.refunds.reduce((s: number, r: { amount: number }) => s + (Number(r?.amount) || 0), 0);
  }
  if (order?.refund && typeof order.refund.amount === "number") {
    return Number(order.refund.amount);
  }
  return 0;
}

/* ---------- Date range helpers ---------- */

function getDateRangeFromQuery(params: SearchParams) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const p = typeof params.p === "string" ? params.p : undefined;
  const startDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const endDate = typeof params.endDate === "string" ? params.endDate : undefined;

  let start: Date;
  let end: Date = now;

  if (startDate && endDate) {
    start = new Date(startDate);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    end = e;
  } else {
    switch (p) {
      case "7d":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "12m":
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case "ytd":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "all":
        start = new Date(2000, 0, 1);
        break;
      case "30d":
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  start.setHours(0, 0, 0, 0);
  return { start, end, preset: p ?? "30d", startDate: startDate ?? undefined, endDate: endDate ?? undefined };
}

function getPreviousPeriodRange(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration + 1);
  previousStart.setHours(0, 0, 0, 0);
  previousEnd.setHours(23, 59, 59, 999);
  return { previousStart, previousEnd };
}

/* ---------- Data processing helpers ---------- */

function calculatePeriodMetrics(orders: OrderDoc[]): RevenueMetrics {
  let gross = 0;
  let shipping = 0;
  let refunded = 0;

  for (const order of orders) {
    gross += Number(order.total || 0);
    shipping += Number(order.shipping || 0);
    refunded += getRefundedAmountFromDoc(order);
  }

  const net = Math.max(0, gross - refunded);
  const avgOrderValue = orders.length > 0 ? net / orders.length : 0;
  const refundRate = gross > 0 ? Number(((refunded / gross) * 100).toFixed(1)) : 0;

  return {
    gross,
    net,
    shipping: orders.length > 0 ? shipping / orders.length : 0,
    refunded,
    avgOrderValue,
    refundRate,
  };
}

function calculateCategoryBreakdown(orders: OrderDoc[]) {
  const categoryMap = new Map<string, { revenue: number; orders: Set<string>; units: number }>();
  let totalRevenue = 0;

  for (const order of orders) {
    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const category = String(item.source || item.category || "Other");
      const qty = Number(item.qty || 1);
      const revenue = Number(item.totalPrice ?? qty * (item.unitPrice ?? 0)) || 0;

      totalRevenue += revenue;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { revenue: 0, orders: new Set(), units: 0 });
      }
      const cat = categoryMap.get(category)!;
      cat.revenue += revenue;
      cat.orders.add(String(order._id));
      cat.units += qty;
    }
  }

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      revenue: Math.round(data.revenue),
      orders: data.orders.size,
      units: data.units,
      percentage: totalRevenue > 0 ? Number(((data.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      color: categoryColor(category),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function categoryColor(category: string) {
  const key = category.toLowerCase();
  if (key.includes("coffee")) return "#8B4513";
  if (key.includes("equipment")) return "#1f2937";
  if (key.includes("accessory") || key.includes("accessories")) return "#10B981";
  if (key.includes("subscription")) return "#8B5CF6";
  return "#6B7280";
}

function calculateCustomerInsights(orders: OrderDoc[]) {
  const customerMap = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    const email = order.email || order.shippingAddress?.email || "guest";
    if (!customerMap.has(email)) {
      customerMap.set(email, { orders: 0, revenue: 0 });
    }
    const customer = customerMap.get(email)!;
    customer.orders += 1;
    customer.revenue += Number(order.total || 0) - getRefundedAmountFromDoc(order);
  }

  const customers = Array.from(customerMap.values());
  const returningCustomers = customers.filter((c) => c.orders > 1).length;
  const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);
  const avgLifetimeValue = customers.length > 0 ? totalRevenue / customers.length : 0;

  return {
    totalCustomers: customerMap.size,
    returningCustomers,
    avgLifetimeValue,
  };
}

function generateMonthlyData(orders: OrderDoc[], months = 6) {
  const now = new Date();
  const monthsData: { year: number; month: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsData.push({ year: dt.getFullYear(), month: dt.getMonth() });
  }

  const monthlyMap = new Map<string, { orders: number; revenue: number; productRevenue: number; shipping: number }>();
  for (const m of monthsData) {
    monthlyMap.set(`${m.year}-${m.month}`, { orders: 0, revenue: 0, productRevenue: 0, shipping: 0 });
  }

  for (const order of orders) {
    if (!order.createdAt) continue;
    const date = new Date(order.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!monthlyMap.has(key)) continue;

    const cur = monthlyMap.get(key)!;
    const total = Number(order.total || 0);
    const ship = Number(order.shipping || 0);
    cur.orders += 1;
    cur.revenue += total;
    cur.shipping += ship;
    cur.productRevenue += Math.max(0, total - ship);
  }

  return monthsData.map((m, i) => {
    const key = `${m.year}-${m.month}`;
    const cur = monthlyMap.get(key)!;
    const prevKey = i > 0 ? `${monthsData[i - 1].year}-${monthsData[i - 1].month}` : null;
    const prev = prevKey ? monthlyMap.get(prevKey) : null;
    return {
      month: monthLabel(m.year, m.month),
      orders: cur.orders,
      revenue: Math.round(cur.revenue),
      productRevenue: Math.round(cur.productRevenue),
      shipping: Math.round(cur.shipping),
      growth: prev && prev.revenue > 0 ? calculateGrowth(cur.revenue, prev.revenue) : 0,
    };
  });
}

function calculateBestSellers(orders: OrderDoc[], limit = 5) {
  const map = new Map<string, { name: string; units: number; revenue: number; category: string; orders: Set<string> }>();

  for (const order of orders) {
    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const id = item.id ?? item.productId ?? `${item.name}-${item.category}`;
      const qty = Number(item.qty || 0);
      const revenue = Number(item.totalPrice ?? qty * (item.unitPrice ?? 0)) || 0;

      if (!map.has(id)) {
        map.set(id, { name: String(item.name || "Unknown"), units: 0, revenue: 0, category: String(item.source || item.category || "Product"), orders: new Set() });
      }
      const p = map.get(id)!;
      p.units += qty;
      p.revenue += revenue;
      p.orders.add(String(order._id));
    }
  }

  return Array.from(map.entries())
    .map(([id, d]) => ({
      id,
      name: d.name,
      unitsSold: d.units,
      revenue: Math.round(d.revenue),
      orders: d.orders.size,
      category: d.category,
      icon: d.category.toLowerCase().includes("coffee") ? "☕" : "📦",
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function formatRecentOrders(orders: OrderDoc[]) {
  return orders.map((order) => {
    const customer =
      order.shippingAddress
        ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
        : order.billingAddress
        ? `${order.billingAddress.firstName || ""} ${order.billingAddress.lastName || ""}`.trim()
        : order.email || "Guest";
    const date = order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const total = Number(order.total || 0);
    const shipping = Number(order.shipping || 0);
    return {
      id: String(order._id),
      customer,
      date,
      items: Array.isArray(order.items) ? order.items.length : 0,
      total,
      productTotal: Math.max(0, total - shipping),
      shipping,
      status: String(order.status || "pending"),
    };
  });
}

function calculateStatusDistribution(orders: OrderDoc[]) {
  return orders.reduce(
    (acc, order) => {
      const s = String(order.status || "pending").toLowerCase();
      if (s.includes("complete") || s.includes("delivered") || s.includes("shipped")) acc.completed++;
      else if (s.includes("cancel") || s.includes("refund")) acc.cancelled++;
      else acc.pending++;
      return acc;
    },
    { completed: 0, pending: 0, cancelled: 0 }
  );
}

/* ---------- Page component ---------- */

/*
  Important: searchParams can be a Promise in Next.js App Router.
  Await it before accessing properties to avoid:
  "searchParams is a Promise and must be unwrapped with await or React.use()"
*/
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}): Promise<JSX.Element> {
  const user = await requireAuth();
  await dbConnect();

  // Await searchParams in case Next.js passed a Promise
  const params = (await searchParams) ?? {};
  const { start, end, preset, startDate, endDate } = getDateRangeFromQuery(params);
  const { previousStart, previousEnd } = getPreviousPeriodRange(start, end);

  const [
    currentOrders,
    previousOrders,
    allOrdersLast12Months,
    recentOrdersRaw,
    coffeeCount,
    equipmentCount,
    totalOrdersCount,
  ] = await Promise.all([
    Order.find({ createdAt: { $gte: start, $lte: end } }).lean().exec(),
    Order.find({ createdAt: { $gte: previousStart, $lte: previousEnd } }).lean().exec(),
    Order.find({ createdAt: { $gte: new Date(new Date().getFullYear() - 1, 0, 1) } }).lean().exec(),
    Order.find({}).sort({ createdAt: -1 }).limit(15).lean().exec(),
    Coffee.countDocuments().exec().catch(() => 0),
    Equipment.countDocuments().exec().catch(() => 0),
    Order.countDocuments().exec().catch(() => 0),
  ]);

  const currentMetrics = calculatePeriodMetrics((currentOrders as unknown) as OrderDoc[]);
  const previousMetrics = calculatePeriodMetrics((previousOrders as unknown) as OrderDoc[]);

  const revenueChange = calculateGrowth(currentMetrics.net, previousMetrics.net ?? 0);
  const ordersChange = calculateGrowth(currentOrders.length, previousOrders.length ?? 0);
  const aovChange = calculateGrowth(currentMetrics.avgOrderValue, previousMetrics.avgOrderValue ?? 0);

  const categoryBreakdown = calculateCategoryBreakdown((currentOrders as unknown) as OrderDoc[]);
  const customerInsights = calculateCustomerInsights((currentOrders as unknown) as OrderDoc[]);
  const monthlyData = generateMonthlyData((allOrdersLast12Months as unknown) as OrderDoc[], 6);
  const bestSellers = calculateBestSellers((currentOrders as unknown) as OrderDoc[], 8);
  const recentOrders = formatRecentOrders((recentOrdersRaw as unknown) as OrderDoc[]);
  const statusCounts = calculateStatusDistribution((currentOrders as unknown) as OrderDoc[]);

  const totalProducts = coffeeCount + equipmentCount;

  const currentProductRevenue = Math.round(
    currentOrders.reduce((s, o) => s + Math.max(0, Number(o.total || 0) - Number(o.shipping || 0)), 0)
  );
  const previousProductRevenue = Math.round(
    previousOrders.reduce((s, o) => s + Math.max(0, Number(o.total || 0) - Number(o.shipping || 0)), 0)
  );

  const metricCards = [
    {
      label: "Net Revenue",
      value: formatCurrency(Math.round(currentMetrics.net)),
      subtitle: `${formatCurrencyDetailed(Math.round(currentMetrics.gross))} gross · ${formatCurrencyDetailed(Math.round(currentMetrics.refunded))} refunded`,
      change: revenueChange,
      trend: revenueChange >= 0 ? "up" : "down",
      gradient: "from-emerald-500 to-teal-600",
      icon: "revenue",
    },
    {
      label: "Product Revenue",
      value: formatCurrency(currentProductRevenue),
      subtitle: "Excluding delivery charges",
      change: calculateGrowth(currentProductRevenue, previousProductRevenue),
      trend: calculateGrowth(currentProductRevenue, previousProductRevenue) >= 0 ? "up" : "down",
      gradient: "from-blue-500 to-indigo-600",
      icon: "product",
    },
    {
      label: "Orders",
      value: String(currentOrders.length),
      subtitle: `${statusCounts.completed} completed · ${statusCounts.pending} pending`,
      change: ordersChange,
      trend: ordersChange >= 0 ? "up" : "down",
      gradient: "from-purple-500 to-pink-600",
      icon: "orders",
    },
    {
      label: "Avg Order Value",
      value: formatCurrency(Math.round(currentMetrics.avgOrderValue)),
      subtitle: `${formatCurrency(Math.round(currentMetrics.shipping))} avg shipping`,
      change: aovChange,
      trend: aovChange >= 0 ? "up" : "down",
      gradient: "from-amber-500 to-orange-600",
      icon: "aov",
    },
  ];

  const presets = [
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "12m", label: "12m" },
    { key: "ytd", label: "YTD" },
    { key: "all", label: "All" },
    { key: "custom", label: "Custom" },
  ];

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* HEADER (no longer sticky) */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Welcome back, {typeof user?.name === 'string' ? user.name : typeof user?.email === 'string' ? user.email : "Admin"}
                  </p>
                </div>
              </div>
            </div>

            {/* Improved filter UX:
                - Visible preset buttons (clicking a preset updates the page immediately)
                - Custom shows date inputs + apply (form GET)
                - Reset link preserved
            */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <nav aria-label="Quick period presets" className="flex flex-wrap gap-2">
                {presets.map((p) => {
                  const active = preset === p.key || (p.key === "30d" && !preset);
                  const href =
                    p.key === "custom"
                      ? `?p=custom${startDate ? `&startDate=${encodeURIComponent(startDate)}` : ""}${endDate ? `&endDate=${encodeURIComponent(endDate)}` : ""}`
                      : `?p=${p.key}`;
                  return (
                    <Link
                      key={p.key}
                      href={href}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${active ? "bg-blue-600 text-white border-transparent shadow" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
                      aria-pressed={active}
                    >
                      {p.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Custom date form: visible when user selects custom or when they provided start/end */}
              {(preset === "custom" || startDate || endDate) && (
                <form method="get" className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-md border border-gray-200" role="search" aria-label="custom date filters">
                  <input type="hidden" name="p" value="custom" />
                  <label className="sr-only" htmlFor="startDate">Start date</label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    defaultValue={startDate ?? start.toISOString().slice(0, 10)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    aria-label="Start date"
                  />
                  <label className="sr-only" htmlFor="endDate">End date</label>
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    defaultValue={endDate ?? end.toISOString().slice(0, 10)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    aria-label="End date"
                  />
                  <button type="submit" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all">
                    Apply
                  </button>
                </form>
              )}

              <Link href="/admin" className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all" aria-label="Reset filters">
                Reset
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ENHANCED METRICS GRID */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {metricCards.map((card, i) => (
              <div
                key={i}
                className="group relative bg-white rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:scale-105 overflow-hidden"
                role="region"
                aria-labelledby={`metric-${i}`}
              >
                {/* Background gradient on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg`}>
                      {card.icon === "revenue" && (
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      {card.icon === "product" && (
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      )}
                      {card.icon === "orders" && (
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      )}
                      {card.icon === "aov" && (
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      )}
                    </div>

                    {typeof card.change === "number" && (
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        card.trend === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}>
                        {card.trend === "up" ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {Math.abs(card.change)}%
                      </div>
                    )}
                  </div>

                  <div id={`metric-${i}`}>
                    <p className="text-sm font-medium text-gray-600 mb-1">{card.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mb-2">{card.value}</p>
                    <p className="text-xs text-gray-500">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ADDITIONAL QUICK STATS */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium opacity-90 mb-1">Total Customers</p>
              <p className="text-3xl font-bold mb-2">{customerInsights.totalCustomers}</p>
              <p className="text-sm opacity-80">{customerInsights.returningCustomers} returning customers</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium opacity-90 mb-1">Completed</p>
              <p className="text-3xl font-bold mb-2">{statusCounts.completed}</p>
              <p className="text-sm opacity-80">{statusCounts.pending} pending orders</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium opacity-90 mb-1">Products</p>
              <p className="text-3xl font-bold mb-2">{totalProducts}</p>
              <p className="text-sm opacity-80">{coffeeCount} coffee · {equipmentCount} equipment</p>
            </div>
          </div>
        </section>

        {/* REVENUE BREAKDOWN - ENHANCED */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Revenue Analytics</h2>
                <p className="text-sm text-gray-600 mt-1">Comprehensive revenue breakdown for selected period</p>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                <div><strong>{start.toLocaleDateString()}</strong></div>
                <div className="text-center my-1">→</div>
                <div><strong>{end.toLocaleDateString()}</strong></div>
              </div>
            </div>

            {/* Revenue cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Gross Revenue</p>
                <p className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(Math.round(currentMetrics.gross))}</p>
                <p className="text-xs text-gray-600">Before any deductions</p>
              </div>
              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-red-50 to-red-100 border border-red-200">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Refunds</p>
                <p className="text-3xl font-bold text-red-700 mb-1">-{formatCurrency(Math.round(currentMetrics.refunded))}</p>
                <p className="text-xs text-red-600">Rate: {currentMetrics.refundRate}%</p>
              </div>
              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Net Revenue</p>
                <p className="text-3xl font-bold text-emerald-700 mb-1">{formatCurrency(Math.round(currentMetrics.net))}</p>
                <p className="text-xs text-emerald-600">After refunds</p>
              </div>
            </div>

            {/* Product revenue visualization */}
            <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Product Revenue (excl. delivery)</h3>
                <div className="text-2xl font-bold text-blue-700">{formatCurrency(currentProductRevenue)}</div>
              </div>
              <div className="relative w-full bg-white rounded-full h-8 overflow-hidden shadow-inner">
                {(() => {
                  const productRev = currentProductRevenue;
                  const totalShipping = currentOrders.reduce((s, o) => s + Number(o.shipping || 0), 0);
                  const total = productRev + totalShipping;
                  const productPct = total > 0 ? Math.round((productRev / total) * 100) : 0;
                  const shippingPct = 100 - productPct;
                  return (
                    <>
                      <div className="absolute inset-0 flex">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-8 transition-all duration-500" style={{ width: `${productPct}%` }} />
                        <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-8 transition-all duration-500" style={{ width: `${shippingPct}%` }} />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-between px-4 text-white text-sm font-semibold">
                        <span>Products {productPct}%</span>
                        <span>Delivery {shippingPct}%</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="mt-3 flex justify-between text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>{formatCurrency(currentProductRevenue)} product revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>{formatCurrency(Math.round(currentOrders.reduce((s, o) => s + Number(o.shipping || 0), 0)))} delivery fees</span>
                </div>
              </div>
            </div>

            {/* Monthly trends */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Trends</h3>
              <div className="space-y-3">
                {monthlyData.map((m) => {
                  const max = Math.max(...monthlyData.map((x) => x.revenue), 1);
                  const w = Math.round((m.revenue / max) * 100);
                  return (
                    <div key={m.month} className="group">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium text-gray-700">{m.month}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-600">{m.orders} orders</span>
                          <span className="font-bold text-gray-900">{formatCurrency(m.revenue)}</span>
                          {m.growth !== 0 && (
                            <span className={`text-xs font-semibold ${m.growth > 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {m.growth > 0 ? "+" : ""}{m.growth}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-700 group-hover:from-indigo-600 group-hover:to-purple-700"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Customer insights sidebar */}
          <aside className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Quick Insights</h3>

            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
                <div className="absolute top-2 right-2 text-4xl opacity-20">👥</div>
                <p className="text-sm font-semibold text-blue-700 mb-1">Total Customers</p>
                <p className="text-3xl font-bold text-blue-900 mb-2">{customerInsights.totalCustomers}</p>
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{customerInsights.returningCustomers} returning</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
                <div className="absolute top-2 right-2 text-4xl opacity-20">✅</div>
                <p className="text-sm font-semibold text-emerald-700 mb-1">Completed</p>
                <p className="text-3xl font-bold text-emerald-900 mb-2">{statusCounts.completed}</p>
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{statusCounts.pending} pending</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
                <div className="absolute top-2 right-2 text-4xl opacity-20">⏳</div>
                <p className="text-sm font-semibold text-amber-700 mb-1">Processing</p>
                <p className="text-3xl font-bold text-amber-900 mb-2">{statusCounts.pending}</p>
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Awaiting fulfillment</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-red-50 to-red-100 border border-red-200">
                <div className="absolute top-2 right-2 text-4xl opacity-20">↩️</div>
                <p className="text-sm font-semibold text-red-700 mb-1">Cancelled/Refunded</p>
                <p className="text-3xl font-bold text-red-900 mb-2">{statusCounts.cancelled}</p>
                <div className="flex items-center gap-2 text-xs text-red-700">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>{formatCurrency(Math.round(currentMetrics.refunded))} refunded</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
                <div className="absolute top-2 right-2 text-4xl opacity-20">📊</div>
                <p className="text-sm font-semibold text-purple-700 mb-1">Refund Rate</p>
                <p className="text-3xl font-bold text-purple-900 mb-2">{currentMetrics.refundRate}%</p>
                <div className="flex items-center gap-2 text-xs text-purple-700">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>{currentMetrics.refundRate < 5 ? "Healthy" : "Needs attention"}</span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        {/* Categories & Top products */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Sales by Category</h3>
                <p className="text-sm text-gray-600 mt-1">Performance breakdown</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </div>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p>No category data for selected period</p>
              </div>
            ) : (
              <div className="space-y-4">
                {categoryBreakdown.slice(0, 6).map((c, idx) => (
                  <div key={c.category} className="group hover:bg-gray-50 p-4 rounded-xl transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div style={{ backgroundColor: c.color }} className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
                            {idx + 1}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 capitalize">{c.category}</div>
                          <div className="text-xs text-gray-600">{c.orders} orders · {c.units} units sold</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">{formatCurrency(c.revenue)}</div>
                        <div className="text-xs text-gray-600">{c.percentage}% of total</div>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        style={{ backgroundColor: c.color, width: `${c.percentage}%` }}
                        className="h-2 rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Top Products</h3>
                <p className="text-sm text-gray-600 mt-1">Best performers by revenue</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>

            {bestSellers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p>No product sales in this period</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bestSellers.map((p, idx) => (
                  <div key={p.id} className="group flex items-center justify-between p-4 rounded-xl hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 transition-all border border-transparent hover:border-amber-200">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center text-2xl shadow-md group-hover:scale-110 transition-transform">
                          {p.icon}
                        </div>
                        {idx < 3 && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 mb-0.5">{p.name}</div>
                        <div className="text-xs text-gray-600">{p.category}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(p.revenue)}</div>
                      <div className="text-xs text-gray-600">{p.unitsSold} units · {p.orders} orders</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recent orders table - Enhanced */}
        <section className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Recent Orders</h3>
              <p className="text-sm text-gray-600 mt-1">Latest {recentOrders.length} transactions</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Order ID</th>
                  <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                  <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
                  <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Items</th>
                  <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Products</th>
                  <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Shipping</th>
                  <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                  <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {o.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-gray-900">{o.customer}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">{o.date}</td>
                    <td className="py-4 px-4 text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {o.items}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(o.productTotal)}
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-gray-600">
                      {formatCurrency(o.shipping)}
                    </td>
                    <td className="py-4 px-4 text-right text-base font-bold text-gray-900">
                      {formatCurrency(o.total)}
                    </td>
                    <td className="py-4 px-4">
                      {(() => {
                        const s = (o.status || "pending").toLowerCase();
                        const isCompleted = s.includes("complete") || s.includes("delivered") || s.includes("shipped");
                        const isCancelled = s.includes("cancel") || s.includes("refund") || s.includes("void");
                        const badgeClasses = isCompleted
                          ? "bg-emerald-100 text-emerald-800"
                          : isCancelled
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800";
                        const label = isCompleted ? "Completed" : isCancelled ? "Cancelled" : (s.charAt(0).toUpperCase() + s.slice(1));
                        return (
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${badgeClasses}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}