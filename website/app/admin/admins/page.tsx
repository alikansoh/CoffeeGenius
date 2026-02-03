import React from "react";
import { requireAuth } from "@/lib/auth";
import UsersAdminClient from "./AdminPage";

export default async function Page() {
  // Server-side protection: will redirect / throw if not authenticated
  await requireAuth();

  // Render the client component (copy your provided client code into ./page.client.tsx)
  return <UsersAdminClient />;
}