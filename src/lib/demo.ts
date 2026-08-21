/**
 * KB-14: the single source of truth for which restaurants ship with demo
 * service windows. Lives in `src/lib` (not `src/convex`) so BOTH the backend
 * (demoRules.ts) and the client (OwnerDashboard.tsx) can import it without
 * pulling convex server code into the web bundle.
 *
 * Previously the owner dashboard hardcoded its own list that included a
 * non-existent "Casa Oliva" and missed Beit Zaytoun and Meridian Kitchen.
 */
export const DEMO_RESTAURANT_NAMES: readonly string[] = [
  "Trullo",
  "Sakura House",
  "Beit Zaytoun",
  "La Brasa",
  "Meridian Kitchen",
];

export type DemoRestaurantName = (typeof DEMO_RESTAURANT_NAMES)[number];
