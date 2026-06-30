import BrowseCategoryPage from "../components/BrowseCategoryPage";
import { BROWSE_CATEGORY_CONFIGS } from "../lib/browse-category-config";

export default function PropertyPage() {
  return <BrowseCategoryPage config={BROWSE_CATEGORY_CONFIGS.property} />;
}
