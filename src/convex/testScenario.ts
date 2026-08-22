import { getAuthUserId } from "@convex-dev/auth/server";
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureSlotsForDate } from "./availability";

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Complex scenario: 5 customers at the same restaurant.
 *
 * 1. Creates 5 customer accounts with phone + password
 * 2. Creates confirmed bookings for all 5 at Beit Zaytoun for today
 * 3. Sets socialize visibility for all 5
 * 4. Sends gifts between diners (cross-gifting)
 * 5. Creates dine-in orders for each diner
 *
 * Admin-only.
 */
export const setupComplexScenario = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Must be signed in.");
    const me = await ctx.db.get(userId as Id<"users">);
    if (me?.role !== "admin") throw new Error("Admins only.");

    const now = Date.now();
    const today = todayKey();

    // ---------------------------------------------------------- 1. Create 5 diners
    const diners = [
      { name: "Sara Khoury", phone: "+96130000001", password: "Test1234!" },
      { name: "Omar Fares", phone: "+96130000002", password: "Test1234!" },
      { name: "Layla Nasser", phone: "+96130000003", password: "Test1234!" },
      { name: "Karim Haddad", phone: "+96130000004", password: "Test1234!" },
      { name: "Nadia Abbas", phone: "+96130000005", password: "Test1234!" },
    ];

    const dinerIds: Id<"users">[] = [];
    for (const d of diners) {
      // Check if already exists
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("phone"), d.phone))
        .first();
      if (existing) {
        dinerIds.push(existing._id);
        continue;
      }
      const id = await ctx.db.insert("users", {
        name: d.name,
        email: `${d.name.toLowerCase().replace(/\s+/g, ".")}@test.kamix`,
        role: "customer",
        phone: d.phone,
        prefs: {
          dietary: ["Vegetarian", "Gluten-free"],
          seating: ["inside", "outside"],
          occasions: ["Date night"],
        },
      });
      dinerIds.push(id);

      // Create password auth account
      await createAccount(ctx as never, {
        provider: "password",
        account: { id: d.phone, secret: d.password },
        profile: { name: d.name, phone: d.phone },
      });
    }

    // ---------------------------------------------------------- 2. Find Beit Zaytoun
    const restaurant = await ctx.db
      .query("restaurants")
      .filter((q) => q.eq(q.field("name"), "Beit Zaytoun"))
      .first();
    if (!restaurant) return { error: "Beit Zaytoun not found — run seed first." };

    // Ensure slots exist for today
    await ensureSlotsForDate(ctx, restaurant._id, today);

    // Find a section
    const section = await ctx.db
      .query("sections")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .first();
    if (!section) return { error: "No sections found for Beit Zaytoun." };

    // Find menu items
    const menuItems = await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();

    // Find gift types
    const giftTypes = await ctx.db
      .query("giftTypes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();

    // ---------------------------------------------------------- 3. Create bookings
    const times = ["19:00", "19:30", "20:00", "20:30", "21:00"];
    const bookingIds: Id<"bookings">[] = [];

    for (let i = 0; i < 5; i++) {
      // Check if booking already exists
      const existing = await ctx.db
        .query("bookings")
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), dinerIds[i]),
            q.eq(q.field("restaurantId"), restaurant._id),
            q.eq(q.field("date"), today),
          ),
        )
        .first();
      if (existing) {
        bookingIds.push(existing._id);
        continue;
      }

      const code = `TEST${String(i + 1).padStart(2, "0")}${String.fromCharCode(65 + i)}`;
      const partySize = i === 0 ? 4 : i === 2 ? 3 : 2;

      const bookingId = await ctx.db.insert("bookings", {
        restaurantId: restaurant._id,
        userId: dinerIds[i],
        name: diners[i].name,
        phone: diners[i].phone,
        date: today,
        time: times[i],
        partySize,
        sectionId: section._id,
        sectionName: section.name,
        kind: section.kind,
        smoking: section.smoking,
        status: "confirmed",
        code,
        createdAt: now - (5 - i) * 60_000,
        updatedAt: now - (5 - i) * 60_000,
        checkedInAt: now - (3 - i) * 30_000, // all checked in
      });
      bookingIds.push(bookingId);
    }

    // Consume seats
    for (let i = 0; i < 5; i++) {
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_restaurant_date", (q) =>
          q.eq("restaurantId", restaurant._id).eq("date", today),
        )
        .collect();
      const slot = slots.find(
        (s) => s.sectionId === section._id && s.time === times[i],
      );
      if (slot && slot.remaining > 0) {
        await ctx.db.patch(slot._id, {
          remaining: Math.max(0, slot.remaining - 1),
        });
      }
    }

    // ---------------------------------------------------------- 4. Set socialize visibility
    const presenceIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const existing = await ctx.db
        .query("dinerPresence")
        .withIndex("by_booking", (q) => q.eq("bookingId", bookingIds[i]))
        .first();
      if (existing) {
        if (!existing.visible) {
          await ctx.db.patch(existing._id, { visible: true, updatedAt: now });
        }
        presenceIds.push(existing._id);
        continue;
      }
      const id = await ctx.db.insert("dinerPresence", {
        bookingId: bookingIds[i],
        restaurantId: restaurant._id,
        userId: dinerIds[i],
        visible: true,
        updatedAt: now,
      });
      presenceIds.push(id);
    }

    // ---------------------------------------------------------- 5. Send gifts
    const giftResults: string[] = [];
    if (giftTypes.length >= 2) {
      // Sara → Omar (revealed now)
      const gift1 = giftTypes[0];
      const existingGift1 = await ctx.db
        .query("giftDeliveries")
        .filter((q) =>
          q.and(
            q.eq(q.field("senderUserId"), dinerIds[0]),
            q.eq(q.field("receiverUserId"), dinerIds[1]),
            q.eq(q.field("giftId"), gift1._id),
          ),
        )
        .first();
      if (!existingGift1) {
        await ctx.db.insert("giftDeliveries", {
          restaurantId: restaurant._id,
          bookingId: bookingIds[0],
          senderUserId: dinerIds[0],
          receiverUserId: dinerIds[1],
          giftId: gift1._id,
          name: gift1.name,
          emoji: gift1.emoji,
          priceCents: gift1.priceCents,
          note: "Enjoy this on me! 🎉",
          reveal: "now",
          status: "ordered",
          revealedAt: now,
          createdAt: now,
        });
        giftResults.push(`Sara → Omar: ${gift1.emoji} ${gift1.name} (revealed now)`);
      }

      // Layla → Karim (surprise)
      const gift2 = giftTypes[1];
      const existingGift2 = await ctx.db
        .query("giftDeliveries")
        .filter((q) =>
          q.and(
            q.eq(q.field("senderUserId"), dinerIds[2]),
            q.eq(q.field("receiverUserId"), dinerIds[3]),
            q.eq(q.field("giftId"), gift2._id),
          ),
        )
        .first();
      if (!existingGift2) {
        await ctx.db.insert("giftDeliveries", {
          restaurantId: restaurant._id,
          bookingId: bookingIds[2],
          senderUserId: dinerIds[2],
          receiverUserId: dinerIds[3],
          giftId: gift2._id,
          name: gift2.name,
          emoji: gift2.emoji,
          priceCents: gift2.priceCents,
          note: "A surprise for you!",
          reveal: "on_delivery",
          status: "ordered",
          createdAt: now,
        });
        giftResults.push(`Layla → Karim: ${gift2.emoji} ${gift2.name} (surprise)`);
      }

      // Nadia → Sara (revealed now)
      if (giftTypes.length >= 3) {
        const gift3 = giftTypes[2];
        const existingGift3 = await ctx.db
          .query("giftDeliveries")
          .filter((q) =>
            q.and(
              q.eq(q.field("senderUserId"), dinerIds[4]),
              q.eq(q.field("receiverUserId"), dinerIds[0]),
              q.eq(q.field("giftId"), gift3._id),
            ),
          )
          .first();
        if (!existingGift3) {
          await ctx.db.insert("giftDeliveries", {
            restaurantId: restaurant._id,
            bookingId: bookingIds[4],
            senderUserId: dinerIds[4],
            receiverUserId: dinerIds[0],
            giftId: gift3._id,
            name: gift3.name,
            emoji: gift3.emoji,
            priceCents: gift3.priceCents,
            note: "You deserve this! 💛",
            reveal: "now",
            status: "ordered",
            revealedAt: now,
            createdAt: now,
          });
          giftResults.push(`Nadia → Sara: ${gift3.emoji} ${gift3.name} (revealed now)`);
        }
      }
    }

    // ---------------------------------------------------------- 6. Create dine-in orders
    const orderResults: string[] = [];
    if (menuItems.length >= 2) {
      for (let i = 0; i < 5; i++) {
        // Check if order already exists
        const existingOrder = await ctx.db
          .query("dineOrders")
          .withIndex("by_booking", (q) => q.eq("bookingId", bookingIds[i]))
          .first();
        if (existingOrder) {
          orderResults.push(`${diners[i].name}: already has order`);
          continue;
        }

        // Pick 2-3 random menu items
        const picked: typeof menuItems = [];
        const usedIdx = new Set<number>();
        const count = 2 + (i % 2);
        for (let j = 0; j < count && j < menuItems.length; j++) {
          let idx: number;
          do {
            idx = Math.floor(Math.random() * menuItems.length);
          } while (usedIdx.has(idx));
          usedIdx.add(idx);
          picked.push(menuItems[idx]);
        }

        const orderItems = picked.map((it, idx) => ({
          menuItemId: it._id,
          name: it.name,
          priceCents: it.priceCents,
          quantity: idx === 0 ? 2 : 1,
        }));
        const totalCents = orderItems.reduce((s, it) => s + it.priceCents * it.quantity, 0);

        await ctx.db.insert("dineOrders", {
          bookingId: bookingIds[i],
          restaurantId: restaurant._id,
          userId: dinerIds[i],
          items: orderItems,
          totalCents,
          status: "open",
          createdAt: now - (5 - i) * 120_000,
          updatedAt: now - (5 - i) * 120_000,
        });
        orderResults.push(
          `${diners[i].name}: ${orderItems.map((it) => `${it.quantity}x ${it.name}`).join(", ")} — $${(totalCents / 100).toFixed(2)}`,
        );
      }
    }

    return {
      scenario: "Complex: 5 diners at Beit Zaytoun",
      restaurant: restaurant.name,
      date: today,
      diners: diners.map((d, i) => ({
        name: d.name,
        phone: d.phone,
        bookingId: bookingIds[i],
        time: times[i],
      })),
      socializeVisible: presenceIds.length,
      gifts: giftResults,
      orders: orderResults,
    };
  },
});

/**
 * Verify the scenario by querying all the data we created.
 */
export const verifyScenario = query({
  args: {},
  handler: async (ctx) => {
    const today = todayKey();

    // Find the restaurant
    const restaurant = await ctx.db
      .query("restaurants")
      .filter((q) => q.eq(q.field("name"), "Beit Zaytoun"))
      .first();
    if (!restaurant) return { error: "Restaurant not found" };

    // Today's bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();
    const todayBookings = bookings.filter((b) => b.date === today);

    // Visible diners
    const presences = await ctx.db
      .query("dinerPresence")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();
    const visibleCount = presences.filter((p) => p.visible).length;

    // Gift deliveries
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();

    // Orders
    const orders = await ctx.db
      .query("dineOrders")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();

    // Resolve names
    const userIds = new Set<string>();
    for (const b of todayBookings) userIds.add(b.userId);
    for (const g of gifts) {
      userIds.add(g.senderUserId);
      userIds.add(g.receiverUserId);
    }
    const userNames: Record<string, string> = {};
    for (const uid of userIds) {
      const u = await ctx.db.get(uid as Id<"users">);
      userNames[uid] = u?.name ?? "Unknown";
    }

    return {
      restaurant: restaurant.name,
      date: today,
      bookings: todayBookings.map((b) => ({
        name: userNames[b.userId] ?? "Unknown",
        time: b.time,
        partySize: b.partySize,
        status: b.status,
        code: b.code,
      })),
      visibleDiners: visibleCount,
      gifts: gifts.map((g) => ({
        from: userNames[g.senderUserId] ?? "Unknown",
        to: userNames[g.receiverUserId] ?? "Unknown",
        gift: `${g.emoji} ${g.name}`,
        reveal: g.reveal,
        status: g.status,
      })),
      orders: orders.map((o) => ({
        user: userNames[o.userId] ?? "Unknown",
        items: o.items.map((it) => `${it.quantity}x ${it.name}`).join(", "),
        total: `$${(o.totalCents / 100).toFixed(2)}`,
        status: o.status,
      })),
    };
  },
});
