import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time check of a Vercel Cron `Authorization` header against `Bearer ${secret}`.
 * Length mismatch -> false (timingSafeEqual needs equal-length buffers). Empty secret -> false.
 */
export function isAuthorizedCronRequest(header: string | null | undefined, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(header, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
