# Kamix — Restaurant Availability & Booking Platform

## Software Requirements Specification (SRS)

**Version:** 1.4 (Version 1 scope + queue, waitlist, restaurant-defined slot rules, menu item photos/attributes & diner check-in notifications)
**Status:** Approved for build
**Product type:** Mobile-first web application (PWA-ready; native wrapper is future work)
**Stack:** React 19 + Vite + TypeScript, Tailwind CSS v4, Convex (backend + reactive database), Convex Auth, Twilio (SMS)

---

## 1. Product Vision

Kamix is a mobile-first platform that connects **diners** with **restaurant owners** in real time.

- **Restaurant owners** publish their restaurant, seating areas (indoor / outdoor / bar, smoking / non-smoking), weekly hours, live availability, and menus. They control the exact rhythm of their service with **service windows** (slot rules) — 30-minute casual grids, 60-minute fine-dining seatings, fixed chef's-table times, or zone-only windows — plus one-off slots for special events. They see every incoming booking and manage it from one dashboard. Menu items carry **photos and attributes** (dietary labels, allergens, spice level, feature flags) so diners can trust what they order before they book. A **notification center** keeps them in the loop: automatic booking events plus real-time **diner check-ins** ("on my way", "running late", "I've arrived"), viewable all at once or per booking.
- **Diners** search restaurants by type (cuisine), city, and seating preferences; inspect live availability; browse menus (with photos, dietary/allergen badges, and spice levels); and book a table in under 3 taps — with an SMS confirmation and a booking code they can share on WhatsApp. When a slot is sold out, they can join a waitlist and get an SMS the moment a table frees up. On the day, they can **notify the restaurant** with one tap — on my way, running late, arrived, or a special request — so the team can time the table.

The product goal for v1: **a super user-friendly, secure, stable booking experience that never overbooks**, even when 100 diners try to book the same restaurant at the same moment.

---

## 2. Personas & User Roles

| Role | Code | Description |
|---|---|---|
| Guest / Diner | `customer` | Searches, browses menus, books tables (via a fair FIFO queue), joins waitlists, manages own bookings, sends check-in notifications to the restaurant. |
| Restaurant Owner | `owner` | Manages one or more restaurants: profile, seating, hours, availability, menu, bookings, and notifications. |
| Admin | `admin` | Platform operator (out of v1 scope; reserved in schema). |

Users are created through auth (email OTP or anonymous). First-run onboarding assigns the role (`customer` or `owner`) and captures name + phone (phone is required to receive SMS confirmations).

---

## 3. Scope — Version 1

### 3.1 In scope (build all of it)

1. Customer search & discovery of restaurants by **type (cuisine)**, city, and text.
2. Restaurant detail page with **menu** (grouped by menu/category), hours, address, seating areas, and **live availability**.
3. Booking with seating preferences: **inside / outside / bar** and **smoking / non-smoking**.
4. Booking confirmation with a unique **confirmation code** and **WhatsApp sharing**.
5. **Special occasions** (birthday, anniversary, proposal…) captured at booking so the restaurant can prepare.
6. **SMS** confirmations, cancellations, and waitlist alerts via **Twilio** (graceful no-op when not configured).
7. **FIFO booking queue** so peak-hour rushes of 100+ simultaneous requests are handled fairly and never overbook.
8. **Waitlist** for sold-out times — diners are notified (and the first eligible diner is auto-promoted) when seats free up.
9. **Restaurant-defined slot rules (service windows):** owners replace the default 30-minute grid with their own pacing — different windows per day part (lunch vs dinner), fixed seatings, zone-only hours — plus **one-off custom slots** for special dates.
10. **Menu item photos & attributes:** owners upload a photo or link an image URL per dish, and tag each item with dietary labels, allergens, spice level, and feature flags; diners see the photo and badges on the menu.
11. Owner workflows: create/manage restaurant profile, seating sections, weekly hours, **availability (free spots, incl. close/reopen overrides)**, menus & items.
12. Owner bookings dashboard: see daily bookings, mark seated/completed, no-show, cancel.
13. Diner "My Bookings" management with cancellation.
14. **Diner check-in notifications:** diners send "on my way / running late / I've arrived / special request" updates tied to a booking; automatic booking-created / booking-cancelled events are logged too. Owners view all notifications and per booking, with unread state.
15. Demo/seed data so the product is usable immediately.

### 3.2 Out of scope for v1 (future)

- Payments/deposits, reviews/ratings, in-app chat, multi-language, native iOS/Android wrappers, admin console, email marketing, push notifications, POS integrations, table-level floor plans.

---

## 4. Functional Requirements

Priorities: **M** = Must, **S** = Should, **C** = Could.

### 4.1 Authentication & Profiles

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-01 | M | Users sign in with email OTP or as guest (anonymous). | Both flows work; sessions persist; protected routes redirect to `/auth?returnTo=…`. |
| FR-02 | M | First-run onboarding captures role (customer/owner), name, phone. | Role is stored on the user; phone is E.164-formatted; users are routed to the correct workspace. |
| FR-03 | M | All authenticated APIs resolve the caller's identity server-side. | No client-supplied identity is ever trusted. |

### 4.2 Customer — Search & Discovery

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-10 | M | Search restaurants by text (name, cuisine, city, description). | Full-text search returns matching restaurants. |
| FR-11 | M | Filter by restaurant type (cuisine) and city. | Chips/selects filter results; filters combine. |
| FR-12 | M | Filter by seating: inside / outside / bar. | Results only include restaurants offering that seating area. |
| FR-13 | M | Filter by non-smoking. | Results only include restaurants with a non-smoking section. |
| FR-14 | S | Restaurant cards show cuisine, price range, city, features. | Card content is complete and consistent. |

### 4.3 Customer — Restaurant Detail & Booking

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-20 | M | Detail page shows hero, description, address, phone, hours, features. | All fields render; graceful placeholder when no photo. |
| FR-21 | M | Show restaurant menu grouped by menu/category with prices. | Prices formatted as currency; unavailable items flagged. |
| FR-22 | M | Show live availability for a selected date (next 14 days). | Slots with seats remaining are displayed; full/closed slots are shown as sold-out/blocked. |
| FR-23 | M | Book with party size (1–20), date, time, seating preference (any/inside/outside/bar), non-smoking preference. | Booking succeeds only when a matching section has enough seats. |
| FR-24 | M | Capture diner name, phone, email (optional), notes, and optional special occasion. | Validated; occasion is surfaced to the owner. |
| FR-25 | M | Successful booking returns a unique confirmation code and confirmation screen. | Code is 6 chars, unambiguous alphabet. |
| FR-26 | M | Availability is **not overbooked** under concurrency. | See NFR-C01–C03 (atomic slot ledger + FIFO queue). |
| FR-27 | S | SMS confirmation sent to diner phone via Twilio when configured. | Message contains restaurant, date, time, party size, code. |
| FR-28 | S | Booking can be shared to WhatsApp with one tap. | Share text includes restaurant, when, party, code, city. |
| FR-29 | S | Sold-out times offer a waitlist join with phone for the alert. | Idempotent per (user, slot); no payment required. |
| FR-21a | S | Menu items show their **photo**, dietary/allergen **badges**, spice level, and feature flags (popular, chef's special…). | Badges match the owner's tags; allergens styled as warnings; spice shown as chili indicators. |

### 4.4 Customer — My Bookings, Waitlist & Check-ins

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-30 | M | List upcoming and past bookings with status. | Sorted; status badges correct. |
| FR-31 | M | Cancel an upcoming booking. | Seats are returned to availability; SMS cancellation sent when configured. |
| FR-32 | S | Waitlist entries are listed and removable; notified entries are marked. | User sees current status (waiting / notified). |
| FR-33 | M | **Notify the restaurant** from an upcoming confirmed booking: on my way, running late, I've arrived, or special request (with optional note). | Only the booking owner can send; only for confirmed, non-past bookings; note capped at 300 chars; the diner sees "Restaurant notified" on the card and can send again. |

### 4.5 Owner — Restaurant Management

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-40 | M | Create and edit restaurant profile (name, cuisine, city, address, phone, price range, description, photo URL, features). | Only the owner can edit; changes persist. |
| FR-41 | M | Manage seating sections: name, kind (inside/outside/bar), smoking flag, capacity. | Add/update/delete; deletion removes its slots. |
| FR-42 | M | Manage weekly hours per weekday (open, close, enabled). | Stored per day; used to generate availability. |
| FR-43 | M | Generate availability (free spots) for any date from hours + sections. | Idempotent; slot capacity equals section capacity. |
| FR-44 | M | Override individual slots: close/reopen a slot (blocked spots). | Closed slots are not bookable and shown as closed. |
| FR-46 | M | **Custom service windows (slot rules):** name, days, first/last seating (last inclusive), pacing (15/30/45/60/90/120 min or a fixed single seating), optional zone restriction. | Rules replace the default 30-min grid for the days they cover; overlapping windows merge without duplicate slots; saving a rule rebuilds upcoming unbooked slots and keeps booked tables. |
| FR-47 | M | **One-off custom slots** for a specific date (special events, holiday brunch, jazz night), scoped to all zones or one section, with an optional note. | Merged into the slot ledger; removable by the owner. |
| FR-48 | S | Owner **preview of the next 7 days** showing exactly the times diners will see per zone, plus smart gap warnings. | Days with no matching window are flagged; gaps > 2h between windows show an "Intentional?" warning. |
| FR-45 | S | Owner dashboard shows today's bookings, covers, and open slots. | Aggregates across the owner's restaurants. |

### 4.6 Owner — Menu, Bookings, Waitlist & Notifications

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-50 | M | Create/rename/delete menus. | Persist and render on the customer detail page. |
| FR-51 | M | Add/edit/delete menu items (name, description, price, category, popular, available). | Currency formatting; toggles work. |
| FR-51a | M | Set a **photo** per menu item — upload a file (≤ 5 MB, JPG/PNG/WebP, stored in Convex file storage) or paste an **image URL**; remove either. | Photo shows on owner rows and the diner menu; uploads persist server-side; editing an item without touching the photo keeps it. |
| FR-51b | M | Tag menu items with **attributes**: dietary labels (vegetarian, vegan, gluten-free, halal, kosher…), **allergens** (EU Big-14 + soy), **spice level** (mild/medium/hot/very hot), and feature flags (chef's special, seasonal, house-made…). | Tags stored as validated enum sets; shown as badges on the diner menu; toggling availability never wipes other fields. |
| FR-52 | M | View bookings per date for each restaurant. | Filter by date; show party, section, code, contact, occasion. |
| FR-53 | M | Mark bookings completed / no-show; cancel (restores seats). | Status transitions enforced; seats restored on cancel. |
| FR-54 | S | View waitlist per date and cancel entries. | Waiting + notified entries visible; cancelling is allowed. |
| FR-55 | M | **Notification center:** all notifications for the restaurant (diner check-ins + automatic booking-created/cancelled events), newest first, with unread state; view all or filter to **diner alerts** / **booking events**, and filter **per booking**; mark one or all as read. | Unread badge on the tab; tapping a notification marks it read; per-booking filter shows only that booking's notifications with diner name, party, date/time, code, and any note. |

### 4.7 Platform

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-60 | M | Seed demo data when the database is empty. | Restaurants, sections, hours, menus, slot rules, and 10 days of slots appear. |
| FR-61 | S | SMS sends degrade gracefully when Twilio keys are absent. | App works; no errors surfaced to users. |
| FR-62 | M | Booking requests go through a **FIFO queue** per (restaurant, date, time). | Every request gets a queue position; entries drain oldest-first. |
| FR-63 | M | Booking engine auto-logs **booking_created / booking_cancelled** notifications for the owner. | Events appear in the notification center without any manual step; cancelled-event restoration logic is unchanged. |

---

## 5. Non-Functional Requirements

### 5.1 Security (NFR-S)

| ID | Requirement |
|---|---|
| NFR-S01 | **Authentication:** all API calls authenticate via Convex Auth (email OTP / anonymous / federated). No unauthenticated writes. |
| NFR-S02 | **Authorization (RBAC):** every mutation verifies the caller's identity; restaurant-scoped writes additionally verify `ownerId === caller`. Bookings are readable only by their owner or the restaurant owner; notifications are readable only by the restaurant owner (or the diner's own alerts). Server-side checks only — never rely on UI. |
| NFR-S03 | **Input validation:** every mutation argument is schema-validated (`v.string`, `v.number`, ranges, time formats `HH:mm`, date format `YYYY-MM-DD`, party size 1–20). Malformed input is rejected before any write. |
| NFR-S04 | **Secrets:** Twilio credentials live only in server environment variables (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`), never in client code or the database. |
| NFR-S05 | **Transport security:** all traffic over HTTPS (platform-provided); SMS sent over TLS with HTTP Basic auth. |
| NFR-S06 | **Data minimization:** queries return only data the caller may see; contact data shared only between the diner and the restaurant owner of that booking. |
| NFR-S07 | **Tamper resistance:** confirmation codes are server-generated; booking status transitions are validated (e.g., cancelling a cancelled booking is idempotent); diner alerts are tied server-side to the caller's own booking. |
| NFR-S08 | **Upload safety:** menu photos are content-type and size checked client-side and stored via Convex file storage with server-generated upload URLs; image URLs are rendered as plain `<img src>` with the owner as the only editor. |

### 5.2 Scalability & Concurrency (NFR-C)

| ID | Requirement |
|---|---|
| NFR-C01 | **100 concurrent bookings, same restaurant, same time:** supported without overbooking. Requests are enqueued into a `bookingQueue` FIFO ledger and drained one at a time per (restaurant, date, time); each drain runs an **atomic read-check-write on the slot document** inside a single serializable Convex mutation, so the last writer always observes the true remaining seats. |
| NFR-C02 | **No lost updates:** decrement uses the value read in the same transaction (`remaining = slot.remaining - partySize`), never a stale client value. Cancellation restores seats with a ceiling of `total`. |
| NFR-C03 | **Fairness:** queue position is derived from insertion order (`createdAt`); a failed attempt never blocks the rest of the line. |
| NFR-C04 | **Idempotency:** slot generation is idempotent (missing slots only); enqueue is idempotent per (user, slot, party size). |

### 5.3 Stability & Reliability (NFR-R)

| ID | Requirement |
|---|---|
| NFR-R01 | Mutation failures return clear, user-safe error messages; the UI surfaces them via toasts, never crashes. |
| NFR-R02 | Root error boundary prevents blank screens; component-level boundaries isolate non-critical widgets. |
| NFR-R03 | SMS delivery failure never blocks the booking transaction (sent async via scheduler; result logged on the booking). |
| NFR-R04 | Seed is guarded (runs only when the restaurants table is empty). |

### 5.4 Usability & Accessibility (NFR-U)

| ID | Requirement |
|---|---|
| NFR-U01 | Mobile-first: booking in ≤ 3 taps from search; bottom navigation; thumb-friendly hit targets. |
| NFR-U02 | Clear empty/loading/error states on every screen, including an explicit "holding your table" state while the queue processes. |
| NFR-U03 | WCAG AA contrast; visible focus rings; semantic labels on icon-only controls. |
| NFR-U04 | Modern visual theme: quiet warm neutrals, refined accent, soft layered cards, crisp typography. |

---

## 6. Data Model (Convex)

```
users          { name?, email?, image?, role?: customer|owner|admin, phone?, onboarded? }
restaurants    { ownerId, name, cuisine, city, address, phone?, priceRange?, description?,
                 imageUrl?, features{inside,outside,bar,smoking,parking?,liveMusic?},
                 searchText, createdAt }        + full-text search index on searchText
sections       { restaurantId, name, kind: inside|outside|bar, smoking, capacity }   // seating areas
hours          { restaurantId, dayOfWeek(0-6), open "HH:mm", close "HH:mm", enabled }
slots          { restaurantId, sectionId, date "YYYY-MM-DD", time "HH:mm",
                 total, remaining, closed }     // free-spot ledger; seats = remaining
slotRules      { restaurantId, name, days[], start "HH:mm", end "HH:mm" (last seating,
                 inclusive), step (minutes; 0 = fixed single seating), sections?[],
                 enabled, createdAt }           // service windows; override the 30-min grid
customSlots    { restaurantId, sectionId?, date "YYYY-MM-DD", time "HH:mm", note?,
                 createdAt }                    // one-off slots for special dates
menus          { restaurantId, name, description? }
menuItems      { restaurantId, menuId, name, description?, priceCents, category?, popular?,
                 available, imageStorageId?, imageUrl?, tags?, allergens?, spiceLevel? }
                 // tags: dietary + feature labels (e.g. "Vegetarian", "Chef's special")
                 // allergens: EU Big-14 + soy (e.g. "Gluten", "Shellfish", "Sesame")
                 // spiceLevel: "mild" | "medium" | "hot" | "very_hot"
bookings       { restaurantId, userId, name, email?, phone?, date, time, partySize,
                 sectionId?, sectionName?, kind?, smoking?, status: confirmed|cancelled|completed|no_show,
                 code, notes?, occasion?, createdAt, updatedAt, smsSent? }
bookingQueue   { restaurantId, userId, date, time, partySize, seat?, nonSmoking?,
                 name, email?, phone?, notes?, occasion?,
                 status: queued|booked|failed, createdAt, bookingId?, code?,
                 bookedTime?, sectionName?, processedAt?, error? }   + by_user, by_slot
waitlist       { restaurantId, sectionId?, sectionName?, date, time, partySize,
                 userId, name, phone?, status: waiting|notified|cancelled, createdAt, notifiedAt? }
notifications  { restaurantId, bookingId?, userId, type: booking_created|booking_cancelled|
                 on_my_way|running_late|arrived|special_request, message?, read,
                 createdAt }                    // owner notification center
                 // booking_created/cancelled written automatically by the booking engine;
                 // diner check-in types written by sendForBooking. bookingId links to a
                 // reservation so the owner can view notifications per booking.
```

**Slot generation:** the 30-minute grid is the fallback. Once a restaurant defines at least one enabled service window, windows drive generation for the days they cover: each window yields times from `start` to `end` inclusive at its step, restricted to its sections when set; overlapping windows merge without duplicates; one-off `customSlots` merge on top. Rule changes rebuild upcoming unbooked slots (booked tables are kept).

**Concurrency design:** the `slots.remaining` field is the single source of truth for seats. Every booking request first enters the `bookingQueue` FIFO ledger, then a scheduled drain (`queue.processSlot`) processes entries oldest-first for one (restaurant, date, time). Each entry delegates to `attemptBooking`, which runs one serializable mutation: read slot → if `remaining >= partySize` → insert booking → `patch(slots, { remaining: remaining - partySize })`. Because Convex serializes writes to the same document, N concurrent requests are processed in strict order — the 101st finds 0 seats and is rejected cleanly. Cancellation performs the inverse with a `min(total, …)` ceiling and notifies the next eligible waitlist entry.

**Menu item photos:** `imageStorageId` (Convex file storage) and `imageUrl` (external URL) are mutually exclusive; `get` resolves any `imageStorageId` to a public URL via `ctx.storage.getUrl`. Editing an item without choosing a new photo leaves the existing one untouched; `removeImage` clears both.

**Notifications:** every booking insert (confirmed) and cancellation writes a `booking_created` / `booking_cancelled` notification with `read: false` inside the same mutation that changes the booking, so the owner's event stream can never drift from the ledger. Diner check-in alerts are written by `sendForBooking`, which verifies the caller owns the booking and that it is confirmed and upcoming. The owner's unread count, list, and mark-read flows query the same table.

---

## 7. API Surface (summary)

| Function | Kind | Purpose |
|---|---|---|
| `users.currentUser` / `users.onboard` / `users.updateProfile` | query / mutation | Profile read; role+name+phone capture; profile edit |
| `restaurants.search` | query | Full-text + cuisine + city + seat + non-smoking filters |
| `restaurants.get` | query | Restaurant + sections + hours + menus(+items) |
| `restaurants.create/update/delete` | mutation | Owner CRUD |
| `restaurants.addSection/updateSection/deleteSection` | mutation | Seating areas |
| `restaurants.saveHours` | mutation | Weekly hours |
| `restaurants.createMenu/updateMenu/deleteMenu`, `createMenuItem/updateMenuItem/deleteMenuItem` | mutation | Menu management (items carry photo + attribute fields) |
| `uploads.generateUploadUrl` | action | Server-generated upload URL for menu item photos (Convex file storage) |
| `availability.ensureForDate` | mutation | Idempotent slot generation for a date (rules or default grid) |
| `availability.forDate` | query | Slots grouped by section for a date |
| `availability.summary` | query | Free-seat summary per restaurant for a date |
| `availability.setSlotClosed` | mutation | Owner override (blocked spots) |
| `slotRules.list` / `slotRules.previewWeek` | query | Rules + one-off slots; 7-day diner preview with gap detection |
| `slotRules.saveRule` / `deleteRule` | mutation | Service-window CRUD (rebuilds upcoming unbooked slots) |
| `slotRules.addCustomSlot` / `deleteCustomSlot` | mutation | One-off slots for special dates |
| `queue.enqueue` | mutation | Join the FIFO booking queue (returns entry + position) |
| `queue.myEntries` | query | Current user's queue entries with restaurant info |
| `bookings.createBooking` | mutation | Direct atomic book (used internally; kept for owner quick-books) |
| `bookings.myBookings` / `bookings.byRestaurant(·Date)` | query | Diner / owner views |
| `bookings.cancelBooking` / `updateStatus` | mutation | Cancel (restores seats + frees waitlist + logs event) / status transitions |
| `notifications.sendForBooking` | mutation | Diner sends a check-in alert tied to a confirmed booking |
| `notifications.myAlerts` | query | The diner's own sent alerts (card "notified" state) |
| `notifications.forRestaurant(·bookingId)` | query | Owner: all notifications, optionally per booking (joined with diner + booking) |
| `notifications.unreadCount` | query | Owner tab badge |
| `notifications.markRead` / `markAllRead` | mutation | Owner read state |
| `waitlist.join` / `waitlist.cancel` / `waitlist.myWaitlist` / `waitlist.byRestaurant` | mutation / query | Waitlist flows |
| `sms.sendBookingSms` / `sms.sendWaitlistSms` | action | Twilio REST calls (env-guarded) |
| `seed.ensureDemoData` | mutation | One-time demo dataset |

---

## 8. Security Architecture

1. **Identity:** Convex Auth sessions (HTTP-only cookies via same-site requests) with email-OTP and anonymous providers; federated tokens accepted for platform sign-in.
2. **Authorization:** a shared `requireOwner(ctx, restaurantId)` helper enforces `ownerId === caller` on every restaurant-scoped mutation; `cancelBooking` accepts the booking owner *or* the restaurant owner; `updateStatus` is owner-only. Notification reads are owner-only (or the diner's own alerts via `myAlerts`); `sendForBooking` verifies `booking.userId === caller`, status `confirmed`, and a non-past date.
3. **Validation:** Convex `v.*` validators on every function argument (types, formats, ranges, length caps).
4. **Secrets:** Twilio keys read via `process.env` inside Convex actions only.
5. **SMS:** Twilio REST `Messages.json` over TLS with HTTP Basic auth; failure is caught, logged via the booking's `smsSent` flag, and never surfaces as a user error.
6. **Uploads:** photo uploads use server-generated one-time URLs (`uploads.generateUploadUrl`); file type/size are checked before upload; stored files are only referenced by the item that owns them.

---

## 9. Acceptance Test Plan (v1 exit criteria)

- [ ] Guest can sign in (email OTP and anonymous) and is routed through onboarding.
- [ ] Diner searches and filters by cuisine, city, inside/outside/bar, non-smoking.
- [ ] Diner opens a restaurant, sees menu + hours, picks date/time/party/preferences and books; receives code + confirmation screen.
- [ ] Booking a slot at 0 remaining seats is impossible (UI disabled + server rejects through the queue).
- [ ] **Load test:** 100 parallel booking attempts on the same slot produce at most `capacity` successful bookings, in FIFO order, with positions shown while queued.
- [ ] Diner cancels a booking; seats are restored and shown available again.
- [ ] Diner joins a waitlist for a sold-out slot; cancelling another booking notifies the first eligible waitlist entry (SMS when configured).
- [ ] Owner creates a restaurant, sections, hours; availability generates; slots close/reopen; menu CRUD works.
- [ ] Owner adds a menu item with an **uploaded photo**, edits it to an **image URL**, and tags it (dietary + allergens + spice + popular); diner menu shows the photo, badges, and spice indicator; toggling availability keeps the photo/tags.
- [ ] Owner defines custom service windows (e.g. lunch 30-min, dinner 60-min, fixed omakase seatings, bar-only window); the 7-day preview reflects them; overlapping windows don't duplicate slots; a >2h gap is flagged; removing a window rebuilds upcoming unbooked slots.
- [ ] Owner adds and removes a one-off custom slot for a special date; the slot appears in availability.
- [ ] Owner sees today's bookings (incl. occasion), marks completed/no-show, cancels.
- [ ] Diner sends an "on my way" alert (and a special request with a note) from an upcoming booking; the card shows "Restaurant notified"; the owner's notification center shows it (unread, with diner + booking info), filtered by all / diner alerts / per booking; tapping it marks it read; "mark all read" clears the badge.
- [ ] A new booking and a cancellation automatically appear as events in the owner's notification center without any manual step.
- [ ] With Twilio keys set, SMS confirmations/cancellations/waitlist alerts deliver; without keys, app still works.
- [ ] All flows pass `npx tsc -b --noEmit`; no unhandled runtime errors in preview console.

---

## 10. Success Metrics (v1)

- Booking success rate ≥ 99% (no overbooking failures other than true capacity).
- Median time from search → booking confirmation < 60 seconds.
- Zero unauthorized-write incidents in review of every mutation (RBAC enforced).
- p95 booking mutation latency < 300 ms.

## 11. Roadmap (post-v1)

Payments/deposits → reviews → table-floor plans → native apps (Capacitor) → admin console → POS integrations.
