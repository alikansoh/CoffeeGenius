import React from "react";
import type { Metadata } from "next";
import ContactClient from "./ContactClient";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const OG_IMAGE = "/og-image.JPG"; // ensure this file exists in the public/ directory

export async function generateMetadata(): Promise<Metadata> {
  const pageUrl = `${SITE_URL}/contact`;
  const title = "Contact — Coffee Genius";
  const description =
    "Get in touch with Coffee Genius. Call, email, or use our contact form to ask about equipment, wholesale, classes or general enquiries.";

  const ogUrl = `${SITE_URL}${OG_IMAGE}`;
  const alternates: Metadata["alternates"] = { canonical: pageUrl };

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Coffee Genius",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default function Page() {
  const pageUrl = `${SITE_URL}/contact`;
  const imageUrl = `${SITE_URL}${OG_IMAGE}`;

  const contactJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact — Coffee Genius",
    description:
      "Get in touch with Coffee Genius for enquiries about coffee, equipment, wholesale, and events.",
    url: pageUrl,
    mainEntity: {
      "@type": "Organization",
      name: "Coffee Genius",
      url: SITE_URL,
      telephone: "+447444724389",
      email: "hello@coffeegenius.example",
      address: {
        "@type": "PostalAddress",
        streetAddress: "173 High Street",
        addressLocality: "Staines",
        postalCode: "TW18 4PA",
        addressCountry: "GB",
      },
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "hello@coffeegenius.example",
          telephone: "+447444724389",
          availableLanguage: ["English"],
        },
      ],
    },
    potentialAction: {
      "@type": "ContactAction",
      target: pageUrl,
      actionAccessibilityRequirement: "Complete the contact form",
    },
  };

  const breadcrumbJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Contact", item: pageUrl },
    ],
  };

  const webPageJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Contact — Coffee Genius",
    description:
      "Contact Coffee Genius by phone, email, or using our contact form. Visit us at 173 High Street, Staines, TW18 4PA.",
    url: pageUrl,
    image: [imageUrl],
  };

  return (
    <>
      {/* Structured data for search engines */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />

      {/* Client UI: move your client component to app/contact/ContactClient.tsx and keep it unchanged */}
      <ContactClient />
    </>
  );
}