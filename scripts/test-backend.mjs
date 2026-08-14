#!/usr/bin/env node
/**
 * Kamix — executable backend test suite (Node).
 *
 * Drives the exact Convex functions the UI calls against the live deployment
 * using `convex run` with `--identity` to simulate signed-in diners/owners.
 *
 *   node scripts/test-backend.mjs            # run everything
 *   PHASE=1 node scripts/test-backend.mjs     # discovery + auth + E2E booking
 *   PHASE=2 node scripts/test-backend.mjs     # queue / waitlist / notifications
 *   PHASE=3 node scripts/test-backend.mjs     # reviews / security / claim-demo
 *
 * scripts/test-backend.sh is the bash equivalent for local machines.
 *
 * Notes:
 * - Mutations like addSection return a bare id, so those scenarios verify via
 *   inline queries — the same reads the UI performs.
 * - The CLI prints nothing for `null` results, so the signed-out auth check
 *   asserts that no user doc leaks instead of expecting the literal "null".
 * - Review/claim scenarios tolerate a previous run having already mutated the
 *   seeded demo data (already-reviewed booking, already-claimed restaurant).
 * - Harness restaurants (created by earlier runs) are cleaned up by name at
 *   the start, so search assertions stay deterministic. Only restaurants whose
 *   *name* matches the harness pattern are removed — real demo/user
 *   restaurants are never touched.
 * - Phase 2 is self-resetting: leftover confirmed 21:30 bookings on the harness
 *   restaurant are cancelled first so every run starts with exactly 2 free
 *   seats, and D-1 uses a fresh diner subject per run because `waitlist:join`
 *   is idempotent per (user, slot).
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { logLine, check, checkAbsent, checkAny, runfn, iq, iqPairs, id, summary } from "./lib/runner.mjs";

const STATE_FILE = "/tmp/kamix-test-state.json";
const PHASE = process.env.PHASE || "all";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ fixtures
const now = new Date();
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = fmt(now);
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW = fmt(tomorrow);

const uid = (email) =>
  iq(
    `const u = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "${email}")).first(); return u?._id;`,
  );
const rid = (name) =>
  iq(
    `const r = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("name"), "${name}")).first(); return r?._id;`,
  );

const TRULLO = rid("Trullo");
const CASA = rid("Casa Oliva");
const MARCO = uid("marco@seatly.demo");
const AVA = uid("ava@seatly.demo");
const LEO = uid("leo@seatly.demo");
const PARIS = iq(
  `const r = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("city"), "Paris")).first(); return r?._id;`,
);
const AVATRULLO = iq(
  `const b = await ctx.db.query("bookings").collect(); const x = b.find((x) => x.code === "AV4K2P"); return x?._id;`,
);
const AVASAKURA = iq(
  `const b = await ctx.db.query("bookings").collect(); const x = b.find((x) => x.code === "SA3T9Q"); return x?._id;`,
);

let RID = "";
if (existsSync(STATE_FILE)) {
  RID = JSON.parse(readFileSync(STATE_FILE, "utf8")).rid || "";
}

/**
 * Remove restaurants left behind by earlier runs of this suite / the UI-flow
 * suite. Matched by NAME ("Test Harness Table", "UI Flow Test …") so real
 * demo and user restaurants are never touched, no matter who owns them.
 */
function cleanupHarnessRestaurants() {
  const pairs = iqPairs(
    `const rs = await ctx.db.query("restaurants").collect(); return rs.filter((r) => r.name.startsWith("Test Harness Table") || r.name.startsWith("UI Flow Test")).map((r) => ({ _id: r._id, ownerId: r.ownerId }));`,
  );
  for (const { id: rId, owner } of pairs) {
    if (!owner) continue;
    runfn("restaurants:remove", JSON.stringify({ id: rId }), "--identity", id(owner));
  }
  if (pairs.length > 0) logLine(`clean | removed ${pairs.length} leftover harness restaurant(s)`);
}

/**
 * Cancel leftover confirmed 21:30 bookings on the harness restaurant so the
 * C-5 overflow race always starts from a full 2-seat slot. Cancelling restores
 * seats (the same path C-6 exercises), and the cancelled rows are excluded
 * from the confirmed-count assertion.
 */
function resetSlotState() {
  const leftovers = iqPairs(
    `const b = await ctx.db.query("bookings").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", "${RID}").eq("date", "${TOMORROW}")).collect(); return b.filter((x) => x.time === "21:30" && x.status === "confirmed").map((x) => ({ _id: x._id, ownerId: x.userId }));`,
  );
  for (const { id: bid, owner } of leftovers) {
    if (!owner) continue;
    runfn("bookings:cancelBooking", JSON.stringify({ bookingId: bid }), "--identity", id(owner));
  }
  if (leftovers.length > 0) logLine(`reset | cancelled ${leftovers.length} leftover 21:30 booking(s)`);
}

// ================================================================= PHASE 1
if (PHASE === "all" || PHASE === "1") {
  logLine("── Phase 1 · discovery · auth · E2E booking ──────────────────────────");
  cleanupHarnessRestaurants();

  check("B-1 search lists restaurants", "Sakura House", "restaurants:search", "{}");
  check("B-2 cuisine filter", "Trullo", "restaurants:search", '{"cuisine":"Italian"}');
  checkAbsent("B-2b cuisine excludes", "Sakura", "restaurants:search", '{"cuisine":"Italian"}');
  check("B-3 city filter", "La Brasa", "restaurants:search", '{"city":"Rome"}');
  check("B-4 solo filter", "Sakura House", "restaurants:search", '{"solo":true}');
  checkAbsent("B-4b solo excludes Trullo", "Trullo", "restaurants:search", '{"solo":true}');
  check("B-5 dietary filter", "Casa Oliva", "restaurants:search", '{"dietary":"vegan"}');
  check("B-6 free-text search", "Sakura House", "restaurants:search", '{"q":"omakase"}');

  // B-7: the CLI renders `restaurants:get` nested menu items as `[Array]`, so
  // the menu-item assertion reads the menuItems table — the same rows the
  // detail page resolves and displays.
  check(
    "B-7 restaurant detail (menu)",
    "Cacio e pepe",
    "--inline-query",
    `const its = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${TRULLO}")).collect(); return its.map((i) => i.name);`,
  );
  check("B-8 availability forDate", "sections", "availability:forDate", JSON.stringify({ restaurantId: TRULLO, date: TODAY }));

  check("AUTH identity maps to user", "Marco Bianchi", "users:currentUser", "{}", "--identity", id(MARCO));
  // The CLI prints nothing for a null result, so assert the negative: signed-out
  // currentUser must not leak any user doc (no name / email / role fields).
  checkAbsent("AUTH signed-out reveals no user", "email", "users:currentUser", "{}");

  check("E-1 owner sees bookings", "AV4K2P", "bookings:byRestaurant", JSON.stringify({ restaurantId: TRULLO }), "--identity", id(MARCO));
  check("E-2 non-owner sees nothing", "[]", "bookings:byRestaurant", JSON.stringify({ restaurantId: TRULLO }), "--identity", id(AVA));
  check("E-3 insights stats", "covers: 6", "bookings:stats", JSON.stringify({ restaurantId: TRULLO, days: 30 }), "--identity", id(MARCO));
  check("E-4 cancellation policy", "cancellationPolicyHours: 24", "restaurants:setCancellationPolicy", JSON.stringify({ restaurantId: TRULLO, hours: 24 }), "--identity", id(MARCO));

  check("G-3 dining preferences", "prefs", "users:updateProfile", '{"prefs":{"dietary":["Vegetarian","Vegan"],"seating":["inside","outside"],"occasions":["birthday"]}}', "--identity", id(AVA));
  // Deterministic favorites: clear leftover state first.
  const casaFav = iq(
    `const u = await ctx.db.get("${AVA}"); return { fav: (u?.favorites ?? []).includes("${CASA}") };`,
  );
  if (casaFav.includes("true")) {
    runfn("users:toggleFavorite", JSON.stringify({ restaurantId: CASA }), "--identity", id(AVA));
  }
  check("G-4a favorite on", "favorited: true", "users:toggleFavorite", JSON.stringify({ restaurantId: CASA }), "--identity", id(AVA));
  check("G-4b favorite off", "favorited: false", "users:toggleFavorite", JSON.stringify({ restaurantId: CASA }), "--identity", id(AVA));

  // C-1: `restaurants:create` returns a bare id in this container, so the
  // creation is verified through the same read the owner dashboard performs.
  runfn(
    "restaurants:create",
    '{"name":"Test Harness Table","cuisine":"Test","city":"Testville","address":"1 Test St","features":{"inside":true,"outside":false,"bar":false,"smoking":false,"parking":false,"liveMusic":false,"soloFriendly":true}}',
    "--identity",
    id("test-owner-1"),
  );
  RID = iq(
    `const r = await ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", "test-owner-1")).order("desc").first(); return r?._id;`,
  );
  writeFileSync(STATE_FILE, JSON.stringify({ rid: RID, tomorrow: TOMORROW }));
  check(
    "C-1 owner creates restaurant",
    "Test Harness Table",
    "--inline-query",
    `const r = await ctx.db.get("${RID}"); return { name: r?.name };`,
  );

  runfn(
    "restaurants:addSection",
    JSON.stringify({ restaurantId: RID, name: "Tasting counter", kind: "inside", smoking: false, capacity: 2 }),
    "--identity",
    id("test-owner-1"),
  );
  check(
    "C-2a 2-seat section added",
    "Tasting counter",
    "--inline-query",
    `const s = await ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return s.map((x) => x.name);`,
  );
  const DEFSEC = iq(
    `const s = await ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).filter((q) => q.eq(q.field("name"), "Main dining room")).first(); return s?._id;`,
  );
  runfn("restaurants:deleteSection", JSON.stringify({ id: DEFSEC }), "--identity", id("test-owner-1"));
  check(
    "C-2b default section removed (1 left)",
    "1",
    "--inline-query",
    `const s = await ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return { count: s.length };`,
  );
  runfn(
    "restaurants:saveHours",
    JSON.stringify({
      restaurantId: RID,
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: "17:00", close: "22:00", enabled: true })),
    }),
    "--identity",
    id("test-owner-1"),
  );
  check(
    "C-2c hours saved (7 days)",
    "7",
    "--inline-query",
    `const h = await ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return { count: h.length };`,
  );
  check(
    "C-3 slots materialize",
    "created: 10",
    "availability:ensureForDate",
    JSON.stringify({ restaurantId: RID, date: TOMORROW }),
    "--identity",
    id("test-owner-1"),
  );
  check(
    "C-4 direct booking 19:00",
    "status: 'confirmed'",
    "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "19:00", partySize: 2, name: "Test Diner One" }),
    "--identity",
    id("test-diner-1"),
  );
  check(
    "C-8 invalid party size",
    "Party size must be between 1 and 20",
    "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "19:00", partySize: 0, name: "Nope" }),
    "--identity",
    id("test-diner-1"),
  );
  check(
    "C-9 signed-out booking",
    "Please sign in to book",
    "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "19:00", partySize: 2, name: "Nope" }),
  );
  check("C-10 owner sees E2E booking", "Test Diner One", "bookings:byRestaurant", JSON.stringify({ restaurantId: RID }), "--identity", id("test-owner-1"));
}

// ================================================================= PHASE 2
if (PHASE === "all" || PHASE === "2") {
  logLine("── Phase 2 · queue · waitlist · notifications ────────────────────────");
  if (!RID) {
    logLine("SKIP  | phase 2 needs phase 1 state (RID missing)");
    process.exit(1);
  }
  resetSlotState();

  // C-5 queue: 4 diners race for the last 2 seats at 21:30 (no later fallback)
  for (const d of ["test-diner-2", "test-diner-3", "test-diner-4", "test-diner-5"]) {
    runfn(
      "queue:enqueue",
      JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "21:30", partySize: 1, name: d }),
      "--identity",
      id(d),
    );
  }
  await sleep(10000);
  check(
    "C-5 queue books exactly 2",
    "total: 2",
    "--inline-query",
    `const b = await ctx.db.query("bookings").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", "${RID}").eq("date", "${TOMORROW}")).collect(); return { total: b.filter((x) => x.time === "21:30" && x.status === "confirmed").length };`,
  );
  check("C-5b overflow diner failed", "failed", "queue:myEntries", "{}", "--identity", id("test-diner-4"));

  // D-1: waitlist:join returns a bare id and is idempotent per (user, slot), so
  // use a fresh diner subject per run and verify the entry via a read.
  const wlDiner = `test-diner-6-${Date.now()}`;
  runfn(
    "waitlist:join",
    JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "21:30", partySize: 1, name: "Test Diner Six" }),
    "--identity",
    id(wlDiner),
  );
  const WLID = iq(
    `const w = await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", "${wlDiner}")).first(); return w?._id;`,
  );
  check(
    "D-1 join waitlist (sold out)",
    "waiting",
    "--inline-query",
    `const w = await ctx.db.get("${WLID}"); return { status: w?.status };`,
  );

  const D2BOOK = iq(
    `const b = await ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", "test-diner-2")).order("desc").first(); return b?._id;`,
  );
  check(
    "C-6 cancellation restores seats",
    "status: 'cancelled'",
    "bookings:cancelBooking",
    JSON.stringify({ bookingId: D2BOOK }),
    "--identity",
    id("test-diner-2"),
  );
  check("D-2 waitlist promoted", "notified", "waitlist:byRestaurant", JSON.stringify({ restaurantId: RID }), "--identity", id("test-owner-1"));

  check("D-3 auto booking event", "booking_created", "notifications:forRestaurant", JSON.stringify({ restaurantId: RID }), "--identity", id("test-owner-1"));
  const D1BOOK = iq(
    `const b = await ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", "test-diner-1")).order("desc").first(); return b?._id;`,
  );
  // sendForBooking returns the booking — verify the alert through myAlerts.
  check(
    "D-4 diner check-in alert",
    "status: 'confirmed'",
    "notifications:sendForBooking",
    JSON.stringify({ bookingId: D1BOOK, type: "on_my_way" }),
    "--identity",
    id("test-diner-1"),
  );
  check("D-4b alert visible in myAlerts", "on_my_way", "notifications:myAlerts", "{}", "--identity", id("test-diner-1"));
  check(
    "D-5a unread badge > 0",
    "ok: true",
    "--inline-query",
    `const n = await ctx.db.query("notifications").withIndex("by_restaurant_read", (q) => q.eq("restaurantId", "${RID}").eq("read", false)).collect(); return { ok: n.length > 0 };`,
  );
  runfn("notifications:markAllRead", JSON.stringify({ restaurantId: RID }), "--identity", id("test-owner-1"));
  check(
    "D-5b mark all read clears badge",
    "unread: 0",
    "--inline-query",
    `const n = await ctx.db.query("notifications").withIndex("by_restaurant_read", (q) => q.eq("restaurantId", "${RID}").eq("read", false)).collect(); return { unread: n.length };`,
  );

  // G-1/G-2 need a booking with headroom — the 19:00 booking fills its 2-cap
  // slot, so host a fresh party of one at 20:00 and confirm the guest on it.
  runfn(
    "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: TOMORROW, time: "20:00", partySize: 1, name: "Guest Host" }),
    "--identity",
    id("test-diner-8"),
  );
  const GBOOK = iq(
    `const b = await ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", "test-diner-8")).order("desc").first(); return b?._id;`,
  );
  check(
    "G-1 guest confirms seat",
    "Nadia",
    "bookings:confirmGuest",
    JSON.stringify({ bookingId: GBOOK, name: "Nadia" }),
    "--identity",
    id("test-diner-7"),
  );
  check(
    "G-2 duplicate guest rejected",
    "already confirmed",
    "bookings:confirmGuest",
    JSON.stringify({ bookingId: GBOOK, name: "Nadia" }),
    "--identity",
    id("test-diner-7"),
  );
}

// ================================================================= PHASE 3
if (PHASE === "all" || PHASE === "3") {
  logLine("── Phase 3 · reviews · security · claim-demo ─────────────────────────");

  check(
    "F-1 owner marks visit completed",
    "status: 'completed'",
    "bookings:updateStatus",
    JSON.stringify({ bookingId: AVATRULLO, status: "completed" }),
    "--identity",
    id(MARCO),
  );
  // Repeatable: a previous run may have already reviewed AV4K2P.
  checkAny(
    "F-2 verified review created (or already reviewed)",
    ["rating: 5", "already reviewed"],
    "reviews:create",
    JSON.stringify({ bookingId: AVATRULLO, rating: 5, text: "Harness test review." }),
    "--identity",
    id(AVA),
  );
  check(
    "F-3 one review per booking",
    "already reviewed",
    "reviews:create",
    JSON.stringify({ bookingId: AVATRULLO, rating: 4 }),
    "--identity",
    id(AVA),
  );
  check(
    "F-4a can't review others' visit",
    "only review your own visits",
    "reviews:create",
    JSON.stringify({ bookingId: AVATRULLO, rating: 5 }),
    "--identity",
    id(LEO),
  );
  check(
    "F-4b can't review future visit",
    "after your visit",
    "reviews:create",
    JSON.stringify({ bookingId: AVASAKURA, rating: 4 }),
    "--identity",
    id(AVA),
  );
  check("F-5 rating aggregates", "avg: 5", "reviews:listForRestaurant", JSON.stringify({ restaurantId: TRULLO }));
  check("F-5b detail shows rating", "avg: 5", "restaurants:get", JSON.stringify({ id: TRULLO }));

  check(
    "E-6 real restaurant can't be claimed",
    "can't be claimed",
    "restaurants:claimDemo",
    JSON.stringify({ id: PARIS }),
    "--identity",
    id("test-owner-9"),
  );
  // Repeatable: a previous run may have already claimed Casa Oliva for
  // test-owner-9 (then it can't be claimed a second time — the guard proving
  // it now has a real owner). Either outcome is correct.
  checkAny(
    "E-5 claim demo restaurant",
    ["test-owner-9", "can't be claimed"],
    "restaurants:claimDemo",
    JSON.stringify({ id: CASA }),
    "--identity",
    id("test-owner-9"),
  );
  check("E-5b new owner sees it", "isOwner: true", "restaurants:get", JSON.stringify({ id: CASA }), "--identity", id("test-owner-9"));
}

// ------------------------------------------------------------------ summary
process.exit(summary());
