import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import AdminCreateCouponForm from "./AdminCreateCouponForm";

export default async function AdminCreateCouponPage(): Promise<JSX.Element> {
  await requireAuth();
  return <AdminCreateCouponForm />;
}