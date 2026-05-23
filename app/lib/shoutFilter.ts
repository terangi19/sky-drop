const BANNED_WORDS = [
  "fuck", "fucking", "fucked", "fucker", "fucks",
  "shit", "shitting", "shitted", "shits",
  "bitch", "bitches", "bitching",
  "asshole", "assholes",
  "bastard", "bastards",
  "cock", "cocks",
  "cunt", "cunts",
  "dick", "dicks", "dickhead",
  "motherfucker", "motherfucking",
  "piss", "pissing", "pissed",
  "whore", "whores",
  "slut", "sluts",
  "nigger", "nigga",
  "fag", "faggot",
  "retard", "retarded",
];

export function checkShout(text: string): { clean: boolean; word?: string } {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (regex.test(lower)) {
      return { clean: false, word };
    }
  }
  return { clean: true };
}
