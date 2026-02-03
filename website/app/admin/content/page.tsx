import React from "react";
import { requireAuth } from "@/lib/auth";
import OffersAdminPage from "./OffersAdminPage";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ./OffersAdminPage.tsx)
  return <OffersAdminPage />;
}