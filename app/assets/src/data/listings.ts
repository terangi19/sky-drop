export type Listing = {
  id: string;

  title: string;

  description: string;

  price: number;

  category: string;

  location: string;

  imageUrl?: string;

  sellerEmail: string;

  sellerUsername?: string;

  createdAt?: any;
};