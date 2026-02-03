import React from "react";
import { requireAuth } from "@/lib/auth";
import AdminEquipmentList from "./EquipmentAdminPage";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ./AdminEquipmentList.tsx)
  return <AdminEquipmentList sendCookies={true} />;
}