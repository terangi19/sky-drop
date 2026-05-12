export function detectScam(text: string) {
  const lowerText =
    text.toLowerCase();

  const scamKeywords = [
    "telegram",
    "whatsapp only",
    "crypto only",
    "wire transfer",
    "bank transfer only",
    "gift cards",
    "western union",
    "send money first",
    "pay before viewing",
    "urgent sale",
    "too good to be true",
    "dm privately",
    "no refunds",
    "cashapp",
    "paypal friends and family",
  ];

  const foundKeywords =
    scamKeywords.filter(
      (keyword) =>
        lowerText.includes(
          keyword
        )
    );

  return {
    isScam:
      foundKeywords.length > 0,

    keywords:
      foundKeywords,
  };
}