"use client";

import React from "react";
import Link from "next/link";
import { DollarSign, ShoppingCart, Package, ArrowUp, ArrowDown } from "lucide-react";

export interface MetricCard {
  label: string;
  value: string;
  change: number;
  // small serializable icon identifier
  iconName: "DollarSign" | "ShoppingCart" | "Package";
  bgColor: string;
  trend: "up" | "down";
}

export interface MonthlyOrderData {
  month: string;
  orders: number;
  revenue: number;
  growth: number;
}

export interface BestSellerProduct {
  id: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  icon: string;
}

export interface RecentOrder {
  id: string;
  customer: string;
  amount: number;
  status: "completed" | "processing" | "pending" | "cancelled";
  date: string;
  items: number;
}

interface Props {
  user: unknown;
  metricCards: MetricCard[];
  bestSellerProducts: BestSellerProduct[];
  recentOrders: RecentOrder[];
  monthlyOrderData: MonthlyOrderData[];
  lastUpdated: string;
}

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  light: "#f9fafb",
  white: "#ffffff",
};

function renderIcon(iconName: MetricCard["iconName"]) {
  switch (iconName) {
    case "DollarSign":
      return <DollarSign size={24} className="text-blue-600" />;
    case "ShoppingCart":
      return <ShoppingCart size={24} className="text-green-600" />;
    case "Package":
      return <Package size={24} className="text-purple-600" />;
    default:
      return null;
  }
}

const getStatusBadge = (status: string) => {
  const statusConfig: { [key: string]: { bg: string; text: string } } = {
    completed: { bg: "#d1fae5", text: "#065f46" },
    processing: { bg: "#fef3c7", text: "#92400e" },
    pending: { bg: "#fecaca", text: "#7f1d1d" },
    cancelled: { bg: "#e5e7eb", text: "#374151" },
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default function DashboardClient({
  user,
  metricCards,
  bestSellerProducts,
  recentOrders,
  monthlyOrderData,
  lastUpdated,
}: Props) {
  return (
    <div>
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metricCards.map((card, idx) => (
          <div
            key={idx}
            className="rounded-lg p-6 border border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            style={{ backgroundColor: COLORS.white }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 text-sm font-medium">{card.label}</h3>
              <div className="p-3 rounded-lg" style={{ backgroundColor: card.bgColor }}>
                {renderIcon(card.iconName)}
              </div>
            </div>
            <div className="mb-2">
              <p className="text-3xl font-bold" style={{ color: COLORS.primary }}>
                {card.value}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {card.trend === "up" ? <ArrowUp size={16} className="text-green-600" /> : <ArrowDown size={16} className="text-red-600" />}
              <p className="text-sm font-medium" style={{ color: card.trend === "up" ? COLORS.success : COLORS.danger }}>
                {Math.abs(card.change)}% from last month
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Last 3 Months Orders & Revenue Table */}
      <div className="mb-8 rounded-lg border border-gray-200" style={{ backgroundColor: COLORS.white }}>
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold" style={{ color: COLORS.primary }}>
            Last 3 Months Orders & Revenue
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: COLORS.light }}>
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold" style={{ color: COLORS.primary }}>
                  Month
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold" style={{ color: COLORS.primary }}>
                  Total Orders
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold" style={{ color: COLORS.primary }}>
                  Revenue
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold" style={{ color: COLORS.primary }}>
                  Growth
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyOrderData.map((data, idx) => (
                <tr key={idx} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium" style={{ color: COLORS.primary }}>
                    {data.month}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{data.orders.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-semibold" style={{ color: COLORS.primary }}>
                    £{data.revenue.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-1">
                      <ArrowUp size={16} className="text-green-600" />
                      <span className="text-green-600 font-semibold">{data.growth}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Best Seller Products & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Seller Products */}
        <div className="rounded-lg p-6 border border-gray-200" style={{ backgroundColor: COLORS.white }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold" style={{ color: COLORS.primary }}>
              Best Seller Products
            </h3>
            <Link href="/admin/products" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {bestSellerProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{product.icon}</div>
                  <div>
                    <p className="font-medium text-sm" style={{ color: COLORS.primary }}>
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500">{product.unitsSold} sold</p>
                  </div>
                </div>
                <p className="font-semibold text-sm" style={{ color: COLORS.primary }}>
                  £{product.revenue.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="rounded-lg p-6 border border-gray-200" style={{ backgroundColor: COLORS.white }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold" style={{ color: COLORS.primary }}>
              Recent Orders
            </h3>
            <Link href="/admin/orders" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-100 last:border-0 cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm" style={{ color: COLORS.primary }}>
                      {order.id}
                    </p>
                    <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                      {order.items} item{order.items > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{order.customer}</p>
                </div>
                <div className="text-right mr-3">
                  <p className="font-semibold text-sm" style={{ color: COLORS.primary }}>
                    £{order.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">{order.date}</p>
                </div>
                <div>{getStatusBadge(order.status)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 py-4">
        <p>Dashboard data last updated: {lastUpdated}</p>
      </div>
    </div>
  );
}