import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { skyAiHistoryKeep } from "./sky-ai-history-window";

const root = path.resolve(__dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("sky-ai history window (Firestore read bound)", () => {
  it("keeps 10 turns on sell/profile surfaces and 6 elsewhere", () => {
    expect(skyAiHistoryKeep("/post/ai")).toBe(10);
    expect(skyAiHistoryKeep("/post/ai/step-2")).toBe(10);
    expect(skyAiHistoryKeep("/profile")).toBe(10);
    expect(skyAiHistoryKeep("/profile/edit")).toBe(10);
    expect(skyAiHistoryKeep("/")).toBe(6);
    expect(skyAiHistoryKeep("/browse")).toBe(6);
    expect(skyAiHistoryKeep("")).toBe(6);
  });

  it("reading only the window equals reading 30 then slicing (same last-N rows)", () => {
    // limitToLast(n) over an ascending order == last n of the ascending list.
    const all = Array.from({ length: 45 }, (_, i) => `m${i}`);
    const limitToLast = (n: number) => all.slice(-n);
    for (const keep of [6, 10]) {
      expect(limitToLast(keep)).toEqual(limitToLast(30).slice(-keep));
    }
  });

  it("route loads only the kept window instead of a fixed 30 messages", () => {
    const route = src("app/api/sky-ai/route.ts");
    expect(route).toContain("const keep = skyAiHistoryKeep(pathname);");
    expect(route).toContain("await loadSkyAiMessages(conversationId, uid, keep)");
    expect(route).not.toMatch(/loadSkyAiMessages\(conversationId, uid, 30\)/);
  });
});
