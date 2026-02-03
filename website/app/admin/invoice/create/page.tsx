import React from "react";
import { requireAuth } from "@/lib/auth";
import CreateInvoiceForm from "./AdminCreateInvoice";

export default async function Page() {
  // Server-side protection: will redirect / throw if not authenticated
  await requireAuth();

  // Render the client component (copy your provided client code into ./CreateInvoiceForm.tsx)
  return <CreateInvoiceForm />;
}