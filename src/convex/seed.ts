import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureSlotsForDate } from "./availability";
import { applyDemoRules } from "./demoRules";

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const weekdays = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun so "open today" lands on weekdays first

export const ensureDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("restaurants").first();
    if (existing) return { seeded: false, reason: "already has data" };

    const now = Date.now();
    const ownerMarco = await ctx.db.insert("users", {
      name: "Marco Bianchi",
      email: "marco@kamix.demo",
      role: "owner",
      phone: "+15550001001",
      onboarded: true,
    });
    const ownerYuki = await ctx.db.insert("users", {
      name: "Yuki Tanaka",
      email: "yuki@kamix.demo",
      role: "owner",
      phone: "+15550001002",
      onboarded: true,
    });
    const ava = await ctx.db.insert("users", {
      name: "Ava",
      email: "ava@kamix.demo",
      role: "customer",
      phone: "+15550001111",
      onboarded: true,
    });
    const leo = await ctx.db.insert("users", {
      name: "Leo",
      email: "leo@kamix.demo",
      role: "customer",
      phone: "+15550002222",
      onboarded: true,
    });

    // ---------------------------------------------------------------- places
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
      features: { inside: true, outside: true, bar: false, smoking: false, parking: false, liveMusic: false, soloFriendly: false },
      searchText: "",
      createdAt: now,
    });
    const sakura = await ctx.db.insert("restaurants", {
      ownerId: ownerYuki,
      name: "Sakura House",
      cuisine: "Japanese",
      city: "Milan",
      address: "Corso Garibaldi 42",
      neighborhood: "Moscova",
      phone: "+39 02 555 0202",
      priceRange: "$$$",
      description:
        "Omakase counter seating and a cozy izakaya floor. Fresh fish delivered daily from the market.",
      imageUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=900&q=70",
      features: { inside: true, outside: false, bar: true, smoking: false, parking: false, liveMusic: false, soloFriendly: true },
      searchText: "",
      createdAt: now,
    });
    const oliva = await ctx.db.insert("restaurants", {
      ownerId: ownerMarco,
      name: "Casa Oliva",
      cuisine: "Mediterranean",
      city: "Rome",
      address: "Piazza Navona 8",
      neighborhood: "Centro Storico",
      phone: "+39 06 555 0303",
      priceRange: "$$",
      description:
        "Sun-drenched courtyard dining with olive trees. Tapas-style sharing plates and crisp rosé.",
      imageUrl: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=900&q=70",
      features: { inside: true, outside: true, bar: true, smoking: false, parking: true, liveMusic: true, soloFriendly: true },
      searchText: "",
      createdAt: now,
    });
    const asado = await ctx.db.insert("restaurants", {
      ownerId: ownerYuki,
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
        spiceLevel: opts.spiceLevel,
      });

    const trulloMenu = await mkMenu(trullo, "Aperitivo & Pasta", "Evening menu");
    await mkItem(trulloMenu, trullo, "Negroni", 1200, {
      category: "Drinks",
      popular: true,
      imageUrl: "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=400&q=70",
      tags: ["House-made"],
    });
    await mkItem(trulloMenu, trullo, "Burrata & prosciutto", 1400, {
      category: "Starters",
      popular: true,
      imageUrl: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&q=70",
      tags: ["Local"],
      allergens: ["Dairy"],
    });
    await mkItem(trulloMenu, trullo, "Cacio e pepe", 1800, {
      category: "Pasta",
      popular: true,
      description: "Pecorino romano, black pepper, tonnarelli",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=70",
      tags: ["Vegetarian", "House-made"],
      allergens: ["Gluten", "Dairy"],
    });
    await mkItem(trulloMenu, trullo, "Tagliatelle al ragù", 1900, {
      category: "Pasta",
      tags: ["House-made"],
      allergens: ["Gluten", "Dairy"],
    });
    await mkItem(trulloMenu, trullo, "Panna cotta", 800, {
      category: "Dessert",
      imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=70",
      tags: ["Vegetarian", "House-made"],
      allergens: ["Dairy"],
    });

    const sakuraMenu = await mkMenu(sakura, "Omakase", "Chef's selection");
    await mkItem(sakuraMenu, sakura, "Nigiri set (8 pcs)", 4200, {
      category: "Sushi",
      popular: true,
      imageUrl: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&q=70",
      tags: ["Chef's special"],
      allergens: ["Fish", "Gluten"],
    });
    await mkItem(sakuraMenu, sakura, "Salmon sashimi", 1600, {
      category: "Sashimi",
      tags: ["Raw"],
      allergens: ["Fish"],
    });
    await mkItem(sakuraMenu, sakura, "Miso soup", 400, {
      category: "Soups",
      tags: ["Vegan"],
      allergens: ["Soy", "Gluten"],
    });
    await mkItem(sakuraMenu, sakura, "Yuzu highball", 1100, {
      category: "Drinks",
      popular: true,
      tags: ["House-made"],
    });

    const olivaMenu = await mkMenu(oliva, "Sharing plates", "All day");
    await mkItem(olivaMenu, oliva, "Patatas bravas", 700, {
      category: "Tapas",
      popular: true,
      imageUrl: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&q=70",
      tags: ["Vegan", "Spicy", "Shareable"],
      spiceLevel: "medium",
    });
    await mkItem(olivaMenu, oliva, "Croquetas de jamón", 800, {
      category: "Tapas",
      tags: ["Shareable"],
      allergens: ["Gluten", "Dairy"],
    });
    await mkItem(olivaMenu, oliva, "Grilled octopus", 1600, {
      category: "Mains",
      popular: true,
      tags: ["Grilled", "Local"],
      allergens: ["Molluscs"],
    });
    await mkItem(olivaMenu, oliva, "Rose spritz", 900, {
      category: "Drinks",
      tags: ["House-made"],
    });

    const asadoMenu = await mkMenu(asado, "Asado", "From the fire");
    await mkItem(asadoMenu, asado, "Entraña (skirt steak) 400g", 3400, {
      category: "Cuts",
      popular: true,
      imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=70",
      tags: ["Chef's special", "Grilled"],
    });
    await mkItem(asadoMenu, asado, "Chorizo criollo", 1300, {
      category: "Cuts",
      tags: ["Spicy"],
      allergens: ["Gluten", "Sulphites"],
      spiceLevel: "hot",
    });
    await mkItem(asadoMenu, asado, "Provoleta", 900, {
      category: "Starters",
      popular: true,
      tags: ["Vegetarian", "Shareable"],
      allergens: ["Dairy"],
    });
    await mkItem(asadoMenu, asado, "Malbec glass", 900, {
      category: "Drinks",
      tags: ["Local"],
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
  },
});
