const DISMISSED_KEY = "awhina-fab-hint-dismissed";

export function shouldShowAwhinaFabHint(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DISMISSED_KEY) !== "1";
}

export function dismissAwhinaFabHint(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, "1");
}
