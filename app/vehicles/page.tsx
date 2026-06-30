"use client";

import BrowseCategoryPage from "../components/BrowseCategoryPage";
import { BROWSE_CATEGORY_CONFIGS } from "../lib/browse-category-config";

export default function VehiclesPage() {
  return <BrowseCategoryPage config={BROWSE_CATEGORY_CONFIGS.vehicle} />;
}
