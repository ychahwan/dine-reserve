// ---------------------------------------------------------------------------
// Menu item attributes — the tag model used across the owner editor and the
// diner-facing menu. Grounded in standard industry practice: dietary labels,
// the EU Big-14 allergen set (+ soy), spice levels, and chef/business flags.
// ---------------------------------------------------------------------------

export const DIETARY_TAGS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut-free",
  "Halal",
  "Kosher",
  "Keto",
  "Paleo",
  "Sugar-free",
  "Organic",
] as const;

export const FEATURE_TAGS = [
  "Chef's special",
  "New",
  "Seasonal",
  "Local",
  "House-made",
  "Shareable",
  "Smoked",
  "Raw",
  "Grilled",
  "Fried",
  "Baked",
  "Steamed",
] as const;

/** All tags combined (stored on the item's `tags` field). */
export const MENU_TAGS = [...DIETARY_TAGS, ...FEATURE_TAGS] as const;

/**
 * Allergens — the EU Big-14 (gluten/wheat, crustaceans, eggs, fish, peanuts,
 * soy, milk, tree nuts, celery, mustard, sesame, sulphites, lupin, molluscs)
 * plus a few common additions. Store exactly these strings on `allergens`.
 */
export const ALLERGENS = [
  "Gluten",
  "Dairy",
  "Eggs",
  "Fish",
  "Shellfish",
  "Molluscs",
  "Peanuts",
  "Tree nuts",
  "Soy",
  "Sesame",
  "Celery",
  "Mustard",
  "Sulphites",
  "Lupin",
] as const;

export const SPICE_LEVELS = [
  { value: "mild", label: "Mild", heat: 1 },
  { value: "medium", label: "Medium", heat: 2 },
  { value: "hot", label: "Hot", heat: 3 },
  { value: "very_hot", label: "Very hot", heat: 4 },
] as const;

export type SpiceValue = (typeof SPICE_LEVELS)[number]["value"];

export const SPICE_VALUES = SPICE_LEVELS.map((s) => s.value);

export function spiceLabel(value?: string): string | null {
  const found = SPICE_LEVELS.find((s) => s.value === value);
  return found ? found.label : null;
}

/** Render a spice level as chili emoji, e.g. "hot" → 🌶️🌶️🌶️. */
export function spiceEmoji(value?: string): string | null {
  const found = SPICE_LEVELS.find((s) => s.value === value);
  if (!found) return null;
  return "🌶️".repeat(found.heat);
}
