import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Listing Details",
    description: "View listing details on Sky Drop — New Zealand's community marketplace.",
    openGraph: {
      title: "Sky Drop — Listing Details",
      description: "Browse and buy with confidence on Sky Drop.",
      url: `https://skydrop.nz/post/listing/${id}`,
    },
  };
}

export default function ListingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
