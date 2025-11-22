import Image from "next/image";
import Navbar from "./Components/Navbar";
import Hero from "./Components/Hero";
import FeaturedCoffee from "./Components/FeautredCoffee";
export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero/>
      <FeaturedCoffee />
    </main>
  );
}
