import BrowseCategoryPage from "../components/BrowseCategoryPage";

/** Legacy browse route — digital is not a V1 sell chip; page keeps deep links / sitemap working. */
export default function DigitalPage() {
  return <BrowseCategoryPage configKey="digital" />;
}
