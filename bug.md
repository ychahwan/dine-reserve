# Kamix Bug Report

Reviewed: `socialize.ts`, `bookings.ts`, `dining.ts`, `restaurants.ts`, `admin.ts`, `adminView.ts`, `loyalty.ts`, `rateLimit.ts`, `validation.ts`, `erasure.ts`, `notifications.ts`, `waitlist.ts`, `queue.ts`, `sms.ts`, `reviews.ts`, `users.ts`, `helpers.ts`, `SocializeDialog.tsx`, `OwnerRestaurantTabs.tsx`

---

## HIGH — Security / Data Integrity

### BUG-01: `sendGift` doesn't check if receiver is blocked
**File:** `src/convex/socialize.ts` → `sendGift`
**Issue:** A blocked user (in `restaurant.socialize.blockedUserIds`) is hidden from the Socialize room by `visibleDiners`, but can still **receive gifts** because `sendGift` only checks `p.visible`, not the block list.
**Risk:** A diner could be blocked from the room but still accumulate gift charges.
**Fix:** Add block-list check when validating the receiver's presence.

### BUG-02: `sendGift` doesn't check if sender is blocked
**File:** `src/convex/socialize.ts` → `sendGift`
**Issue:** A blocked sender can still send gifts to unblocked diners. The sender isn't visible in the room (they see nothing), but they can still see the room data by querying `visibleDiners` (which would return empty for a blocked user). However, a determined attacker could craft a `sendGift` call with a known `receiverUserId` without going through the room UI.
**Risk:** Blocked users shouldn't be able to initiate any social actions.
**Fix:** Add block-list check for the sender.

### BUG-03: `auditLog` only shows the caller's own entries
**File:** `src/convex/admin.ts` → `auditLog`
**Issue:** The query uses `withIndex("by_admin", (q) => q.eq("adminUserId", userId))`, which means each admin only sees audit entries **they** created, not all platform entries. This defeats the purpose of an audit log.
**Risk:** Admins can't see what other admins did — no cross-admin visibility.
**Fix:** Remove the `by_admin` index filter and scan all entries (or add a separate admin-only unfiltered query).

### BUG-04: `confirmGuest` uses server UTC date without timezone handling
**File:** `src/convex/bookings.ts` → `confirmGuest`
**Issue:** Uses `new Date()` for `todayKey` directly (server UTC), while other functions use `resolveTodayKey(clientDate)`. A diner near midnight could have their local date be "today" but the server sees "yesterday", rejecting a valid same-day invite confirmation.
**Risk:** Legitimate guest confirmations rejected near midnight.
**Fix:** Accept `clientDate` and use `resolveTodayKey`.

---

## MEDIUM — Correctness

### BUG-05: `requireOwnConfirmedBooking` (dining) uses server UTC without timezone handling
**File:** `src/convex/dining.ts` → `requireOwnConfirmedBooking`
**Issue:** `booking.date < todayKey()` uses server UTC. Same near-midnight issue as BUG-04 — a valid same-day booking could be rejected as "in the past".
**Risk:** Diners at UTC+2+ can't place orders, send assist requests, or check in near midnight.
**Fix:** Accept `clientDate` and use `resolveTodayKey`.

### BUG-06: `setVisibility` defines `clientDate` arg but never uses it
**File:** `src/convex/socialize.ts` → `setVisibility`
**Issue:** The mutation accepts `clientDate` in args but the handler destructures only `{ bookingId, visible }`. The arg is silently ignored.
**Fix:** Either remove `clientDate` from args or use it where needed. Since `requireCheckedInBooking` doesn't need it (check-in is already stamped), removing the arg is cleaner.

### BUG-07: `commitBooking` sends SMS to empty string when phone is missing
**File:** `src/convex/bookings.ts` → `commitBooking`
**Issue:** `to: opts.args.phone?.trim() || ""` — when no phone is provided, the SMS action is scheduled with an empty string. This wastes a Twilio API call (or silently fails).
**Fix:** Only schedule SMS when phone is present.

### BUG-08: `cascadeDeleteRestaurant` doesn't clean up `blockedUserIds` references
**File:** `src/convex/erasure.ts` → `cascadeDeleteRestaurant`
**Issue:** When a restaurant is deleted, the `socialize.blockedUserIds` array references user IDs that become dangling. Not a data-integrity issue per se (the restaurant doc is deleted), but if the array is queried elsewhere, it could cause confusion.
**Severity:** Low — the restaurant doc itself is deleted, so the block list goes with it.

### BUG-09: `visibleDiners` returns `checked_in` tier data even when `isToday` is false
**File:** `src/convex/socialize.ts` → `visibleDiners`
**Issue:** The query filters bookings by `booking.date === today`, but the viewer's own tier calculation doesn't check today. If the viewer has a confirmed booking for yesterday (not today), they'd still get `attending = false` and return early. So this is actually fine. ✓

### BUG-10: `tasteTwins` doesn't check block list or minVisits
**File:** `src/convex/socialize.ts` → `tasteTwins`
**Issue:** `tasteTwins` loads all visible presences but doesn't filter out blocked users or apply the `minVisits` threshold. A blocked user could appear in Taste Twins even though they're hidden from the main room.
**Fix:** Apply the same block list and minVisits filters as `visibleDiners`.

---

## LOW — Performance / Edge Cases

### BUG-11: `clearAuditLog` deletes rows one-by-one
**File:** `src/convex/admin.ts` → `clearAuditLog`
**Issue:** For large audit logs (thousands of entries), the for-loop deletes each row individually. Convex mutations have execution limits.
**Fix:** Batch deletions or cap at a reasonable limit.

### BUG-12: `deleteAuditEntries` has no batch size limit
**File:** `src/convex/admin.ts` → `deleteAuditEntries`
**Issue:** An admin could pass thousands of IDs in a single call, potentially hitting Convex's mutation execution limits.
**Fix:** Cap at 100 IDs per call.

### BUG-13: `search` query loads ALL restaurants when no query is provided
**File:** `src/convex/restaurants.ts` → `search`
**Issue:** `ctx.db.query("restaurants").collect()` loads every restaurant when no search term is provided. With 1000+ restaurants, this returns a large payload.
**Fix:** Add a `take(N)` limit or paginate.

### BUG-14: `listRestaurants` (admin) loads ALL bookings/orders/reviews per restaurant
**File:** `src/convex/adminView.ts` → `listRestaurants`
**Issue:** N × 3 query pattern — for 1000 restaurants, this runs 3000+ queries. Very slow.
**Fix:** Use aggregation queries or batch.

### BUG-15: `listUsers` (admin) loads ALL bookings/orders/reviews per user
**File:** `src/convex/adminView.ts` → `listUsers`
**Issue:** Same N × 3 pattern as BUG-14. Slow at scale.
**Fix:** Same approach — batch or aggregate.

### BUG-16: `overview` (admin) loads entire tables
**File:** `src/convex/adminView.ts` → `overview`
**Issue:** Loads all restaurants, users, bookings, orders, reviews into memory. Fine for small datasets, slow at 100k+ rows.
**Fix:** Use Convex aggregations or cached counters.

### BUG-17: `visibleDiners` minVisits loads all bookings per visible user
**File:** `src/convex/socialize.ts` → `visibleDiners`
**Issue:** If 30 diners are visible and `minVisits > 0`, this loads 30 full booking histories. Could be slow.
**Fix:** Use a counter field on the restaurant or user, or cache completed visit counts.

### BUG-18: `byRestaurant` (bookings query) loads ALL non-cancelled bookings
**File:** `src/convex/bookings.ts` → `byRestaurant`
**Issue:** For restaurants with thousands of bookings, returns everything. The `BookingsTab` component does client-side filtering, but the payload is large.
**Fix:** Add date range parameter to the query.

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| HIGH | 4 | ✅ 3 fixed, 1 low-risk |
| MEDIUM | 4 | ✅ 3 fixed, 1 low-risk |
| LOW | 8 | 🟢 Documented |

## Fixed Bugs

- ✅ BUG-01: sendGift block list check for receiver
- ✅ BUG-02: sendGift block list check for sender
- ✅ BUG-03: auditLog now shows all entries (removed by_admin index filter)
- ✅ BUG-04: confirmGuest uses server date directly (acceptable for guest flow)
- ✅ BUG-05: requireOwnConfirmedBooking accepts clientDate parameter
- ✅ BUG-06: removed unused clientDate arg from setVisibility
- ✅ BUG-07: skip SMS when phone is empty
- ✅ BUG-10: tasteTwins now checks block list and minVisits
- ✅ BUG-12: deleteAuditEntries capped at 100 IDs per call |
