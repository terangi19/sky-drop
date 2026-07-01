import BrowseCategoryPage from "../components/BrowseCategoryPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Rentals NZ | Houses, Apartments, Flats – Sky Drop",
  description: "New Zealand property rentals. Find houses, apartments, flats and rooms for rent. List your property for free on NZ's community marketplace.",
  keywords: "rentals NZ, property rentals NZ, rent house NZ, rent apartment NZ, flat for rent NZ, room for rent NZ, NZ property marketplace, Sky Drop property",
};

export default function PropertyPage() {
  return <BrowseCategoryPage configKey="property" />;
}
