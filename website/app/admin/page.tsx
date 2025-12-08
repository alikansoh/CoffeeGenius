import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import DashboardClient, {
  MetricCard,
  MonthlyOrderData,
  BestSellerProduct,
  RecentOrder,
} from "./dashbordClient";

export default async function DashboardPage(): Promise<JSX.Element> {
  const user = await requireAuth();

  const metricCards: MetricCard[] = [
    {
      label: "Total Revenue",
      value: "£45,231.89",
      change: 12.5,
      iconName: "DollarSign",
      bgColor: "#dbeafe",
      trend: "up",
    },
    {
      label: "Total Orders",
      value: "1,248",
      change: 8.2,
      iconName: "ShoppingCart",
      bgColor: "#dcfce7",
      trend: "up",
    },
    {
      label: "Total Products",
      value: "342",
      change: -2.4,
      iconName: "Package",
      bgColor: "#f3e8ff",
      trend: "down",
    },
  ];

  const bestSellerProducts: BestSellerProduct[] = [
    {
      id: "1",
      name: "Ethiopian Yirgacheffe",
      category: "Coffee Beans",
      unitsSold: 324,
      revenue: 5184,
      icon: "☕",
    },
    {
      id: "2",
      name: "Espresso Machine Pro",
      category: "Equipment",
      unitsSold: 45,
      revenue: 13495,
      icon: "🤖",
    },
    {
      id: "3",
      name: "Colombian Supremo",
      category: "Coffee Beans",
      unitsSold: 289,
      revenue: 5482,
      icon: "☕",
    },
    {
      id: "4",
      name: "Manual Coffee Grinder",
      category: "Equipment",
      unitsSold: 156,
      revenue: 14004,
      icon: "⚙️",
    },
  ];

  const recentOrders: RecentOrder[] = [
    {
      id: "ORD-2025-001",
      customer: "John Smith",
      amount: 125.5,
      status: "completed",
      date: "Dec 3, 2:45 PM",
      items: 3,
    },
    {
      id: "ORD-2025-002",
      customer: "Sarah Johnson",
      amount: 89.99,
      status: "processing",
      date: "Dec 3, 1:20 PM",
      items: 2,
    },
    {
      id: "ORD-2025-003",
      customer: "Mike Chen",
      amount: 299.75,
      status: "pending",
      date: "Dec 2, 11:30 AM",
      items: 1,
    },
    {
      id: "ORD-2025-004",
      customer: "Emma Wilson",
      amount: 156.0,
      status: "completed",
      date: "Dec 2, 9:15 AM",
      items: 4,
    },
    {
      id: "ORD-2025-005",
      customer: "David Brown",
      amount: 42.5,
      status: "completed",
      date: "Dec 1, 4:50 PM",
      items: 1,
    },
  ];

  const monthlyOrderData: MonthlyOrderData[] = [
    { month: "October", orders: 1045, revenue: 38250, growth: 8.5 },
    { month: "November", orders: 1156, revenue: 42180, growth: 10.2 },
    { month: "December", orders: 1248, revenue: 45231, growth: 12.5 },
  ];

  const lastUpdated = new Date().toLocaleString();

  return (
    <div className="space-y-8">
      <DashboardClient
        user={user}
        metricCards={metricCards}
        bestSellerProducts={bestSellerProducts}
        recentOrders={recentOrders}
        monthlyOrderData={monthlyOrderData}
        lastUpdated={lastUpdated}
      />
    </div>
  );
}