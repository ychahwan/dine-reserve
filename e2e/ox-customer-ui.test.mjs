import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("OX-H-05 defers per-card subscriptions until near-viewport and reuses batched restaurant data", async () => {
  const explore = await source("src/pages/Explore.tsx");

  // A visibility gate (IntersectionObserver) must exist so cards outside the
  // viewport don't open live subscriptions at all.
  assert.match(explore, /IntersectionObserver/);

  // The remaining per-card queries (rating/capacity + wait signal) must be
  // gated on that visibility state, not run unconditionally for every card.
  const cardComponent = explore.slice(explore.indexOf("const RestaurantCard"));
  assert.match(cardComponent, /useQuery\(api\.restaurants\.card,\s*inView\s*\?/);
  assert.match(cardComponent, /useQuery\(api\.analytics\.publicWaitSignal,\s*inView\s*\?/);

  // The main results grid already has full restaurant docs from the batched
  // search query — cards must reuse that instead of waiting on a query for
  // name/image/cuisine/city.
  assert.match(cardComponent, /restaurant\?:/);
  assert.match(explore, /visible\.map\(\(r\)\s*=>\s*\(\s*<RestaurantCard[\s\S]{0,120}restaurant=\{r\}/);
});

test("OX-M-24 scopes the offline booking cache to the authenticated user and clears it on sign-out/delete", async () => {
  const [myBookings, account, shell] = await Promise.all([
    source("src/pages/MyBookings.tsx"),
    source("src/pages/Account.tsx"),
    source("src/components/CustomerShell.tsx"),
  ]);

  // Cache key must be scoped by user id, not a fixed global key.
  assert.match(myBookings, /offlineBookingsKey\(/);
  assert.doesNotMatch(myBookings, /localStorage\.(get|set)Item\(\s*"kamix:offline-bookings"\s*[,)]/);

  // A shared clear helper must exist and be exported for sign-out/delete paths.
  assert.match(myBookings, /export function clearOfflineBookingsCache/);

  // Every sign-out / account-delete path must call it.
  assert.match(account, /clearOfflineBookingsCache/);
  assert.match(shell, /clearOfflineBookingsCache/);
});

test("OX-M-25 / OX-L-26 customer images use no-referrer policy and lazy/async decoding with stable layout", async () => {
  const files = [
    "src/pages/Explore.tsx",
    "src/pages/RestaurantDetail.tsx",
    "src/pages/MyBookings.tsx",
    "src/pages/Account.tsx",
    "src/pages/Invite.tsx",
    "src/components/SocializeDialog.tsx",
  ];
  const texts = await Promise.all(files.map(source));
  for (const [i, text] of texts.entries()) {
    const images = text.match(/<img\b[\s\S]*?\/>/g) ?? [];
    assert.ok(images.length > 0, `expected <img> tags in ${files[i]}`);
    for (const image of images) {
      assert.match(image, /referrerPolicy="no-referrer"/, `${files[i]}: ${image}`);
      assert.match(image, /decoding="async"/, `${files[i]}: ${image}`);
    }
  }
});

test("OX-L-22 gates demo seeding on the true unfiltered empty-database signal", async () => {
  const explore = await source("src/pages/Explore.tsx");
  const effect = explore.slice(
    explore.indexOf("Seed demo data once"),
    explore.indexOf("const visible = useMemo"),
  );
  // The effect must only decide seeding from the very first (unfiltered)
  // evaluation, never re-triggering off a later filtered zero-result state.
  assert.match(effect, /if \(searchWithFilters === undefined \|\| seeded\) return;/);
  assert.match(effect, /setSeeded\(true\)/);
});

test("OX-L-23 memoizes the walk-in picker filter instead of filtering twice per render", async () => {
  const explore = await source("src/pages/Explore.tsx");
  assert.match(explore, /const pickerResults = useMemo/);
  const dialogBody = explore.slice(
    explore.indexOf("Walk-in restaurant picker (M-25)"),
    explore.indexOf("{/* Search */}"),
  );
  assert.doesNotMatch(dialogBody, /visible\s*\n?\s*\.filter/);
  assert.match(dialogBody, /pickerResults\.length === 0/);
  assert.match(dialogBody, /pickerResults\s*\n?\s*\.map/);
});

test("OX-L-24 skips the presence subscription until a Socialize booking is active", async () => {
  const dialog = await source("src/components/SocializeDialog.tsx");
  assert.match(dialog, /useQuery\(\s*api\.socialize\.myPresence,\s*booking\s*\?\s*\{\}\s*:\s*"skip"\s*\)/);
});

test("OX-L-25 paginates reviews and computes the rating distribution once", async () => {
  const detail = await source("src/pages/RestaurantDetail.tsx");
  assert.match(detail, /const ratingDistribution = useMemo/);
  assert.match(detail, /REVIEW_PAGE_SIZE/);
  assert.match(detail, /Show more/);
  // The distribution must be read from the memoized map, not refiltered
  // inline per star in JSX.
  const barsBlock = detail.slice(
    detail.indexOf("{[5, 4, 3, 2, 1].map((star) => {"),
    detail.indexOf("{/* Review filter chips"),
  );
  assert.doesNotMatch(barsBlock, /reviewsData\.reviews\.filter/);
});
