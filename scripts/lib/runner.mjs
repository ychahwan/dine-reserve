/**
 * Shared input validation for Kamix's Convex functions.
 *
 * Convex's `v` validators already enforce wire-level types; these Zod schemas
 * add the semantic rules the domain needs (real calendar dates, time formats,
 * integer ranges, non-empty names, allowed enums, length caps) so every
 * mutation validates with one consistent, readable source of truth instead of
 * scattered ad-hoc regexes. Error messages deliberately match the previous
 * inline messages the UI and the test suite rely on.
 */
import { z } from "zod";

/**
 * Validate `data` against a schema and throw a plain `Error` with the first
 * issue's message — Convex surfaces `Error` messages to the client, and the
 * UI/tests match on those exact strings.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(issue?.message ?? "Invalid input.");
  }
  return result.data;
}

/** A real calendar date "YYYY-MM-DD" (rejects e.g. 2026-02-31). */
export function isValidCalendarDate(s: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
  .refine(isValidCalendarDate, "Invalid date.");

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time.");

export const partySizeSchema = z
  .number()
  .int("Party size must be a whole number.")
  .min(1, "Party size must be between 1 and 20.")
  .max(20, "Party size must be between 1 and 20.");

export const seatKindSchema = z.enum(["inside", "outside", "bar"]);

export const optionalTextSchema = (max: number) =>
  z.string().trim().max(max, `Must be at most ${max} characters.`).optional();

/** Booking args shared by `bookings:createBooking` and `queue:enqueue`. */
export const bookingArgsSchema = z.object({
  restaurantId: z.string().min(1),
  date: dateSchema,
  time: timeSchema,
  partySize: partySizeSchema,
  name: z.string().trim().min(1, "Please enter your name.").max(80, "Name is too long."),
  email: optionalTextSchema(120),
  phone: optionalTextSchema(20),
  seat: seatKindSchema.optional(),
  nonSmoking: z.boolean().optional(),
  notes: optionalTextSchema(300),
  occasion: optionalTextSchema(40),
});

/** Waitlist join — same shape minus seat/notes/occasion. */
export const waitlistJoinSchema = z.object({
  restaurantId: z.string().min(1),
  sectionId: z.string().optional(),
  date: dateSchema,
  time: timeSchema,
  partySize: partySizeSchema,
  name: z.string().trim().min(1, "Please enter your name.").max(80, "Name is too long."),
  phone: optionalTextSchema(20),
});

/** Booking invite code (6-char, unambiguous alphabet, case-insensitive). */
export const bookingCodeSchema = z
  .string()
  .trim()
  .max(6, "Invalid booking code.")
  .regex(/^[A-Za-z0-9]+$/, "Invalid booking code.");

export const guestNameSchema = z
  .string()
  .trim()
  .min(1, "Please tell us your name.")
  .max(60, "Name is too long.");

export const restaurantFeaturesSchema = z.object({
  inside: z.boolean(),
  outside: z.boolean(),
  bar: z.boolean(),
  smoking: z.boolean(),
  parking: z.boolean().optional(),
  liveMusic: z.boolean().optional(),
  soloFriendly: z.boolean().optional(),
});

/** Owner restaurant create/update (name/cuisine/city/address all required). */
export const restaurantArgsSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required.").max(100, "Name is too long."),
  cuisine: z.string().trim().min(1, "Cuisine type is required.").max(40),
  city: z.string().trim().min(1, "City is required.").max(60),
  address: z.string().trim().min(1, "Address is required.").max(200),
  phone: optionalTextSchema(30),
  priceRange: z
    .string()
    .trim()
    .max(8, "Invalid price range.")
    .regex(/^\$+$/, "Price range must look like $$ or $$$.")
    .optional(),
  description: optionalTextSchema(1000),
  imageUrl: z.string().trim().max(500).optional(),
  features: restaurantFeaturesSchema,
});

export const sectionArgsSchema = z.object({
  name: z.string().trim().min(1, "Section name is required.").max(60),
  kind: seatKindSchema,
  smoking: z.boolean(),
  capacity: z
    .number()
    .int("Capacity must be a whole number.")
    .min(1, "Capacity must be 1–500 seats.")
    .max(500, "Capacity must be 1–500 seats."),
  description: optionalTextSchema(300),
});

export const hoursSchema = z
  .object({
    hours: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0, "Invalid day.").max(6, "Invalid day."),
          open: z.string(),
          close: z.string(),
          enabled: z.boolean(),
        }),
      )
      .length(7, "Provide hours for all 7 days."),
  })
  .refine(
    (v) =>
      v.hours.every(
        (h) => !h.enabled || (timeSchema.safeParse(h.open).success && timeSchema.safeParse(h.close).success),
      ),
    { message: "Invalid time." },
  );

export const menuArgsSchema = z.object({
  name: z.string().trim().min(1, "Menu name is required.").max(80),
  description: optionalTextSchema(300),
});

export const spiceLevelSchema = z.enum(["mild", "medium", "hot", "very_hot"]);

export const menuItemArgsSchema = z.object({
  name: z.string().trim().min(1, "Item name is required.").max(100),
  description: optionalTextSchema(300),
  priceCents: z
    .number()
    .int("Price must be a whole number of cents.")
    .min(0, "Invalid price.")
    .max(1_000_000, "Invalid price."),
  category: optionalTextSchema(40),
  popular: z.boolean().optional(),
  spiceLevel: z.union([spiceLevelSchema, z.literal("")]).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  allergens: z.array(z.string().trim().max(40)).max(12).optional(),
  ingredients: z.array(z.string().trim().max(40)).max(12).optional(),
});

/** updateMenuItem: every field optional (absent = keep current); an empty
 *  name means "keep existing", unlike create where a name is required. */
export const menuItemUpdateSchema = z.object({
  name: z.string().trim().max(100).optional(),
  description: optionalTextSchema(300),
  priceCents: z
    .number()
    .int("Price must be a whole number of cents.")
    .min(0, "Invalid price.")
    .max(1_000_000, "Invalid price.")
    .optional(),
  category: optionalTextSchema(40),
  popular: z.boolean().optional(),
  available: z.boolean().optional(),
  spiceLevel: z.union([spiceLevelSchema, z.literal("")]).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  allergens: z.array(z.string().trim().max(40)).max(12).optional(),
  ingredients: z.array(z.string().trim().max(40)).max(12).optional(),
});

export const orderLineSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1, "Item quantities must be between 1 and 20.").max(20, "Item quantities must be between 1 and 20."),
  note: optionalTextSchema(120),
  removeIngredients: z.array(z.string().trim().max(60)).max(20).optional(),
});

export const placeOrderSchema = z.object({
  items: z.array(orderLineSchema).min(1, "Your order is empty.").max(50, "Too many items in one order."),
  note: optionalTextSchema(300),
});

export const assistNoteSchema = z.object({
  note: optionalTextSchema(300),
});

export const menuRequestSchema = z.object({
  name: z.string().trim().min(1, "Tell us what you'd like.").max(100),
  description: optionalTextSchema(400),
});

export const ratingSchema = z
  .number()
  .int("Rating must be a whole number.")
  .min(1, "Rating must be between 1 and 5.")
  .max(5, "Rating must be between 1 and 5.");

export const reviewArgsSchema = z.object({
  rating: ratingSchema,
  text: optionalTextSchema(1000),
});

export const cancellationPolicySchema = z
  .number()
  .int("Policy must be a whole number of hours.")
  .min(0, "Policy must be between 0 and 168 hours.")
  .max(168, "Policy must be between 0 and 168 hours.");

export const cancelReasonSchema = optionalTextSchema(300);

// ---------------------------------------------------------------------------
// Socialize: diner-to-diner gifts
// ---------------------------------------------------------------------------

export const giftTypeSchema = z.object({
  name: z.string().trim().min(1, "Gift name is required.").max(60, "Gift name is too long."),
  emoji: z.string().trim().min(1, "Pick an emoji for the gift.").max(8, "Emoji is too long."),
  description: optionalTextSchema(200),
  priceCents: z
    .number()
    .int("Price must be a whole number of cents.")
    .min(0, "Invalid price.")
    .max(1_000_000, "Invalid price."),
  available: z.boolean(),
});

export const sendGiftSchema = z.object({
  giftId: z.string().min(1, "Pick a gift."),
  receiverUserId: z.string().min(1, "Pick who to send it to."),
  note: optionalTextSchema(200),
  reveal: z.enum(["now", "on_delivery"]),
});
