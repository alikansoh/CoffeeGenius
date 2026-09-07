import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import AdminCouponsList from "./AdminCouponsList";

export default async function AdminCouponsPage(): Promise<JSX.Element> {
  await requireAuth();
  return <AdminCouponsList />;
}