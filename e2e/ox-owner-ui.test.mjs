import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("OX-M-26 uses atomic addBlockedUser/removeBlockedUser mutations", async () => {
  const [tabs, restaurant, socialize] = await Promise.all([
    source("src/components/OwnerRestaurantTabs.tsx"),
    source("src/pages/OwnerRestaurant.tsx"),
    source("src/convex/socialize.ts"),
  ]);

  assert.doesNotMatch(tabs, /blockedUserIds:\s*next/);
  assert.doesNotMatch(restaurant, /blockedUserIds:\s*\(data\?/);
  assert.match(tabs, /api\.socialize\.addBlockedUser/);
  assert.match(tabs, /api\.socialize\.removeBlockedUser/);
  assert.match(socialize, /export const addBlockedUser = mutation/);
  assert.match(socialize, /export const removeBlockedUser = mutation/);
});

test("OX-M-27 uses openCounts for every closed-tab dining badge", async () => {
  const dining = await source("src/components/OwnerDiningTabs.tsx");
  const counter = dining.slice(
    dining.indexOf("export function DiningTabCount"),
    dining.indexOf("/** Booking line"),
  );

  assert.match(counter, /api\.dining\.openCounts/);
  assert.doesNotMatch(counter, /api\.dining\.restaurantOrders/);
});

test("OX-M-28 dashboard cards consume listMine summaries without per-card queries", async () => {
  const dashboard = await source("src/pages/OwnerDashboard.tsx");
  const card = dashboard.slice(
    dashboard.indexOf("function OwnerRestaurantCard"),
  );

  assert.match(
    dashboard,
    /restaurants\.map\(\(restaurant\)\s*=>[\s\S]{0,80}<OwnerRestaurantCard/,
  );
  assert.doesNotMatch(card, /useQuery\(api\.restaurants\.get/);
  assert.doesNotMatch(card, /useQuery\(api\.bookings\.byRestaurant/);
});

test("OX-M-29 debounces searches and bounds every owner history render", async () => {
  const [restaurant, dining, gifts, notifications] = await Promise.all([
    source("src/components/OwnerRestaurantTabs.tsx"),
    source("src/components/OwnerDiningTabs.tsx"),
    source("src/components/OwnerGiftsTab.tsx"),
    source("src/components/OwnerNotificationsTab.tsx"),
  ]);

  assert.match(restaurant, /useDebouncedValue/);
  assert.match(restaurant, /OWNER_LIST_PAGE_SIZE/);
  assert.match(dining, /OWNER_LIST_PAGE_SIZE/);
  assert.match(gifts, /OWNER_LIST_PAGE_SIZE/);
  assert.match(notifications, /OWNER_LIST_PAGE_SIZE/);
  for (const text of [restaurant, dining, gifts, notifications]) {
    assert.match(text, /Show more/);
  }
});

test("OX-L-27/28/31 confirms masked CSV export, strips controls, and defers revoke", async () => {
  const tabs = await source("src/components/OwnerRestaurantTabs.tsx");

  assert.match(tabs, /[Mm]asked contact details/);
  assert.match(tabs, /[\[]\\u0000-\\u001f\\u007f[\]]/);
  assert.ok(tabs.includes("^[=+\\-@]"));
  assert.match(tabs, /window\.setTimeout\(\(\)\s*=>\s*URL\.revokeObjectURL/);
  assert.match(tabs, /<AlertDialogTitle[^>]*>\s*Export customer data\?/);
});

test("OX-L-29/30 gates signed-out and non-owner content before child tabs mount", async () => {
  const [shell, restaurant, dashboard] = await Promise.all([
    source("src/components/OwnerShell.tsx"),
    source("src/pages/OwnerRestaurant.tsx"),
    source("src/pages/OwnerDashboard.tsx"),
  ]);

  assert.match(shell, /if \(user === null\)/);
  assert.match(restaurant, /function OwnerRestaurantContent/);
  assert.match(restaurant, /isOwner\s*\?\s*\(/);
  assert.match(dashboard, /function OwnerDashboardContent/);
});

test("OX-L-32 gives every owner image lazy loading, async decoding, and dimensions", async () => {
  const texts = await Promise.all([
    source("src/pages/OwnerDashboard.tsx"),
    source("src/pages/OwnerRestaurant.tsx"),
    source("src/components/OwnerMenuTab.tsx"),
  ]);

  for (const text of texts) {
    const images = text.match(/<img\b[\s\S]*?\/>/g) ?? [];
    assert.ok(images.length > 0);
    for (const image of images) {
      assert.match(image, /loading="lazy"/);
      assert.match(image, /decoding="async"/);
      assert.match(image, /width=\{\d+\}/);
      assert.match(image, /height=\{\d+\}/);
    }
  }
});
