import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Navbar from "./Components/Navbar";
import Footer from "./Components/Footer";
import LayoutWrapper from "./Components/LayoutWrapper";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

// REQUIRED: set this to your production domain (include protocol)
const SITE_URL = "https://www.coffeegenius.co.uk"; // <- change to your domain

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Coffee Genius — Specialty Coffee, Beans & Classes",
    template: "%s | Coffee Genius",
  },
  description:
    "Coffee Genius — Specialty coffee shop in Staines (TW18). Buy roasted beans, coffee gear, book barista classes and request wholesale.",
  keywords: [
    "coffee",
    "coffee beans UK",
    "buy coffee beans",
    "barista classes staines",
    "Coffee Genius",
    "Staines",
  ],
  openGraph: {
    title: "Coffee Genius — Specialty Coffee, Beans & Classes",
    description:
      "Buy freshly roasted beans, coffee gear and book barista classes at Coffee Genius — 173 High St, Staines, TW18 4PA.",
    url: SITE_URL,
    siteName: "Coffee Genius",
    images: [{ url: `${SITE_URL}/og-image.JPG`, width: 1200, height: 630 }],
    locale: "en_GB",
    type: "website",
  },
 
  icons: {
    icon: "/favicon.ico",
    other: [{ rel: "apple-touch-icon", url: "/apple-touch-icon.png" }],
  },
  alternates: {
    canonical: SITE_URL,
    // Add hreflang entries if you publish other language versions
    languages: {
      "en-GB": SITE_URL,
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  // set content-language header via server or next.config headers (example below)
};

const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Coffee Genius",
      url: SITE_URL,
      logo: `${SITE_URL}/logo-512.png`,
      sameAs: [
        "https://www.instagram.com/coffeegeniuscg",
        "https://maps.app.goo.gl/wSeAHytz5b4nP2S69" // <- replace with real
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Coffee Genius",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "CafeOrCoffeeShop",
      "@id": `${SITE_URL}/#cafe`,
      name: "Coffee Genius",
      image: `${SITE_URL}/cafe-front.jpg`,
      address: {
        "@type": "PostalAddress",
        streetAddress: "173 High St",
        addressLocality: "Staines",
        postalCode: "TW18 4PA",
        addressCountry: "GB",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: "51.4350875",
        longitude: "-0.5061624",
      },
      
      telephone: "+44-7444724389", // <- replace with real phone
      url: SITE_URL,
      priceRange: "££",
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
          ],
          opens: "07:00",
          closes: "16:00",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Saturday",
          opens: "08:30",
          closes: "16:00",
        },
        // Sunday closed -> يمكن حذفها تمامًا، Google سيفترض أنها مغلقة
      ],
      
      makesOffer: {
        "@type": "OfferCatalog",
        name: "Shop & Services",
        itemListElement: [
          { "@type": "OfferCatalog", name: "Coffee Beans" },
          { "@type": "OfferCatalog", name: "Equipment" },
          { "@type": "OfferCatalog", name: "Classes" },
          { "@type": "OfferCatalog", name: "Wholesale" },
        ],
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className={`${inter.variable} ${playfair.variable} antialiased`}>
        {/* Site-wide structured data (Organization, Website, LocalBusiness) */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }} />
        <LayoutWrapper>
          <main>{children}</main>
        </LayoutWrapper>
      </body>
    </html>
  );
}