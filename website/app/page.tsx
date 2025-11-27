import Image from "next/image";
import Hero from "./Components/Hero";
import FeaturedCoffee from "./Components/FeautredCoffee";
import  Sections from "./Components/FeautredSections";
import WholesaleSection from "./Components/WholesaleSection";
import GoogleReviews from "./Components/GoogleReviews";
export default function Home() {
  return (
    <main>
      <Hero/>
      <FeaturedCoffee />
      <Sections />
      <WholesaleSection />
      <GoogleReviews />

    </main>
  );
}
