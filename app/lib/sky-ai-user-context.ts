export type SkyAiUserContext = {
  isSeller: boolean;
  listingCount: number;
  isVerified: boolean;
  memberDays: number;
};

export function formatSkyAiUserContextBlock(user: SkyAiUserContext | null): string {
  if (!user) return "";
  const parts: string[] = [];
  if (user.isSeller) parts.push("seller");
  if (user.isVerified) parts.push("verified");
  if (user.listingCount > 0) parts.push(`${user.listingCount} listings`);
  if (user.memberDays > 0) parts.push(`member ${user.memberDays}d`);
  return parts.length ? `\n\nUser context: ${parts.join(", ")}.` : "";
}
