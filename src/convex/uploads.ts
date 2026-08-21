import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

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
    // KB-21: upload URLs are only useful to restaurant owners (menu-item
    // photos) — let any signed-in diner mint them and the platform becomes a
    // free blob store. Restrict to owner/admin accounts.
    const user = await ctx.runQuery(api.users.currentUser);
    if (!user || (user.role !== "owner" && user.role !== "admin")) {
      throw new Error("Only restaurant owners can upload photos.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});
