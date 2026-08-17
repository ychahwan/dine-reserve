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
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // customer | owner | admin
      phone: v.optional(v.string()), // for SMS confirmations
      onboarded: v.optional(v.boolean()), // completed first-run onboarding
      prefs: v.optional(DINING_PREFS), // dining preferences (dietary, seating, occasions)
      favorites: v.optional(v.array(v.id("restaurants"))), // saved restaurants
    }).index("email", ["email"]),

    // ---------- Kamix domain tables ----------

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
