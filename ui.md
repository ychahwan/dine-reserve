# Kamix UI and CSS Improvement Proposal

The UI foundation is solid and consistent, but it currently feels like a polished component library rather than a distinctive hospitality product. The recommended direction is **warm editorial hospitality**: Lebanese green, mineral cream, restrained terracotta and gold accents, stronger typography, fewer generic cards, and more restaurant imagery.

## Highest-priority improvements

### 1. Fix the global horizontal scrolling rule

`src/index.css` applies hidden scrollbars and scroll snapping to every `.overflow-x-auto` element. This also affects admin tables and navigation, where hiding the scrollbar makes overflow difficult to discover.

Keep that behavior on an explicit `.horizontal-rail` class only. Tables and admin navigation should retain normal scrolling.

### 2. Give the product a typographic identity

`src/index.css` does not define a font family, so the application uses the system default.

Recommended typography:

- Alexandria for UI and multilingual Arabic/Latin content.
- Fraunces or Newsreader for Latin marketing headings.
- Slightly heavier restaurant names and more relaxed editorial line-height.
- Raise the minimum metadata size from 9–11px to 12px.

### 3. Reduce excessive rounding and card repetition

There are well over 150 instances of `rounded-xl`, `rounded-2xl`, and `rounded-3xl`. Almost every feature becomes a rounded bordered card, which makes different content types feel interchangeable.

Use a clearer radius hierarchy:

- Inputs and buttons: 8–10px.
- List rows and filters: 10–12px.
- Main feature panels: 16px.
- Dialogs and sheets: 20–24px.
- Pills only for actual filters, statuses, and compact selections.

Restaurant lists should feel more like editorial rows with imagery and dividers, while operational and admin content should use denser tables and panels.

### 4. Improve desktop use of space

The customer interface is permanently constrained to `max-w-md` in `src/components/CustomerShell.tsx`. That works on phones but produces a narrow phone-shaped column on laptops.

Keep the compact layout on mobile, then expand selected screens at larger breakpoints:

- Explore: two-column restaurant results.
- Restaurant detail: content plus a sticky booking panel.
- Bookings: wider timeline or list.
- Account: narrow form column inside a broader page.

The owner interface's `max-w-2xl` in `src/components/OwnerShell.tsx` is also too narrow for analytics, menus, and operational tables.

### 5. Replace the mobile admin navigation

`src/components/AdminShell.tsx` puts all admin destinations in a horizontal rail. With the AI workspace, there are too many destinations for this pattern.

Use:

- Desktop: persistent grouped sidebar.
- Mobile: menu button opening a drawer.
- Groups: Overview, Platform Data, AI & Automation, Administration.
- Keep “Register restaurant” as a clear action rather than another navigation item.

## Interaction and accessibility

- Custom filter buttons in `src/pages/Explore.tsx` lack the consistent keyboard focus treatment provided by the shared `Button` component.
- Add `prefers-reduced-motion` handling for smooth scrolling and Framer Motion reveals.
- Use `min-h-dvh` instead of `min-h-screen` for mobile browser viewport accuracy.
- Add `env(safe-area-inset-bottom)` padding to the fixed customer navigation.
- Make active filters distinguishable through icon/check state as well as color.
- Avoid important copy below 12px, especially admin metadata and notification counts.
- Either expose the existing dark theme through a system/theme switch or treat dark mode as unsupported until every surface has been visually tested.

## Visual direction

The current green and cream tokens in `src/index.css` are a good starting point. Retain them and add:

- A warm terracotta action or accent color for hospitality moments.
- A muted gold for loyalty, premium dining, and success highlights.
- A deeper forest color for headers and high-emphasis regions.
- More tonal surfaces so hierarchy does not depend entirely on borders.
- One consistent elevation system instead of scattered `shadow-sm`, `shadow-md`, and `shadow-2xl` usage.

The landing page should become more image-led. Its current centered hero and three equal “how it works” cards are clear but familiar. A restaurant photography composition, reservation receipt, or atmospheric Beirut dining scene would communicate the product faster and give Kamix a memorable identity.

## Suggested rollout

1. Foundation: typography, spacing, radius, elevation, accessibility, and safe-area rules.
2. Shells: responsive customer and owner layouts plus a mobile admin drawer.
3. Core journey: redesign Explore and Restaurant Detail around stronger imagery and clearer booking actions.
4. Admin: increase density, improve tables, and polish the AI workspace.
5. Marketing: rebuild the landing page with a distinctive editorial hospitality direction.

## Target design character

The goal is a recognizable hospitality identity rather than additional generic gradients, pills, and card grids. The interface should feel warm, editorial, trustworthy, locally relevant, and operationally clear.
