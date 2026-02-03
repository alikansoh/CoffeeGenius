"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  FaChartBar,
  FaUsers,
  FaShoppingCart,
  FaCoffee,
  FaBox,
  FaCog,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaBlog,
  FaBolt,
  FaUserTie,
  FaGraduationCap,
  FaFileAlt,
  FaMugHot,
  FaReceipt,
} from "react-icons/fa";
import { TbCodeVariablePlus } from "react-icons/tb";

const COLORS = {
  primary: "#111827",
  accent: "#6b7280",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  light: "#f9fafb",
  white: "#ffffff",
};

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  category?: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userInfo, setUserInfo] = useState({ userName: "", mounted: false });
  const router = useRouter();
  const pathname = usePathname();

  const logoSrc = "/logo.png";

  // Get user name from localStorage on component mount
  useEffect(() => {
    const storedUserName = localStorage.getItem("username");
    const updateUserInfo = () => {
      setUserInfo({
        userName: storedUserName || "",
        mounted: true,
      });
    };
    updateUserInfo();
  }, []);

  // Logout handler that calls the logout API to clear the httpOnly cookie
  const handleLogout = async () => {
    try {
      const res = await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!res.ok) {
        console.error("Logout failed", await res.text());
        return;
      }

      localStorage.removeItem("username");

      router.replace("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <FaChartBar size={20} />,
      href: "/admin",
      category: "main",
    },
    {
      id: "coffee",
      label: "Coffee",
      icon: <FaCoffee size={20} />,
      href: "/admin/coffee",
      category: "commerce",
    },
    {
      id: "Coffee-Variants",
      label: "Coffee Variants",
      icon: <TbCodeVariablePlus size={20} />,
      href: "/admin/coffee/variant",
      category: "commerce",
    },
    {
      id: "wholesale",
      label: "Wholesale",
      icon: <FaBox size={20} />,
      href: "/admin/wholesale",
      category: "commerce",
    },
    {
      id: "orders",
      label: "Orders",
      icon: <FaShoppingCart size={20} />,
      href: "/admin/orders",
      category: "commerce",
    },
    {
      id: "customers",
      label: "Customers",
      icon: <FaUsers size={20} />,
      href: "/admin/customers",
      category: "community",
    },
    {
      id: "classes",
      label: "Classes",
      icon: <FaGraduationCap size={20} />,
      href: "/admin/classes",
      category: "community",
    },
    {
      id: "equipment",
      label: "Equipment",
      icon: <FaMugHot size={20} />,
      href: "/admin/equipment",
      category: "commerce",
    },
    {
      id: "blog",
      label: "Blog",
      icon: <FaBlog size={20} />,
      href: "/admin/blog",
      category: "content",
    },
    {
      id: "content",
      label: "content",
      icon: <FaFileAlt size={20} />,
      href: "/admin/content",
      category: "content",
    },
    {
      id: "Invoice",
      label: "Invoice ",
      icon: <FaReceipt size={20} />,
      href: "/admin/invoice",
      category: "settings",
    },
    {
      id: "admins",
      label: "Admins",
      icon: <FaUserTie size={20} />,
      href: "/admin/admins",
      category: "settings",
    },
    {
      id: "delivery-settings",
      label: "settings",
      icon: <FaBolt size={20} />,
      href: "/admin/settings/",
      category: "settings",
    },
  ];

  const isActive = (href: string) => pathname === href;

  // Group menu items by category
  const groupedMenuItems = {
    main: menuItems.filter((item) => item.category === "main"),
    commerce: menuItems.filter((item) => item.category === "commerce"),
    community: menuItems.filter((item) => item.category === "community"),
    content: menuItems.filter((item) => item.category === "content"),
    settings: menuItems.filter((item) => item.category === "settings"),
  };

  return (
    <div
      className="flex h-screen bg-gray-50"
      style={{ backgroundColor: COLORS.light }}
    >
      {/* SIDEBAR */}
      <div
        className={`fixed lg:sticky top-0 left-0 h-screen z-40 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 w-64 border-r border-gray-200 overflow-y-auto`}
        style={{ backgroundColor: COLORS.white, borderRightColor: "#e5e7eb" }}
      >
        {/* Logo Section */}
        <div
          className="p-6 border-b border-gray-200 sticky top-0 flex items-center justify-between gap-3"
          style={{ backgroundColor: COLORS.white }}
        >
          <Link href="/admin" className="flex items-center gap-3 cursor-pointer">
            <Image
              src={logoSrc}
              alt="Logo"
              width={40}
              height={40}
              className="object-contain"
            />
            <div>
              <h1 className="text-lg font-bold" style={{ color: COLORS.primary }}>
                Coffee Admin
              </h1>
              <p className="text-xs text-gray-500">Dashboard</p>
            </div>
          </Link>

          {/* Mobile close button: visible on small screens to dismiss the sidebar */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="px-4 space-y-6 py-6">
          {/* Main Dashboard */}
          {groupedMenuItems.main.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer block ${
                isActive(item.href)
                  ? "bg-gray-100 font-semibold"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
              style={{
                color: isActive(item.href) ? COLORS.primary : "inherit",
              }}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Commerce Section */}
          {groupedMenuItems.commerce.length > 0 && (
            <div>
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Commerce
              </p>
              {groupedMenuItems.commerce.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer block ${
                    isActive(item.href)
                      ? "bg_gray-100 font-semibold"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                  style={{
                    color: isActive(item.href) ? COLORS.primary : "inherit",
                  }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Customers & Community Section */}
          {groupedMenuItems.community.length > 0 && (
            <div>
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Community
              </p>
              {groupedMenuItems.community.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer block ${
                    isActive(item.href)
                      ? "bg-gray-100 font-semibold"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                  style={{
                    color: isActive(item.href) ? COLORS.primary : "inherit",
                  }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Content & Resources Section */}
          {groupedMenuItems.content.length > 0 && (
            <div>
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Content
              </p>
              {groupedMenuItems.content.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer block ${
                    isActive(item.href)
                      ? "bg-gray-100 font-semibold"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                  style={{
                    color: isActive(item.href) ? COLORS.primary : "inherit",
                  }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Settings Section with Cog Icon */}
          {groupedMenuItems.settings.length > 0 && (
            <div>
              <div className="px-4 mb-3 flex items-center gap-2">
                <FaCog size={14} className="text-gray-500" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Configuration
                </p>
              </div>
              {groupedMenuItems.settings.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer block ${
                    isActive(item.href)
                      ? "bg-gray-100 font-semibold"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                  style={{
                    color: isActive(item.href) ? COLORS.primary : "inherit",
                  }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* Logout Button */}
        <div className="">
          <button
            onClick={handleLogout}
            className="w-full flex mb-2 items-center justify-center sm:justify-start gap-2 px-4 py-3 rounded-lg font-medium text-white transition-colors duration-200 hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: COLORS.primary }}
          >
            <FaSignOutAlt size={20} />
            <span className=" sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar - Fixed */}
        <div
          className="flex-shrink-0 border-b border-gray-200 bg-white px-3 sm:px-6 lg:px-8 py-3 sm:py-4 z-30"
          style={{ backgroundColor: COLORS.white, borderBottomColor: "#e5e7eb" }}
        >
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                {sidebarOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
              </button>
              <div className="min-w-0">
                <h2
                  className="text-lg sm:text-2xl font-bold truncate"
                  style={{ color: COLORS.primary }}
                >
                  {menuItems.find((item) => isActive(item.href))?.label ||
                    "Dashboard"}
                </h2>
              </div>
            </div>
            <div className="flex-shrink-0">
              {userInfo.mounted && userInfo.userName && (
                <p className="text-xs sm:text-sm text-gray-600 text-right">
                  Welcome,{" "}
                  <span
                    className="font-semibold"
                    style={{ color: COLORS.primary }}
                  >
                    {userInfo.userName}
                  </span>
                  !
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Page Content - Scrollable */}
        <div className="flex-1 overflow-auto p-3 sm:p-6 lg:p-8">
          {children}
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}