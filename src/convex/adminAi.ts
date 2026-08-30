import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { DEFAULT_AI_KNOWLEDGE, DEFAULT_AI_SEMANTIC_RULES } from "./aiPolicy";

const MAX_ADMIN_CONVERSATIONS = 250;
const MAX_ADMIN_MESSAGES = 500;

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") throw new Error("Admins only.");
  return { userId };
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [conversations, knowledge, rules] = await Promise.all([
      ctx.db
        .query("aiConversations")
        .withIndex("by_last_message")
        .order("desc")
        .take(MAX_ADMIN_CONVERSATIONS),
      ctx.db.query("aiKnowledge").take(250),
      ctx.db.query("aiSemanticRules").take(250),
    ]);
    const users = await Promise.all(
      [...new Set(conversations.map((c) => c.userId))].map((id) =>
        ctx.db.get(id),
      ),
    );
    const names = new Map(
      users
        .filter(Boolean)
        .map((u) => [u!._id, u!.name ?? u!.phone ?? "Customer"]),
    );
    return {
      conversations: conversations.map((c) => ({
        ...c,
        customerName: names.get(c.userId) ?? "Customer",
      })),
      messageCount: conversations.reduce(
        (sum, conversation) => sum + conversation.messageCount,
        0,
      ),
      knowledge,
      rules,
    };
  },
});

export const conversation = query({
  args: { id: v.id("aiConversations") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const thread = await ctx.db.get(id);
    if (!thread) return null;
    const [customer, messages] = await Promise.all([
      ctx.db.get(thread.userId),
      ctx.db
        .query("aiMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", id))
        .order("asc")
        .take(MAX_ADMIN_MESSAGES),
    ]);
    return {
      conversation: thread,
      customer: customer
        ? {
            _id: customer._id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          }
        : null,
      messages,
      messagesCappedAt: MAX_ADMIN_MESSAGES,
    };
  },
});

export const saveKnowledge = mutation({
  args: {
    id: v.optional(v.id("aiKnowledge")),
    title: v.string(),
    category: v.string(),
    content: v.string(),
    priority: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const values = {
      title: args.title.trim(),
      category: args.category.trim(),
      content: args.content.trim(),
      priority: args.priority,
      enabled: args.enabled,
      updatedBy: userId,
      updatedAt: Date.now(),
    };
    if (!values.title || !values.content)
      throw new Error("Title and content are required.");
    if (args.id) await ctx.db.patch(args.id, values);
    else await ctx.db.insert("aiKnowledge", values);
    return { ok: true };
  },
});

export const deleteKnowledge = mutation({
  args: { id: v.id("aiKnowledge") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const saveRule = mutation({
  args: {
    id: v.optional(v.id("aiSemanticRules")),
    name: v.string(),
    description: v.string(),
    instruction: v.string(),
    priority: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const values = {
      name: args.name.trim(),
      description: args.description.trim(),
      instruction: args.instruction.trim(),
      priority: args.priority,
      enabled: args.enabled,
      updatedBy: userId,
      updatedAt: Date.now(),
    };
    if (!values.name || !values.instruction)
      throw new Error("Name and instruction are required.");
    if (args.id) await ctx.db.patch(args.id, values);
    else await ctx.db.insert("aiSemanticRules", values);
    return { ok: true };
  },
});

export const deleteRule = mutation({
  args: { id: v.id("aiSemanticRules") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const installDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAdmin(ctx);
    let knowledgeAdded = 0;
    let rulesAdded = 0;
    for (const entry of DEFAULT_AI_KNOWLEDGE) {
      const existing = await ctx.db
        .query("aiKnowledge")
        .withIndex("by_key", (q) => q.eq("key", entry.key))
        .first();
      if (!existing) {
        await ctx.db.insert("aiKnowledge", {
          ...entry,
          updatedBy: userId,
          updatedAt: Date.now(),
        });
        knowledgeAdded++;
      }
    }
    for (const entry of DEFAULT_AI_SEMANTIC_RULES) {
      const existing = await ctx.db
        .query("aiSemanticRules")
        .withIndex("by_key", (q) => q.eq("key", entry.key))
        .first();
      if (!existing) {
        await ctx.db.insert("aiSemanticRules", {
          ...entry,
          updatedBy: userId,
          updatedAt: Date.now(),
        });
        rulesAdded++;
      }
    }
    return { knowledgeAdded, rulesAdded };
  },
});
