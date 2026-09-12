import { normalizeUsernameInput, validateUsername } from "./username";

export class UsernameTakenError extends Error {
  constructor(message = "Username already taken") {
    super(message);
    this.name = "UsernameTakenError";
  }
}

export function isUsernameTakenError(error: unknown): boolean {
  return (
    error instanceof UsernameTakenError ||
    (error instanceof Error && error.name === "UsernameTakenError") ||
    (error instanceof Error && error.message === "Username already taken")
  );
}

/** How a usernames/{key} document relates to the requester. */
export function usernameOwnerState(
  existingUid: string | null | undefined,
  requesterUid: string
): "available" | "owned" | "taken" {
  if (!existingUid) return "available";
  if (existingUid === requesterUid) return "owned";
  return "taken";
}

export function parseUsernameForProfileSave(
  raw: unknown,
  opts?: { allowSpaces?: boolean }
): { ok: true; username: string; key: string } | { ok: false; error: string; status: 400 } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Username is required", status: 400 };
  }
  if (trimmed.includes(" ")) {
    if (!opts?.allowSpaces) {
      return { ok: false, error: "Usernames cannot contain spaces.", status: 400 };
    }
    return { ok: true, username: trimmed, key: trimmed.toLowerCase() };
  }
  const validation = validateUsername(trimmed);
  if (!validation.valid) {
    return { ok: false, error: validation.error || "Invalid username", status: 400 };
  }
  const username = normalizeUsernameInput(trimmed);
  return { ok: true, username, key: username.toLowerCase() };
}

/** Inline field error while typing. Empty input is not an error until save. */
export function usernameTypingError(raw: string, opts?: { allowSpaces?: boolean }): string {
  const typed = raw.trim();
  if (!typed) return "";
  const parsed = parseUsernameForProfileSave(typed, opts);
  return parsed.ok ? "" : parsed.error;
}
