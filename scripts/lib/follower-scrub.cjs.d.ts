export declare const ALLOWED_KEYS: readonly string[];
export declare function planFollowerScrub(
  docId: string,
  data: Record<string, unknown> | null | undefined
): { docId: string; deleteKeys: string[]; issues: string[] };
export declare function parseCliArgs(argv: string[]): { apply: boolean; pageSize: number };
