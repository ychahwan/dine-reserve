import { getAuthUserId } from "@convex-dev/auth/server";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query } from "./_generated/server";
import { FEATURES } from "./schema";
import { parseOrThrow, restaurantArgsSchema } from "./validation";
import { checkRateLimit } from "./rateLimit";
import { normalizePhone } from "./users";

/**
 * Platform administrator.
 *
 * The account whose verified phone number equals PLATFORM_ADMIN_PHONE can
 * claim the admin role (bootstrap). Admins are the ONLY people allowed to
 * register restaurants on the platform: they create the restaurant AND its
 * owner account (with a temporary password), or tag an existing account as a
 * restaurant. Restaurant accounts must set a new password on their next
 * login (users.mustChangePassword = true), which the Auth flow enforces.
 */
export const PLATFORM_ADMIN_PHONE = "+96176683661";

/** The signed-in user must be a platform admin or this throws. */
async function requireAdmin(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") throw new Error("Admins only.");
  return { userId, user };
}

/**
 * Log an admin action to the audit table. Every admin mutation calls this
 * so there is an immutable record of who did what and when.
 */
async function logAdminAction(
  ctx: MutationCtx,
  adminUserId: string,
  action: string,
  opts: { targetUserId?: string; details?: string } = {},
) {
  await ctx.db.insert("adminAuditLog", {
    adminUserId: adminUserId as never,
    action,
    targetUserId: opts.targetUserId ? (opts.targetUserId as never) : undefined,
    details: opts.details,
    createdAt: Date.now(),
  });
}

/**
 * Self-service bootstrap: only the platform admin phone can claim admin.
 * Hardened: if the user already has the admin role, re-claiming is blocked
 * (prevents accidental role resets or stale JWT-based re-claims).
 */
export const claimPlatformAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    if (user.role === "admin") {
      throw new Error("This account already has admin access.");
    }

    // Prove ownership of the platform-admin phone via a VERIFIED auth
    // account (phone-otp or password provider).
    // Collect all auth accounts for this user and check if any match.
    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId),
      )
      .collect();
    const accountPhones = authAccounts.map((a) => a.providerAccountId);
    const isPlatformAdmin = accountPhones.some(
      (phone) => phone === PLATFORM_ADMIN_PHONE,
    );
    if (!isPlatformAdmin) {
      throw new Error(
        "This phone number is not the platform admin. " +
        `Account phones: [${accountPhones.join(", ")}]`,
      );
    }

    await ctx.db.patch(userId, { role: "admin", onboarded: true });
    await logAdminAction(ctx, userId, "claimPlatformAdmin");
    return await ctx.db.get(userId);
  },
});

/** Is the signed-in user a platform admin? */
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return user?.role === "admin";
  },
});

/** Admin-only: view admin audit log entries with optional filtering. */
export const auditLog = query({
  args: {
    search: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, { search, action }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    let entries = await ctx.db
      .query("adminAuditLog")
      .order("desc")
      .take(500);
    if (action) {
      entries = entries.filter((e) => e.action === action);
    }
    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          (e.details && e.details.toLowerCase().includes(q)) ||
          (e.targetUserId && String(e.targetUserId).toLowerCase().includes(q)),
      );
    }
    return entries;
  },
});

/**
 * Admin-only: register a restaurant AND create/tag its owner account.
 * The owner is created with a temporary password and must change it on their
 * next sign-in. If an account already exists for the phone, it is promoted to
 * owner and its password is replaced with the temporary one.
 */
export const registerRestaurant = mutation({
  args: {
    name: v.string(),
    cuisine: v.string(),
    city: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    priceRange: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    features: FEATURES,
    ownerPhone: v.string(),
    ownerName: v.string(),
    tempPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "registerRestaurant",
      userId,
      limit: 30,
      windowMs: 60 * 60_000, // 30 per hour
    });
    parseOrThrow(restaurantArgsSchema, args);
    if (args.tempPassword.length < 8) {
      throw new Error("Temporary password must be at least 8 characters.");
    }
    if (!args.ownerPhone.trim()) throw new Error("Owner phone is required.");
    if (!args.ownerName.trim()) throw new Error("Owner name is required.");
    // Store the owner under the canonical phone so login (verbatim auth-library
    // lookup) and hasPasswordAccount routing agree regardless of formatting.
    const ownerPhone = normalizePhone(args.ownerPhone);
    if (ownerPhone.length < 8 || ownerPhone.length > 15 || !/^\+\d+$/.test(ownerPhone)) {
      throw new Error("Enter a valid phone number (e.g. +961 71 123 456).");
    }

    // Create (or link) the owner's password account. shouldLinkViaPhone links
    // to an existing phone-verified user when one exists.
    const { user } = await createAccount(ctx as never, {
      provider: "password",
      account: { id: ownerPhone, secret: args.tempPassword },
      profile: {
        email: ownerPhone,
        phone: ownerPhone,
        ...(args.ownerName.trim() ? { name: args.ownerName.trim().slice(0, 80) } : {}),
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: true,
    });

    await ctx.db.patch(user._id, {
      role: "owner",
      onboarded: true,
      mustChangePassword: true,
      name: args.ownerName.trim().slice(0, 80),
      phone: ownerPhone,
    });

    const restaurantId = await ctx.db.insert("restaurants", {
      ownerId: user._id,
      name: args.name.trim().slice(0, 100),
      cuisine: args.cuisine.trim().slice(0, 40),
      city: args.city.trim().slice(0, 60),
      address: args.address.trim().slice(0, 200),
      phone: args.phone?.trim().slice(0, 30),
      priceRange: args.priceRange,
      description: args.description?.trim().slice(0, 1000),
      imageUrl: args.imageUrl?.trim().slice(0, 500),
      features: args.features,
      searchText: "",
      createdAt: Date.now(),
    });

    const doc = await ctx.db.get(restaurantId);
    const searchText = [doc!.name, doc!.cuisine, doc!.city, doc!.neighborhood ?? "", doc!.description ?? ""]
      .join(" ")
      .toLowerCase();
    await ctx.db.patch(restaurantId, { searchText });

    // Sensible default section so booking works out of the box
    await ctx.db.insert("sections", {
      restaurantId,
      name: "Main dining room",
      kind: "inside",
      smoking: false,
      capacity: 24,
    });

    await logAdminAction(ctx, userId, "registerRestaurant", {
      targetUserId: user._id as unknown as string,
      details: JSON.stringify({ restaurantName: args.name, ownerPhone: args.ownerPhone }),
    });

    return restaurantId;
  },
});

/**
 * Admin-only: tag an EXISTING account as a restaurant (owner). The account
 * must have set a phone number. On their next login they must set a new
 * password (mustChangePassword), and if they have no password account yet the
 * forced set-password step creates one.
 */
export const tagAsRestaurant = mutation({
  args: { phone: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { phone, name }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "tagAsRestaurant",
      userId,
      limit: 60,
      windowMs: 60 * 60_000, // 60 per hour
    });
    // KB-23: accounts are stored under the canonical form (normalizePhone),
    // so look up with the same normalization or `+961 76 683 661` typed by
    // the admin would never match the stored `+96176683661`.
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) throw new Error("Phone is required.");

    const user = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", cleanPhone))
      .first();
    if (!user) throw new Error("No account found with that phone number.");

    await ctx.db.patch(user._id, {
      role: "owner",
      onboarded: true,
      mustChangePassword: true,
      ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}),
    });

    await logAdminAction(ctx, userId, "tagAsRestaurant", {
      targetUserId: user._id as unknown as string,
      details: JSON.stringify({ phone: cleanPhone, name: name ?? null }),
    });

    return await ctx.db.get(user._id);
  },
});

/**
 * Create or replace the password account for a user under its CANONICAL
 * phone (so the verbatim auth-library lookup matches regardless of how the
 * number is stored or typed). Shared by ensureOwnerPassword and
 * setUserPassword. Returns the user doc (or null if it vanished).
 */
async function setPasswordForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  phone: string,
  newPassword: string,
) {
  const existing = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", phone),
    )
    .unique();
  if (existing) {
    await modifyAccountCredentials(ctx as never, {
      provider: "password",
      account: { id: phone, secret: newPassword },
    });
  } else {
    const user = await ctx.db.get(userId);
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
  return await ctx.db.get(userId);
}

/**
 * Admin-only: ensure a tagged owner has a working password account.
 * Used internally by the admin console so tagged accounts can actually log in
 * with a password even if they previously only used OTP.
 */
export const ensureOwnerPassword = mutation({
  args: { phone: v.string(), tempPassword: v.string() },
  handler: async (ctx, { phone, tempPassword }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "ensureOwnerPassword",
      userId,
      limit: 60,
      windowMs: 60 * 60_000, // 60 per hour
    });
    if (tempPassword.length < 8) {
      throw new Error("Temporary password must be at least 8 characters.");
    }
    const cleanPhone = normalizePhone(phone);
    const user = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", cleanPhone))
      .first();
    if (!user) throw new Error("No account found with that phone number.");

    await setPasswordForUser(ctx, user._id, cleanPhone, tempPassword);
    await ctx.db.patch(user._id, { mustChangePassword: true, role: "owner", onboarded: true });

    await logAdminAction(ctx, userId, "ensureOwnerPassword", {
      targetUserId: user._id as unknown as string,
      details: JSON.stringify({ phone: cleanPhone }),
    });

    return await ctx.db.get(user._id);
  },
});

// ---------------------------------------------------------------------------
// Account & restaurant moderation
// ---------------------------------------------------------------------------
// cascadeDeleteUser + invalidateUserSessions live in ./erasure so the admin
// console and the diner self-service "delete my account" flow share one
// implementation of the GDPR cascade.
import { cascadeDeleteRestaurant, cascadeDeleteUser, invalidateUserSessions } from "./erasure";

/**
 * Admin-only: disable or re-enable a user account. A disabled user cannot
 * sign in (the auth `afterUserCreatedOrUpdated` callback rejects them before
 * any session is issued) and their existing sessions are invalidated now, so
 * the lock is immediate. You cannot disable yourself or another admin.
 */
export const setUserDisabled = mutation({
  args: { userId: v.id("users"), disabled: v.boolean() },
  handler: async (ctx, { userId, disabled }) => {
    const { userId: adminUserId, user: adminUser } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "setUserDisabled",
      userId: adminUserId,
      limit: 120,
      windowMs: 60 * 60_000, // 120 per hour
    });
    if (userId === adminUserId) throw new Error("You cannot disable your own account.");
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found.");
    if (target.role === "admin") throw new Error("You cannot disable another admin account.");

    await ctx.db.patch(userId, { disabled: disabled || undefined });
    if (disabled) await invalidateUserSessions(ctx, userId);

    await logAdminAction(ctx, adminUserId, disabled ? "disableUser" : "enableUser", {
      targetUserId: userId as unknown as string,
      details: JSON.stringify({ phone: target.phone ?? null, name: target.name ?? null }),
    });
    return await ctx.db.get(userId);
  },
});

/**
 * Admin-only: create a new user account with phone, name, and temp password.
 * Creates both the user doc and the password auth account.
 */
export const createUser = mutation({
  args: {
    phone: v.string(),
    name: v.string(),
    role: v.optional(v.union(v.literal("customer"), v.literal("owner"))),
    tempPassword: v.string(),
  },
  handler: async (ctx, { phone, name, role, tempPassword }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "createUser",
      userId,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (tempPassword.length < 8) {
      throw new Error("Temporary password must be at least 8 characters.");
    }
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 8 || !/^\+\d+$/.test(cleanPhone)) {
      throw new Error("Enter a valid phone number (e.g. +961 71 123 456).");
    }
    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) throw new Error("Name is required.");

    const { user } = await createAccount(ctx as never, {
      provider: "password",
      account: { id: cleanPhone, secret: tempPassword },
      profile: {
        email: cleanPhone,
        phone: cleanPhone,
        name: cleanName,
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: true,
    });

    await ctx.db.patch(user._id, {
      role: role ?? "customer",
      onboarded: true,
      mustChangePassword: true,
      name: cleanName,
      phone: cleanPhone,
    });

    await logAdminAction(ctx, userId, "createUser", {
      targetUserId: user._id as unknown as string,
      details: JSON.stringify({ phone: cleanPhone, name: cleanName, role: role ?? "customer" }),
    });

    return await ctx.db.get(user._id);
  },
});

/**
 * Admin-only: bulk delete multiple users (GDPR-style erasure).
 * Skips admins and users who own restaurants. Returns counts.
 */
export const bulkDeleteUsers = mutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const { userId: adminUserId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "bulkDeleteUsers",
      userId: adminUserId,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    const limited = userIds.slice(0, 50);
    let deleted = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (const userId of limited) {
      if (userId === adminUserId) { skipped.push({ id: userId, reason: "self" }); continue; }
      const target = await ctx.db.get(userId);
      if (!target) { skipped.push({ id: userId, reason: "not_found" }); continue; }
      if (target.role === "admin") { skipped.push({ id: userId, reason: "admin" }); continue; }
      const owned = await ctx.db
        .query("restaurants")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .collect();
      if (owned.length > 0) { skipped.push({ id: userId, reason: "owns_restaurants" }); continue; }
      await cascadeDeleteUser(ctx, userId);
      deleted++;
    }
    await logAdminAction(ctx, adminUserId, "bulkDeleteUsers", {
      details: JSON.stringify({ requested: userIds.length, deleted, skipped: skipped.length }),
    });
    return { deleted, skipped };
  },
});

/**
 * Admin-only: permanently delete a user and all their data (GDPR-style
 * erasure). Cascades: reviews, bookings (+ their dine orders, assist
 * requests, notifications, presence, gifts), waitlist, dine-in history,
 * messages, loyalty ledger, auth accounts and sessions. Blocked while the
 * user owns restaurants — delete (or reassign) those first.
 */
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: adminUserId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "deleteUser",
      userId: adminUserId,
      limit: 30,
      windowMs: 60 * 60_000, // 30 per hour
    });
    if (userId === adminUserId) throw new Error("You cannot delete your own account.");
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found.");
    if (target.role === "admin") throw new Error("You cannot delete another admin account.");

    // Owners own restaurants — force the admin to handle those first so a
    // restaurant is never left with a dangling ownerId.
    const owned = await ctx.db
      .query("restaurants")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    if (owned.length > 0) {
      throw new Error("This user owns restaurants — delete those first (Restaurants → Delete).");
    }

    await cascadeDeleteUser(ctx, userId);

    await logAdminAction(ctx, adminUserId, "deleteUser", {
      targetUserId: userId as unknown as string,
      details: JSON.stringify({ phone: target.phone ?? null, name: target.name ?? null }),
    });
    return { deleted: true };
  },
});

/**
 * Admin-only: disable or re-enable a restaurant. Disabled venues disappear
 * from Explore/search/stats, are treated as closed for availability, and
 * refuse new bookings (see restaurants.ts / bookings.ts / availability.ts).
 */
export const setRestaurantDisabled = mutation({
  args: { restaurantId: v.id("restaurants"), disabled: v.boolean() },
  handler: async (ctx, { restaurantId, disabled }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "setRestaurantDisabled",
      userId,
      limit: 120,
      windowMs: 60 * 60_000,
    });
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    await ctx.db.patch(restaurantId, { disabled: disabled || undefined });
    await logAdminAction(ctx, userId, disabled ? "disableRestaurant" : "enableRestaurant", {
      details: JSON.stringify({ restaurantName: restaurant.name }),
    });
    return await ctx.db.get(restaurantId);
  },
});

/**
 * Admin-only: permanently delete a restaurant and everything attached to it.
 * Delegates the full cascade (incl. releasing uploaded menu photos from
 * storage) to the shared erasure module — same code the owner-facing
 * restaurants.remove runs, so the two paths can never drift.
 */
export const deleteRestaurant = mutation({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "deleteRestaurant",
      userId,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");

    await cascadeDeleteRestaurant(ctx, restaurantId);

    await logAdminAction(ctx, userId, "deleteRestaurant", {
      details: JSON.stringify({ restaurantName: restaurant.name }),
    });
    return { deleted: true };
  },
});

/**
 * Admin-only: wipe the audit log. Records a single "clearAuditLog" entry
 * (with the number of cleared rows) so the clearing itself stays traceable.
 */
export const clearAuditLog = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "clearAuditLog",
      userId,
      limit: 10,
      windowMs: 60 * 60_000, // 10 per hour
    });
    const all = await ctx.db.query("adminAuditLog").collect();
    for (const row of all) await ctx.db.delete(row._id);
    await ctx.db.insert("adminAuditLog", {
      adminUserId: userId,
      action: "clearAuditLog",
      details: JSON.stringify({ clearedRows: all.length }),
      createdAt: Date.now(),
    });
    return { cleared: all.length };
  },
});

/**
 * Admin-only: delete specific audit log entries by ID (bulk delete).
 */
export const deleteAuditEntries = mutation({
  args: { ids: v.array(v.id("adminAuditLog")) },
  handler: async (ctx, { ids }) => {
    const { userId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "deleteAuditEntries",
      userId,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    const limited = ids.slice(0, 100); // BUG-12: cap batch size
    for (const id of limited) await ctx.db.delete(id);
    await ctx.db.insert("adminAuditLog", {
      adminUserId: userId,
      action: "deleteAuditEntries",
      details: JSON.stringify({ deletedIds: limited.length }),
      createdAt: Date.now(),
    });
    return { deleted: limited.length };
  },
});

/**
 * Admin-only: set or reset ANY user's password (diner, owner or admin).
 * Creates the password account if the user only had OTP, or replaces the
 * existing password. The user must set a new password on their next login
 * (mustChangePassword = true) — same trusted flow as restaurant owners.
 */
export const setUserPassword = mutation({
  args: { userId: v.id("users"), newPassword: v.string() },
  handler: async (ctx, { userId, newPassword }) => {
    const { userId: adminUserId } = await requireAdmin(ctx);
    await checkRateLimit(ctx, {
      key: "setUserPassword",
      userId: adminUserId,
      limit: 60,
      windowMs: 60 * 60_000, // 60 per hour
    });
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    const phone = normalizePhone(user.phone ?? "");
    if (!phone) throw new Error("This account has no phone number on file.");

    await setPasswordForUser(ctx, userId, phone, newPassword);
    await ctx.db.patch(userId, { mustChangePassword: true });

    await logAdminAction(ctx, adminUserId, "setUserPassword", {
      targetUserId: userId as unknown as string,
      details: JSON.stringify({ phone }),
    });

    return await ctx.db.get(userId);
  },
});
