export function detectScam(text: string) {
  const lowerText = text.toLowerCase();

  const scamKeywords = [
    "bank transfer only",
    "crypto only",
    "pay outside",
    "whatsapp",
    "telegram",
    "gift card",
    "urgent payment",
    "friends and family",
    "shipping agent",
    "wire transfer",
    "cashapp",
    "western union",
    "send money first",
    "pay before viewing",
    "urgent sale",
    "too good to be true",
    "dm privately",
    "no refunds",
  ];

  const foundKeywords = scamKeywords.filter((keyword) => lowerText.includes(keyword));

  const severity = foundKeywords.length >= 3 ? "high" : foundKeywords.length >= 1 ? "medium" : "low";

  return {
    isScam: foundKeywords.length > 0,
    keywords: foundKeywords,
    severity,
  };
}
