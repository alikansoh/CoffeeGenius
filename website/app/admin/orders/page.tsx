import React from "react";
import { requireAuth } from "@/lib/auth";
import OrdersPage from "./OrderAdminPage";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (copy your provided client code into ./OrdersPage.tsx)
  return <OrdersPage />;
}