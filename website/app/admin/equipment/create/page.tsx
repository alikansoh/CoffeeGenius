import React from "react";
import { requireAuth } from "@/lib/auth";
import AdminCreateEquipmentPage from "./CreateEquipmentPage";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ../AdminCreateEquipmentPage.tsx)
  return <AdminCreateEquipmentPage sendCookies={true} />;
}