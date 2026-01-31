import React from "react";
import type { Metadata } from "next";
import SimpleWholesaleEnquirySteps from "./WholeSaleClient";
import { notFound } from "next/navigation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const title = "Wholesale Enquiries — Coffee Genius";
  const description =
    "Wholesale enquiries for cafés, retailers and offices. Request samples, pricing and account support from Coffee Genius — quick three-step enquiry form.";

  const alternates: Metadata["alternates"] = { canonical: `${SITE_URL}/wholesale` };

  // Use the requested image at the site root (public/og-image.JPG)
  const ogImageUrl = `${SITE_URL}/og-image.JPG`;

  const openGraphImages = [
    {
      url: ogImageUrl,
      width: 1200,
      height: 630,
    },
  ];

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/wholesale`,
      siteName: "Coffee Genius",
      images: openGraphImages,
      type: "website",
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: openGraphImages.map((i) => i.url),
    },
  };
}

export default function Page() {
  const pageUrl = `${SITE_URL}/wholesale`;

  const contactJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Wholesale enquiries — Coffee Genius",
    description:
      "Wholesale enquiries for cafés, retailers and offices. Request samples, pricing and account support from Coffee Genius.",
    url: pageUrl,
    mainEntity: {
      "@type": "Organization",
      name: "Coffee Genius",
      url: SITE_URL,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "sales",
          areaServed: "GB",
          availableLanguage: ["English"],
        },
      ],
    },
    potentialAction: {
      "@type": "ContactAction",
      target: pageUrl,
      actionAccessibilityRequirement: "Complete the enquiry form",
    },
  };

  const breadcrumbJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Wholesale", item: pageUrl },
    ],
  };

  const webPageJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Wholesale — Coffee Genius",
    description:
      "Send a wholesale enquiry for roasted beans, green beans, equipment or training. Coffee Genius will respond with tailored pricing and next steps.",
    url: pageUrl,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />

      <SimpleWholesaleEnquirySteps />
    </>
  );
}