const DISMISSED_KEY = "awhina-chat-intro-dismissed";
const NEVER_KEY = "awhina-chat-intro-never";

/** Whether the first-time Āwhina intro should appear. */
export function shouldShowAwhinaIntro(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(NEVER_KEY) === "1") return false;
  if (localStorage.getItem(DISMISSED_KEY) === "1") return false;
  return true;
}

/** Persist intro dismissal. `neverAgain` sets the explicit opt-out from the checkbox. */
export function dismissAwhinaIntro(neverAgain = false): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, "1");
  if (neverAgain) localStorage.setItem(NEVER_KEY, "1");
}
