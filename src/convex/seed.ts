import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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
  "Beit Zaytoun": [
    { name: "Rose lemonade", emoji: "🌹", description: "Rosewater, mint, lemon", priceCents: 700 },
    { name: "Baklava trio", emoji: "🍯", description: "Pistachio, walnut, cashew", priceCents: 800 },
  ],
  "La Brasa": [
    { name: "Margarita", emoji: "🍹", description: "Tequila, lime, salt rim", priceCents: 1000 },
    { name: "Churros & cajeta", emoji: "🍩", description: "Warm churros, goat-milk caramel", priceCents: 800 },
  ],
  "Meridian Kitchen": [
    { name: "Rooftop cocktail", emoji: "🍸", description: "Ask the bartender", priceCents: 1100 },
    { name: "Tasting dessert", emoji: "🍰", description: "Chef's fusion pick", priceCents: 900 },
  ],
};

/** Fallback list for demo restaurants without a curated set. */
const DEFAULT_GIFTS = [
  { name: "House drink", emoji: "🍸", description: "Ask the bartender", priceCents: 900 },
  { name: "Dessert to share", emoji: "🍰", description: "Chef's pick", priceCents: 800 },
];

// ---------------------------------------------------------------------------
// 100-customer generation
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Ava", "Leo", "Mia", "Noah", "Zoe", "Liam", "Emma", "Ethan", "Grace", "Lucas",
  "Sofia", "Mason", "Chloe", "Oscar", "Ruby", "Felix", "Nora", "Adam", "Ivy", "Owen",
];
const LAST_NAMES = [
  "Rossi", "Bianchi", "Romano", "Ferrari", "Esposito", "Ricci", "Marino", "Greco",
  "Conti", "De Luca", "Costa", "Fontana", "Villa", "Rinaldi", "Caruso", "Moretti",
  "Barbieri", "Santoro", "Mariani", "Serra",
];

function customerName(i: number): string {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

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
  const ownerRania = await mkUser("Rania", "rania@kamix.demo", "owner", "+15550001003");
  const ownerLuis = await mkUser("Luis", "luis@kamix.demo", "owner", "+15550001004");
  const ownerNoah = await mkUser("Noah", "noah@kamix.demo", "owner", "+15550001005");

  // ------------------------------------------------- 100 demo customers
  // customers[0] = Ava, customers[1] = Leo (kept as the two "hero" accounts
  // used below for sample bookings / waitlist / reviews); the remaining 98
  // are generated for a realistic customer base.
  const customers: Id<"users">[] = [];
  customers.push(await mkUser("Ava", "ava@kamix.demo", "customer", "+15550001111"));
  customers.push(await mkUser("Leo", "leo@kamix.demo", "customer", "+15550002222"));
  for (let i = 2; i < 100; i++) {
    const name = customerName(i);
    const email = `customer${i + 1}@kamix.demo`;
    const phone = `+1555010${String(i).padStart(3, "0")}`;
    customers.push(await mkUser(name, email, "customer", phone));
  }
  const ava = customers[0];
  const leo = customers[1];

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
  const zaytoun = await ctx.db.insert("restaurants", {
    ownerId: ownerRania,
    name: "Beit Zaytoun",
    cuisine: "Lebanese",
    city: "Rome",
    address: "Via del Governo Vecchio 90",
    neighborhood: "Ponte",
    phone: "+39 06 555 0303",
    priceRange: "$$",
    description:
      "Family-style mezze on a sun-drenched terrace — hummus, kibbeh, and slow-grilled shawarma.",
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: false, parking: false, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });
  const brasa = await ctx.db.insert("restaurants", {
    ownerId: ownerLuis,
    name: "La Brasa",
    cuisine: "Mexican",
    city: "Rome",
    address: "Via Ostiense 300",
    neighborhood: "Testaccio",
    phone: "+39 06 555 0404",
    priceRange: "$$$$",
    description:
      "Wood-fired tacos and mezcal over open flame. Late-night bar section with a smoking terrace.",
    imageUrl: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: true, parking: true, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });
  const meridian = await ctx.db.insert("restaurants", {
    ownerId: ownerNoah,
    name: "Meridian Kitchen",
    cuisine: "International",
    city: "Barcelona",
    address: "Passeig de Gràcia 45",
    neighborhood: "Eixample",
    phone: "+34 93 555 0505",
    priceRange: "$$$",
    description:
      "A rooftop kitchen crossing continents — wagyu burgers, pad thai, and butter chicken under the stars.",
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=70",
    features: { inside: true, outside: true, bar: true, smoking: false, parking: false, liveMusic: true, soloFriendly: true },
    searchText: "",
    createdAt: now,
  });

  for (const r of [trullo, sakura, zaytoun, brasa, meridian]) {
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
  const zaytounTerrace = await sec(zaytoun, "Terrace", "outside", false, 24);
  const zaytounDining = await sec(zaytoun, "Dining room", "inside", false, 24);
  const brasaMain = await sec(brasa, "Main hall", "inside", false, 40);
  const brasaTerrace = await sec(brasa, "Smoking terrace", "outside", true, 14);
  const brasaBar = await sec(brasa, "Grill bar", "bar", false, 12);
  const meridianDining = await sec(meridian, "Dining room", "inside", false, 30);
  const meridianRooftop = await sec(meridian, "Rooftop", "outside", false, 20);

  // ---------------------------------------------------------------- hours
  const hours: { restaurantId: string; dayOfWeek: number; open: string; close: string; enabled: boolean }[] = [];
  const addHours = (restaurantId: string, dow: number, open: string, close: string, enabled: boolean) =>
    hours.push({ restaurantId, dayOfWeek: dow, open, close, enabled });
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    addHours(trullo, dow, dow === 6 || dow === 0 ? "12:00" : "17:30", "23:30", true);
    addHours(sakura, dow, dow === 6 || dow === 0 ? "12:00" : "18:00", "23:00", true);
    addHours(zaytoun, dow, "12:00", "23:30", true);
    addHours(brasa, dow, dow === 6 || dow === 0 ? "12:00" : "19:00", "00:30", true);
    addHours(meridian, dow, "12:00", "23:00", true);
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

  const zaytounMenu = await mkMenu(zaytoun, "Mezze & Grill", "All day");
  await mkItem(zaytounMenu, zaytoun, "Hummus", 700, {
    category: "Mezze",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1615937691194-97dbd3ffcd28?w=400&q=70",
    tags: ["Vegan", "Shareable"],
    ingredients: ["Chickpeas", "Tahini", "Lemon", "Olive oil"],
  });
  await mkItem(zaytounMenu, zaytoun, "Tabbouleh", 750, {
    category: "Mezze",
    tags: ["Vegan", "Shareable"],
    ingredients: ["Parsley", "Bulgur", "Tomato", "Lemon"],
  });
  await mkItem(zaytounMenu, zaytoun, "Kibbeh", 900, {
    category: "Mains",
    popular: true,
    tags: ["Fried"],
    allergens: ["Gluten"],
    ingredients: ["Bulgur", "Ground beef", "Pine nuts", "Spices"],
  });
  await mkItem(zaytounMenu, zaytoun, "Chicken shawarma", 1400, {
    category: "Mains",
    popular: true,
    tags: ["Grilled"],
    ingredients: ["Chicken", "Garlic sauce", "Pickles", "Flatbread"],
  });
  await mkItem(zaytounMenu, zaytoun, "Baklava", 700, {
    category: "Dessert",
    tags: ["Vegetarian", "Shareable"],
    allergens: ["Nuts", "Gluten"],
    ingredients: ["Phyllo", "Pistachio", "Honey syrup"],
  });

  const brasaMenu = await mkMenu(brasa, "Fuego Mexicano", "From the fire");
  await mkItem(brasaMenu, brasa, "Tacos al pastor", 1300, {
    category: "Tacos",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=70",
    tags: ["Chef's special", "Grilled"],
    ingredients: ["Pork", "Pineapple", "Onion", "Cilantro", "Corn tortilla"],
  });
  await mkItem(brasaMenu, brasa, "Guacamole", 800, {
    category: "Starters",
    tags: ["Vegan", "Shareable"],
    ingredients: ["Avocado", "Lime", "Cilantro", "Serrano chile"],
  });
  await mkItem(brasaMenu, brasa, "Elote", 700, {
    category: "Starters",
    popular: true,
    tags: ["Vegetarian", "Spicy"],
    spiceLevel: "medium",
    allergens: ["Dairy"],
    ingredients: ["Grilled corn", "Cotija", "Chili powder", "Lime"],
  });
  await mkItem(brasaMenu, brasa, "Carne asada 400g", 3400, {
    category: "Cuts",
    popular: true,
    tags: ["Grilled"],
    ingredients: ["Skirt steak", "Chimichurri", "Charred lime"],
  });
  await mkItem(brasaMenu, brasa, "Margarita", 1000, {
    category: "Drinks",
    tags: ["House-made"],
    ingredients: ["Tequila", "Lime", "Triple sec"],
  });

  const meridianMenu = await mkMenu(meridian, "Rooftop Fusion", "Global small plates");
  await mkItem(meridianMenu, meridian, "Wagyu burger", 2200, {
    category: "Mains",
    popular: true,
    imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=70",
    tags: ["Chef's special", "Grilled"],
    allergens: ["Gluten", "Dairy"],
    ingredients: ["Wagyu beef", "Brioche bun", "Truffle aioli", "Cheddar"],
  });
  await mkItem(meridianMenu, meridian, "Pad thai", 1500, {
    category: "Mains",
    popular: true,
    tags: ["Spicy"],
    spiceLevel: "medium",
    allergens: ["Peanuts", "Shellfish", "Gluten"],
    ingredients: ["Rice noodles", "Shrimp", "Peanuts", "Tamarind"],
  });
  await mkItem(meridianMenu, meridian, "Butter chicken curry", 1700, {
    category: "Mains",
    tags: ["Mild spice"],
    spiceLevel: "mild",
    allergens: ["Dairy"],
    ingredients: ["Chicken", "Tomato", "Cream", "Garam masala"],
  });
  await mkItem(meridianMenu, meridian, "Poke bowl", 1600, {
    category: "Mains",
    tags: ["Raw", "Gluten-free"],
    allergens: ["Fish", "Soy"],
    ingredients: ["Ahi tuna", "Rice", "Avocado", "Edamame", "Ponzu"],
  });
  await mkItem(meridianMenu, meridian, "Rooftop tiramisu", 900, {
    category: "Dessert",
    tags: ["Vegetarian"],
    allergens: ["Dairy", "Gluten", "Eggs"],
    ingredients: ["Mascarpone", "Espresso", "Cocoa", "Ladyfingers"],
  });

  // ------------------------------------------------------------ slots (10 days)
  for (const restaurantId of [trullo, sakura, zaytoun, brasa, meridian]) {
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
  for (const r of [trullo, sakura, zaytoun, brasa, meridian]) {
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

  return {
    seeded: true,
    customers: customers.length,
    restaurants: [trullo, sakura, zaytoun, brasa, meridian],
    booking: b1,
  };
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
  "Hummus": { tags: ["Vegan", "Shareable"], ingredients: ["Chickpeas", "Tahini", "Lemon", "Olive oil"] },
  "Tabbouleh": { tags: ["Vegan", "Shareable"], ingredients: ["Parsley", "Bulgur", "Tomato", "Lemon"] },
  "Kibbeh": { tags: ["Fried"], allergens: ["Gluten"], ingredients: ["Bulgur", "Ground beef", "Pine nuts", "Spices"] },
  "Chicken shawarma": { tags: ["Grilled"], ingredients: ["Chicken", "Garlic sauce", "Pickles", "Flatbread"] },
  "Baklava": { tags: ["Vegetarian", "Shareable"], allergens: ["Nuts", "Gluten"], ingredients: ["Phyllo", "Pistachio", "Honey syrup"] },
  "Tacos al pastor": { tags: ["Chef's special", "Grilled"], ingredients: ["Pork", "Pineapple", "Onion", "Cilantro", "Corn tortilla"] },
  "Guacamole": { tags: ["Vegan", "Shareable"], ingredients: ["Avocado", "Lime", "Cilantro", "Serrano chile"] },
  "Elote": { tags: ["Vegetarian", "Spicy"], spiceLevel: "medium", allergens: ["Dairy"], ingredients: ["Grilled corn", "Cotija", "Chili powder", "Lime"] },
  "Carne asada 400g": { tags: ["Grilled"], ingredients: ["Skirt steak", "Chimichurri", "Charred lime"] },
  "Margarita": { tags: ["House-made"], ingredients: ["Tequila", "Lime", "Triple sec"] },
  "Wagyu burger": { tags: ["Chef's special", "Grilled"], allergens: ["Gluten", "Dairy"], ingredients: ["Wagyu beef", "Brioche bun", "Truffle aioli", "Cheddar"] },
  "Pad thai": { tags: ["Spicy"], spiceLevel: "medium", allergens: ["Peanuts", "Shellfish", "Gluten"], ingredients: ["Rice noodles", "Shrimp", "Peanuts", "Tamarind"] },
  "Butter chicken curry": { tags: ["Mild spice"], spiceLevel: "mild", allergens: ["Dairy"], ingredients: ["Chicken", "Tomato", "Cream", "Garam masala"] },
  "Poke bowl": { tags: ["Raw", "Gluten-free"], allergens: ["Fish", "Soy"], ingredients: ["Ahi tuna", "Rice", "Avocado", "Edamame", "Ponzu"] },
  "Rooftop tiramisu": { tags: ["Vegetarian"], allergens: ["Dairy", "Gluten", "Eggs"], ingredients: ["Mascarpone", "Espresso", "Cocoa", "Ladyfingers"] },
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
      const solo = ["Sakura House", "Beit Zaytoun", "La Brasa", "Meridian Kitchen"].includes(r.name);
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
// demo activity generator — realistic bookings / orders / reviews
//
// The AI concierge (ai.recommendDinner) and ops advisor (ai.ownerInsights)
// are only as good as the data they read. The base seed ships a handful of
// bookings, so this generator backfills ~5 weeks of believable history for
// every demo restaurant (@kamix.demo owners): completed / no-show /
// cancelled bookings across weekdays (weekends busier), dine-in orders on
// the restaurant's real menu items, verified reviews, waitlist entries and
// checked-in timestamps — so wait-time analytics have real signal too.
// Idempotent: skips any restaurant that already has >15 bookings.
// ---------------------------------------------------------------------------

const REVIEW_TEXTS = [
  "Wonderful evening — the service was warm and the food arrived fast.",
  "Great spot for a date night. Booking through the app was seamless.",
  "Solid food and a lovely atmosphere. Will definitely come back.",
  "The staff went above and beyond for our anniversary. Highly recommend.",
  "Came for a birthday dinner — they even brought out a dessert with a candle.",
  "Delicious, fresh, and beautifully presented. A new favorite.",
  "Lovely vibe and generous portions. The terrace is the place to sit.",
  "Good food but the wait was a bit long on a busy Friday night.",
  "Nice menu and friendly team. Parking nearby is tricky though.",
  "Perfect for a business lunch — quiet enough to talk, fast enough to leave on time.",
  "The specials were fantastic and reasonably priced.",
  "Cozy and authentic. You can tell the kitchen cares.",
  "Great cocktails and even better pasta. We'll be back next week!",
  "Decent food, but service slowed down when it got busy.",
  "Amazing value for the quality. Highly recommended.",
  "The chef's tasting menu was the highlight of our trip.",
];

const REVIEWERS = [
  "Ava", "Leo", "Mia", "Noah", "Zoe", "Liam", "Emma", "Ethan", "Grace", "Lucas",
  "Sofia", "Mason", "Chloe", "Oscar", "Ruby", "Felix", "Nora", "Adam", "Ivy", "Owen",
];

/** Deterministic PRNG so every run produces the same dataset. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(rand: () => number): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

/** "YYYY-MM-DD" + "HH:mm" → epoch ms (UTC — only relative ordering matters here). */
function bookingTimeMs(date: string, time: string): number {
  return new Date(`${date}T${time}:00Z`).getTime();
}

/** Pick n distinct items (weighted toward popular) from a menu list. */
function pickItems<T extends { _id: string; name: string; priceCents: number; popular?: boolean }>(
  rand: () => number,
  items: T[],
  max: number,
): T[] {
  if (items.length === 0) return [];
  const weighted = items.flatMap((it) => Array(it.popular ? 3 : 1).fill(it));
  const picked: T[] = [];
  const used = new Set<string>();
  const count = 1 + Math.floor(rand() * max);
  for (let i = 0; i < count && picked.length < max; i++) {
    const candidate = weighted[Math.floor(rand() * weighted.length)]!;
    if (used.has(candidate._id)) continue;
    used.add(candidate._id);
    picked.push(candidate);
  }
  return picked.length > 0 ? picked : [items[Math.floor(rand() * items.length)]!];
}

/**
 * Generate the realistic history for all demo restaurants. Admin-only (it
 * writes a lot of rows). Safe to re-run — skips restaurants with data.
 */
export const generateDemoActivity = mutation({
  args: {},
  handler: async (ctx) => {
    // Admin-only: this writes a lot of rows; diners shouldn't trigger it.
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const me = await ctx.db.get(userId as Id<"users">);
    if (me?.role !== "admin") throw new Error("Admins only.");

    const rand = mulberry32(20260821);
    const now = Date.now();
    const todayKey = daysFromNow(0);

    // demo restaurants = owned by @kamix.demo accounts
    const restaurants = await ctx.db.query("restaurants").collect();
    const demo: Doc<"restaurants">[] = [];
    for (const r of restaurants) {
      const owner = await safeGet<Doc<"users">>(ctx, r.ownerId);
      if (owner?.email?.endsWith("@kamix.demo")) demo.push(r);
    }
    if (demo.length === 0) return { seeded: false, reason: "no demo restaurants" };

    // demo diners = the seeded customer accounts (@kamix.demo)
    const allUsers = await ctx.db.query("users").collect();
    const diners = allUsers.filter(
      (u) => u.email?.endsWith("@kamix.demo") && u.role === "customer",
    );
    if (diners.length < 5) return { seeded: false, reason: "not enough demo diners" };

    const totals = { restaurants: 0, bookings: 0, orders: 0, reviews: 0, waitlist: 0 };

    for (const r of demo) {
      // idempotency: only generate for restaurants with little/no history
      const existing = await ctx.db
        .query("bookings")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
        .collect();
      if (existing.length > 15) {
        totals.restaurants++;
        continue; // already has activity
      }

      const sections = await ctx.db
        .query("sections")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
        .collect();
      const hours = await ctx.db
        .query("hours")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
        .collect();
      const menuItems = await ctx.db
        .query("menuItems")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id))
        .collect();

      const times: string[] = [];
      for (const h of hours.filter((x) => x.enabled)) {
        const open = Number(h.open.slice(0, 2)) * 60 + Number(h.open.slice(3, 5));
        const close = Number(h.close.slice(0, 2)) * 60 + Number(h.close.slice(3, 5));
        for (let m = open + 60; m <= close - 30; m += 30) {
          const t = `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          if (!times.includes(t)) times.push(t);
        }
      }
      if (times.length === 0) times.push("19:00", "19:30", "20:00", "20:30", "21:00", "21:30");

      let restaurantBookings = 0;
      let restaurantOrders = 0;
      let restaurantReviews = 0;

      // 5 weeks of history: Fri/Sat busiest, Sun moderate, Mon–Thu quieter
      for (let d = 35; d >= 0; d--) {
        const date = daysFromNow(-d);
        const dow = new Date(`${date}T00:00:00`).getDay();
        const isWeekend = dow === 5 || dow === 6;
        const isSunday = dow === 0;
        const count = isWeekend
          ? 3 + Math.floor(rand() * 4) // 3–6
          : isSunday
            ? 2 + Math.floor(rand() * 3) // 2–4
            : 1 + Math.floor(rand() * 3); // 1–3

        for (let i = 0; i < count; i++) {
          const isPast = date < todayKey;
          const status = isPast
            ? rand() < 0.12
              ? "no_show"
              : rand() < 0.18
                ? "cancelled"
                : "completed"
            : "confirmed";
          if (status === "cancelled") continue; // cancelled rows add no signal

          const diner = diners[Math.floor(rand() * diners.length)]!;
          const section = sections.length > 0 ? sections[Math.floor(rand() * sections.length)] : null;
          const time = times[Math.floor(rand() * times.length)]!;
          const partySize = [1, 2, 2, 2, 3, 3, 4, 4, 5][Math.floor(rand() * 9)]!;
          const createdOffset = 1 + Math.floor(rand() * 72) * 3600_000; // booked 1h–3d ahead
          const createdAt = isPast ? bookingTimeMs(date, time) - createdOffset : now - createdOffset;
          const checkedInAt =
            status === "completed" ? bookingTimeMs(date, time) + Math.floor((rand() - 0.4) * 30 * 60_000) : undefined;

          const code = randomCode(rand);
          const bookingId = await ctx.db.insert("bookings", {
            restaurantId: r._id,
            userId: diner._id,
            name: diner.name ?? diner.email ?? "Guest",
            email: diner.email,
            phone: diner.phone,
            date,
            time,
            partySize,
            sectionId: section?._id,
            sectionName: section?.name,
            kind: section?.kind,
            smoking: section?.smoking,
            status: status as "confirmed" | "completed" | "no_show",
            code,
            notes: rand() < 0.15 ? "Birthday" : rand() < 0.1 ? "Window table please" : undefined,
            occasion: rand() < 0.12 ? ["Birthday", "Anniversary", "Date night", "Business"][Math.floor(rand() * 4)] : undefined,
            createdAt,
            updatedAt: status === "completed" && checkedInAt ? checkedInAt + 70 * 60_000 : createdAt,
            smsSent: true,
            reminderSent: isPast ? true : undefined,
            checkedInAt: checkedInAt && checkedInAt > 0 ? checkedInAt : undefined,
          });
          restaurantBookings++;

          // dine-in order for most completed visits, using real menu items
          if (status === "completed" && menuItems.length > 0 && rand() < 0.6) {
            const picked = pickItems(rand, menuItems, 4);
            const items = picked.map((it) => {
              const quantity = 1 + (rand() < 0.35 ? 1 : 0);
              return {
                menuItemId: it._id,
                name: it.name,
                priceCents: it.priceCents,
                quantity,
                ingredients: (it.ingredients ?? undefined) as string[] | undefined,
              };
            });
            const totalCents = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);
            const orderAt = (checkedInAt ?? createdAt) + 15 * 60_000;
            await ctx.db.insert("dineOrders", {
              bookingId,
              restaurantId: r._id,
              userId: diner._id,
              items,
              totalCents,
              status: "completed",
              createdAt: orderAt,
              updatedAt: orderAt + 55 * 60_000,
            });
            restaurantOrders++;
          }

          // verified review for a share of completed visits
          if (status === "completed" && rand() < 0.4) {
            const ratingRoll = rand();
            const rating = ratingRoll < 0.05 ? 1 : ratingRoll < 0.15 ? 2 : ratingRoll < 0.3 ? 3 : ratingRoll < 0.6 ? 4 : 5;
            await ctx.db.insert("reviews", {
              restaurantId: r._id,
              userId: diner._id,
              bookingId,
              rating,
              text: REVIEW_TEXTS[Math.floor(rand() * REVIEW_TEXTS.length)],
              createdAt: (checkedInAt ?? createdAt) + 26 * 3600_000, // next day
            });
            restaurantReviews++;
          }
        }
      }

      // a couple of waitlist entries for sold-out slots (waiting + one freed)
      const future = daysFromNow(1 + Math.floor(rand() * 3));
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", r._id).eq("date", future))
        .collect();
      const full = slots.filter((s) => s.remaining === 0);
      const target = full.length > 0 ? full[Math.floor(rand() * full.length)] : null;
      if (target) {
        const diner = diners[Math.floor(rand() * diners.length)]!;
        await ctx.db.insert("waitlist", {
          restaurantId: r._id,
          sectionId: target.sectionId,
          sectionName: sections.find((s) => s._id === target.sectionId)?.name,
          date: future,
          time: target.time,
          partySize: 2,
          userId: diner._id,
          name: diner.name ?? "Guest",
          phone: diner.phone,
          status: "waiting",
          createdAt: now - Math.floor(rand() * 12) * 3600_000,
        });
        totals.waitlist++;
      }

      totals.restaurants++;
      totals.bookings += restaurantBookings;
      totals.orders += restaurantOrders;
      totals.reviews += restaurantReviews;
    }

    return { seeded: true, totals };
  },
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
  "stories",
  "loyaltyLedger",
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
 * `npm run seed` — wipe everything, then recreate the full demo dataset:
 * 100 customers, 5 cuisine-themed restaurants (Italian, Japanese, Lebanese,
 * Mexican, International), each with its own menu, bookings for
 * today/tomorrow, waitlist, and reviews. Always produces a fresh, consistent
 * dataset.
 */
export const resetData = mutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await wipeAll(ctx);
    const seeded = await runSeed(ctx);
    return { deleted, seeded };
  },
});
