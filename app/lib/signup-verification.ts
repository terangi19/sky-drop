import type { User } from "firebase/auth";

/**
 * Firebase's User object is the authority for this event. A verification email
 * being sent only proves delivery was attempted, not that the user verified it.
 */
export function isVerifiedSignupUser(user: Pick<User, "emailVerified"> | null | undefined): boolean {
  return user?.emailVerified === true;
}
