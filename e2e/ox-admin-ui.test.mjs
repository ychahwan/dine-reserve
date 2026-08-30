import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("CSV cells neutralize formulas and remove unsafe controls", async () => {
  const helpers = await import(
    new URL("../src/lib/use-table-pagination.ts", import.meta.url)
  );
  assert.equal(typeof helpers.sanitizeCsvCell, "function");

  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    const value = helpers.sanitizeCsvCell(`${prefix}=1+1`);
    assert.equal(
      value.startsWith("'"),
      true,
      `prefix ${JSON.stringify(prefix)} was not neutralized`,
    );
    assert.doesNotMatch(value, /[\u0000-\u001f\u007f]/);
  }
  assert.equal(helpers.sanitizeCsvCell("safe\u0000\u0007value"), "safevalue");
  assert.equal(helpers.sanitizeCsvCell("ordinary"), "ordinary");
});

test("both admin CSV exporters use the shared sanitizer", async () => {
  for (const path of [
    "src/pages/admin/AdminRestaurantDetail.tsx",
    "src/pages/admin/AdminAudit.tsx",
  ]) {
    const text = await source(path);
    assert.match(text, /sanitizeCsvCell/);
    assert.match(
      text,
      /\.map\(\(cell\)\s*=>\s*`"\$\{sanitizeCsvCell\(cell\)\.replace/s,
    );
  }
});

test("restaurant detail uses stable hoisted extractors", async () => {
  const text = await source("src/pages/admin/AdminRestaurantDetail.tsx");
  assert.doesNotMatch(text, /extractValue=\{\s*\(/);
  for (const name of [
    "extractBookingValue",
    "extractOrderValue",
    "extractReviewValue",
    "extractAssistValue",
    "extractMenuRequestValue",
  ]) {
    assert.match(text, new RegExp(`function ${name}\\(`));
    assert.match(text, new RegExp(`extractValue=\\{${name}\\}`));
  }
});

test("admin list processing is capped and text filtering is deferred", async () => {
  for (const path of [
    "src/pages/admin/AdminUsers.tsx",
    "src/pages/admin/AdminRestaurants.tsx",
    "src/pages/admin/AdminReviews.tsx",
  ]) {
    const text = await source(path);
    assert.match(text, /capAdminRows/);
    assert.match(text, /useDeferredValue/);
  }
});

test("audit facets do not trigger a second audit-log query", async () => {
  const text = await source("src/pages/admin/AdminAudit.tsx");
  assert.equal((text.match(/useQuery\(api\.admin\.auditLog/g) ?? []).length, 1);
});

test("production root errors expose only a generic reference", async () => {
  const text = await source("src/main.tsx");
  assert.match(text, /import\.meta\.env\.DEV/);
  assert.match(text, /Reference: KMX-UI-ROOT/);
  assert.match(text, /Something went wrong/);
});

test("camera and notification defaults bound mobile memory", async () => {
  const camera = await source("src/hooks/use-camera.ts");
  assert.match(camera, /quality: 70/);
  assert.match(camera, /width: 1600/);
  assert.match(camera, /height: 1600/);

  const push = await source("src/hooks/use-push-notifications.ts");
  assert.match(push, /MAX_RECENT_NOTIFICATIONS = 50/);
  assert.match(push, /slice\(0, MAX_RECENT_NOTIFICATIONS\)/);
});

test("bounded parallel helper never exceeds its concurrency", async () => {
  const helpers = await import(
    new URL("../src/lib/use-table-pagination.ts", import.meta.url)
  );
  assert.equal(typeof helpers.runBoundedParallel, "function");

  let active = 0;
  let peak = 0;
  const results = await helpers.runBoundedParallel(
    [1, 2, 3, 4, 5, 6, 7],
    3,
    async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (value === 5) throw new Error("expected failure");
      return value * 2;
    },
  );

  assert.equal(peak, 3);
  assert.equal(results.length, 7);
  assert.equal(results[4].status, "rejected");
  assert.deepEqual(
    results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value),
    [2, 4, 6, 8, 12, 14],
  );
});

test("review deletion uses bounded parallel execution", async () => {
  const text = await source("src/pages/admin/AdminReviews.tsx");
  assert.match(text, /runBoundedParallel\(\s*selectedReviewIds,\s*4,/);
});

test("review detail uses the dedicated by-id backend contract (OX-M-32)", async () => {
  // `adminView.reviewById` now exists and is used directly instead of the
  // bounded recent-reviews list + `.find()` workaround, so reviews older
  // than the list cap remain reachable.
  const adminView = await source("src/convex/adminView.ts");
  assert.match(adminView, /export const reviewById = query/);

  const text = await source("src/pages/admin/AdminReviewDetail.tsx");
  assert.match(text, /OX-M-32/);
  assert.match(text, /useQuery\(\s*api\.adminView\.reviewById,/);
});
