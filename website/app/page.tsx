import Image from "next/image";
import Navbar from "./Components/Navbar";
import Hero from "./Components/Hero";
import FeaturedCoffee from "./Components/FeautredCoffee";
import  Sections from "./Components/FeautredSections";
export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero/>
      <FeaturedCoffee />
      <Sections />
    </main>
  );
}
