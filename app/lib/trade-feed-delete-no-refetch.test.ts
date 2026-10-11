import { describe, expect, it, vi } from "vitest";
import { createLatestWins } from "./latest-wins";

type Post = { id: string };

/**
 * Behavioural model of the trade-feed posts state (app/trade-feed/page.tsx):
 * fetchPosts = guarded poll (setPosts only if latest); deleteTrade = API call, then on ok
 * invalidate in-flight polls + remove locally; on failure nothing changes.
 */
function makeFeed(initial: Post[]) {
  const guard = createLatestWins();
  let posts = [...initial];
  const reads = { count: 0 };
  async function fetchPosts(server: () => Promise<Post[]>) {
    const isLatest = guard.begin();
    const snap = await server();
    reads.count += snap.length;
    if (!isLatest()) return;
    posts = snap;
  }
  async function deleteTrade(id: string, api: () => Promise<{ ok: boolean }>, toast: (m: string) => void) {
    const result = await api();
    if (!result.ok) toast("Couldn't delete");
    else {
      guard.invalidate();
      posts = posts.filter((p) => p.id !== id);
    }
  }
  return { fetchPosts, deleteTrade, get posts() { return posts; }, reads };
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("trade-feed delete without a full refetch", () => {
  it("successful delete removes the post locally and costs zero feed reads", async () => {
    const feed = makeFeed([{ id: "a" }, { id: "b" }]);
    await feed.deleteTrade("a", async () => ({ ok: true }), vi.fn());
    expect(feed.posts.map((p) => p.id)).toEqual(["b"]);
    expect(feed.reads.count).toBe(0);
  });

  it("failed delete keeps the post and shows an error", async () => {
    const toast = vi.fn();
    const feed = makeFeed([{ id: "a" }, { id: "b" }]);
    await feed.deleteTrade("a", async () => ({ ok: false }), toast);
    expect(feed.posts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("a poll that read the post before the delete cannot put it back", async () => {
    const feed = makeFeed([{ id: "a" }, { id: "b" }]);
    const stale = deferred<Post[]>();
    const poll = feed.fetchPosts(() => stale.promise); // started before the delete
    await feed.deleteTrade("a", async () => ({ ok: true }), vi.fn());
    stale.resolve([{ id: "a" }, { id: "b" }]); // still contains the deleted post
    await poll;
    expect(feed.posts.map((p) => p.id)).toEqual(["b"]);
    // the next poll (after the delete) applies normally
    await feed.fetchPosts(async () => [{ id: "b" }, { id: "c" }]);
    expect(feed.posts.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("invalidate() does not break later fetches", () => {
    const g = createLatestWins();
    const a = g.begin();
    g.invalidate();
    expect(a()).toBe(false);
    const b = g.begin();
    expect(b()).toBe(true);
  });
});
