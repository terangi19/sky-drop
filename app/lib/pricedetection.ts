const CATEGORY_THRESHOLDS: Record<string, number> = {
  Cars: 1000,
  Tech: 50,
  Gaming: 30,
  Fashion: 20,
  Home: 20,
  Sports: 20,
  Property: 10000,
  Electronics: 20,
  Phones: 50,
  Clothing: 10,
  Books: 5,
  Jewellery: 20,
  Furniture: 30,
};

export function detectSuspiciousPrice(price: number, category?: string): boolean {
  if (!category || !CATEGORY_THRESHOLDS[category]) return false;
  return price < CATEGORY_THRESHOLDS[category];
}
