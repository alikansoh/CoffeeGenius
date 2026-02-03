import React from "react";
import { requireAuth } from "@/lib/auth";
import AdminEditClassPage from "./ClassAdminEdit";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (paste your provided client code into ./AdminEditClassPage.tsx)
  return <AdminEditClassPage />;
}