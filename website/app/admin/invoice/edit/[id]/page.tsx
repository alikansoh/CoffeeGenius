import { requireAuth } from "@/lib/auth";
import EditInvoiceForm from "./EditInvoiceForm";

export default async function Page() {
  await requireAuth();
  return <EditInvoiceForm />;
}