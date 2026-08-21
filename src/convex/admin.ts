import { getAuthUserId } from "@convex-dev/auth/server";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
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

    // Prove ownership of the platform-admin phone via the VERIFIED auth
    // account (phone-otp provider), never via the mutable users.phone profile
    // field. An attacker who edits their profile phone cannot satisfy this
    // check: providerAccountId is fixed at account creation by the auth
    // provider and is not reachable through updateProfile.
    const phoneAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "phone-otp"),
      )
      .first();
    if (phoneAccount?.providerAccountId !== PLATFORM_ADMIN_PHONE) {
      throw new Error("This phone number is not the platform admin.");
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

/** Admin-only: view recent admin audit log entries (last 50). */
export const auditLog = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db
      .query("adminAuditLog")
      .withIndex("by_admin", (q) => q.eq("adminUserId", userId))
      .order("desc")
      .take(50);
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
    const cleanPhone = phone.trim();
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
    const cleanPhone = phone.trim();
    const user = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", cleanPhone))
      .first();
    if (!user) throw new Error("No account found with that phone number.");

    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", cleanPhone),
      )
      .unique();
    if (existing) {
      await modifyAccountCredentials(ctx as never, {
        provider: "password",
        account: { id: cleanPhone, secret: tempPassword },
      });
    } else {
      await createAccount(ctx as never, {
        provider: "password",
        account: { id: cleanPhone, secret: tempPassword },
        profile: {
          email: cleanPhone,
          phone: cleanPhone,
          ...(user.name ? { name: user.name } : {}),
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: true,
      });
    }
    await ctx.db.patch(user._id, { mustChangePassword: true, role: "owner", onboarded: true });

    await logAdminAction(ctx, userId, "ensureOwnerPassword", {
      targetUserId: user._id as unknown as string,
      details: JSON.stringify({ phone: cleanPhone }),
    });

    return await ctx.db.get(user._id);
  },
});
