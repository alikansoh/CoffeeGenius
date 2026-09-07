"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import CreateInvoiceForm from "../../create/AdminCreateInvoice";

interface Address {
  firstName?: string;
  lastName?: string;
  line1?: string;
  unit?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface InvoiceClient {
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
}

interface Invoice {
  _id: string;
  orderNumber: string;
  client?: InvoiceClient;
  billingAddress?: Address | null;
  shippingAddress?: Address | null;
  items?: InvoiceItem[];
  shipping?: number;
  notes?: string;
  dueDate?: string;
  createdAt?: string;
  currency?: string;
  source?: "manual" | "stripe";
  paymentStatus?: "unpaid" | "paid" | "partial";
  paidAt?: string | null;
  remindersEnabled?: boolean;
  recurring?: { enabled?: boolean; dayOfMonth?: number };
}

interface FetchInvoiceResponse {
  success?: boolean;
  invoice?: Invoice;
  error?: string;
}

export default function EditInvoiceForm() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvoice() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/invoices/${id}`);
        const json: FetchInvoiceResponse = await res.json();

        if (!res.ok) {
          throw new Error(json.error || `Failed to fetch invoice (${res.status})`);
        }

        if (!json.invoice) {
          throw new Error("Invoice not found");
        }

        setInvoice(json.invoice);
      } catch (err) {
        console.error("Failed to load invoice:", err);
        setError(err instanceof Error ? err.message : "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchInvoice();
    } else {
      setError("Missing invoice ID");
      setLoading(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error || "Invoice not found"}</p>
          <a href="/admin/invoice" className="text-blue-600 hover:underline mt-4 inline-block">
            Back to invoices
          </a>
        </div>
      </div>
    );
  }

  if (invoice.source !== "manual") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Only manual invoices can be edited</p>
          <a href="/admin/invoice" className="text-blue-600 hover:underline mt-4 inline-block">
            Back to invoices
          </a>
        </div>
      </div>
    );
  }

  return <CreateInvoiceForm invoice={invoice} isEditing={true} />;
}