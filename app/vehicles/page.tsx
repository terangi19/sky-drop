import BrowseCategoryPage from "../components/BrowseCategoryPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buy & Sell Vehicles NZ | Cars, Motorbikes, Boats – Sky Drop",
  description: "New Zealand's vehicle marketplace. Buy and sell cars, motorbikes, boats, caravans and more. Free to list, secure payments, local NZ marketplace.",
  keywords: "buy cars NZ, sell cars NZ, NZ vehicle marketplace, buy motorbikes NZ, sell motorbikes NZ, buy boats NZ, sell boats NZ, NZ car classifieds, Sky Drop vehicles",
};

export default function VehiclesPage() {
  return <BrowseCategoryPage configKey="vehicle" />;
}
