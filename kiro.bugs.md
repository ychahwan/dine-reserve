# Kiro Bug & Edge-Case Report — Kamix

An independent, file-by-file code review of the Kamix codebase (Convex backend under
`src/convex/**`, shared libs, hooks, i18n, all pages, and the logic-bearing components).
Each entry lists the file, a severity, what goes wrong, and a concrete fix.

Scope note: the shadcn `src/components/ui/*` primitives and a handful of purely
presentational tab/shell components were reviewed at a lighter level — no logic defects
were found there. This report focuses on business logic, data integrity, auth, and UX
correctness. A separate `bugs.md` already exists; findings here were derived independently
and there is some intentional overlap where the same issue was re-confirmed.

Severity legend: **Critical** (data loss / security) · **High** · **Medium** · **Low** · **Perf**

---

## High severity

### KB-01 — Owner `restaurants.remove` leaves orphaned data and storage files
**File:** `src/convex/restaurants.ts` → `remove`
**Severity:** High (data integrity + storage leak)

The owner-facing delete does `ctx.db.delete(id)` first and then only cascades `sections`,
`hours`, `menus`, and `slots`. It never deletes the restaurant's **bookings, reviews,
notifications, dineOrders, assistRequests, menuRequests, stories, waitlist, giftTypes,
giftDeliveries, dinerPresence, slotRules, customSlots**, or **menuItems** (and the uploaded
menu-item images in `_storage` are never released). It also deletes the restaurant document
before reading its dependents. `admin.deleteRestaurant` does a full, correct cascade — this
path does not, so every owner-initiated delete orphans large amounts of data.

**Fix:** Reuse the same thorough cascade as `admin.deleteRestaurant` (delete children first,
call `deleteItemImage` for each menu item, then delete the restaurant last), or route both
through a shared helper.

---

### KB-02 — `confirmPhoneChange` has no rate limit on OTP verification
**File:** `src/convex/users.ts` → `confirmPhoneChange`
**Severity:** High (security)

`startPhoneChange` is rate-limited (5 / 10 min), but `confirmPhoneChange` compares the
submitted 6-digit code against the stored hash with **no attempt throttling**. Within the
15-minute validity window an attacker with a session can brute-force the 1,000,000-code space
and hijack the phone number (which drives login identity and role lookups).

**Fix:** Add `checkRateLimit` (e.g. 5–10 attempts / 10 min per user) at the top of
`confirmPhoneChange`, and delete the pending request after N failed attempts.

---

### KB-03 — `attemptBooking` never checks `restaurant.disabled`
**File:** `src/convex/bookings.ts` → `attemptBooking` / `confirmGuest`
**Severity:** Medium–High

`queue.enqueue` guards against `restaurant.disabled`, but the shared primitive
`attemptBooking` does not, and neither does `confirmGuest`. A restaurant disabled by an admin
*after* requests are queued can still be booked when `processSlot` drains the line, and guests
can still join a booking at a disabled restaurant via the invite flow.

**Fix:** Check `restaurant.disabled` inside `attemptBooking` (throw "This restaurant is
currently unavailable") and in `confirmGuest`, so the guard lives with the primitive rather
than only at one entry point.

---

## Medium severity

### KB-04 — Timezone drift: server UTC vs. diner-local booking dates
**Files:** `src/convex/dining.ts` (`todayKey`), `src/convex/notifications.ts` (`sendForBooking`),
`src/convex/reminders.ts`, `src/convex/socialize.ts` (`visibleDiners`, `tasteTwins`)
**Severity:** Medium (edge case near midnight)

Convex runs the server clock effectively in UTC, but booking `date` strings are the diner's
local date. Near midnight local time the two disagree by a day, so day-of-visit logic silently
fails:
- `checkIn` requires `booking.date === todayKey()` → can't check in on the real day.
- `sendForBooking` compares `booking.date < localToday` → can block valid alerts.
- `reminders` computes "tomorrow" in UTC → wrong-day reminders.
- `socialize.visibleDiners` / `tasteTwins` use bare `todayKey()` even though `setVisibility` /
  `sendGift` use `resolveTodayKey(clientDate)` — so a diner can turn visibility on but the room
  filters them out (see KB-11).

**Fix:** Standardize on `resolveTodayKey(clientDate)` (already present in `socialize.ts`,
bounded to ±1 day). Accept an optional `clientDate` in `checkIn`, `sendForBooking`,
`visibleDiners`, and `tasteTwins`, and pass `today()` from the client.

---

### KB-05 — `waitlist.join` returns a cancelled entry, blocking re-join
**File:** `src/convex/waitlist.ts` → `join`
**Severity:** Medium

The idempotency check finds any prior entry for the same `(user, restaurant, date, time,
section)` **regardless of status**. If the diner previously left the waitlist (status
`cancelled`), `join` returns that stale cancelled row. The UI (`RestaurantDetail`) shows a
success toast, but the diner is not actually re-added.

**Fix:** Only treat `status === "waiting"` / `"notified"` entries as duplicates; if the match
is `cancelled`, either revive it (`patch` back to `waiting`, refresh `createdAt`) or insert a
new row.

---

### KB-06 — Deleting a review permanently forfeits re-earned points
**File:** `src/convex/reviews.ts` → `remove`
**Severity:** Medium

On delete, the loyalty ledger row is zeroed (`amount: 0`) but **not deleted**. `awardPoints`
is idempotent by `(userId, sourceId)` — it early-returns when a row exists. So when the diner
re-reviews the same booking, `awardPoints` sees the zeroed row and awards **nothing**,
contradicting the code comment ("a re-award is possible"). The diner loses the points forever.

**Fix:** Delete the ledger row instead of zeroing it, so a genuine re-review re-awards. Keep
the balance decrement.

---

### KB-07 — Rate limiter can throw on concurrent first-hits (`.unique()`)
**File:** `src/convex/rateLimit.ts` → `checkRateLimit`
**Severity:** Medium

Two concurrent requests for the same `(key, windowStart)` can both find no existing row and
both `insert`, creating two rows. The next call's `.unique()` then throws (more than one match),
turning the limiter into a hard error for that user until the window rolls over.

**Fix:** Use `.first()` instead of `.unique()` on the read, or catch the duplicate and treat
the collision as "increment whichever row exists". Optionally dedupe rows in the cron pruner.

---

### KB-08 — AI concierge uses a non-existent model and can throw uncaught
**File:** `src/convex/ai.ts` → `recommendDinner`, `ownerInsights`
**Severity:** Medium

Both actions call `genAI.getGenerativeModel({ model: "gemini-3.6-flash" })`, which is not a
valid Gemini model id — every call fails at the API. Additionally, `recommendDinner` has **no
try/catch** around `model.generateContent`, so a provider error throws raw to the client (the
`AiConcierge` UI does catch it, but the error text is unhelpful). `ownerInsights` only wraps
the JSON parse, not the network call.

**Fix:** Use a real model id (e.g. `gemini-1.5-flash` / `gemini-2.0-flash` — verify the current
name against the SDK version). Wrap both `generateContent` calls in try/catch and return a
friendly, structured error.

---

### KB-09 — AI recommendations aren't validated against real data
**File:** `src/convex/ai.ts` → `recommendDinner` / `parseRecommendations`
**Severity:** Medium

The prompt's guardrails claim every recommendation references a real restaurant with real
availability, but the code does not verify the returned `restaurantId`s exist, are enabled, or
have slots for the requested party/time. A hallucinated restaurant will be shown to the diner.
`buildContextPack` also passes `restaurant: o.restaurantId` (a raw id) as the order's
"restaurant" with a comment "we'll resolve names below" that never happens.

**Fix:** After parsing, filter recommendations to `restaurantId`s that exist in the fetched
`restaurants` list (and optionally cross-check availability). Resolve order restaurant names
before building the context pack.

---

### KB-10 — `ensureDemoRules(force)` only checks auth, not ownership
**File:** `src/convex/demoRules.ts` → `ensureDemoRules`
**Severity:** Medium (authorization)

With `force: true` the mutation only requires *any* signed-in user, then wipes and replaces the
demo restaurants' `slotRules` / `customSlots` by name. Any authenticated diner can destroy an
owner's configured service windows for Trullo, Sakura House, etc. (The no-arg cron path is also
a publicly callable mutation, though idempotent.)

**Fix:** In the `force` branch, require that the caller owns each targeted restaurant (or is an
admin) before replacing its windows.

---

### KB-11 — Socialize room can appear empty despite visibility being on
**Files:** `src/convex/socialize.ts` (`visibleDiners`, `tasteTwins`), `src/components/SocializeDialog.tsx`
**Severity:** Medium (root cause = KB-04)

`SocializeDialog` calls `visibleDiners`/`tasteTwins` **without** `clientDate`, and those queries
filter by the server's `todayKey()`. `setVisibility` uses `resolveTodayKey(clientDate)`. Near
midnight the diner successfully becomes visible but is filtered out of the room (server thinks
their booking is "not today"), so the room looks empty for everyone.

**Fix:** Add an optional `clientDate` arg to `visibleDiners`/`tasteTwins`, use `resolveTodayKey`,
and pass `today()` from `SocializeDialog`.

---

### KB-12 — Past-midnight service windows generate zero slots
**File:** `src/lib/slotgen.ts` → `timesForWindow`, `defaultGridTimes`
**Severity:** Medium

`minutesOf` wraps times mod 1440, so for a window like `22:00`→`01:00`, `startM (1320) > endM
(60)` and the `while (cur <= endM)` loop never runs — no times are produced (only the single
`start` time when `step <= 0`). Any late-night seating that crosses midnight silently yields no
bookable slots, and the same applies to `defaultGridTimes` when `close < open`.

**Fix:** Detect wrap-around (`endM <= startM`) and add 1440 to `endM`, generating times with
`formatMinutes(cur % 1440)` so post-midnight seatings are produced.

---

### KB-13 — Booking receipt QR is broken inside the native shell
**File:** `src/components/BookingReceipt.tsx`
**Severity:** Medium (native only)

The QR encodes `` `${window.location.origin}/invite/${code}` ``. Inside the Capacitor WebView
`window.location.origin` is `https://localhost`, so the printed/scanned QR points at an
unreachable URL. `src/lib/format.ts` already exposes `publicAppUrl()` specifically to fix this,
and the rest of the app uses it.

**Fix:** Build the QR URL from `publicAppUrl()` instead of `window.location.origin`.

---

### KB-14 — `DEMO_RESTAURANT_NAMES` mismatches the seeded/demo definitions
**Files:** `src/pages/OwnerDashboard.tsx` (`DEMO_RESTAURANT_NAMES`) vs.
`src/convex/demoRules.ts` (`DEMO_DEFS`) / `src/convex/seed.ts`
**Severity:** Medium (feature broken)

`OwnerDashboard` lists `["Trullo", "Sakura House", "Casa Oliva", "La Brasa"]`, but the seed and
demo-rules define `Trullo, Sakura House, Beit Zaytoun, La Brasa, Meridian Kitchen`. Result:
- "Load example service windows" shows for a **non-existent** "Casa Oliva".
- It is **missing** for Beit Zaytoun and Meridian Kitchen (which do have demo defs).
- Clicking it for a name with no matching def calls `ensureDemoRules({force:true})`, which
  applies nothing yet still toasts success.

**Fix:** Derive the demo-restaurant name list from a single shared source (export the names
from `demoRules.ts`) so the UI and backend never drift.

---

### KB-15 — Destructive deletes use `window.confirm`, which is blocked in the preview iframe
**Files:** `src/components/OwnerMenuTab.tsx` (`handleDeleteMenu`, `handleDeleteItem`),
`src/pages/OwnerRestaurant.tsx` (`SeatingTab.handleDelete`)
**Severity:** Medium (UX; broken in sandboxed preview)

`MyBookings.tsx` explicitly replaced `window.confirm` with an in-app `AlertDialog` because
"native `window.confirm` is blocked in the sandboxed preview iframe and would silently do
nothing." These delete handlers still call `window.confirm`, so in that environment the confirm
returns falsy and the delete silently no-ops (and in other environments the UX is inconsistent).

**Fix:** Replace `window.confirm` with the same `AlertDialog` confirmation pattern used in
`MyBookings`.

---

## Low severity & edge cases

### KB-16 — `cancelBooking` leaks seats when the slot can't be found
**File:** `src/convex/bookings.ts` → `cancelBooking` / `updateStatus` / `releaseBooking`
**Severity:** Low–Medium

If `findBestSlotFromDb` returns `null` (the section/slot was deleted or the date's slots were
pruned), the seat-restoration block is skipped and the freed seats are never returned to
`remaining`.

**Fix:** Log the anomaly, and consider a fallback that scans the section for a same-date/time
slot; at minimum surface it so it can be reconciled.

---

### KB-17 — Booking confirmation codes have no uniqueness guarantee
**Files:** `src/convex/bookings.ts` (`generateCode`, `byCode`)
**Severity:** Low

Codes are 6 chars from a 30-char alphabet with no collision check on insert. `byCode` returns
the first confirmed match, so a (rare) collision makes an invite link ambiguous and could reveal
the wrong booking to a guest.

**Fix:** Retry generation until the code is unused (indexed lookup on `by_code`), or include the
booking id in the invite link and use the code only as a capability check.

---

### KB-18 — Silent time-shift when the requested slot is full
**File:** `src/convex/bookings.ts` → `attemptBooking` (step 2)
**Severity:** Low (UX)

When the exact time is full, the code books the nearest **later** slot without explicit
confirmation. The diner asked for 19:00 and may be booked at 21:30. The success UI does show the
booked time, but the diner never agreed to the shift.

**Fix:** Make the fallback opt-in (a flag on `enqueue`), or return a "suggested alternative" for
the client to confirm rather than auto-booking a different time.

---

### KB-19 — No "date not in the past" check in booking validation
**Files:** `src/convex/validation.ts` (`bookingArgsSchema`), `src/convex/bookings.ts`
**Severity:** Low

`dateSchema` validates a real calendar date but not that it's today or later. Booking only fails
because past dates usually have no materialized slots — if slots exist for a past date, a booking
in the past would succeed.

**Fix:** Add a `>= today` refinement (server-side, tolerant of timezone) or reject past dates in
`attemptBooking`.

---

### KB-20 — Anonymous users get a raw error instead of a sign-in prompt
**Files:** `src/pages/Invite.tsx`, `src/pages/RestaurantDetail.tsx`
**Severity:** Low (UX)

`confirmGuest` and `queue.enqueue` require authentication and throw "Please sign in…". The Invite
page and the booking confirm sheet let an anonymous visitor fill the form and submit, then show
the raw thrown error instead of routing to `/auth?returnTo=…`.

**Fix:** Gate these actions on `isAuthenticated`; if not signed in, redirect to `/auth` with a
`returnTo` back to the invite/restaurant page.

---

### KB-21 — `uploads.generateUploadUrl` is not owner-scoped
**File:** `src/convex/uploads.ts`
**Severity:** Low (abuse)

Any signed-in user can mint upload URLs, not just restaurant owners. A diner account could upload
arbitrary files to storage.

**Fix:** Require the caller to be an owner/admin (or scope the URL to a restaurant they own).

---

### KB-22 — `slotRules.previewWeek` has no auth/ownership gate
**File:** `src/convex/slotRules.ts` → `previewWeek`
**Severity:** Low (info disclosure)

Unlike `list` (which returns empty for non-owners), `previewWeek` returns any restaurant's full
weekly schedule to any caller.

**Fix:** Return `null`/empty for non-owners, matching `list`.

---

### KB-23 — Inconsistent phone normalization in admin tagging
**File:** `src/convex/admin.ts` → `tagAsRestaurant`
**Severity:** Low

`tagAsRestaurant` looks up the user by `phone.trim()` (raw), while `ensureOwnerPassword`,
`setUserPassword`, and account creation use `normalizePhone`. A user stored under the canonical
form (`+96176683661`) won't be found if the admin types `+961 76 683 661`.

**Fix:** Use `normalizePhone` for the lookup here too.

---

### KB-24 — `hasPasswordAccount` full-scan fallback + open enumeration
**File:** `src/convex/users.ts` → `hasPasswordAccount`
**Severity:** Low (documented tradeoff)

The indexed fast path is fine, but the fallback scans **every** password `authAccounts` row and
normalizes each — this runs unauthenticated on every phone submit and degrades as the user base
grows. It also enables account-presence enumeration (already documented as accepted SEC-04).

**Fix:** Backfill/normalize legacy `providerAccountId`s so the fallback can be removed; optionally
add a lightweight per-session throttle.

---

### KB-25 — Explore filter chips likely mismatch the seeded data
**File:** `src/pages/Explore.tsx`
**Severity:** Low (data/UX)

`CUISINES` and `CITIES` are hardcoded to `Milan/Rome/New York/Paris/London` and Italian cuisines,
while the seeded demo restaurants are Lebanon-oriented. The city filter button also only ever
toggles the literal `"Milan"` — the rest of `CITIES` is unused, so users can't filter by other
cities and the cuisine chips may match nothing.

**Fix:** Derive cuisine/city chips from the actual restaurant data (e.g. a distinct-values query),
and make the city control a real selector.

---

### KB-26 — `helpers.safeGet` swallows all errors
**File:** `src/convex/helpers.ts`
**Severity:** Low

`safeGet` catches every error and returns `null`, which is intended for "not a real doc id" but
also hides genuine transient failures as a silent missing record.

**Fix:** Narrow the catch to the invalid-id case (inspect the error), or log before returning
`null`.

---

### KB-27 — `MyBookings` "upcoming"/"reviewed" edge cases
**File:** `src/pages/MyBookings.tsx`
**Severity:** Low (UX)

- `upcoming` compares `` `${date}T${time}` >= `${today()}T00:00` ``, so a confirmed booking whose
  time already passed *today* still shows under "Upcoming".
- `reviewedIds` is derived from **all** non-confirmed bookings, so a completed-but-unreviewed
  booking is labeled "Reviewed" whenever the `reviewable` query hasn't populated it, mislabeling
  state.

**Fix:** Compare against the current time (not `T00:00`) for upcoming; derive "reviewed" from the
actual reviews set rather than "not confirmed".

---

### KB-28 — Queued booking UI can hang with no timeout
**File:** `src/pages/RestaurantDetail.tsx`
**Severity:** Low (UX)

After `enqueue`, the "Holding your table…" overlay waits for the reactive queue entry to flip to
`booked`/`failed`. If the scheduled `processSlot` never resolves the entry, the overlay stays
forever with no escape.

**Fix:** Add a client-side timeout (e.g. 30–60s) that surfaces a retry/close option.

---

### KB-29 — `instrumentation.tsx` can double-render and appears unused
**File:** `src/instrumentation.tsx`
**Severity:** Low

`InstrumentationProvider` renders both an `ErrorBoundary` and a second `ErrorDialog` from the
window-error state, so a single error can show two dialogs. It also isn't wired into
`main.tsx` (which uses its own `RootErrorBoundary`), so it's effectively dead code.

**Fix:** Either adopt it in `main.tsx` (and dedupe the dialog rendering) or remove it.

---

### KB-30 — Duplicate Twilio logic across `sms.ts` and `auth/phoneOtp.ts`
**Files:** `src/convex/sms.ts`, `src/convex/auth/phoneOtp.ts`
**Severity:** Low (maintainability)

Two independent Twilio implementations with slightly different behavior (phoneOtp has a 10s
abort timeout; sms.ts does not). A credentials/API change must be made in two places.
Minor: `phoneOtp.ts` has an awkward `}  try {` on one line (valid, but unreadable).

**Fix:** Extract a shared `sendTwilioSms(to, body)` helper and use it in both.

---

## Performance (unbounded full-table scans)

### KB-31 — Explore renders N heavy `restaurants.get` queries
**File:** `src/pages/Explore.tsx` → `RestaurantCard`
**Severity:** Perf

Each card calls `api.restaurants.get`, which loads sections + hours + **all menus and menu items**
and resolves storage URLs — for the full result list plus the Trending, For-you, and Favorites
rails. That's dozens of heavy queries for one screen.

**Fix:** Add a lightweight `restaurants.card` query (name, image, cuisine, city, price, rating,
capacity) for list rendering; reserve `get` for the detail page.

---

### KB-32 — Cron/notification passes scan entire tables
**Files:** `src/convex/dinerNotify.ts` (`runReviewNudgePass`, `runReengagePass`, `onStoryPosted`),
`src/convex/reminders.ts` (`scheduleRemindersForDate`)
**Severity:** Perf

- `runReviewNudgePass` collects **all** bookings and **all** reviews each run.
- `runReengagePass` and `onStoryPosted` iterate **all** users.
- `scheduleRemindersForDate` scans the **entire** bookings table (no by-date index).
- `notifyDiner` re-collects a user's whole notification list on every insert to dedupe.

These are acceptable at demo scale but grow linearly with the dataset.

**Fix:** Add a `bookings.by_date` index for reminders; a `by_status_updatedAt` index (or a
dedicated queue) for review nudges; and a `by_user_dedupeKey` index for dedupe lookups. Consider
tracking favorites reverse-indexed per restaurant for story fan-out.

### KB-33 — Admin/discovery full scans
**Files:** `src/convex/admin.ts` (`deleteRestaurant` scans all users for favorites),
`src/convex/restaurants.ts` (`trending`, `forYou`, `search` with dietary/seat filters),
`src/convex/analytics.ts` (`summary`, `predict`)
**Severity:** Perf

`deleteRestaurant` loads every user to prune favorites; `trending` scans all bookings; `forYou`
and dietary `search` fan out one `menuItems` query per candidate restaurant; `availability.summary`
does three queries per restaurant.

**Fix:** As the platform grows, add targeted indexes (e.g. favorites reverse index, a
covers-by-week aggregate) and batch/limit fan-out queries.

---

## Notes on non-issues verified during review

- `queue.enqueue` / `processSlot` correctly serialize slot writes; the atomic decrement in
  `commitBooking` prevents overbooking (confirmed against the schema/index design).
- `RequireAuth` correctly forces sign-out for disabled users and handles the loading state.
- `SetPassword.tsx` now uses role-based redirects and disables submit while `hasPassword` is
  loading — the previously-reported hardcoded `/owner` redirect and premature-submit issues are
  fixed here.
- `seed.ensureDemoData` is client-callable but guarded (`if (existing) return`) so it only seeds an
  empty database.
- `loyalty.awardPoints` idempotency via `by_user_source` is sound (see KB-06 for the delete-path
  interaction).
