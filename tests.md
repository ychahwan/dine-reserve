# Kamix — Test Scenarios

Version-1 acceptance suite. Two execution modes:

- **Automated (backend)** — `scripts/test-backend.sh` drives the exact Convex functions the UI calls, against the live deployment, using `convex run` with `--identity` to simulate signed-in diners and owners. Results are recorded in the **Status** column below.
- **Manual (web UI)** — click-through steps for the preview app. No browser automation is available in this environment, so these are written as precise walkthroughs to run by hand.

Status legend: **✅ Pass** · **❌ Fail** · **⚠️ Not run** (needs manual/browser execution).

---

## A. Landing, auth & routing (manual — web UI)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| A-1 | Landing page loads | Open `/` signed-out | Hero, features, CTAs render; "Explore" CTA leads to `/auth?returnTo=…` | ⚠️ Not run |
| A-2 | Protected routes redirect | Open `/explore`, `/bookings`, `/owner` signed-out | Redirected to `/auth` with the intended `returnTo` | ⚠️ Not run |
| A-3 | Sign in (email code / guest) | `/auth` → guest or email OTP | Lands on `/dashboard` (or the `returnTo` path); onboarding completes with name + role | ⚠️ Not run |
| A-4 | Role router | After onboarding pick "customer" vs "owner" | Customer lands in Explore workspace; owner lands in owner dashboard | ⚠️ Not run |
| A-5 | Not-found route | Open `/nope` | Friendly 404 page | ⚠️ Not run |

## B. Diner — discovery (automated + manual)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| B-1 | Search lists restaurants | `restaurants:search {}` | Trullo, Sakura House, Casa Oliva, La Brasa returned | ✅ Pass |
| B-2 | Cuisine filter | `search {cuisine:"Italian"}` | Trullo + Casa Oliva only | ✅ Pass |
| B-3 | City filter | `search {city:"Rome"}` | Casa Oliva + La Brasa only | ✅ Pass |
| B-4 | Solo-friendly filter | `search {solo:true}` | Sakura, Casa Oliva, La Brasa — **not** Trullo | ✅ Pass |
| B-5 | Dietary search | `search {dietary:"vegan"}` | Only restaurants with a tagged vegan menu item (Casa Oliva) | ✅ Pass |
| B-6 | Free-text search | `search {q:"omakase"}` | Sakura House | ✅ Pass |
| B-7 | Restaurant detail | `restaurants:get` for Trullo | Sections, hours, menu groups with items, rating object | ✅ Pass |
| B-8 | Availability per date | `availability:forDate` Trullo today | Sections with slot times + remaining seats | ✅ Pass |
| B-9 | Explore page (manual) | `/explore` signed-in; filter chips, search box | Results update live; favorites heart + rating shown | ⚠️ Not run |
| B-10 | Menu display (manual) | Open any restaurant from Explore | Photos, dietary badges, ⚠ allergen rows, 🌶 spice shown per item | ⚠️ Not run |

## C. Booking engine — the no-overbooking guarantee (automated)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| C-1 | Owner creates restaurant | `restaurants:create` as `test-owner-1` | Restaurant + default section created | ✅ Pass |
| C-2 | Owner tunes seating | `addSection` (cap 2) + delete default + `saveHours` | Exactly one 2-seat section, 7-day hours | ✅ Pass |
| C-3 | Slots materialize | `availability:ensureForDate` tomorrow | Slot grid 17:00–21:30 created | ✅ Pass |
| C-4 | Direct booking | `bookings:createBooking` as diner 1 at 19:00 ×2 | Confirmed, code generated, slot decremented | ✅ Pass |
| C-5 | Queue handles overflow | 4 diners `queue:enqueue` 21:30 ×1 | Exactly **2 booked**, 2 failed — never overbooked | ✅ Pass |
| C-6 | Cancellation restores seats | Diner cancels queued booking | Slot remaining increases, capped at capacity | ✅ Pass |
| C-7 | Nearest-slot fallback | Book when 21:30 full but 20:00 free | Booking confirmed at the shifted later time | ⚠️ Not run |
| C-8 | Invalid party size | `createBooking` party 0 | Rejected: "Party size must be between 1 and 20" | ✅ Pass |
| C-9 | Signed-out booking | `createBooking` without identity | Rejected: "Please sign in to book" | ✅ Pass |
| C-10 | Booking screen (manual) | Restaurant detail → date/time/party → confirm | Live "confirming your table" state, then confirmation card | ⚠️ Not run |

## D. Waitlist & notifications (automated + manual)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| D-1 | Join waitlist on sold-out slot | `waitlist:join` as diner 6 (21:30 full) | Entry `waiting`; join at an open slot is rejected ("book directly") | ✅ Pass |
| D-2 | Cancellation promotes waitlist | Cancel a 21:30 booking | First waiting entry → `notified` (SMS scheduled) | ✅ Pass |
| D-3 | Auto booking event | Any confirmed booking | Owner `notifications:forRestaurant` shows `booking_created` unread | ✅ Pass |
| D-4 | Diner check-in alert | `notifications:sendForBooking` on own upcoming booking | `on_my_way` alert inserted for the restaurant | ✅ Pass |
| D-5 | Mark read | `notifications:markRead` / `markAllRead` as owner | Unread count drops to 0 | ✅ Pass |
| D-6 | Owner notification center (manual) | Owner → restaurant → Notifications tab | Badge with unread count; filters All / alerts / per booking | ⚠️ Not run |
| D-7 | Diner "Notify" button (manual) | My Bookings → Notify → On my way | Card shows "Restaurant notified" | ⚠️ Not run |

## E. Owner management & insights (automated + manual)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| E-1 | Owner sees own bookings | `bookings:byRestaurant` as Trullo owner (marco) | Seed bookings listed (incl. code AV4K2P) | ✅ Pass |
| E-2 | Non-owner sees nothing | `bookings:byRestaurant` as ava | `[]` (empty, no data leak) | ✅ Pass |
| E-3 | Insights stats | `bookings:stats` as owner | Covers, completion/no-show/cancel rates, top times | ✅ Pass |
| E-4 | Cancellation policy | `restaurants:setCancellationPolicy` 24h → diner sees note | Policy persisted; shown on booking + cards | ✅ Pass |
| E-5 | Claim demo restaurant | `restaurants:claimDemo` on Trullo (seatly demo owner) | Ownership transfers; bookings + notifications appear | ✅ Pass |
| E-6 | Claim a real restaurant | `restaurants:claimDemo` on user-owned Paris venue | Rejected: "can't be claimed" | ✅ Pass |
| E-7 | Owner tabs (manual) | Owner → restaurant → Overview / Bookings / Waitlist / Menu / Notifications / Insights | Tabs render; bookings default to **All** | ⚠️ Not run |
| E-8 | Menu editor (manual) | Owner → Menu tab → edit/add item | Photo upload or URL, dietary/allergen/spice chips, hide/show toggle | ⚠️ Not run |

## F. Reviews (automated + manual)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| F-1 | Verified review | Owner marks Ava's Trullo visit `completed` → `reviews:create` 5★ | Review created | ✅ Pass |
| F-2 | One review per booking | `reviews:create` again for same booking | Rejected: "already reviewed" | ✅ Pass |
| F-3 | Can't review others' visits | `reviews:create` on someone else's booking | Rejected: "only review your own visits" | ✅ Pass |
| F-4 | Can't review future visits | `reviews:create` on tomorrow's booking | Rejected: "after your visit" | ✅ Pass |
| F-5 | Rating aggregates | `reviews:listForRestaurant` Trullo + `restaurants:get` | Count ≥ 1, avg = 5.0, shown on detail | ✅ Pass |
| F-6 | Review flow (manual) | My Bookings → past visit → Rate | Star + text dialog; badge "Reviewed" after | ⚠️ Not run |

## G. Group invites & profile (automated + manual)

| ID | Scenario | Steps | Expected | Status |
|----|----------|-------|----------|--------|
| G-1 | Confirm guest grows party | `bookings:confirmGuest` on an invite link | Guests +1, slot decremented atomically, never over capacity | ✅ Pass |
| G-2 | Duplicate confirmation rejected | Same user confirms twice | Rejected: "already confirmed your seat" | ✅ Pass |
| G-3 | Dining preferences | `users:updateProfile` dietary/seating/occasions | Sanitized + persisted; pre-fills the booking sheet | ✅ Pass |
| G-4 | Favorites | `users:toggleFavorite` twice | `favorited: true` then `false`; `myFavorites` reflects it | ✅ Pass |
| G-5 | Invite page (manual) | Share booking link → open in another account | Guest sees booking card + Confirm seat button | ⚠️ Not run |
| G-6 | Profile (manual) | `/account` → preferences + favorites | Chips save; favorites listed | ⚠️ Not run |

---

## Run log

| Run | Date | Result |
|-----|------|--------|
| 1 | 2026-08-13 | See `scripts/test-backend.sh` output (automated scenarios above) |
