import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import AdminCreateCoffeeForm from "./AdminCreateCoffeeForm";

export default async function AdminCreateCoffeePage(): Promise<JSX.Element> {
  // ensure the user is authenticated on the server (will redirect if not)
  await requireAuth();

  // render the client form component and ensure cookies are sent by default
  return <AdminCreateCoffeeForm sendCookies={true} />;
}
