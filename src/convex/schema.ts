import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// User roles. customer = diner, owner = restaurant manager.
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  CUSTOMER: "customer",
  OWNER: "owner",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.CUSTOMER),
  v.literal(ROLES.OWNER),
);
export type Role = Infer<typeof roleValidator>;

export const SEAT_KIND = v.union(
  v.literal("inside"),
  v.literal("outside"),
  v.literal("bar"),
);
export type SeatKind = Infer<typeof SEAT_KIND>;

export const BOOKING_STATUS = v.union(
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("completed"),
  v.literal("no_show"),
);

export const WAITLIST_STATUS = v.union(
  v.literal("waiting"),
  v.literal("notified"),
  v.literal("cancelled"),
);

// Notifications shown in the restaurant owner's dashboard.
// - booking_created / booking_cancelled are written automatically by the
//   booking engine so the owner sees the full event stream.
// - on_my_way / running_late / arrived / special_request are sent by the
//   diner from their booking ("moving now" style check-ins).
// - new_order / assist_request / menu_request are written by the dine-in
//   experience (orders, pings to the team, and off-menu requests).
// - gift_ordered is written when a diner sends another diner a gift via
//   Socialize (the owner prepares it and marks it delivered).
export const NOTIFICATION_TYPE = v.union(
  v.literal("booking_created"),
  v.literal("booking_cancelled"),
  v.literal("on_my_way"),
  v.literal("running_late"),
  v.literal("arrived"),
  v.literal("special_request"),
  v.literal("new_order"),
  v.literal("assist_request"),
  v.literal("menu_request"),
  v.literal("gift_ordered"),
);
export type NotificationType = Infer<typeof NOTIFICATION_TYPE>;

// Shared validator for restaurant features / amenities
export const FEATURES = v.object({
  inside: v.boolean(),
  outside: v.boolean(),
  bar: v.boolean(),
  smoking: v.boolean(),
  parking: v.optional(v.boolean()),
  liveMusic: v.optional(v.boolean()),
  soloFriendly: v.optional(v.boolean()),
});
export type RestaurantFeatures = Infer<typeof FEATURES>;

// Diner dining profile: dietary tags, preferred seating vibes, occasions
// they celebrate, and favorite restaurants (used to prefill + personalize).
export const DINING_PREFS = v.object({
  dietary: v.array(v.string()), // e.g. ["Vegetarian", "Halal"]
  seating: v.array(SEAT_KIND), // preferred zones
  occasions: v.array(v.string()), // e.g. ["birthday", "anniversary"]
});
export type DiningPrefs = Infer<typeof DINING_PREFS>;

// One confirmed guest on a booking (via the invite link flow)
export const BOOKING_GUEST = v.object({
  name: v.string(),
  userId: v.optional(v.id("users")),
  confirmedAt: v.number(),
});

// Lifecycle of a dine-in order placed from a booking.
// open → preparing → served → completed (owner drives it); diner can cancel
// while open. completed/cancelled are terminal for billing purposes.
export const ORDER_STATUS = v.union(
  v.literal("open"),
  v.literal("preparing"),
  v.literal("served"),
  v.literal("completed"),
  v.literal("cancelled"),
);

// One line on a dine-in order — snapshot of the menu item at order time so
// prices stay correct even if the menu changes later. ingredients is the
// restaurant's list at order time; removeIngredients is what the diner asked
// the kitchen to leave out (the customization).
export const ORDER_ITEM = v.object({
  menuItemId: v.optional(v.id("menuItems")),
  name: v.string(),
  priceCents: v.number(),
  quantity: v.number(),
  note: v.optional(v.string()),
  ingredients: v.optional(v.array(v.string())),
  removeIngredients: v.optional(v.array(v.string())),
});

// Ready-made pings a diner can send to the waiter/manager from the table.
export const ASSIST_TEMPLATE = v.union(
  v.literal("water"),
  v.literal("napkins"),
  v.literal("utensils"),
  v.literal("order_status"),
  v.literal("bill"),
  v.literal("help"),
  v.literal("custom"),
);

export const ASSIST_STATUS = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("cancelled"),
);

// Off-menu requests ("can you make something without peanuts?") — the owner
// manages them in a dedicated tab.
export const MENU_REQUEST_STATUS = v.union(
  v.literal("new"),
  v.literal("in_progress"),
  v.literal("fulfilled"),
  v.literal("declined"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      phoneVerificationTime: v.optional(v.number()), // phone verification time (auth library writes this). do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // customer | owner | admin
      phone: v.optional(v.string()), // for SMS confirmations
      onboarded: v.optional(v.boolean()), // completed first-run onboarding
      // Set on restaurant accounts created/tagged by the platform admin: the
      // owner must set a new password on their next sign-in before proceeding.
      mustChangePassword: v.optional(v.boolean()),
      // Platform admin can disable an account. Disabled users cannot sign in
      // (enforced in the auth afterUserCreatedOrUpdated callback) and their
      // existing sessions are invalidated when the flag is set.
      disabled: v.optional(v.boolean()),
      prefs: v.optional(DINING_PREFS), // dining preferences (dietary, seating, occasions)
      favorites: v.optional(v.array(v.id("restaurants"))), // saved restaurants
      // Loyalty points (Idea #18): earned for completed bookings, reviews
      // and Socialize activity; shown in the diner's account. Awarded via
      // loyalty.awardPoints (idempotent per source doc).
      points: v.optional(v.number()),
    })
      .index("email", ["email"])
      .index("phone", ["phone"]),

    // ---------- Kamix domain tables ----------

    // Server-side rate limiter (key + window → count). Checked in mutations
    // that need per-user throttling (e.g. gift sends, invite lookups).
    rateLimits: defineTable({
      key: v.string(), // e.g. "sendGift:userId"
      windowStart: v.number(), // start of the current window (ms)
      count: v.number(), // calls in this window
    })
      .index("by_key_window", ["key", "windowStart"])
      // garbage-collect old windows; Convex TTL or manual cleanup
      .index("by_window", [
        "windowStart",
      ]),

    // Audit log for platform admin actions. Append-only — never deleted.
    adminAuditLog: defineTable({
      adminUserId: v.id("users"),
      action: v.string(), // e.g. "claimPlatformAdmin", "registerRestaurant"
      targetUserId: v.optional(v.id("users")),
      details: v.optional(v.string()), // JSON summary (restaurant name, etc.)
      createdAt: v.number(),
    }).index("by_admin", ["adminUserId", "createdAt"]),

    restaurants: defineTable({
      ownerId: v.id("users"),
      name: v.string(),
      cuisine: v.string(),
      searchText: v.string(), // concatenated searchable text
      description: v.optional(v.string()),
      address: v.string(),
      city: v.string(),
      neighborhood: v.optional(v.string()),
      phone: v.optional(v.string()),
      priceRange: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      features: FEATURES,
      // no-show protection: diners can cancel free until this many hours
      // before the booking; 0 / undefined = no policy
      cancellationPolicyHours: v.optional(v.number()),
      // Platform admin can disable or delete a restaurant. Disabled venues
      // are hidden from search/explore, treated as closed for availability,
      // and refuse new bookings — the owner can still see them.
      disabled: v.optional(v.boolean()),
      // Socialize room controls (Idea #8): the owner decides whether the
      // Socialize feature is active at this venue, sets a minimum completed-
      // visit threshold for visibility, and can block specific users.
      socialize: v.optional(v.object({
        enabled: v.boolean(),
        minVisits: v.number(), // 0 = any confirmed diner, N = need N+ completed visits
        blockedUserIds: v.array(v.id("users")),
      })),
      createdAt: v.number(),
    })
      .index("by_owner", ["ownerId"])
      .index("by_city", ["city"])
      .searchIndex("search_name", {
        searchField: "searchText",
        filterFields: ["city", "cuisine"],
      }),

    // seating areas: indoor / terrace / bar / smoking lounge, etc.
    sections: defineTable({
      restaurantId: v.id("restaurants"),
      name: v.string(),
      kind: SEAT_KIND,
      smoking: v.boolean(),
      capacity: v.number(),
      description: v.optional(v.string()),
    }).index("by_restaurant", ["restaurantId"]),

    // weekly opening-hours template, one doc per weekday
    hours: defineTable({
      restaurantId: v.id("restaurants"),
      dayOfWeek: v.number(), // 0 = Sunday ... 6 = Saturday
      open: v.string(), // "HH:mm" 24h
      close: v.string(), // "HH:mm" 24h
      enabled: v.boolean(),
    }).index("by_restaurant", ["restaurantId"]),

    // free-spot ledger. One doc per (section, date, time).
    // remaining seats is the source of truth for capacity — mutated atomically.
    slots: defineTable({
      restaurantId: v.id("restaurants"),
      sectionId: v.id("sections"),
      date: v.string(), // "YYYY-MM-DD"
      time: v.string(), // "HH:mm"
      total: v.number(),
      remaining: v.number(),
      closed: v.boolean(), // owner override
    })
      .index("by_restaurant_date", ["restaurantId", "date"])
      .index("by_section_date", ["sectionId", "date"]),

    // restaurant-defined service windows ("slot rules"). When the restaurant has
    // at least one enabled rule, rules replace the default 30-min grid entirely
    // for the days they cover — so a fine-dining place can run 60-min seatings,
    // a fast-casual spot 15-min slots, and a chef's table can be fixed seatings.
    slotRules: defineTable({
      restaurantId: v.id("restaurants"),
      name: v.string(), // "Lunch", "Dinner", "Chef's table"…
      days: v.array(v.number()), // weekdays 0 (Sun) … 6 (Sat) this window repeats on
      start: v.string(), // "HH:mm" first seating
      end: v.string(), // "HH:mm" last seating (inclusive)
      step: v.number(), // minutes between seatings; 0 = fixed single seating
      sections: v.optional(v.array(v.id("sections"))), // restrict to zones; omitted = all
      enabled: v.boolean(),
      createdAt: v.number(),
    }).index("by_restaurant", ["restaurantId"]),

    // one-off slots for a specific date (holiday brunch, jazz night, private
    // event). sectionId omitted = applies to every seating area.
    customSlots: defineTable({
      restaurantId: v.id("restaurants"),
      sectionId: v.optional(v.id("sections")),
      date: v.string(), // "YYYY-MM-DD"
      time: v.string(), // "HH:mm"
      note: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_restaurant_date", ["restaurantId", "date"]),

    menus: defineTable({
      restaurantId: v.id("restaurants"),
      name: v.string(),
      description: v.optional(v.string()),
    }).index("by_restaurant", ["restaurantId"]),

    menuItems: defineTable({
      restaurantId: v.id("restaurants"),
      menuId: v.id("menus"),
      name: v.string(),
      description: v.optional(v.string()),
      priceCents: v.number(),
      category: v.optional(v.string()),
      popular: v.optional(v.boolean()),
      available: v.boolean(),
      // photo: either an uploaded file (Convex storage) or an external URL
      imageStorageId: v.optional(v.id("_storage")),
      imageUrl: v.optional(v.string()),
      // attribute tags: dietary + feature labels (e.g. Vegan, Chef's special)
      tags: v.optional(v.array(v.string())),
      // allergens (EU Big-14 set + common additions)
      allergens: v.optional(v.array(v.string())),
      // the dish's ingredients as defined by the restaurant — diners can
      // remove any of these when they customize their order at the table
      ingredients: v.optional(v.array(v.string())),
      // mild | medium | hot | very_hot
      spiceLevel: v.optional(
        v.union(v.literal("mild"), v.literal("medium"), v.literal("hot"), v.literal("very_hot")),
      ),
    })
      .index("by_menu", ["menuId"])
      .index("by_restaurant", ["restaurantId"]),

    bookings: defineTable({
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      date: v.string(), // "YYYY-MM-DD"
      time: v.string(), // "HH:mm"
      partySize: v.number(),
      sectionId: v.optional(v.id("sections")),
      sectionName: v.optional(v.string()),
      kind: v.optional(SEAT_KIND),
      smoking: v.optional(v.boolean()),
      status: BOOKING_STATUS,
      code: v.string(),
      notes: v.optional(v.string()),
      occasion: v.optional(v.string()), // birthday, anniversary, proposal, business…
      createdAt: v.number(),
      updatedAt: v.number(),
      smsSent: v.optional(v.boolean()),
      // friends confirmed via the invite link (their seats count against the slot)
      guests: v.optional(v.array(BOOKING_GUEST)),
      // day-before SMS reminder has been sent (via the daily reminders cron)
      reminderSent: v.optional(v.boolean()),
      // diner confirmed arrival at the restaurant (timestamp)
      checkedInAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_restaurant", ["restaurantId"])
      .index("by_restaurant_date", ["restaurantId", "date"])
      .index("by_date", ["date"]) // KB-32: day-before reminder cron (reminders.ts)
      .index("by_status_updated", ["status", "updatedAt"]) // KB-32: review-nudge pass
      .index("by_code", ["code"]), // invite-link lookups

    // FIFO booking-request queue. Every diner booking request enqueues here
    // and is drained one entry at a time per (restaurant, date, time), so a
    // peak-hour rush of 100+ simultaneous requests is handled fairly and can
    // never overbook the restaurant.
    bookingQueue: defineTable({
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      date: v.string(), // "YYYY-MM-DD"
      time: v.string(), // "HH:mm"
      partySize: v.number(),
      seat: v.optional(SEAT_KIND),
      nonSmoking: v.optional(v.boolean()),
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      notes: v.optional(v.string()),
      occasion: v.optional(v.string()),
      status: v.union(v.literal("queued"), v.literal("booked"), v.literal("failed")),
      createdAt: v.number(),
      bookingId: v.optional(v.id("bookings")),
      code: v.optional(v.string()),
      bookedTime: v.optional(v.string()),
      sectionName: v.optional(v.string()),
      processedAt: v.optional(v.number()),
      error: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_slot", ["restaurantId", "date", "time"]),

    // diners waiting for a sold-out time; notified automatically on cancellation
    waitlist: defineTable({
      restaurantId: v.id("restaurants"),
      sectionId: v.optional(v.id("sections")),
      sectionName: v.optional(v.string()),
      date: v.string(), // "YYYY-MM-DD"
      time: v.string(), // "HH:mm"
      partySize: v.number(),
      userId: v.id("users"),
      name: v.string(),
      phone: v.optional(v.string()),
      status: WAITLIST_STATUS,
      createdAt: v.number(),
      notifiedAt: v.optional(v.number()),
    })
      .index("by_restaurant_date", ["restaurantId", "date"])
      .index("by_user", ["userId"]),

    // owner dashboard notifications: diner check-in alerts + automatic
    // booking events. bookingId is set when the notification concerns a
    // specific reservation (so the owner can view them per booking).
    notifications: defineTable({
      restaurantId: v.id("restaurants"),
      bookingId: v.optional(v.id("bookings")),
      userId: v.id("users"), // the diner who triggered it (or booked)
      type: NOTIFICATION_TYPE,
      message: v.optional(v.string()),
      read: v.boolean(), // seen by the restaurant
      createdAt: v.number(),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_restaurant_read", ["restaurantId", "read"])
      .index("by_booking", ["bookingId"])
      .index("by_user", ["userId"]),

    // verified diner reviews (a diner can only review a restaurant they've
    // actually dined at). rating 1–5; one review per booking.
    reviews: defineTable({
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      bookingId: v.optional(v.id("bookings")),
      rating: v.number(), // 1..5
      text: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_user", ["userId"])
      .index("by_booking", ["bookingId"]),

    // dine-in orders placed from a booking — the diner orders from the menu
    // directly, the kitchen sees it live, and the bill is built from these.
    dineOrders: defineTable({
      bookingId: v.id("bookings"),
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      items: v.array(ORDER_ITEM),
      totalCents: v.number(),
      status: ORDER_STATUS,
      note: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_booking", ["bookingId"])
      .index("by_restaurant", ["restaurantId"])
      .index("by_user", ["userId"]),

    // diner pings to the waiter/manager ("more water", "bring the bill"…).
    // The restaurant sees them instantly (reactive) and marks them resolved.
    assistRequests: defineTable({
      bookingId: v.id("bookings"),
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      template: ASSIST_TEMPLATE,
      note: v.optional(v.string()),
      status: ASSIST_STATUS,
      createdAt: v.number(),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_booking", ["bookingId"])
      .index("by_user", ["userId"]),

    // "can you make me something not on the menu?" — the owner reviews these
    // in a dedicated tab (new → in progress → fulfilled / declined).
    menuRequests: defineTable({
      restaurantId: v.id("restaurants"),
      userId: v.optional(v.id("users")),
      bookingId: v.optional(v.id("bookings")),
      name: v.string(),
      description: v.optional(v.string()),
      status: MENU_REQUEST_STATUS,
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_user", ["userId"])
      .index("by_booking", ["bookingId"]),

    // ---------- Socialize: diner-to-diner gifts & presence ----------

    // Restaurant-defined gift catalog — what diners can send each other in
    // the Socialize space (a drink, a dessert, a coffee…). Owner-managed.
    giftTypes: defineTable({
      restaurantId: v.id("restaurants"),
      name: v.string(),
      emoji: v.string(),
      description: v.optional(v.string()),
      priceCents: v.number(),
      available: v.boolean(),
      createdAt: v.number(),
    }).index("by_restaurant", ["restaurantId"]),

    // A diner's Socialize presence at a restaurant — visible (shown to other
    // diners, open to gifts) or invisible. One doc per booking.
    dinerPresence: defineTable({
      bookingId: v.id("bookings"),
      restaurantId: v.id("restaurants"),
      userId: v.id("users"),
      visible: v.boolean(),
      updatedAt: v.number(),
      // Soft gate (Idea #3): progressive access tiers.
      // "booked" = pre-set only, "checked_in" = names visible, "seated" = full profiles + Taste Twins
      accessTier: v.optional(v.union(v.literal("booked"), v.literal("checked_in"), v.literal("seated"))),
      tierUpdatedAt: v.optional(v.number()),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_booking", ["bookingId"])
      .index("by_user", ["userId"]),

    // Pending self-service account deletion (GDPR erasure). The diner
    // requests deletion; we SMS an OTP to their phone and store the pending
    // request here. Only after the code is verified does the cascade run.
    // Same shape as phoneChangeRequests so the confirmation UX is identical.
    accountDeleteRequests: defineTable({
      userId: v.id("users"),
      codeHash: v.string(), // sha256 of the 6-digit OTP sent to the user's phone
      expiresAt: v.number(), // ms epoch; code is only valid until then
      createdAt: v.number(),
    })
      .index("by_user", ["userId"]),

    // Pending phone-number change. A signed-in user requests a change to a
    // new number; we SMS an OTP to the NEW number and store the pending
    // change here. Only after the code is verified does the phone actually
    // move (users.phone + the phone-otp/password authAccounts providerAccountId).
    phoneChangeRequests: defineTable({
      userId: v.id("users"),
      newPhone: v.string(), // the verified new number
      codeHash: v.string(), // sha256 of the 6-digit OTP sent to newPhone
      expiresAt: v.number(), // ms epoch; code is only valid until then
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_new_phone", ["newPhone"]),

    // ---------- Restaurant stories (Idea #8) ----------

    // Short behind-the-scenes posts owners publish to their restaurant page:
    // new menu items, chef's specials, event nights. Shown on the Explore
    // feed and the restaurant detail page, newest first.
    stories: defineTable({
      restaurantId: v.id("restaurants"),
      text: v.string(),
      emoji: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_restaurant", ["restaurantId", "createdAt"])
      .index("by_created", ["createdAt"]),

    // ---------- Diner notification inbox (Idea #4) ----------

    // Contextual, personalized nudges for the diner: a favorite restaurant
    // posted a story, it's been a while since their last visit, a friend
    // confirmed a seat on their booking, a table on their waitlist freed up,
    // or a visit is ready to be reviewed. Shown in the app's bell feed;
    // high-value types can also be SMS-mirrored (see notifyDiner).
    dinerNotifications: defineTable({
      userId: v.id("users"),
      type: v.union(
        v.literal("favorite_story"),
        v.literal("reengage"),
        v.literal("guest_joined"),
        v.literal("review_nudge"),
        v.literal("waitlist_freed"),
        v.literal("booking_reminder"),
      ),
      title: v.string(),
      body: v.string(),
      link: v.optional(v.string()), // app route, e.g. /restaurant/:id
      // dedupe key: the same story / booking / waitlist must never produce
      // two identical rows for the same diner.
      dedupeKey: v.string(),
      read: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_read", ["userId", "read"])
      .index("by_user_dedupe", ["userId", "dedupeKey"]), // KB-32: dedupe lookup

    // ---------- Loyalty points ledger (Idea #18) ----------

    // Idempotent credit ledger — one row per (user, sourceId) so a booking
    // can never be credited twice. Balance lives on users.points.
    loyaltyLedger: defineTable({
      userId: v.id("users"),
      amount: v.number(),
      source: v.union(
        v.literal("booking_completed"),
        v.literal("review"),
        v.literal("gift_sent"),
        v.literal("check_in"),
      ),
      sourceId: v.string(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_source", ["userId", "sourceId"]),

    // A gift one diner sends to another at the same restaurant. The price is
    // snapped at send time and charged to the sender's bill. `reveal` decides
    // whether the receiver sees it immediately ("now") or only once the
    // restaurant marks it delivered ("on_delivery" — a surprise).
    giftDeliveries: defineTable({
      restaurantId: v.id("restaurants"),
      bookingId: v.id("bookings"), // sender's booking (the bill this gift lands on)
      senderUserId: v.id("users"),
      receiverUserId: v.id("users"),
      giftId: v.optional(v.id("giftTypes")),
      name: v.string(), // snapshot at send time
      emoji: v.string(),
      priceCents: v.number(),
      note: v.optional(v.string()),
      reveal: v.union(v.literal("now"), v.literal("on_delivery")),
      status: v.union(v.literal("ordered"), v.literal("delivered"), v.literal("cancelled")),
      revealedAt: v.optional(v.number()),
      createdAt: v.number(),
      deliveredAt: v.optional(v.number()),
    })
      .index("by_restaurant", ["restaurantId"])
      .index("by_booking", ["bookingId"])
      .index("by_sender", ["senderUserId"])
      .index("by_receiver", ["receiverUserId"]),

    // Platform-level configuration editable by the admin in the console:
    // API keys (Gemini, Twilio, …) stored server-side so they can be
    // changed at runtime without redeploying environment variables.
    // `value` is plaintext in the DB — the admin console masks it in the UI
    // and the value is only readable by admins through the settings actions.
    appSettings: defineTable({
      key: v.string(), // e.g. "GEMINI_API_KEY", "TWILIO_ACCOUNT_SID"
      value: v.string(),
      updatedBy: v.id("users"),
      updatedAt: v.number(),
    })
      .index("by_key", ["key"]),

    // Persisted AI support data. Conversations/messages are deliberately
    // separate so the admin console can browse threads without duplicating
    // the customer profile or prompt payload on every row.
    aiConversations: defineTable({
      userId: v.id("users"),
      title: v.optional(v.string()),
      lastMessageAt: v.number(),
      messageCount: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_last_message", ["lastMessageAt"]),

    aiMessages: defineTable({
      conversationId: v.id("aiConversations"),
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      metadata: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_conversation", ["conversationId", "createdAt"])
      .index("by_user", ["userId"]),

    // Curated facts and rules injected into the agent context. These are
    // editable by admins and intentionally versionable through updatedAt.
    aiKnowledge: defineTable({
      key: v.optional(v.string()),
      title: v.string(),
      category: v.string(),
      content: v.string(),
      priority: v.number(),
      enabled: v.boolean(),
      updatedBy: v.id("users"),
      updatedAt: v.number(),
    }).index("by_enabled_priority", ["enabled", "priority"]).index("by_key", ["key"]),

    aiSemanticRules: defineTable({
      key: v.optional(v.string()),
      name: v.string(),
      description: v.string(),
      instruction: v.string(),
      priority: v.number(),
      enabled: v.boolean(),
      updatedBy: v.id("users"),
      updatedAt: v.number(),
    }).index("by_enabled_priority", ["enabled", "priority"]).index("by_key", ["key"]),

    // Push notification tokens for FCM (Firebase Cloud Messaging)
    notificationTokens: defineTable({
      token: v.string(),
      platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
      userId: v.id("users"),
      createdAt: v.number(),
      lastUsed: v.number(),
      active: v.boolean(),
    })
      .index("by_token", ["token"])
      .index("by_user", ["userId"])
      .index("by_platform", ["platform"]),
  },
  {
    schemaValidation: true,
  },
);

export default schema;
