export const KYC_OBJECT_PREFIXES: string[];
export const DEFAULT_BUCKET: string;
export const LEGACY_BUCKET: string;
export const KNOWN_BUCKETS: string[];
export const DOWNLOAD_URL_FIELDS: string[];

export function isSensitiveObjectPath(value: unknown): boolean;
export function parseSensitiveStoragePath(value: unknown): string | null;
export function isFirebaseDownloadUrlWithToken(value: unknown): boolean;
export function objectHasDownloadToken(
  metadata: { metadata?: Record<string, unknown> } | null | undefined
): boolean;
export function downloadTokenClearMetadata(): {
  metadata: { firebaseStorageDownloadTokens: null };
};
export function planFirestoreScrub(data: Record<string, unknown> | null | undefined): {
  changed: boolean;
  storagePath: string | null;
  deleteFields: string[];
  setFields: Record<string, string>;
};
export function parseCliArgs(argv: string[]): { apply: boolean; help: boolean };
