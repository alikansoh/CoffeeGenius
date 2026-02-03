import React from "react";
import { requireAuth } from "@/lib/auth";
import ClientsPage from "./CustomersAdminPage";

export default async function Page() {
  // Server-side protection: will redirect / throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ./ClientsPage.tsx)
  return <ClientsPage />;
}