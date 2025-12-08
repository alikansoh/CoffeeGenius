import React, { JSX } from "react";
import { requireAuth } from "@/lib/auth";
import CreateVariantsPage from "./CreateVariantsPage";

export default async function CreateVariantsRoute(): Promise<JSX.Element> {
  // server-side auth redirect if not authenticated
  await requireAuth();

  // render the client component and ensure it will include cookies by default
  return <CreateVariantsPage sendCookies={true} />;
}