export type BrowseCategoryTile = {
  key: string;
  emoji: string;
  label: string;
  filter?: string;
  href?: string;
};

export const BROWSE_CATEGORY_TILES: BrowseCategoryTile[] = [
  { key: "vehicles", emoji: "🚗", label: "Vehicles", href: "/vehicles" },
  { key: "services", emoji: "🛠️", label: "Services", href: "/services" },
  { key: "rentals", emoji: "🔑", label: "Rentals", href: "/rentals" },
  { key: "tech", emoji: "💻", label: "Tech", filter: "Tech" },
  { key: "gaming", emoji: "🎮", label: "Gaming", filter: "Gaming" },
  { key: "fashion", emoji: "👟", label: "Fashion", filter: "Fashion" },
  { key: "home", emoji: "🏡", label: "Home", filter: "Home" },
  { key: "collectibles", emoji: "🃏", label: "Collectibles", filter: "Collectibles" },
  { key: "sports", emoji: "⚽", label: "Sports", filter: "Sports" },
];
