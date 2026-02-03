import React from "react";
import { requireAuth } from "@/lib/auth";
import AdminCreateClassForm from "./ClassAdminCreate";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (paste your client code into ../AdminCreateClassForm.tsx)
  return <AdminCreateClassForm sendCookies={true} />;
}