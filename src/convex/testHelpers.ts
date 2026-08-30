/**
 * Test-only helpers — deploy only in dev/staging.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { createAccount } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Admin-only: clear all rate limit rows. */
export const clearRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId!);
    if (user?.role !== "admin") throw new Error("Admins only");
    const rows = await ctx.db.query("rateLimits").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { cleared: rows.length };
  },
});

/** Wipe rate limits (no auth required). */
export const wipeRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rateLimits").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { cleared: rows.length };
  },
});

/**
 * No-auth: fix the admin's password auth account after corruption.
 * Deletes ALL auth accounts for the admin phone and recreates them
 * by patching with the correct Scrypt hash.
 */
export const fixAdminAuth = mutation({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const phone = "+96176683661";

    // Find the admin user
    const adminUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("phone"), phone))
      .first();
    if (!adminUser) return { error: "Admin user not found" };

    // Delete ALL auth accounts for this phone
    const allAccounts = await ctx.db.query("authAccounts").collect();
    let deleted = 0;
    for (const a of allAccounts) {
      if (a.providerAccountId === phone || a.userId === adminUser._id) {
        await ctx.db.delete(a._id);
        deleted++;
      }
    }

    // Delete all sessions for this user
    const sessions = await ctx.db
      .query("authSessions")
      .filter((q) => q.eq(q.field("userId"), adminUser._id))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);

    // Hash the password using Scrypt (same as the auth library's Password provider)
    const scrypt = new Scrypt();
    const hash = await scrypt.hash(password);

    // Insert a fresh password auth account linked to the admin user
    await ctx.db.insert("authAccounts", {
      userId: adminUser._id,
      provider: "password",
      providerAccountId: phone,
      secret: hash,
    });

    // Also create a phone-otp auth account
    await ctx.db.insert("authAccounts", {
      userId: adminUser._id,
      provider: "phone-otp",
      providerAccountId: phone,
    });

    return { deleted, created: true };
  },
});

const TEST_PASSWORD = "KamixTest2026!";

/**
 * Seed all test accounts (5 customers + 2 owners).
 * Safe to re-run — deletes existing users with matching phones first.
 */
export const seedAllTestUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const accounts = [
      // 5 Customers
      { phone: "+96171111111", name: "Layla Customer", role: "customer" as const },
      { phone: "+96172222222", name: "Omar Customer", role: "customer" as const },
      { phone: "+96173333333", name: "Sara Customer", role: "customer" as const },
      { phone: "+96174444444", name: "Ali Customer", role: "customer" as const },
      { phone: "+96175555555", name: "Nour Customer", role: "customer" as const },
      // 2 Owners
      { phone: "+96176666666", name: "Bilal Owner", role: "owner" as const },
      { phone: "+96177777777", name: "Rima Owner", role: "owner" as const },
    ];

    const results: { phone: string; name: string; role: string; action: string }[] = [];

    for (const acct of accounts) {
      // Delete any existing user with this phone
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("phone"), acct.phone))
        .first();
      if (existing) {
        // Delete auth accounts linked to this user
        const authAccounts = await ctx.db
          .query("authAccounts")
          .filter((q) => q.eq(q.field("userId"), existing._id))
          .collect();
        for (const a of authAccounts) await ctx.db.delete(a._id);
        // Also delete by providerAccountId (phone)
        const phoneAccounts = await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q.eq("provider", "password").eq("providerAccountId", acct.phone)
          )
          .collect();
        for (const a of phoneAccounts) await ctx.db.delete(a._id);
        await ctx.db.delete(existing._id);
      }

      // Create user via auth library
      const { user } = await createAccount(ctx as never, {
        provider: "password",
        account: { id: acct.phone, secret: TEST_PASSWORD },
        profile: {
          email: acct.phone,
          phone: acct.phone,
          name: acct.name,
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: true,
      });

      await ctx.db.patch(user._id, {
        role: acct.role,
        onboarded: true,
        mustChangePassword: false,
        name: acct.name,
        phone: acct.phone,
      });

      results.push({ phone: acct.phone, name: acct.name, role: acct.role, action: "created" });
    }

    // Create restaurants for the 2 owners
    const restaurants = [
      {
        ownerPhone: "+96176666666",
        name: "Bilal's Grill House",
        cuisine: "Lebanese",
        city: "Beirut",
        address: "Hamra St, Beirut",
        neighborhood: "Hamra",
        phone: "+96176666666",
        priceRange: "$$",
        description: "Authentic Lebanese grilled meats and mezze in the heart of Hamra.",
        imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=70",
        features: { inside: true, outside: true, bar: true, smoking: false, parking: false, liveMusic: false, soloFriendly: true },
      },
      {
        ownerPhone: "+96177777777",
        name: "Rima's Kitchen",
        cuisine: "Italian",
        city: "Beirut",
        address: "Gemmayze, Beirut",
        neighborhood: "Gemmayze",
        phone: "+96177777777",
        priceRange: "$$$",
        description: "Wood-fired pizza and handmade pasta with a Mediterranean twist.",
        imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=70",
        features: { inside: true, outside: true, bar: false, smoking: false, parking: true, liveMusic: true, soloFriendly: false },
      },
    ];

    for (const r of restaurants) {
      // Find owner
      const owner = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("phone"), r.ownerPhone))
        .first();
      if (!owner) continue;

      // Check if already has a restaurant
      const existing = await ctx.db
        .query("restaurants")
        .filter((q) => q.eq(q.field("ownerId"), owner._id))
        .first();
      if (existing) {
        results.push({ phone: r.ownerPhone, name: r.name, role: "owner", action: "restaurant-exists" });
        continue;
      }

      const restId = await ctx.db.insert("restaurants", {
        ownerId: owner._id,
        name: r.name,
        cuisine: r.cuisine,
        city: r.city,
        address: r.address,
        neighborhood: r.neighborhood,
        phone: r.phone,
        priceRange: r.priceRange,
        description: r.description,
        imageUrl: r.imageUrl,
        features: r.features,
        searchText: [r.name, r.cuisine, r.city, r.neighborhood, r.description].join(" ").toLowerCase(),
        createdAt: Date.now(),
      });

      // Add a default section
      await ctx.db.insert("sections", {
        restaurantId: restId,
        name: "Main Dining",
        kind: "inside",
        capacity: 30,
        smoking: false,
      });

      results.push({ phone: r.ownerPhone, name: r.name, role: "owner", action: "restaurant-created" });
    }

    return { accounts: results, password: TEST_PASSWORD };
  },
});

/** Fix admin user after wipeAllData. */
export const fixAdminUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    const phone = "+96176683661";
    const existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("phone"), phone))
      .first();
    if (existingUser) return { userId: existingUser._id, existed: true };

    const userId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@kamix.demo",
      role: "admin",
      phone,
    });

    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", phone)
      )
      .first();
    if (passwordAccount) await ctx.db.patch(passwordAccount._id, { userId });

    const otpAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "phone-otp").eq("providerAccountId", phone)
      )
      .first();
    if (otpAccount) await ctx.db.patch(otpAccount._id, { userId });

    return { userId, linked: { password: !!passwordAccount, otp: !!otpAccount } };
  },
});
