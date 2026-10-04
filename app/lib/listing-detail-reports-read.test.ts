import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library).
 * firestore.rules: `reports` is readable only by admins and by a report's own
 * reporter (`resource.data.reporterUserId == request.auth.uid`) and `create` is
 * server-only. The public listing detail page therefore must not query `reports`
 * from the browser: it was always denied with "Missing or insufficient permissions".
 */
const page = readFileSync(path.join(process.cwd(), "app/post/listing/[id]/page.tsx"), "utf8");
const rules = readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");

describe("listing detail does not read the private reports collection (client)", () => {
  it("has no client query on the reports collection", () => {
    expect(page).not.toMatch(/collection\(\s*db\s*,\s*["']reports["']/);
    expect(page).not.toContain("Failed to fetch reports");
    expect(page).not.toContain("setSellerReportsCount");
  });

  it("still renders the Report listing flow (button + ReportModal) unchanged", () => {
    expect(page).toContain("Report listing");
    expect(page).toContain("setShowReportModal(true)");
    expect(page).toContain("<ReportModal");
    // logged-out users still go through the login return with intent=report
    expect(page).toContain("&intent=report");
  });

  it("rules still keep reports private (guard: this PR must not need a rules change)", () => {
    const block = rules.slice(rules.indexOf("match /reports/{reportId}"));
    const end = block.indexOf("match /tradePosts");
    const reports = block.slice(0, end);
    expect(reports).toContain("allow create: if false;");
    expect(reports).toMatch(/isAdmin\(\)\s*\|\|\s*resource\.data\.reporterUserId == request\.auth\.uid/);
    expect(reports).not.toMatch(/allow read:\s*if true/);
  });
});
