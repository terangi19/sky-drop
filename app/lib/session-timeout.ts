import { signOut } from "firebase/auth";
import { auth } from "./firebase";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes (5 min warning)
const WARNING_DISPLAY_MS = 60 * 1000; // Show warning for 1 minute

let timeoutId: NodeJS.Timeout | null = null;
let warningTimeoutId: NodeJS.Timeout | null = null;
let lastActivityTime: number = Date.now();

/**
 * Initialize session timeout monitoring
 * Call this when the user logs in
 */
export function initSessionTimeout(onTimeout: () => void, onWarning?: () => void): void {
  resetSessionTimeout(onTimeout, onWarning);
  
  // Track user activity
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  activityEvents.forEach(event => {
    window.addEventListener(event, () => {
      lastActivityTime = Date.now();
      resetSessionTimeout(onTimeout, onWarning);
    }, { passive: true });
  });
}

/**
 * Reset the session timeout timers
 */
function resetSessionTimeout(onTimeout: () => void, onWarning?: () => void): void {
  if (timeoutId) clearTimeout(timeoutId);
  if (warningTimeoutId) clearTimeout(warningTimeoutId);
  
  // Set warning timeout
  if (onWarning) {
    warningTimeoutId = setTimeout(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity >= WARNING_TIMEOUT_MS) {
        onWarning();
      }
    }, WARNING_TIMEOUT_MS);
  }
  
  // Set logout timeout
  timeoutId = setTimeout(async () => {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity >= SESSION_TIMEOUT_MS) {
      try {
        await signOut(auth);
        onTimeout();
      } catch (e) {
        console.error('Auto-logout failed:', e);
      }
    }
  }, SESSION_TIMEOUT_MS);
}

/**
 * Clear all session timeout timers
 * Call this when the user logs out
 */
export function clearSessionTimeout(): void {
  if (timeoutId) clearTimeout(timeoutId);
  if (warningTimeoutId) clearTimeout(warningTimeoutId);
  timeoutId = null;
  warningTimeoutId = null;
  lastActivityTime = Date.now();
}

/**
 * Get remaining session time in seconds
 */
export function getSessionTimeRemaining(): number {
  const elapsed = Date.now() - lastActivityTime;
  return Math.max(0, Math.floor((SESSION_TIMEOUT_MS - elapsed) / 1000));
}
