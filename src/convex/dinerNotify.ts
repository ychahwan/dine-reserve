import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { safeGet } from "./helpers";

/**
 * Smart contextual push notifications (Idea #4).
 *
 * Replaces generic alerts with personalized, data-grounded nudges built from
 * real Kamix activity:
 *  - favorite_story: a restaurant the diner saved just posted a story
 *  - reengage:      it's been a while since their last visit + the venue has news
 *  - guest_joined:  a friend confirmed a seat on their booking (invite flow)
 *  - review_nudge:  a completed visit hasn't been reviewed yet
 *  - waitlist_freed: a table they were waiting for opened up
 *  - booking_reminder: their booking is tomorrow
 *
 * Delivery: in-app inbox (bell feed) for all types; the highest-value
 * time-sensitive types (waitlist_freed, booking_reminder) are additionally
 * SMS-mirrored through the existing Twilio-guarded actions.
 *
 * Everything is deduplicated by a stable key so a cron re-run (or a repeated
 * event) can never produce duplicate rows.
 */

export const DINER_NOTIFICATION_TYPES = v.union(
  v.literal("favorite_story"),
  v.literal("reengage"),
  v.literal("guest_joined"),
  v.literal("review_nudge"),
  v.literal("waitlist_freed"),
  v.literal("booking_reminder"),
);

type DinerNotifType =
  | "favorite_story"
  | "reengage"
  | "guest_joined"
  | "review_nudge"
  | "waitlist_freed"
  | "booking_reminder";

/** Days since the last visit before we consider a diner "lapsed". */
const REENGAGE_AFTER_DAYS = 21;

// ---------------------------------------------------------------------------
// core helper — deduplicated insert
// ---------------------------------------------------------------------------

/**
 * Insert a diner notification unless one with the same (user, dedupeKey)
 * already exists. Returns the inserted row or null when deduplicated.
 */
export async function notifyDiner(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    type: DinerNotifType;
    title: string;
    body: string;
    link?: string;
    dedupeKey: string;
  },
) {
  // KB-32: by_user_dedupe index — check one row instead of re-collecting the
  // user's entire notification history on every insert.
  const existing = await ctx.db
    .query("dinerNotifications")
    .withIndex("by_user_dedupe", (q) =>
      q.eq("userId", opts.userId).eq("dedupeKey", opts.dedupeKey.slice(0, 160)),
    )
    .first();
  if (existing) return null;

  const id = await ctx.db.insert("dinerNotifications", {
    userId: opts.userId,
    type: opts.type,
    title: opts.title.slice(0, 80),
    body: opts.body.slice(0, 240),
    link: opts.link,
    dedupeKey: opts.dedupeKey.slice(0, 160),
    read: false,
    createdAt: Date.now(),
  });
  return await ctx.db.get(id);
}

// ---------------------------------------------------------------------------
// diner side — inbox queries / actions
// ---------------------------------------------------------------------------

/** The diner's notification feed, newest first, with unread-first ordering. */
export const myNotifications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    // L-11: two bounded indexed takes (unread, then read fill) instead of
    // collecting the user's entire notification history to sort/slice in JS.
    const unread = await ctx.db
      .query("dinerNotifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId as Id<"users">).eq("read", false))
      .order("desc")
      .take(100);
    if (unread.length >= 100) {
      return unread.sort((a, b) => b.createdAt - a.createdAt);
    }
    const read = await ctx.db
      .query("dinerNotifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId as Id<"users">).eq("read", true))
      .order("desc")
      .take(100 - unread.length);
    return [
      ...unread.sort((a, b) => b.createdAt - a.createdAt),
      ...read.sort((a, b) => b.createdAt - a.createdAt),
    ];
  },
});

/** Unread count for the bell badge. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const items = await ctx.db
      .query("dinerNotifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId as Id<"users">).eq("read", false))
      .collect();
    return items.length;
  },
});

/** Mark one notification read (tapping it). */
export const markRead = mutation({
  args: { id: v.id("dinerNotifications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const n = await ctx.db.get(id);
    if (!n || n.userId !== userId) return null;
    if (!n.read) await ctx.db.patch(id, { read: true });
    return await ctx.db.get(id);
  },
});

/** Mark the whole feed read (opening the bell). */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const unread = await ctx.db
      .query("dinerNotifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId as Id<"users">).eq("read", false))
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { read: true })));
    return unread.length;
  },
});

// ---------------------------------------------------------------------------
// event hooks — called by the originating mutations
// ---------------------------------------------------------------------------

/** Users scanned per onStoryPosted invocation (M-18) — keeps story posting O(page). */
const STORY_SCAN_PAGE = 200;

/** A restaurant posted a story → tell diners who saved it (or dined there). */
export const onStoryPosted = internalMutation({
  args: { storyId: v.id("stories"), cursor: v.optional(v.string()) },
  handler: async (ctx, { storyId, cursor }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return { notified: 0 };
    const restaurant = await ctx.db.get(story.restaurantId);
    if (!restaurant) return { notified: 0 };

    // M-18: paginate the users scan and continue across scheduled
    // invocations instead of collecting the whole table in one transaction.
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: STORY_SCAN_PAGE, cursor: cursor ?? null });

    let notified = 0;
    for (const u of page.page) {
      if (!(u.favorites ?? []).includes(story.restaurantId)) continue;
      // L-11: delivery is purely in-app — no phone/email requirement.
      const inserted = await notifyDiner(ctx, {
        userId: u._id,
        type: "favorite_story",
        title: `${restaurant.name} just posted`,
        body: `${story.emoji ?? "🍽️"} ${story.text.slice(0, 160)}`,
        link: `/restaurant/${restaurant._id}`,
        dedupeKey: `story:${story._id}`,
      });
      if (inserted) notified++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.dinerNotify.onStoryPosted, {
        storyId,
        cursor: page.continueCursor,
      });
    }
    return { notified };
  },
});

/** A friend confirmed their seat on the host's booking. */
export const onGuestConfirmed = internalMutation({
  args: { bookingId: v.id("bookings"), guestName: v.string() },
  handler: async (ctx, { bookingId, guestName }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking) return { notified: 0 };
    const restaurant = await ctx.db.get(booking.restaurantId);
    // L-10: key on the guest's stable identity (userId + confirmation time)
    // so two same-named guests never collide; fall back to the name for
    // legacy guest entries without a userId.
    const guest = booking.guests?.find(
      (g) => g.name.toLowerCase() === guestName.toLowerCase(),
    );
    const inserted = await notifyDiner(ctx, {
      userId: booking.userId,
      type: "guest_joined",
      title: `${guestName} confirmed their seat`,
      body: `${guestName} is in for ${restaurant?.name ?? "your booking"} on ${booking.date} at ${booking.time}. Your party is growing!`,
      link: "/bookings",
      dedupeKey: `guest:${booking._id}:${guest?.userId ?? guestName.toLowerCase()}:${guest?.confirmedAt ?? ""}`,
    });
    return { notified: inserted ? 1 : 0 };
  },
});

/** A booking was marked completed → nudge the diner to leave a review. */
export const onBookingCompleted = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking) return { notified: 0 };
    const restaurant = await ctx.db.get(booking.restaurantId);
    const inserted = await notifyDiner(ctx, {
      userId: booking.userId,
      type: "review_nudge",
      title: `How was ${restaurant?.name ?? "your visit"}?`,
      body: "You recently dined here — a quick rating helps other diners and takes 10 seconds.",
      link: "/bookings",
      dedupeKey: `review:${booking._id}`,
    });
    return { notified: inserted ? 1 : 0 };
  },
});

// ---------------------------------------------------------------------------
// daily contextual nudges — the cron entry point
// ---------------------------------------------------------------------------

/**
 * Runs every morning. For every diner:
 *  - lapsed visitors (last booking ≥ REENGAGE_AFTER_DAYS ago) whose favorite
 *    restaurants have fresh stories get a re-engagement nudge;
 *  - completed, unreviewed visits get a gentle review nudge (once).
 */
export const dailyNudges = internalAction({
  args: {},
  handler: async (ctx): Promise<{ reengaged: number; reviewNudges: number }> => {
    const reengaged: number = await ctx.runMutation(internal.dinerNotify.runReengagePass, {});
    const reviewNudges: number = await ctx.runMutation(internal.dinerNotify.runReviewNudgePass, {});
    return { reengaged, reviewNudges };
  },
});

export const runReengagePass = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REENGAGE_AFTER_DAYS * 24 * 3600_000;
    const cutoffKey = new Date(cutoff).toISOString().slice(0, 10);

    const users = await ctx.db.query("users").collect();
    const diners = users.filter((u) => u.role === "customer");

    // preload all stories in the last 14 days
    const stories = await ctx.db.query("stories").withIndex("by_created", (q) => q.gte("createdAt", Date.now() - 14 * 24 * 3600_000)).collect();
    const storiesByRestaurant = new Map<string, Doc<"stories">[]>();
    for (const s of stories) {
      const arr = storiesByRestaurant.get(s.restaurantId) ?? [];
      arr.push(s);
      storiesByRestaurant.set(s.restaurantId, arr);
    }

    let notified = 0;
    for (const u of diners) {
      const favorites = u.favorites ?? [];
      if (favorites.length === 0) continue;

      // last visit for this diner
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      const past = bookings.filter((b) => b.date < cutoffKey && (b.status === "completed" || b.status === "confirmed"));
      if (past.length === 0) continue; // never visited or only recent — no nudge

      const lastVisit = past.map((b) => b.date).sort().pop()!;
      if (lastVisit >= cutoffKey) continue; // visited recently

      // does a favorite venue have fresh stories?
      const fresh = favorites
        .map((rid) => ({ rid, stories: storiesByRestaurant.get(rid) ?? [] }))
        .filter((x) => x.stories.length > 0);
      if (fresh.length === 0) continue;

      const target = fresh[0]!;
      const restaurant = await safeGet<Doc<"restaurants">>(ctx, target.rid);
      if (!restaurant) continue;
      const storyCount = target.stories.length;

      const inserted = await notifyDiner(ctx, {
        userId: u._id,
        type: "reengage",
        title: `It's been a while, ${u.name?.split(" ")[0] ?? "diner"} — ${restaurant.name} has news`,
        body:
          storyCount === 1
            ? `${restaurant.name} just shared something new since your last visit.`
            : `${restaurant.name} has shared ${storyCount} new updates since your last visit.`,
        link: `/restaurant/${restaurant._id}`,
        dedupeKey: `reengage:${restaurant._id}:${lastVisit}`,
      });
      if (inserted) notified++;
    }
    return notified;
  },
});

export const runReviewNudgePass = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const recently = now - 3 * 24 * 3600_000; // completed in the last 3 days

    // KB-32: by_status_updated index — only completed bookings updated in the
    // window, instead of scanning every booking + every review each run.
    const completedRecent = await ctx.db
      .query("bookings")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "completed").gte("updatedAt", recently),
      )
      .collect();
    const reviews = await ctx.db.query("reviews").collect();
    const reviewedBookingIds = new Set(reviews.map((r) => r.bookingId));

    let notified = 0;
    for (const b of completedRecent) {
      if (reviewedBookingIds.has(b._id)) continue;
      if (!b.userId) continue;
      const user = await ctx.db.get(b.userId);
      if (!user) continue;

      const restaurant = await ctx.db.get(b.restaurantId);
      const inserted = await notifyDiner(ctx, {
        userId: b.userId,
        type: "review_nudge",
        title: `How was ${restaurant?.name ?? "your visit"}?`,
        body: "You recently dined here — a quick rating helps other diners and takes 10 seconds.",
        link: "/bookings",
        dedupeKey: `review:${b._id}`,
      });
      if (inserted) notified++;
    }
    return notified;
  },
});

// ---------------------------------------------------------------------------
// SMS mirror for time-sensitive types (optional per type)
// ---------------------------------------------------------------------------

/**
 * Internal action used by the booking reminder cron path to also surface the
 * reminder in-app. Not wired to the SMS sender here (the SMS already fires
 * via reminders.ts) — this just guarantees the in-app copy exists.
 */
export const mirrorBookingReminder = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.status !== "confirmed") return { notified: 0 };
    const restaurant = await ctx.db.get(booking.restaurantId);
    const inserted = await notifyDiner(ctx, {
      userId: booking.userId,
      type: "booking_reminder",
      title: `Your table at ${restaurant?.name ?? "the restaurant"} is tomorrow`,
      body: `${restaurant?.name ?? ""} · ${booking.date} at ${booking.time} for ${booking.partySize}. Code: ${booking.code}.`,
      link: "/bookings",
      dedupeKey: `reminder:${booking._id}`,
    });
    return { notified: inserted ? 1 : 0 };
  },
});

/** Mirror a freed waitlist spot into the inbox (SMS already sent by bookings). */
export const mirrorWaitlistFreed = internalMutation({
  args: {
    waitlistId: v.id("waitlist"),
    restaurantId: v.id("restaurants"),
    date: v.string(),
    time: v.string(),
  },
  handler: async (ctx, { waitlistId, restaurantId, date, time }) => {
    const entry = await ctx.db.get(waitlistId);
    if (!entry) return { notified: 0 };
    const restaurant = await ctx.db.get(restaurantId);
    const inserted = await notifyDiner(ctx, {
      userId: entry.userId,
      type: "waitlist_freed",
      title: `A table freed up at ${restaurant?.name ?? "the restaurant"}!`,
      body: `${restaurant?.name ?? ""} · ${date} at ${time} — book it now before it's gone.`,
      link: `/restaurant/${restaurantId}`,
      dedupeKey: `waitlist:${waitlistId}`,
    });
    return { notified: inserted ? 1 : 0 };
  },
});
