// Dev-only mock auth — bypasses Firebase Auth for local testing
// Enable by adding ?dev=1 to the URL or setting NEXT_PUBLIC_DEV_AUTH=true in .env.local

let mockUser: { uid: string; email: string; emailVerified: boolean } | null = null;

export function getMockUser() {
  return mockUser;
}

export function setMockUser(email: string) {
  mockUser = {
    uid: `dev_${email.replace(/[^a-zA-Z0-9]/g, "_")}`,
    email,
    emailVerified: true,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem("devMockUser", email);
  }
  return mockUser;
}

export function clearMockUser() {
  mockUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("devMockUser");
  }
}

export function isDevAuthEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEV_AUTH === "true") return true;
  return window.location.search.includes("dev=1");
}

export function restoreMockUser(): boolean {
  if (!isDevAuthEnabled()) return false;
  if (mockUser) return true;
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("devMockUser");
    if (saved) {
      setMockUser(saved);
      return true;
    }
  }
  return false;
}
