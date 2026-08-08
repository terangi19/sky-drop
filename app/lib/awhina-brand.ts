/** User-facing assistant brand — Māori for help / assistance */
export const AWHINA_NAME = "Āwhina";

export const AWHINA_INTRO = `I'm ${AWHINA_NAME}, your Sky Drop assistant.`;

export const AWHINA_ASK_LABEL = `Ask ${AWHINA_NAME} Anything`;

/** Short launcher label — shown on desktop pill; a11y on mobile icon. */
export const AWHINA_LAUNCHER_LABEL = `Ask ${AWHINA_NAME}`;

export const AWHINA_THINKING = `${AWHINA_NAME} is thinking…`;

export const AWHINA_REQUEST_FAILED = `${AWHINA_NAME} request failed`;

export const AWHINA_UNAVAILABLE = `${AWHINA_NAME} unavailable`;

/** Injected into system prompts — never use legacy Sky AI / Sky names in replies */
export const AWHINA_BRANDING_RULE = `Your name is **${AWHINA_NAME}** only. Never call yourself Sky AI, Sky Drop AI, or Sky. If users say "Sky AI", they mean you.`;
