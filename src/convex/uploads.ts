import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";

/**
 * Returns a one-time signed upload URL for a menu-item photo. The browser
 * POSTs the file directly to that URL and receives a `storageId` back, which
 * is then saved on the menu item via `restaurants.createMenuItem` /
 * `restaurants.updateMenuItem`.
 */
export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    return await ctx.storage.generateUploadUrl();
  },
});
