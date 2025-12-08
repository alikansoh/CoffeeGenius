'use client';

import { usePathname } from "next/navigation";
import NavBar from "./Navbar";
import Footer from "./Footer";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''; // Fixes the TS warning

  const isAdminRoute = pathname.startsWith("/admin")||pathname.startsWith("/login") ;

  if (isAdminRoute) {
    return <>{children}</>; // No navbar/footer on admin pages
  }

  return (
    <>
      <NavBar />
      {children}
      <Footer />
    </>
  );
}