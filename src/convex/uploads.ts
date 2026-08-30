import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { checkRateLimit } from "./rateLimit";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const consumeUploadRateLimit = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await checkRateLimit(ctx, {
      key: "uploadUrl",
      userId,
      limit: 20,
      windowMs: 15 * 60_000,
    });
    await checkRateLimit(ctx, {
      key: "uploadUrlGlobal",
      userId: "deployment",
      limit: 500,
      windowMs: 60 * 60_000,
    });
  },
});

/**
 * Returns a one-time signed upload URL for a menu-item photo. The browser
 * POSTs the file directly to that URL and receives a `storageId` back, which
 * is then saved on the menu item via `restaurants.createMenuItem` /
 * `restaurants.updateMenuItem`.
 */
export const generateUploadUrl = action({
  args: { contentType: v.string(), size: v.number() },
  handler: async (ctx, { contentType, size }) => {
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, and WebP images are allowed.");
    }
    if (!Number.isInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) {
      throw new Error("Image must be between 1 byte and 5 MB.");
    }
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    // KB-21: upload URLs are only useful to restaurant owners (menu-item
    // photos) — let any signed-in diner mint them and the platform becomes a
    // free blob store. Restrict to owner/admin accounts.
    const user = await ctx.runQuery(api.users.currentUser);
    if (!user || (user.role !== "owner" && user.role !== "admin")) {
      throw new Error("Only restaurant owners can upload photos.");
    }
    await ctx.runMutation(internal.uploads.consumeUploadRateLimit, { userId });
    return await ctx.storage.generateUploadUrl();
  },
});
