import {
  createAccount,
  getAuthUserId,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { v } from "convex/values";
import { z } from "zod";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { ROLES, SEAT_KIND, DINING_PREFS } from "./schema";
import { parseOrThrow } from "./validation";
import { checkRateLimit } from "./rateLimit";
import { generateOtpToken } from "./auth/phoneOtp";

/**
 * Normalize a phone for comparison/lookup: strip spaces, dashes, parens.
 * Used on BOTH sides of lookups (input and stored value) so that
 * `+961 76 683 661`, `+961-76-683-661` and `+96176683661` all resolve to the
 * same identity.
 */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, "");
}

const profileNameSchema = z
  .string()
  .trim()
  .min(1, "Please tell us your name.")
  .max(80, "Name is too long.");
const profilePhoneSchema = z.string().trim().max(20, "Phone number is too long.").optional();

/**
 * Check if a phone number has a password account.
 *
 * SEC-04 tradeoff (documented, accepted): this query is intentionally
 * unauthenticated because the login screen needs to route a phone between the
 * password and OTP flows *before* the user is signed in. Returning
 * `{ exists }` does leak account presence (an attacker can enumerate which
 * numbers have a password account). The accepted mitigations are:
 *   1. Phone numbers are normalized before lookup so `+961 76 683 661` and
 *      `+96176683661` can't be probed as distinct identities.
 *   2. It reveals only presence, never a password, and never issues a token.
 *   3. The actual credential attempts (password / OTP verification) are
 *      rate-limited by the auth library's own `authRateLimits` table.
 * A unified "always show OTP" response would close the leak entirely but
 * would break the existing-password fast path, so we accept the tradeoff.
 */
export const hasPasswordAccount = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return { exists: false };

    // Fast path: exact indexed lookup on the canonical form. New accounts
    // are always stored canonical, so this hits for them.
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", normalized),
      )
      .first();
    if (account) return { exists: true };

    // Fallback: older accounts may have been stored verbatim (e.g. the OTP
    // provider saved "+961 71 123 456" with spaces). Compare normalized
    // values so those users still route to password login, not OTP.
    const passwordAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password"))
      .collect();
    return {
      exists: passwordAccounts.some(
        (a) => normalizePhone(a.providerAccountId) === normalized,
      ),
    };
  },
});

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * First-run onboarding: choose a role (customer / owner) and capture
 * name + phone (phone is used for SMS booking confirmations).
 */
export const onboard = mutation({
  args: {
    // Only customer role allowed — owner/admin roles are assigned
    // exclusively by admin mutations (registerRestaurant, tagAsRestaurant).
    role: v.literal(ROLES.CUSTOMER),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const cleanName = parseOrThrow(profileNameSchema, args.name);
    let cleanPhone = parseOrThrow(profilePhoneSchema, args.phone);

    // Validate phone format if provided (must be E.164-ish: + followed by 8-15 digits).
    if (cleanPhone) {
      const normalized = normalizePhone(cleanPhone);
      if (normalized.length < 8 || normalized.length > 15 || !/^\+\d+$/.test(normalized)) {
        throw new Error("Enter a valid phone number (e.g. +961 71 123 456).");
      }
      cleanPhone = normalized;
    }

    const existing = await ctx.db.get(userId);

    // Auto-populate phone from auth account if not explicitly provided.
    // This ensures the phone-otp user always has a phone on their profile,
    // which is needed for admin:tagAsRestaurant and booking confirmations.
    if (!cleanPhone) {
      if (existing?.phone) {
        cleanPhone = existing.phone;
      } else {
        // Look up the phone-otp auth account identifier (which IS the phone)
        const accounts = await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) =>
            q.eq("userId", userId).eq("provider", "phone-otp")
          )
          .first();
        if (accounts?.providerAccountId) {
          cleanPhone = accounts.providerAccountId;
        }
      }
    }

    // Never demote an existing admin/owner through the onboarding path —
    // those roles are granted exclusively by admin mutations.
    const patch: {
      role?: "customer";
      name: string;
      phone?: string;
      onboarded: boolean;
    } = {
      name: cleanName,
      phone: cleanPhone || undefined,
      onboarded: true,
    };
    if (existing?.role !== "admin" && existing?.role !== "owner") {
      patch.role = args.role;
    }

    await ctx.db.patch(userId, patch);
    return await ctx.db.get(userId);
  },
});

type PrefsPatch = {
  dietary: string[];
  seating: ("inside" | "outside" | "bar")[];
  occasions: string[];
};

/**
 * Update profile (name / dining preferences). Keeps existing role.
 *
 * Phone is intentionally NOT accepted here: changing the login phone must go
 * through users.startPhoneChange → users.confirmPhoneChange, which sends an
 * OTP to the NEW number and only then moves the phone (users.phone AND the
 * phone-otp/password authAccounts). This closes the old path where any
 * signed-in user could silently rewrite the phone used for SMS confirmations
 * and role lookups without proving they own the new number.
 */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    prefs: v.optional(DINING_PREFS),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const patch: { name?: string; prefs?: PrefsPatch } = {};
    if (args.name !== undefined) {
      patch.name = parseOrThrow(profileNameSchema, args.name);
    }
    if (args.prefs !== undefined) {
      // sanitize: dedupe + cap each list so the profile stays tidy
      patch.prefs = {
        dietary: [...new Set(args.prefs.dietary)].slice(0, 12),
        seating: [...new Set(args.prefs.seating)].slice(0, 3),
        occasions: [...new Set(args.prefs.occasions)].slice(0, 6),
      };
    }
    await ctx.db.patch(userId, patch);
    return await ctx.db.get(userId);
  },
});

/** Add or remove a restaurant from the diner's favorites. */
export const toggleFavorite = mutation({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");

    const user = await ctx.db.get(userId);
    const favorites = user?.favorites ?? [];
    if (favorites.includes(restaurantId)) {
      await ctx.db.patch(userId, {
        favorites: favorites.filter((id) => id !== restaurantId),
      });
      return { favorited: false };
    }
    const next = [...favorites, restaurantId].slice(-50);
    await ctx.db.patch(userId, { favorites: next });
    return { favorited: true };
  },
});

/**
 * Set a new password for the current user's phone (the password provider
 * stores accounts by phone). Used by the forced "set a new password" step
 * after a restaurant account is created/tagged by the platform admin, and by
 * diners who want to set a password later.
 *
 * The user must be signed in and must know their current password if one
 * exists. Clears the mustChangePassword flag on success.
 */
export const setPassword = mutation({
  args: {
    newPassword: v.string(),
    currentPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const user = await ctx.db.get(userId);
    if (!user?.phone) throw new Error("No phone on this account.");
    // Always store the password account under the CANONICAL phone so the
    // verbatim auth-library lookup (signIn + retrieveAccount) matches
    // regardless of how the user formats their number.
    const phone = normalizePhone(user.phone);

    const newPassword = args.newPassword;
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    // Verify the current password when one exists (prevents a stale session
    // or a hijacked device from silently rotating the password). The check
    // verifies the ACTUAL secret — retrieveAccount throws when the provided
    // current password does not match the stored hash.
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", phone),
      )
      .unique();
    if (existing) {
      if (args.currentPassword === undefined) {
        throw new Error("Enter your current password.");
      }
      // Throws "InvalidSecret" (or a rate-limit error) if it doesn't match.
      await retrieveAccount(ctx as never, {
        provider: "password",
        account: { id: phone, secret: args.currentPassword },
      });
      // Replace the existing password hash.
      await modifyAccountCredentials(ctx as never, {
        provider: "password",
        account: { id: phone, secret: newPassword },
      });
    } else {
      // No password account yet (e.g. a diner who only used OTP and was then
      // tagged as a restaurant owner): create one linked to this user.
      await createAccount(ctx as never, {
        provider: "password",
        account: { id: phone, secret: newPassword },
        profile: {
          email: phone,
          phone,
          ...(user?.name ? { name: user.name } : {}),
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: true,
      });
    }

    await ctx.db.patch(userId, { mustChangePassword: false });
    return true;
  },
});

/**
 * Step 1 of changing the account's phone number.
 *
 * Sends an OTP to the NEW number and records a pending change (user +
 * newPhone + code hash). The phone does NOT move until confirmPhoneChange
 * verifies the code. Refuses numbers already in use by another account
 * (checked against both the phone-otp and password providers).
 */
export const startPhoneChange = mutation({
  args: { newPhone: v.string() },
  handler: async (ctx, { newPhone }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");

    await checkRateLimit(ctx, {
      key: "startPhoneChange",
      userId,
      limit: 5,
      windowMs: 10 * 60_000, // 5 requests per 10 minutes
    });

    const clean = normalizePhone(newPhone);
    if (!clean) throw new Error("Enter a phone number.");
    if (clean.length < 8 || clean.length > 15) {
      throw new Error("Enter a valid phone number.");
    }
    if (user.phone && normalizePhone(user.phone) === clean) {
      throw new Error("That's already your phone number.");
    }

    // The new number must not belong to another account — check both
    // providers so neither OTP nor password logins collide.
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "phone-otp").eq("providerAccountId", clean),
      )
      .first();
    const existingPassword = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", clean),
      )
      .first();
    if (existing || existingPassword) {
      throw new Error("That phone number is already in use by another account.");
    }

    // Replace any prior pending request for this user.
    const prior = await ctx.db
      .query("phoneChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (prior) await ctx.db.delete(prior._id);

    const code = await generateOtpToken();
    const codeHash = encodeHexLowerCase(await sha256(new TextEncoder().encode(code)));
    await ctx.db.insert("phoneChangeRequests", {
      userId,
      newPhone: clean,
      codeHash,
      expiresAt: Date.now() + 15 * 60_000, // 15 minutes
      createdAt: Date.now(),
    });

    // Send the code to the NEW number (scheduled like other SMS sends).
    // Graceful no-op when Twilio is off.
    await ctx.scheduler.runAfter(0, api.sms.sendOtpSms, { phone: clean, code });
    return { started: true };
  },
});

/**
 * Step 2 of changing the account's phone number.
 *
 * Verifies the OTP sent to the new number. On success the phone moves:
 *  - users.phone is updated
 *  - the phone-otp and password authAccounts get the new providerAccountId
 *    so future OTP/password logins use the new number
 *  - the pending request is deleted (single use)
 */
export const confirmPhoneChange = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");

    const pending = await ctx.db
      .query("phoneChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!pending) throw new Error("No pending phone change. Request a code first.");
    if (pending.expiresAt < Date.now()) {
      await ctx.db.delete(pending._id);
      throw new Error("That code has expired. Request a new one.");
    }

    const codeHash = encodeHexLowerCase(await sha256(new TextEncoder().encode(code)));
    if (codeHash !== pending.codeHash) {
      throw new Error("Incorrect code. Try again.");
    }

    const newPhone = pending.newPhone;

    // Update the login accounts so the new number becomes the identifier
    // (providerAccountId is what the auth library matches on; phoneVerified
    // mirrors it on verified phone accounts).
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      if (account.provider === "phone-otp" || account.provider === "password") {
        const patch: { providerAccountId: string; phoneVerified?: string } = {
          providerAccountId: newPhone,
        };
        if (account.phoneVerified) {
          patch.phoneVerified = newPhone;
        }
        await ctx.db.patch(account._id, patch);
      }
    }

    await ctx.db.patch(userId, { phone: newPhone });
    await ctx.db.delete(pending._id);
    return await ctx.db.get(userId);
  },
});

/** Restaurants the current user has saved, with a live snapshot each. */
export const myFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    const ids = user?.favorites ?? [];
    const out = [];
    for (const id of ids) {
      const r = await ctx.db.get(id);
      if (r) out.push(r);
    }
    return out;
  },
});
