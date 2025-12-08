import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import AdminEditCoffeePage from "./AdminEditCoffeeForm";

export default async function AdminEditCoffeeRoute({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  // server-side auth redirect if not authenticated
  await requireAuth();

  // render the client component (keeps the client file exactly as you provided)
  return <AdminEditCoffeePage />;
}