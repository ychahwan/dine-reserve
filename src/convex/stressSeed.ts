import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Stress test seed: 100k users + 1000 restaurants + realistic activity
// ---------------------------------------------------------------------------

const CITIES = [
  "Beirut",
  "Dubai",
  "Riyadh",
  "Cairo",
  "Amman",
  "Kuwait City",
  "Doha",
  "Abu Dhabi",
  "Manama",
  "Muscat",
];
const CUISINES = [
  "Lebanese",
  "Italian",
  "Japanese",
  "Indian",
  "Mexican",
  "Thai",
  "French",
  "Turkish",
  "American",
  "Korean",
];
const NAMES_FIRST = [
  "Ali",
  "Sara",
  "Omar",
  "Layla",
  "Youssef",
  "Nadia",
  "Karim",
  "Rania",
  "Hassan",
  "Mona",
  "Tarek",
  "Jana",
  "Rami",
  "Lina",
  "Fadi",
  "Maya",
  "Walid",
  "Dina",
  "Samir",
  "Hiba",
];
const NAMES_LAST = [
  "Khoury",
  "Nasser",
  "Haddad",
  "Mansour",
  "Saleh",
  "Khalil",
  "Amine",
  "Farhat",
  "Boustani",
  "Chahwan",
  "Hamadeh",
  "Itani",
  "Karam",
  "Mouawad",
  "Rizk",
];
const SECTIONS = [
  { name: "Main Hall", kind: "inside" as const, smoking: false, capacity: 40 },
  { name: "Terrace", kind: "outside" as const, smoking: false, capacity: 24 },
  { name: "Bar Area", kind: "bar" as const, smoking: false, capacity: 12 },
];
const GIFT_ITEMS = [
  { name: "House drink", emoji: "🍹", priceCents: 800 },
  { name: "Dessert", emoji: "🍰", priceCents: 700 },
  { name: "Appetizer", emoji: "🍽️", priceCents: 900 },
];

function rand(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pastDate(daysAgo: number): string {
  return futureDate(-daysAgo);
}

function timeSlot(): string {
  const h = randInt(11, 22);
  const m = Math.random() < 0.5 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

async function batchInsert(
  ctx: MutationCtx,
  table: string,
  docs: Record<string, unknown>[],
  batchSize = 500,
) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await Promise.all(batch.map((doc) => (ctx.db as any).insert(table, doc)));
  }
}

/**
 * Stress seed: creates 100k users, 1000 restaurants, and realistic booking/
 * order/review activity. Run with: npx convex run seed:stressSeed
 *
 * WARNING: This is a heavy operation. It will take several minutes and
 * consume significant Convex resources. Only run on a test deployment.
 */
export async function runStressSeed(ctx: MutationCtx) {
  const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
  if (
    deployment.startsWith("prod:") ||
    process.env.ALLOW_STRESS_SEED !== "true"
  ) {
    throw new Error(
      "Stress seeding is disabled. Set ALLOW_STRESS_SEED=true on a non-production deployment.",
    );
  }
  const results = {
    users: 0,
    restaurants: 0,
    bookings: 0,
    orders: 0,
    reviews: 0,
  };

  // ── 1. Create 1000 restaurant owners ──
  const ownerIds: Id<"users">[] = [];
  const ownerDocs: Record<string, unknown>[] = [];
  for (let i = 0; i < 1000; i++) {
    ownerDocs.push({
      name: `${rand(NAMES_FIRST)} ${rand(NAMES_LAST)}`,
      phone: `+961${String(70000000 + i).slice(0, 8)}`,
      role: "owner",
      onboarded: true,
    });
  }
  for (const doc of ownerDocs) {
    const id = await ctx.db.insert("users", doc as any);
    ownerIds.push(id as Id<"users">);
    results.users++;
  }

  // ── 2. Create 99,000 diner users ──
  const dinerIds: Id<"users">[] = [];
  for (let i = 0; i < 99000; i++) {
    const id = await ctx.db.insert("users", {
      name: `${rand(NAMES_FIRST)} ${rand(NAMES_LAST)}`,
      phone: `+961${String(71000000 + i).slice(0, 8)}`,
      role: "customer",
      onboarded: true,
    } as any);
    dinerIds.push(id as Id<"users">);
    results.users++;
    if (results.users % 5000 === 0)
      console.log(`Users: ${results.users}/100000`);
  }

  // ── 3. Create 1000 restaurants ──
  const restaurantIds: Id<"restaurants">[] = [];
  for (let i = 0; i < 1000; i++) {
    const city = rand(CITIES);
    const cuisine = rand(CUISINES);
    const ownerId = ownerIds[i]!;
    const name = `${rand(NAMES_LAST)}'s ${cuisine}`;
    const id = await ctx.db.insert("restaurants", {
      ownerId,
      name,
      cuisine,
      searchText: `${name} ${cuisine} ${city}`.toLowerCase(),
      address: `${randInt(1, 200)} ${rand(["Main St", "Market Rd", "Beach Ave", "Hill St"])} ${city}`,
      city,
      neighborhood: rand([
        "Downtown",
        "Marina",
        "Old Town",
        "Hamra",
        "Ashrafieh",
      ]),
      phone: `+961${String(10000000 + i).slice(0, 8)}`,
      priceRange: rand(["$", "$$", "$$$", "$$$$"]),
      description: `A great ${cuisine.toLowerCase()} restaurant in ${city}.`,
      features: {
        inside: true,
        outside: Math.random() > 0.3,
        bar: Math.random() > 0.5,
        smoking: false,
      },
      createdAt: Date.now() - randInt(30, 365) * 86400000,
    } as any);
    restaurantIds.push(id as Id<"restaurants">);
    results.restaurants++;

    // Sections
    for (const sec of SECTIONS) {
      await ctx.db.insert("sections", {
        restaurantId: id,
        name: sec.name,
        kind: sec.kind,
        smoking: sec.smoking,
        capacity: sec.capacity,
      } as any);
    }

    // Gift catalog
    for (const gift of GIFT_ITEMS) {
      await ctx.db.insert("giftTypes", {
        restaurantId: id,
        name: gift.name,
        emoji: gift.emoji,
        priceCents: gift.priceCents,
        available: true,
        createdAt: Date.now(),
      } as any);
    }

    if (results.restaurants % 100 === 0)
      console.log(`Restaurants: ${results.restaurants}/1000`);
  }

  // ── 4. Create bookings (10 per restaurant avg = 10,000 total) ──
  const bookingDocs: Record<string, unknown>[] = [];
  for (let r = 0; r < 1000; r++) {
    const rid = restaurantIds[r]!;
    const bookingCount = randInt(5, 15);
    for (let b = 0; b < bookingCount; b++) {
      const dinerIdx = randInt(0, dinerIds.length - 1);
      const userId = dinerIds[dinerIdx]!;
      const daysOffset = randInt(-30, 30);
      const date =
        daysOffset < 0 ? pastDate(-daysOffset) : futureDate(daysOffset);
      const statuses: Array<
        "confirmed" | "completed" | "no_show" | "cancelled"
      > = [
        "confirmed",
        "completed",
        "completed",
        "completed",
        "no_show",
        "cancelled",
      ];
      const status = daysOffset < -1 ? rand(statuses) : "confirmed";
      const code = `STR${String(r).padStart(3, "0")}${String(b).padStart(3, "0")}`;

      bookingDocs.push({
        restaurantId: rid,
        userId,
        name: `${rand(NAMES_FIRST)} ${rand(NAMES_LAST)}`,
        phone: `+961${String(71000000 + dinerIdx).slice(0, 8)}`,
        date,
        time: timeSlot(),
        partySize: randInt(1, 8),
        status,
        code,
        createdAt: Date.now() - randInt(0, 60) * 86400000,
        updatedAt: Date.now(),
      });
      results.bookings++;
    }
  }
  await batchInsert(ctx, "bookings", bookingDocs);
  console.log(`Bookings: ${results.bookings}`);

  // ── 5. Create orders (for completed bookings) ──
  const orderDocs: Record<string, unknown>[] = [];
  const completedBookings = await ctx.db.query("bookings").collect();
  const completed = completedBookings
    .filter((b) => b.status === "completed")
    .slice(0, 5000);
  for (const booking of completed) {
    const itemCount = randInt(1, 4);
    const items = Array.from({ length: itemCount }, () => ({
      name: rand([
        "Hummus",
        "Falafel",
        "Shawarma",
        "Kebab",
        "Fattoush",
        "Tabbouleh",
        "Grilled Halloumi",
        "Kibbeh",
      ]),
      priceCents: randInt(500, 2500),
      quantity: randInt(1, 3),
    }));
    const totalCents = items.reduce(
      (s, it) => s + it.priceCents * it.quantity,
      0,
    );

    orderDocs.push({
      bookingId: booking._id,
      restaurantId: booking.restaurantId,
      userId: booking.userId,
      items,
      totalCents,
      status: rand(["completed", "completed", "completed", "cancelled"]),
      createdAt: booking.createdAt + randInt(15, 90) * 60000,
      updatedAt: booking.createdAt + randInt(60, 180) * 60000,
    });
    results.orders++;
  }
  await batchInsert(ctx, "dineOrders", orderDocs);
  console.log(`Orders: ${results.orders}`);

  // ── 6. Create reviews (for ~30% of completed bookings) ──
  const reviewDocs: Record<string, unknown>[] = [];
  const reviewedBookings = completed.slice(0, 2000);
  for (const booking of reviewedBookings) {
    reviewDocs.push({
      restaurantId: booking.restaurantId,
      userId: booking.userId,
      bookingId: booking._id,
      rating: randInt(1, 5),
      text: rand([
        "Amazing food and great atmosphere!",
        "Good but service was a bit slow.",
        "Perfect for a special occasion.",
        "Solid restaurant, would come back.",
        "The food was okay, nothing special.",
        "Loved the ambiance and the desserts!",
        "Will definitely recommend to friends.",
        "Not bad, but expected better for the price.",
      ]),
      createdAt: booking.updatedAt + randInt(1, 24) * 3600000,
    });
    results.reviews++;
  }
  await batchInsert(ctx, "reviews", reviewDocs);
  console.log(`Reviews: ${results.reviews}`);

  return results;
}

export const stressSeed = internalMutation({
  args: {},
  handler: runStressSeed,
});
