import React from "react";
import { requireAuth } from "@/lib/auth";
import PostsAdminPage from "./BlogAdmin";

export default async function Page() {
  // Server-side protection: will redirect or throw if not authenticated
  await requireAuth();

  // Render the client component (copy your provided client code into ./PostsAdminPage.tsx)
  return <PostsAdminPage />;
}