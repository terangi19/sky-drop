import { describe, expect, it } from "vitest";
import {
  parseUsernameForProfileSave,
  usernameOwnerState,
  usernameTypingError,
} from "./username-reservation";

describe("parseUsernameForProfileSave", () => {
  it("rejects empty usernames", () => {
    expect(parseUsernameForProfileSave("")).toEqual({
      ok: false,
      error: "Username is required",
      status: 400,
    });
    expect(parseUsernameForProfileSave("   ")).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects spaces for non-admins", () => {
    expect(parseUsernameForProfileSave("cool name")).toEqual({
      ok: false,
      error: "Usernames cannot contain spaces.",
      status: 400,
    });
  });

  it("rejects short and digit-first handles", () => {
    expect(parseUsernameForProfileSave("ab").ok).toBe(false);
    const digitFirst = parseUsernameForProfileSave("12345");
    expect(digitFirst.ok).toBe(false);
    if (!digitFirst.ok) expect(digitFirst.error).toMatch(/Start with a letter/);
  });

  it("normalizes a valid handle", () => {
    expect(parseUsernameForProfileSave("Cool_Name")).toEqual({
      ok: true,
      username: "Cool_Name",
      key: "cool_name",
    });
  });

  it("lets admins keep spaces", () => {
    expect(parseUsernameForProfileSave("Sky Drop", { allowSpaces: true })).toEqual({
      ok: true,
      username: "Sky Drop",
      key: "sky drop",
    });
  });
});

describe("usernameOwnerState", () => {
  it("treats a missing owner as available", () => {
    expect(usernameOwnerState(null, "uid-a")).toBe("available");
    expect(usernameOwnerState("", "uid-a")).toBe("available");
  });

  it("treats the same uid as owned", () => {
    expect(usernameOwnerState("uid-a", "uid-a")).toBe("owned");
  });

  it("treats a different uid as taken so the second writer cannot overwrite", () => {
    expect(usernameOwnerState("uid-a", "uid-b")).toBe("taken");
  });
});

describe("usernameTypingError", () => {
  it("does not flag an empty field while typing", () => {
    expect(usernameTypingError("")).toBe("");
    expect(usernameTypingError("   ")).toBe("");
  });

  it("flags invalid typed values so Save can stay disabled", () => {
    expect(usernameTypingError("ab")).toMatch(/at least 3 characters/);
    expect(usernameTypingError("cool name")).toMatch(/spaces/);
    expect(usernameTypingError("valid_user")).toBe("");
  });
});
