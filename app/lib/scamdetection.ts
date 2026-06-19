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

  // Obfuscation patterns to catch attempts to bypass keyword detection
  const obfuscationPatterns = [
    /\bw\.h\.a\.t\.s\.a\.p\b/i,
    /\bt\.e\.l\.e\.g\.r\.a\.m\b/i,
    /\bw\s*@\s*h\s*@\s*t\s*@\s*s\s*@\s*a\s*@\s*p\b/i,
    /\bt\s*@\s*e\s*@\s*l\s*@\s*e\s*@\s*g\s*@\s*r\s*@\s*a\s*@\s*m\b/i,
    /\bb[\s\W]*a[\s\W]*n[\s\W]*k[\s\W]*t[\s\W]*r[\s\W]*a[\s\W]*n[\s\W]*s[\s\W]*f[\s\W]*e[\s\W]*r\b/i,
    /\bc[\s\W]*r[\s\W]*y[\s\W]*p[\s\W]*t[\s\W]*o\b/i,
    /\bbit[\s\W]*coin\b/i,
    /\bus[\s\W]*dt\b/i,
    /\bg[\s\W]*i[\s\W]*f[\s\W]*t[\s\W]*c[\s\W]*a[\s\W]*r[\s\W]*d\b/i,
    /\bf[\s\W]*r[\s\W]*i[\s\W]*e[\s\W]*n[\s\W]*d[\s\W]*s[\s\W]*f[\s\W]*a[\s\W]*m[\s\W]*i[\s\W]*l[\s\W]*y\b/i,
    /\b[\s\W]*@\s*[\s\W]*g[\s\W]*m[\s\W]*a[\s\W]*i[\s\W]*l[\s\W]*\.[\s\W]*c[\s\W]*o[\s\W]*m\b/i,
  ];

  const foundKeywords = scamKeywords.filter((keyword) => lowerText.includes(keyword));
  
  const foundObfuscations: string[] = [];
  for (const pattern of obfuscationPatterns) {
    const match = text.match(pattern);
    if (match) {
      foundObfuscations.push(match[0]);
    }
  }

  const totalMatches = foundKeywords.length + foundObfuscations.length;
  const severity = totalMatches >= 3 ? "high" : totalMatches >= 1 ? "medium" : "low";

  return {
    isScam: totalMatches > 0,
    keywords: foundKeywords,
    obfuscations: foundObfuscations,
    severity,
  };
}
