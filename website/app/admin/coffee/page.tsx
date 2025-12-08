import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import AdminCoffeeList from "./AdminCoffeeList";

export default async function AdminCoffeeListPage(): Promise<JSX.Element> {
  // ensure the user is authenticated on the server (will redirect if not)
  await requireAuth();

  return <AdminCoffeeList sendCookies={true} />;
}