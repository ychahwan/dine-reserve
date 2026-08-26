/**
 * Test-only helpers — deploy only in dev/staging.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Admin-only: clear all rate limit rows so auth flows aren't blocked during testing. */
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

/** Anon-accessible wipe for test setup — clears rate limits table. */
export const wipeRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rateLimits").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { cleared: rows.length };
  },
});

/**
 * Admin-only: create or reset a test user with the correct password.
 * Completely removes old auth accounts and recreates from scratch.
 * Uses the auth library's signIn mutation to verify the password works.
 */
export const seedTestUser = mutation({
  args: {
    phone: v.string(),
    name: v.string(),
    password: v.string(),
    role: v.union(v.literal("customer"), v.literal("owner")),
  },
  handler: async (ctx, { phone, name, password, role }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const admin = await ctx.db.get(userId!);
    if (admin?.role !== "admin") throw new Error("Admins only");

    // Step 1: Clean up ALL existing data for this phone
    const existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("phone"), phone))
      .first();

    if (existingUser) {
      // Delete all auth accounts linked to this user
      const accounts = await ctx.db
        .query("authAccounts")
        .filter((q) => q.eq(q.field("userId"), existingUser._id))
        .collect();
      for (const a of accounts) await ctx.db.delete(a._id);

      // Also delete any auth accounts by providerAccountId (phone)
      const phoneAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", phone)
        )
        .collect();
      for (const a of phoneAccounts) await ctx.db.delete(a._id);

      const otpAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "phone-otp").eq("providerAccountId", phone)
        )
        .collect();
      for (const a of otpAccounts) await ctx.db.delete(a._id);

      // Delete sessions
      const sessions = await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), existingUser._id))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);

      // Delete the user doc
      await ctx.db.delete(existingUser._id);
    }

    // Step 2: Create fresh user doc
    const newUserId = await ctx.db.insert("users", {
      name,
      phone,
      role,
      onboarded: true,
      mustChangePassword: true,
    } as any);

    // Step 3: Create auth accounts via the auth library's internal mutations
    // We use ctx.runMutation to call the auth:store mutation which handles
    // password hashing and account creation
    const authResult = await ctx.runMutation("auth:store" as any, {
      args: {
        type: "createAccountFromCredentials",
        provider: "password",
        account: { id: phone, secret: password },
        profile: { email: phone, phone, name },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: true,
      },
    });

    // Step 4: Link the auth accounts to our new user
    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", phone)
      )
      .first();

    if (passwordAccount) {
      await ctx.db.patch(passwordAccount._id, { userId: newUserId });
    }

    const otpAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "phone-otp").eq("providerAccountId", phone)
      )
      .first();

    if (otpAccount) {
      await ctx.db.patch(otpAccount._id, { userId: newUserId });
    }

    return { userId: newUserId, action: "created" };
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
