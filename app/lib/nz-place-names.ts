/**
 * Shared NZ marketplace place names.
 * Multi-word phrases first so "new plymouth" / "palmerston north" win over
 * a bare city token. Used for location harvest, title tails, and item stops.
 */

export const NZ_PLACE_ALT =
  "west\\s+auckland|east\\s+auckland|south\\s+auckland|north\\s+shore|" +
  "palmerston\\s+north|new\\s+plymouth|mount\\s+maunganui|mt\\s+maunganui|" +
  "mount\\s+eden|mt\\s+eden|grey\\s*lynn|new\\s+lynn|hibiscus\\s+coast|" +
  "lower\\s+hutt|upper\\s+hutt|hawke'?s\\s+bay|" +
  "auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|" +
  "rotorua|queenstown|nelson|whangarei|invercargill|gisborne|hastings|" +
  "taupo|blenheim|greymouth|porirua|whanganui|levin|kerikeri|timaru|" +
  "te\\s+puke|henderson|manukau|albany|newmarket|takapuna|ponsonby|" +
  "remuera|howick|botany|papakura|waitakere|massey|petone|paraparaumu|" +
  "epsom|onehunga|mangere|manurewa|papatoetoe|otahuhu|glenfield|" +
  "birkenhead|devonport|orewa|pukekohe|frankton|hillcrest";

export const NZ_PLACE_RE = new RegExp(`\\b(${NZ_PLACE_ALT})\\b`, "i");
export const NZ_PLACE_TAIL_RE = new RegExp(`\\b(${NZ_PLACE_ALT})\\b.*$`, "i");
export const NZ_PLACE_GLOBAL_RE = new RegExp(`\\b(?:${NZ_PLACE_ALT})\\b`, "gi");
