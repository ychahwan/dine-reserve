import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ensureSlotsForDate } from "./availability";
import { applyDemoRules } from "./demoRules";
import { safeGet } from "./helpers";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// demo gift catalog (Socialize)
// ---------------------------------------------------------------------------

/**
 * Gift lists the demo venues ship with so the Socialize room is usable on a
 * fresh install. Owners can edit or extend these from the Gifts tab.
 */
const SEED_GIFTS: Record<
  string,
  { name: string; emoji: string; description?: string; priceCents: number }[]
> = {
  Trullo: [
    { name: "Aperol spritz", emoji: "🍊", description: "Sunset in a glass", priceCents: 900 },
    { name: "House negroni", emoji: "🥃", description: "Gin, Campari, sweet vermouth", priceCents: 1200 },
    { name: "Panna cotta", emoji: "🍮", description: "Vanilla bean, berries", priceCents: 800 },
  ],
  "Sakura House": [
    { name: "Yuzu highball", emoji: "🍋", description: "Yuzu, soda, ice", priceCents: 1100 },
    { name: "Sake flight", emoji: "🍶", description: "Three pours, chef's pick", priceCents: 1500 },
    { name: "Mochi trio", emoji: "🍡", description: "Matcha, strawberry, black sesame", priceCents: 700 },
  ],
  "Casa Oliva": [
    { name: "Rose spritz", emoji: "🌹", description: "Rosé, Aperol, soda", priceCents: 900 },
    { name: "Croquetas de jamón", emoji: "🧆", description: "Four to share", priceCents: 800 },
  ],
  "La Brasa": [
    { name: "Malbec glass", emoji: "🍷", description: "Local malbec", priceCents: 900 },
    { name: "Provoleta", emoji: "🧀", description: "Melted provolone, oregano", priceCents: 900 },
  ],
};

/** Fallback list for demo restaurants without a curated set. */
const DEFAULT_GIFTS = [
  { name: "House drink", emoji: "🍸", description: "Ask the bartender", priceCents: 900 },
  { name: "Dessert to share", emoji: "🍰", description: "Chef's pick", priceCents: 800 },
];

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

async function runSeed(ctx: MutationCtx) {
  // only seed once per deployment
  const existing = await ctx.db.query("restaurants").first();
  if (existing) return { seeded: false };

  const now = Date.now();

  // ----------------------------------------------- users (demo identities)
  const mkUser = async (name: string, email: string, role?: "owner" | "customer", phone?: string) => {
    const id = await ctx.db.insert("users", { name, email, role, phone });
    return id;
  };
  // Demo restaurant owners use @kamix.demo addresses so ownerIsDemoAccount /
  // claimDemo can identify them and a fresh sign-in can take over the venue.
  const ownerMarco = await mkUser("Marco", "marco@kamix.demo", "owner", "+15550001001");
  const ownerYuki = await mkUser("Yuki", "yuki@kamix.demo", "owner", "+15550001002");
  const ownerSofia = await mkUser("Sofia", "sofia@kamix.demo", "owner", "+15550001003");
  const ownerLuis = await mkUser("Luis", "luis@kamix.demo", "owner", "+15550001004");
  const ava = await mkUser("Ava", "ava@kamix.demo", "customer", "+15550001111");
  const leo = await mkUser("Leo", "leo@kamix.demo", "customer", "+15550002222");

  // ---------------------------------------------------------- restaurants
  const trullo = await ctx.db.insert("restaurants", {
    ownerId: ownerMarco,
    name: "Trullo",
    cuisine: "Italian",
    city: "Milan",
    address: "Via della Spiga 12",
    neighborhood: "Brera",
    phone: "+39 02 555 0101",
    priceRange: "$$$",
    description:
      "Wood-fired pasta and natural wine in a candle-lit dining room. Ask for the terrace in summer.",
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: false, parking: true, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });
  const sakura = await ctx.db.insert("restaurants", {
    ownerId: ownerYuki,
    name: "Sakura House",
    cuisine: "Japanese",
    city: "Milan",
    address: "Corso Como 8",
    neighborhood: "Garibaldi",
    phone: "+39 02 555 0202",
    priceRange: "$$$$",
    description:
      "Omakase counter and a quiet sake bar. Eight seats at the counter, booked out weeks ahead.",
    imageUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=900&q=70",
    features: { inside: true, outside: false, bar: true, smoking: false, parking: false, liveMusic: false, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });
  const oliva = await ctx.db.insert("restaurants", {
    ownerId: ownerSofia,
    name: "Casa Oliva",
    cuisine: "Mediterranean",
    city: "Rome",
    address: "Via del Governo Vecchio 90",
    neighborhood: "Ponte",
    phone: "+39 06 555 0303",
    priceRange: "$$",
    description:
      "Sun-drenched courtyard, olive-oil everything, and the best aperitivo in Rome after work.",
    imageUrl: "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: false, parking: false, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });
  const asado = await ctx.db.insert("restaurants", {
    ownerId: ownerLuis,
    name: "La Brasa",
    cuisine: "Steakhouse",
    city: "Rome",
    address: "Via Ostiense 300",
    neighborhood: "Testaccio",
    phone: "+39 06 555 0404",
    priceRange: "$$$$",
    description:
      "Argentine-style asado over open flame. Late-night bar section with a smoking terrace.",
    imageUrl: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: true, parking: true, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });

  for (const r of [trullo, sakura, oliva, asado]) {
    const doc = await ctx.db.get(r);
    const searchText = [doc!.name, doc!.cuisine, doc!.city, doc!.neighborhood ?? "", doc!.description ?? ""].join(" ").toLowerCase();
    // no-show protection: Trullo demoes the free-cancel-until policy
    await ctx.db.patch(r, {
      searchText,
      ...(r === trullo ? { cancellationPolicyHours: 24 } : {}),
    });
  }

  // ------------------------------------------------------------- sections
  const sec = async (restaurantId: string, name: string, kind: "inside" | "outside" | "bar", smoking: boolean, capacity: number) =>
    ctx.db.insert("sections", { restaurantId: restaurantId as never, name, kind, smoking, capacity });

  const trulloInside = await sec(trullo, "Dining room", "inside", false, 32);
  const trulloTerrace = await sec(trullo, "Terrace", "outside", false, 16);
  const sakuraCounter = await sec(sakura, "Omakase counter", "inside", false, 12);
  const sakuraBar = await sec(sakura, "Sake bar", "bar", false, 10);
  const olivaCourtyard = await sec(oliva, "Courtyard", "outside", false, 24);
  const olivaBar = await sec(oliva, "Aperitivo bar", "bar", false, 12);
  const asadoMain = await sec(asado, "Main hall", "inside", false, 40);
  const asadoTerrace = await sec(asado, "Smoking terrace", "outside", true, 14);
  const asadoBar = await sec(asado, "Grill bar", "bar", false, 12);

  // ---------------------------------------------------------------- hours
  const hours: { restaurantId: string; dayOfWeek: number; open: string; close: string; enabled: boolean }[] = [];
  const addHours = (restaurantId: string, dow: number, open: string, close: string, enabled: boolean) =>
    hours.push({ restaurantId, dayOfWeek: dow, open, close, enabled });
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    addHours(trullo, dow, dow === 6 || dow === 0 ? "12:00" : "17:30", "23:30", true);
    addHours(sakura, dow, dow === 6 || dow === 0 ? "12:00" : "18:00", "23:00", true);
    addHours(oliva, dow, "12:00", "23:30", true);
    addHours(asado, dow, dow === 6 || dow === 0 ? "12:00" : "19:00", "00:30", true);
  }
  for (const h of hours) await ctx.db.insert("hours", h as never);

  // ---------------------------------------------------- slot rules (service windows)
  // Same demo windows used by seed.ensureDemoRules (see demoRules.ts): 60-min
  // fine-dining seatings, 30-min casual windows, fixed omakase seatings,
  // section-restricted windows, and a one-off custom slot for a special date.
  await applyDemoRules(ctx, now);

  // ---------------------------------------------------------------- menus
  const mkMenu = async (restaurantId: string, name: string, description?: string) =>
    ctx.db.insert("menus", { restaurantId: restaurantId as never, name, description });
  const mkItem = async (
    menuId: string,
    restaurantId: string,
    name: string,
    priceCents: number,
    opts: {
      category?: string;
      popular?: boolean;
      description?: string;
      imageUrl?: string;
      tags?: string[];
      allergens?: string[];
      ingredients?: string[];
      spiceLevel?: "mild" | "medium" | "hot" | "very_hot";
    } = {},
  ) =>
    ctx.db.insert("menuItems", {
      menuId: menuId as never,
      restaurantId: restaurantId as never,
      name,
      description: opts.description,
      priceCents,
      category: opts.category,
      popular: opts.popular ?? false,
      available: true,
      imageUrl: opts.imageUrl,
      tags: opts.tags,
      allergens: opts.allergens,
      ingredients: opts.ingredients,
      spiceLevel: opts.spiceLevel,
    });

  const trulloMenu = await mkMenu(trullo, "Aperitivo & Pasta", "Evening menu");
  await mkItem(trulloMenu, trullo, "Negroni", 1200, {
    category: "Drinks",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=400&q=70",
    tags: ["House-made"],
    ingredients: ["Gin", "Campari", "Sweet vermouth", "Orange peel"],
  });
  await mkItem(trulloMenu, trullo, "Burrata & prosciutto", 1400, {
    category: "Starters",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&q=70",
    tags: ["Local"],
    allergens: ["Dairy"],
    ingredients: ["Burrata", "Parma prosciutto", "Rocket", "EVOO"],
  });
  await mkItem(trulloMenu, trullo, "Cacio e pepe", 1800, {
    category: "Pasta",
    popular: true,
    description: "Pecorino romano, black pepper, tonnarelli",
    imageUrl: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=70",
    tags: ["Vegetarian", "House-made"],
    allergens: ["Gluten", "Dairy"],
    ingredients: ["Tonnarelli", "Pecorino romano", "Black pepper", "Sea salt"],
  });
  await mkItem(trulloMenu, trullo, "Tagliatelle al ragù", 1900, {
    category: "Pasta",
    tags: ["House-made"],
    allergens: ["Gluten", "Dairy"],
    ingredients: ["Fresh tagliatelle", "Beef ragù", "Tomato", "Parmesan"],
  });
  await mkItem(trulloMenu, trullo, "Panna cotta", 800, {
    category: "Dessert",
    imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=70",
    tags: ["Vegetarian", "House-made"],
    allergens: ["Dairy"],
    ingredients: ["Cream", "Vanilla", "Berries"],
  });

  const sakuraMenu = await mkMenu(sakura, "Omakase", "Chef's selection");
  await mkItem(sakuraMenu, sakura, "Nigiri set (8 pcs)", 4200, {
    category: "Sushi",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&q=70",
    tags: ["Chef's special"],
    allergens: ["Fish", "Gluten"],
    ingredients: ["Sushi rice", "Tuna", "Salmon", "Eel", "Soy"],
  });
  await mkItem(sakuraMenu, sakura, "Salmon sashimi", 1600, {
    category: "Sashimi",
    tags: ["Raw"],
    allergens: ["Fish"],
    ingredients: ["Fresh salmon", "Daikon", "Wasabi", "Soy"],
  });
  await mkItem(sakuraMenu, sakura, "Miso soup", 400, {
    category: "Soups",
    tags: ["Vegan"],
    allergens: ["Soy", "Gluten"],
    ingredients: ["Miso", "Tofu", "Seaweed", "Spring onion"],
  });
  await mkItem(sakuraMenu, sakura, "Yuzu highball", 1100, {
    category: "Drinks",
    popular: true,
    tags: ["House-made"],
    ingredients: ["Yuzu", "Soda", "Ice"],
  });

  const olivaMenu = await mkMenu(oliva, "Sharing plates", "All day");
  await mkItem(olivaMenu, oliva, "Patatas bravas", 700, {
    category: "Tapas",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&q=70",
    tags: ["Vegan", "Spicy", "Shareable"],
    spiceLevel: "medium",
    ingredients: ["Potato", "Brava sauce", "Aioli", "Paprika"],
  });
  await mkItem(olivaMenu, oliva, "Croquetas de jamón", 800, {
    category: "Tapas",
    tags: ["Shareable"],
    allergens: ["Gluten", "Dairy"],
    ingredients: ["Ham", "Béchamel", "Breadcrumbs"],
  });
  await mkItem(olivaMenu, oliva, "Grilled octopus", 1600, {
    category: "Mains",
    popular: true,
    tags: ["Grilled", "Local"],
    allergens: ["Molluscs"],
    ingredients: ["Octopus", "Smoked paprika", "Potato cream", "Olive oil"],
  });
  await mkItem(olivaMenu, oliva, "Rose spritz", 900, {
    category: "Drinks",
    tags: ["House-made"],
    ingredients: ["Rosé", "Aperol", "Soda", "Orange"],
  });

  const asadoMenu = await mkMenu(asado, "Asado", "From the fire");
  await mkItem(asadoMenu, asado, "Entraña (skirt steak) 400g", 3400, {
    category: "Cuts",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=70",
    tags: ["Chef's special", "Grilled"],
    ingredients: ["Skirt steak", "Chimichurri", "Charred lemon"],
  });
  await mkItem(asadoMenu, asado, "Chorizo criollo", 1300, {
    category: "Cuts",
    tags: ["Spicy"],
    allergens: ["Gluten", "Sulphites"],
    spiceLevel: "hot",
    ingredients: ["Beef sausage", "Smoked paprika", "Peppers"],
  });
  await mkItem(asadoMenu, asado, "Provoleta", 900, {
    category: "Starters",
    popular: true,
    tags: ["Vegetarian", "Shareable"],
    allergens: ["Dairy"],
    ingredients: ["Provolone", "Oregano", "Olive oil"],
  });
  await mkItem(asadoMenu, asado, "Malbec glass", 900, {
    category: "Drinks",
    tags: ["Local"],
    ingredients: ["Malbec"],
  });

  // ------------------------------------------------------------ slots (10 days)
  for (const restaurantId of [trullo, sakura, oliva, asado]) {
    for (let i = 0; i < 10; i++) {
      await ensureSlotsForDate(ctx, restaurantId, daysFromNow(i));
    }
  }

  // ---------------------------------------------------- sample bookings today
  const today = daysFromNow(0);
  const tomorrow = daysFromNow(1);
  const evening = (open: string) => open; // reuse restaurant open times

  const b1 = await ctx.db.insert("bookings", {
    restaurantId: trullo,
    userId: ava,
    name: "Ava",
    email: "ava@kamix.demo",
    phone: "+15550001111",
    date: today,
    time: evening("17:30"),
    partySize: 2,
    sectionId: trulloInside,
    sectionName: "Dining room",
    kind: "inside",
    smoking: false,
    status: "confirmed",
    code: "AV4K2P",
    notes: "Window table if possible",
    createdAt: now - 1000 * 60 * 60 * 3,
    updatedAt: now - 1000 * 60 * 60 * 3,
  });
  await ctx.db.insert("bookings", {
    restaurantId: trullo,
    userId: leo,
    name: "Leo",
    email: "leo@kamix.demo",
    phone: "+15550002222",
    date: tomorrow,
    time: evening("20:00"),
    partySize: 4,
    sectionId: trulloTerrace,
    sectionName: "Terrace",
    kind: "outside",
    smoking: false,
    status: "confirmed",
    code: "LE9X7M",
    createdAt: now - 1000 * 60 * 60 * 5,
    updatedAt: now - 1000 * 60 * 60 * 5,
  });
  await ctx.db.insert("bookings", {
    restaurantId: sakura,
    userId: ava,
    name: "Ava",
    email: "ava@kamix.demo",
    phone: "+15550001111",
    date: tomorrow,
    time: "18:00",
    partySize: 2,
    sectionId: sakuraCounter,
    sectionName: "Omakase counter",
    kind: "inside",
    smoking: false,
    status: "confirmed",
    code: "SA3T9Q",
    createdAt: now - 1000 * 60 * 60 * 2,
    updatedAt: now - 1000 * 60 * 60 * 2,
  });

  // consume the seats those bookings occupy (mirrors createBooking's decrement)
  const consume = async (slotTime: string, sectionId: string, restaurantId: string, partySize: number) => {
    const slots = await ctx.db
      .query("slots")
      .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId as never).eq("date", today))
      .collect();
    const slot = slots.find((s) => s.sectionId === sectionId && s.time === slotTime);
    if (slot) await ctx.db.patch(slot._id, { remaining: Math.max(0, slot.remaining - partySize) });
  };
  await consume("17:30", trulloInside, trullo, 2);
  await consume("18:00", sakuraCounter, sakura, 2);

  // ---------------------------------------------------- waitlist demo
  // Sell out one slot and park a diner on its waitlist so the flow is
  // visible right away: Sakura omakase counter, 8:00 PM today.
  const sakuraSlots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", sakura as never).eq("date", today))
    .collect();
  const soldOut = sakuraSlots.find((s) => s.sectionId === sakuraCounter && s.time === "20:00");
  if (soldOut) await ctx.db.patch(soldOut._id, { remaining: 0 });
  await ctx.db.insert("waitlist", {
    restaurantId: sakura,
    sectionId: sakuraCounter,
    sectionName: "Omakase counter",
    date: today,
    time: "20:00",
    partySize: 2,
    userId: leo,
    name: "Leo",
    phone: "+15550002222",
    status: "waiting",
    createdAt: now - 1000 * 60 * 30,
  });

  // --------------------------------------- demo gift catalog (Socialize)
  // A few gifts per venue so the Socialize room works on a fresh install.
  for (const r of [trullo, sakura, oliva, asado]) {
    const doc = await ctx.db.get(r);
    const list = (doc && SEED_GIFTS[doc.name]) ?? DEFAULT_GIFTS;
    for (const g of list) {
      await ctx.db.insert("giftTypes", {
        restaurantId: r,
        name: g.name,
        emoji: g.emoji,
        description: g.description,
        priceCents: g.priceCents,
        available: true,
        createdAt: now,
      });
    }
  }

  // ------------------------------------------------ verified demo reviews
  await ctx.db.insert("reviews", {
    restaurantId: trullo,
    userId: ava,
    bookingId: b1,
    rating: 5,
    text: "Candle-lit room, perfect cacio e pepe and the terrace was lovely. We'll be back.",
    createdAt: now - 1000 * 60 * 60 * 24 * 2,
  });
  await ctx.db.insert("reviews", {
    restaurantId: sakura,
    userId: leo,
    rating: 4,
    text: "Freshest fish in the city — the omakase counter is worth the wait.",
    createdAt: now - 1000 * 60 * 60 * 24 * 3,
  });
  await ctx.db.insert("reviews", {
    restaurantId: trullo,
    userId: leo,
    rating: 4,
    text: "Great negroni and friendly staff. Booking was instant.",
    createdAt: now - 1000 * 60 * 60 * 24 * 6,
  });

  return { seeded: true, restaurants: [trullo, sakura, oliva, asado], booking: b1 };
}

export const seed = mutation({
  args: {},
  handler: runSeed,
});

// ---------------------------------------------------------------------------
// ensureDemoData — called by the Explore page on first load
// ---------------------------------------------------------------------------

/**
 * Seeds demo data when the database is empty; otherwise retrofits older
 * deployments with the latest demo attributes (solo flag, menu attributes,
 * ingredients, gift catalog). Safe to call on every app boot.
 */
export const ensureDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const seeded = await runSeed(ctx);
    if (!seeded.seeded) {
      await runRetrofit(ctx);
    }
    return seeded;
  },
});

// ---------------------------------------------------------------------------
// retrofit for databases seeded before the enrichment improvements
// ---------------------------------------------------------------------------

/**
 * Attribute map mirroring the menu items the current seed creates, keyed by
 * item name. Used by retrofitDemoData to backfill databases that were seeded
 * before menu attributes (dietary tags, allergens, spice, ingredients) existed.
 */
const SEED_ITEM_ATTRS: Record<
  string,
  {
    tags?: string[];
    allergens?: string[];
    ingredients?: string[];
    spiceLevel?: "mild" | "medium" | "hot" | "very_hot";
  }
> = {
  "Negroni": { tags: ["House-made"], ingredients: ["Gin", "Campari", "Sweet vermouth", "Orange peel"] },
  "Burrata & prosciutto": { tags: ["Local"], allergens: ["Dairy"], ingredients: ["Burrata", "Parma prosciutto", "Rocket", "EVOO"] },
  "Cacio e pepe": { tags: ["Vegetarian", "House-made"], allergens: ["Gluten", "Dairy"], ingredients: ["Tonnarelli", "Pecorino romano", "Black pepper", "Sea salt"] },
  "Tagliatelle al ragù": { tags: ["House-made"], allergens: ["Gluten", "Dairy"], ingredients: ["Fresh tagliatelle", "Beef ragù", "Tomato", "Parmesan"] },
  "Panna cotta": { tags: ["Vegetarian", "House-made"], allergens: ["Dairy"] },
  "Nigiri set (8 pcs)": { tags: ["Chef's special"], allergens: ["Fish", "Gluten"], ingredients: ["Sushi rice", "Tuna", "Salmon", "Eel", "Soy"] },
  "Salmon sashimi": { tags: ["Raw"], allergens: ["Fish"], ingredients: ["Fresh salmon", "Daikon", "Wasabi", "Soy"] },
  "Miso soup": { tags: ["Vegan"], allergens: ["Soy", "Gluten"] },
  "Yuzu highball": { tags: ["House-made"], ingredients: ["Yuzu", "Soda", "Ice"] },
  "Patatas bravas": { tags: ["Vegan", "Spicy", "Shareable"], spiceLevel: "medium", ingredients: ["Potato", "Brava sauce", "Aioli", "Paprika"] },
  "Croquetas de jamón": { tags: ["Shareable"], allergens: ["Gluten", "Dairy"], ingredients: ["Ham", "Béchamel", "Breadcrumbs"] },
  "Grilled octopus": { tags: ["Grilled", "Local"], allergens: ["Molluscs"], ingredients: ["Octopus", "Smoked paprika", "Potato cream", "Olive oil"] },
  "Rose spritz": { tags: ["House-made"], ingredients: ["Rosé", "Aperol", "Soda", "Orange"] },
  "Entraña (skirt steak) 400g": { tags: ["Chef's special", "Grilled"], ingredients: ["Skirt steak", "Chimichurri", "Charred lemon"] },
  "Chorizo criollo": { tags: ["Spicy"], allergens: ["Gluten", "Sulphites"], spiceLevel: "hot", ingredients: ["Beef sausage", "Smoked paprika", "Peppers"] },
  "Provoleta": { tags: ["Vegetarian", "Shareable"], allergens: ["Dairy"], ingredients: ["Provolone", "Oregano", "Olive oil"] },
  "Malbec glass": { tags: ["Local"], ingredients: ["Malbec"] },
};

/**
 * Idempotent data upgrade for deployments that were seeded before the
 * enrichment improvements (solo-friendly flag, menu-item photos/attributes,
 * dietary search, ingredients, Socialize gift catalog). Only touches
 * restaurants owned by seeded demo accounts (@kamix.demo / @seatly.demo) and
 * only fills *missing* fields, so owner customizations are never overwritten.
 * Safe to run repeatedly.
 */
async function runRetrofit(ctx: MutationCtx) {
  const restaurants = await ctx.db.query("restaurants").collect();
  let patchedRestaurants = 0;
  let patchedItems = 0;
  let patchedGifts = 0;

  for (const r of restaurants) {
    // safeGet: tolerate owners stored as bare auth subjects (e.g. test/legacy
    // identities) rather than real user docs — never crash the retrofit.
    const owner = await safeGet<Doc<"users">>(ctx, r.ownerId);
    const email = owner?.email ?? "";
    if (!(email.endsWith("@kamix.demo") || email.endsWith("@seatly.demo"))) continue;

    // solo-friendly flag (defaults match the current seed)
    if (r.features.soloFriendly === undefined) {
      const solo = ["Sakura House", "Casa Oliva", "La Brasa"].includes(r.name);
      await ctx.db.patch(r._id, { features: { ...r.features, soloFriendly: solo } });
      patchedRestaurants++;
    }

    // menu-item attributes, by item name (only where completely missing)
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
      .collect();
    for (const it of items) {
      const def = SEED_ITEM_ATTRS[it.name];
      if (!def) continue;
      const patch: {
        tags?: string[];
        allergens?: string[];
        ingredients?: string[];
        spiceLevel?: "mild" | "medium" | "hot" | "very_hot";
      } = {};
      if (!it.tags && def.tags) patch.tags = def.tags;
      if (!it.allergens && def.allergens) patch.allergens = def.allergens;
      if (!it.ingredients && def.ingredients) patch.ingredients = def.ingredients;
      if (!it.spiceLevel && def.spiceLevel) patch.spiceLevel = def.spiceLevel;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(it._id, patch);
        patchedItems++;
      }
    }

    // Socialize gift catalog (only where completely empty — owner edits win)
    const existingGift = await ctx.db
      .query("giftTypes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
      .first();
    if (!existingGift) {
      const list = SEED_GIFTS[r.name] ?? DEFAULT_GIFTS;
      for (const g of list) {
        await ctx.db.insert("giftTypes", {
          restaurantId: r._id,
          name: g.name,
          emoji: g.emoji,
          description: g.description,
          priceCents: g.priceCents,
          available: true,
          createdAt: Date.now(),
        });
      }
      patchedGifts += list.length;
    }
  }
  return { patchedRestaurants, patchedItems, patchedGifts };
}

export const retrofitDemoData = mutation({
  args: {},
  handler: runRetrofit,
});

// ---------------------------------------------------------------------------
// data reset — wipe or reset (npm run wipe / npm run seed)
// ---------------------------------------------------------------------------

/**
 * Every application table, in dependency-light order. Auth system tables
 * (authAccounts / authSessions / authVerificationRequests) are intentionally
 * NOT included — wiping them would break sign-in for every account.
 */
const ALL_TABLES = [
  "users",
  "restaurants",
  "sections",
  "hours",
  "slots",
  "slotRules",
  "customSlots",
  "menus",
  "menuItems",
  "bookings",
  "bookingQueue",
  "waitlist",
  "notifications",
  "reviews",
  "dineOrders",
  "assistRequests",
  "menuRequests",
  "giftTypes",
  "dinerPresence",
  "giftDeliveries",
] as const;

/** Deletes every row from every app table — the data, not the schema. */
async function wipeAll(ctx: MutationCtx) {
  const counts: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    const docs = await ctx.db.query(table).collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    counts[table] = docs.length;
  }
  return counts;
}

/** `npm run wipe` — remove all data, keep the schema and code intact. */
export const wipeAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await wipeAll(ctx);
    return { deleted };
  },
});

/**
 * `npm run seed` — wipe everything, then recreate the full demo dataset
 * (restaurants, menus, gift catalogs, bookings for today/tomorrow, waitlist,
 * reviews). Always produces a fresh, consistent dataset.
 */
export const resetData = mutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await wipeAll(ctx);
    const seeded = await runSeed(ctx);
    return { deleted, seeded };
  },
});
