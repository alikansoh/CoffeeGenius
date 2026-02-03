import React from "react";
import { requireAuth } from "@/lib/auth";
import AdminEditEquipmentPage from "./AdminEquipmentEdit";

export default async function Page() {
  // Server-side protection: will redirect / throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ./AdminEditEquipmentPage.tsx)
  return <AdminEditEquipmentPage />;
}