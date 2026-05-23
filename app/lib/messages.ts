export function getMessagesUrl(sellerEmail: string) {
  return `/messages?seller=${encodeURIComponent(sellerEmail)}`;
}
