# Code Review Report — opencodebugs.md

**Date:** 2025-08-25
**Scope:** All application code in `src/` (~163 files, ~33k lines excluding `src/components/ui/` boilerplate): Convex backend (`src/convex/`), pages, components, hooks, libs, i18n.
**Method:** File-by-file, function-by-function read-only review across 7 parallel review passes. No code was modified.
**Severity levels:** CRITICAL (security hole / data loss / crash) · HIGH (broken feature / wrong results / exploitable) · MEDIUM (edge case failure / scaling hazard / poor practice) · LOW (minor / cosmetic).

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 4 |
| HIGH | 31 |
| MEDIUM | 40 |
| LOW | 41 |
| **Total** | **116** |

Hot spots: `src/convex/notifications.ts` (token management is effectively unauthenticated), `src/convex/walkIn.ts` (bypasses booking ledger), `settings.ts` secret exposure, walk-in/check-in timezone handling, admin bulk-selection logic.

---

# CRITICAL

### C-1. `src/convex/settings.ts` : getSettingDb / getSettingRows / getSettingRoleCheck (lines 48–83)
**Issue:** Defined as public `query()` with **no auth check inside**. Comments say "Not for client use", but Convex exposes every exported public function to any client. Anyone — even unauthenticated — can call `api.settings.getSettingDb({ key: "TWILIO_AUTH_TOKEN" })` or `getSettingRows({})` and receive raw secrets (`GEMINI_API_KEY`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SECRET`). The admin check lives only in the wrapper action `listSettings`.
**Impact:** Full secret exfiltration: Twilio account takeover (SMS interception → OTP theft → account takeover of every phone-OTP user), Gemini API abuse billed to the platform.
**Fix:** Convert all three to `internalQuery` and switch internal callers to `internal.settings.*`; or add an inline admin check to each handler.

### C-2. `src/convex/notifications.ts` : saveToken (line 269)
**Issue:** No `getAuthUserId(ctx)`; does not verify `args.userId` belongs to the caller. Anyone can bind any FCM token to any `userId`, including overwriting an existing token's owner via the `existing` branch (line 282).
**Impact:** Attacker registers their own device token under a victim's userId → the victim's pushes (booking reminders, waitlist alerts) are delivered to the attacker's device. Complete push-interception chain requiring no privileges.
**Fix:** Require auth and derive `userId` from the session; never accept it as an argument.

### C-3. `src/convex/notifications.ts` : getAllActiveTokens (line 331)
**Issue:** Public query with zero auth that `.collect()`s every active FCM token for every user (the safe `internalQuery` twin `_getAllActiveTokensForPush` at line 396 already exists).
**Impact:** Unauthenticated dump of all users' push credentials; enables targeted push abuse/tracking and combines with unauthenticated `removeToken` for DoS.
**Fix:** Delete the public export; keep only internal variants (or gate behind admin check).

### C-4. `src/convex/notifications.ts` : getUserTokens (line 318)
**Issue:** Public query, no auth check — any caller can enumerate another user's active push tokens by passing an arbitrary `userId`.
**Impact:** Per-victim push-token disclosure.
**Fix:** Only allow a caller to fetch their own tokens (`args.userId === authUserId`) or make it internal.

---

# HIGH

## Backend

### H-1. `src/convex/bookings.ts` : updateStatus (line 531)
**Issue:** Seat-ledger adjustment only happens when moving *into* `cancelled`. Transitioning `cancelled → confirmed` (or `no_show → confirmed`) reactivates the booking but never re-decrements the slot; those seats were returned and may have been resold.
**Impact:** Direct overbooking path: owner cancels → seats freed → someone else books → owner flips back to `confirmed` → slot oversold. `cancelled → completed` also awards loyalty points for a booking that released its seats.
**Fix:** Reject transitions out of `cancelled`/`completed` (require a fresh booking), or re-run the atomic decrement when leaving `cancelled`.

### H-2. `src/convex/walkIn.ts` : approveWalkIn / hostInitiatedWalkIn (lines 229, 300)
**Issue:** Both create `bookings` rows via raw `ctx.db.insert`, bypassing `attemptBooking` — no slot-ledger decrement, no `restaurant.disabled` check, no validation. Meanwhile `cancelBooking`/`releaseBooking` restore `Math.min(slot.total, remaining + partySize)` for any booking with a `sectionId` (`bookings.ts:447, 592`), so cancelling a walk-in booking mints seats that were never taken.
**Impact:** Phantom availability compounding on every walk-in-with-section cancellation; disabled venues accept walk-ins; repeatable availability-corruption loop (create walk-in → cancel → free seats from nothing).
**Fix:** Route walk-in creation through `attemptBooking` (or make seat restore symmetric and skip it for `source: "walk_in"*` bookings); add the `disabled` guard both paths already fetch the restaurant for.

### H-3. `src/convex/walkIn.ts` : generateCode (line 18)
**Issue:** Uses `Math.random()` with no uniqueness retry against `bookings.by_code` — unlike `commitBooking` (`bookings.ts:181–186`) which retries because `code` is a public capability (`byCode` returns full booking details to whoever presents the code).
**Impact:** A colliding code leaks a stranger's booking (name/date/time/party) via invite-link lookup and lets an outsider act on it via `confirmGuest`.
**Fix:** Reuse bookings' crypto-random uniqueness-retried generator, or add the same `by_code` clash loop here.

### H-4. `src/convex/notifications.ts` : forRestaurant (lines 133–153)
**Issue:** When `bookingId` is supplied, the query switches to the `by_booking` index without checking the booking belongs to `restaurantId`.
**Impact:** Cross-tenant leak: owner of restaurant A passes any booking ID from restaurant B and receives B's notifications, including diner name, special requests, and the booking check-in code.
**Fix:** Load the booking first and assert `booking.restaurantId === restaurantId`.

### H-5. `src/convex/socialize.ts` : tasteTwins (line 324)
**Issue:** Missing two gates enforced by `visibleDiners`: (1) no `socialize.enabled` check, (2) no blocked-caller check (a diner on `blockedUserIds` still gets results).
**Impact:** Privacy bypass — a blocked diner, or any attendee where Socialize is OFF, still retrieves other diners' full names, photos, and preference-overlap profiles.
**Fix:** Replicate both early-return guards before doing any work.

### H-6. `src/convex/socialize.ts` : myReceivedGifts (lines 707–738)
**Issue:** For undelivered `on_delivery` gifts the response hides gift details but always returns real `senderName`/`senderImage`, contradicting its own contract ("sender identity only revealed on delivery").
**Impact:** Surprise gifting broken — receiver sees who sent the gift before delivery; anonymous gifting impossible.
**Fix:** Return `"A guest"`/`undefined` while not delivered.

### H-7. `src/convex/notifications.ts` : sendForBooking (line 80)
**Issue:** Date check `booking.date < today` only rejects *past* dates — next week passes (error text claims day-of only). No `checkRateLimit` anywhere in the mutation.
**Impact:** Diners trigger owner alerts days early; unlimited notification rows spam the owner feed and unread count.
**Fix:** Enforce equality; add per-user/per-booking rate limit.

### H-8. `src/convex/users.ts` : backfillPasswordAccounts (line 93)
**Issue:** Maintenance mutation exported as plain public `mutation` with no auth check ("run once via npx convex run" per comment).
**Impact:** Any client can repeatedly rewrite `authAccounts.providerAccountId` table-wide, racing signups — an uncontrolled write path onto the credential table.
**Fix:** Convert to `internalMutation` or gate behind admin check.

### H-9. `src/convex/reminders.ts` : scheduleRemindersForDate (line 55)
**Issue:** Filtered list `confirmed` (status==="confirmed" && !reminderSent) computed at lines 49–52 then **never used** — the loop iterates `candidates` (ALL bookings for the date). Dead alias `const bookings = confirmed;` confirms the bug.
**Impact:** Cancelled/completed/no-show bookings get "see you tomorrow" SMS; `reminderSent` dedupe dead — re-running the cron re-texts everyone (duplicate SMS cost + spam).
**Fix:** Iterate `confirmed`; delete the dead variable.

### H-10. `src/convex/auth/phoneOtp.ts` : sendOtpSms (line 27)
**Issue:** Calls `sendTwilioMessage(phone, body)` without `ctx`, so admin-stored `appSettings` Twilio credentials are never read — only `process.env`. Every other SMS path passes ctx.
**Impact:** If Twilio is configured via the admin Settings page (the advertised flow), signup/password-reset OTPs silently no-op — phone authentication completely broken with no user-visible error.
**Fix:** Thread `ctx` into `sendVerificationRequest` → `sendOtpSms`.

### H-11. `src/convex/auth/phoneOtp.ts` : phoneOtp provider (lines 30–36) + verification path
**Issue:** 6-digit numeric code, 15-minute validity, **no attempt counter / rate limit on verification** anywhere (rate limits exist only for gifts/AI).
**Impact:** Brute-forceable (~10⁶ combos in window) → account takeover of any phone-OTP account, including password reset.
**Fix:** Per-phone/per-IP rate limit on verify attempts, or higher code entropy.

### H-12. `src/convex/ai.ts` : ownerInsights (lines 333, 344–348)
**Issue:** `topDiners` (includes `name` **and `phone`** from analytics.ts:212) plus review text go verbatim into the Gemini prompt; unlike reviews, PII is not sanitized/pseudonymized.
**Impact:** Diner names + phone numbers sent to third-party processor without consent basis (GDPR data-minimization violation); re-identification channel if response echoes them.
**Fix:** Strip `phone`/`userId` from topDiners before building the pack.

### H-13. `src/convex/erasure.ts` : cascadeDeleteUser (lines 45–99)
**Issue:** Cascade misses user-referencing tables: `walkInRequests`, `notificationTokens`, `aiConversations` + `aiMessages`, `bookingQueue` (all have `by_user` indexes).
**Impact:** GDPR Art. 17 failure — FCM tokens stay active forever, AI chat transcripts and walk-in history survive "permanent deletion"; dangling IDs break admin AI console.
**Fix:** Add deletes for these tables inside the cascade before `ctx.db.delete(userId)`.

## Frontend — customer flows

### H-14. `src/components/WalkInDialog.tsx` : step state machine (lines 21, 66–67, 212–224)
**Issue:** After submit, local `step` = `"pending"` and nothing transitions it to approved/rejected. Backing query (`walkIn.ts:429–438`) filters `status === "pending"` only, so once the host decides, `myWalkInStatus` becomes `undefined` — zero signal left.
**Impact:** Diner stares at "Waiting for host approval…" forever; the approved/rejected screens (225–251) are unreachable dead code. Core walk-in flow broken end-to-end.
**Fix:** Query latest request regardless of status; drive `step` from a reactive effect on status.

### H-15. `src/components/DiningDialog.tsx` : handleCheckIn (line 263)
**Issue:** Calls `checkIn({ bookingId })` without `clientDate` (unlike MyBookings.tsx:326). Server falls back to UTC date.
**Impact:** Non-UTC diners near midnight falsely rejected during daily check-in (e.g., UTC+3 diner at 01:30 local has UTC "today" of yesterday).
**Fix:** Pass `clientDate: today()` like MyBookings does.

### H-16. `src/pages/RestaurantDetail.tsx` : handleConfirm (lines 285–290)
**Issue:** Treats `!user` as signed-out, but `useAuth()` returns `undefined` also *while loading*. Route renders before `user` resolves (CustomerShell doesn't gate on auth).
**Impact:** Signed-in users on slow connections tapping Confirm get bounced to `/auth` losing all filled form state; also fires spuriously on refetches.
**Fix:** Use `isLoading` from useAuth; only redirect when `!isLoading && !user`; disable/spin while loading.

### H-17. `src/pages/RestaurantDetail.tsx` : KB-28 queue timeout effect (lines 328–363)
**Issue:** Blanket 45s timer clears `queueEntryId` and reports failure while FIFO drain may still be processing. Once cleared, `trackedEntry` is permanently null so later `status === "booked"` is silently ignored.
**Impact:** Under exactly the peak load the queue was built for: told "failed" while server books anyway → duplicate bookings on retry, or diners unaware they have a table.
**Fix:** Keep tracking reactively; only offer "keep waiting / leave queue"; declare failure from the entry's own terminal state.

### H-18. `src/pages/Explore.tsx` : RestaurantCard duplicate buttons (lines 711–716)
**Issue:** Two adjacent buttons both labeled `t("explore.book")`; first links with `?walkin=true` which is consumed nowhere in the app (verified by grep).
**Impact:** Duplicate identical CTAs; intended walk-in entry from cards is a no-op.
**Fix:** Wire `walkin=true` in RestaurantDetail (open WalkInDialog) with a distinct label, or remove the dead button.

### H-19. `src/components/OwnerRestaurantTabs.tsx` : OwnerCustomersTab grouping (customers tab, ~lines 1050–1126)
**Issue:** Customers grouped by `phone ?? name` instead of stable user id. Distinct guests sharing a name (or one guest with missing then present phone) get merged into inflated visit/guest totals; the merged row carries a single `userId` from whichever booking iterated first.
**Impact:** Wrong customer analytics; "Block from Socialize" targets an arbitrary account while the intended diner stays visible.
**Fix:** Group by `b.userId`; keep name/phone as display fields only.

### H-20. `src/components/OwnerMenuTab.tsx` : handleAddMenu Enter handler (lines 108–120, 170–175)
**Issue:** The onKeyDown handler calls `handleAddMenu()` directly, bypassing the button's `disabled={saving}`; no `if (saving) return` guard.
**Impact:** Two Enter presses during in-flight mutation create duplicate menu documents.
**Fix:** Add `if (saving) return;` at top of handler.

### H-21. CSV formula injection — `src/components/OwnerRestaurantTabs.tsx` handleExport (lines 1113–1126), `src/pages/admin/AdminRestaurantDetail.tsx` exportToCsv (147–158), `src/pages/admin/AdminAudit.tsx` exportToCsv (58–78)
**Issue:** Exports escape quotes but don't neutralize spreadsheet formula prefixes (`=`, `+`, `-`, `@`) on diner-controlled values.
**Impact:** `=HYPERLINK(...)` planted in a name executes when owner/admin opens the export in Excel/Sheets (phishing/exfil aimed at staff).
**Fix:** Prefix dangerous leading chars with `'` (or tab) before quoting.

## Frontend — routing/auth shell

### H-22. `src/main.tsx` : /invite/:code route (lines 225–232)
**Issue:** Invite route wrapped in `<RequireAuth>`, but `Invite.tsx:36–43` contains explicit anonymous-visitor handling (KB-20) designed to show details first and redirect on confirm tap.
**Impact:** Anonymous visitors opening a shared invite link bounce straight to `/auth`; the viral share loop is broken and Invite's anonymous branch is dead code.
**Fix:** Remove RequireAuth from this route (backend enforces auth on `byCode`/`confirmGuest`).

### H-23. `src/main.tsx` + `src/components/NotificationHandler.tsx` : push navigation target (NotificationHandler line 37; route map main.tsx:184)
**Issue:** Push tap for `booking_confirmed` navigates to `/my-bookings`; the actual route is `/bookings`. No `/my-bookings` route exists anywhere.
**Impact:** Every booking-confirmed push lands users on the 404 page.
**Fix:** Navigate to `/bookings` (prefer router navigate over full page reload).

## Hooks

### H-24. `src/hooks/use-push-notifications.ts` : register() (lines 69–91) + `src/components/NotificationHandler.tsx` saveToken (line 55)
**Issue:** (a) `register()` returns the `token` state captured in closure — always `null` since the token arrives asynchronously via the `registration` listener; `loading` flips false immediately; function identity changes whenever `token` changes (effect re-run trap). (b) In NotificationHandler the saved token is hardcoded `platform: "android"` regardless of device.
**Impact:** Callers awaiting `register()` never get a token despite the documented contract; iOS APNs tokens recorded as Android breaks platform routing/cleanup of push notifications.
**Fix:** Resolve register() via a deferred promise set by the listener; pass `Capacitor.getPlatform()` as platform.

## Admin pages

### H-25. `src/pages/admin/AdminAudit.tsx` : toggleSelectAll (lines 140–146, 275)
**Issue:** Select-all compares `selected.size === pageItems.length` instead of checking whether every item *on the current page* is selected; selections from other pages inflate size.
**Impact:** With selections on page 1, page 2 shows header checked; clicking deselects everything instead of selecting page 2 — wrong selection scope for destructive bulk delete. (AdminUsers.tsx:120 does this correctly.)
**Fix:** Compute `pageItems.every(e => selected.has(e._id))` and toggle only current-page ids.

### H-26. `src/pages/admin/AdminUsers.tsx` : selection vs filters (lines 72, 120–168) and `src/pages/admin/AdminReviews.tsx` : selectedReviewIds (lines 125–128, 141–171)
**Issue:** Selection Set persists across filter/search changes and is never pruned to visible rows before bulk delete (AdminReviews keeps ids selected anywhere in `reviews`, not `filtered`).
**Impact:** Admin narrows filters → hits "Delete (N)" → permanently deletes users/reviews no longer visible or matching the filter; confirmation count misrepresents what's on screen.
**Fix:** Prune selection against filtered rows when filters change (or intersect inside the delete handler and surface skipped counts).

### H-27. `src/pages/admin/AdminRestaurantDetail.tsx` : dateKey/DATE_PRESETS (lines 171–180)
**Issue:** `dateKey()` uses `toISOString().slice(0,10)` (UTC) but booking dates are local-calendar strings (format.ts `dateFromNow()` uses local getters).
**Impact:** For UTC+ zones (home market UTC+3), between local midnight and 03:00 the "Today" preset filters yesterday's bookings; week/month boundaries shift too — admins see wrong rows on the most common filter.
**Fix:** Build YYYY-MM-DD keys from local components (reuse `today()` from `@/lib/format`).

### H-28. `src/lib/navigation.ts` : openWaze / openOSM (lines 113–137)
**Issue:** Destination passed as free-text address, but Waze `ul?ll=` and OSM `directions?route=` expect `lat,lng` coordinates; only Google/Apple accept address text in these URL shapes.
**Impact:** Choosing Waze or OSM (both offered by `getAvailableProviders()`) opens without a valid destination — navigation silently fails.
**Fix:** Pass coordinates when available (Waze `q=lat,lng` search; OSM coordinate route); fall back to Google Maps when no coords.

---

# MEDIUM

### M-1. `src/convex/waitlist.ts` : join (line 126)
Missing `restaurant.disabled` check (every other entry point enforces moderation hold) — waitlists joinable at suspended venues. Fix: throw after existence check.

### M-2. `src/convex/dining.ts` : billForBooking (lines 380–393)
Bill-line aggregation key `name|removals|note` ignores `priceCents` while totalCents sums real prices — if a dish price changes between orders, Σ(lineTotal) ≠ totalCents. Billing-dispute material. Fix: include price in key.

### M-3. `src/convex/bookings.ts` : stats (line 416)
`avgParty = covers / inWindow.length` — numerator excludes cancelled bookings, denominator includes them; average party size systematically understated. Fix: divide by nonCancelled count.

### M-4. `src/convex/queue.ts` : enqueue (lines 70–77)
Duplicate detection requires identical partySize — changing size creates two queued entries for one slot and `processSlot` books both (accidental double-booking). No cap on active entries (flood vector). Fix: idempotency on `(user, restaurantId, date, time)` alone, patch existing entry, cap entries.

### M-5. `src/convex/availability.ts` : summary (lines 239–245)
Loops ALL restaurants × 3 indexed queries each in one transaction; powers the frequently-polled discovery screen. Will hit Convex read limits / latency spikes at scale. Fix: paginate/denormalize free-seat counters.

### M-6. `src/convex/availability.ts` : rebuildRestaurantSlots (lines 144–153)
Deletes every future unbooked slot (`date >= today`) but regenerates only `daysAhead = 14`; slots previously materialized beyond 14 days (public `ensureForDate` has no upper bound) are destroyed on every rule edit. Fix: prune only within regeneration window.

### M-7. `src/convex/restaurants.ts` : search/stats/facetValues/trending/forYou (lines 120–388)
Full-table `.collect()`s on restaurants, sections, menuItems with O(n·m) JS filtering (`ids.includes`) on every search/discovery call. Unbounded reads, degrades linearly. Fix: paginate, batch per-id reads over result set, or denormalize flags onto restaurant docs.

### M-8. `src/convex/walkIn.ts` : walkInCheckIn / hostInitiatedWalkIn (lines 74–83, 212–246)
No input sanitization — `name/tableNumber/notes/dinerEmail` stored raw (no length caps) unlike every other writer; oversized fields bloat storage and break notification rendering. Fix: apply trim/caps/Zod like bookings/waitlist.

### M-9. `src/convex/users.ts` : hasPasswordAccount (lines 74–81)
Fallback scan caps at `.take(2000)` and returns `exists:true` on cap-hit — once ≥2000 password accounts exist, all new OTP users get routed to password login and can't sign in with OTP. Also unauthenticated 2000-row scan per login submit. Fix: treat cap-hit as false or move normalization to signup invariant.

### M-10. `src/convex/admin.ts` : tagAsRestaurant (266) / registerRestaurant (191) / ensureOwnerPassword (348)
Unconditionally patch `role:"owner"` with no `target.role==="admin"` guard (users.onboard refuses to demote admins) — registering/tagging another admin's phone strips their admin role. Fix: mirror the admin-demote refusal.

### M-11. `src/convex/admin.ts` : setUserPassword (line 646)
Resets password without `invalidateUserSessions(ctx, userId)` (setUserDisabled does, line 389) — hijacker sessions survive admin password reset. Fix: invalidate after setPasswordForUser.

### M-12. `src/convex/users.ts` : deleteAccount (line 550)
Step 2 verifies OTP but never re-checks owned restaurants (guard exists only in startAccountDelete:503–509). Owner-tagging between request and confirm leaves `restaurants.ownerId` dangling. Fix: repeat the by_owner check right before cascadeDeleteUser.

### M-13. `src/convex/users.ts` : startPhoneChange (line 362)
Validates length only, not `/^\+\d+$/` format used everywhere else — login identity can migrate to non-canonical phone breaking lookups/SMS. Fix: apply shared regex.

### M-14. `src/convex/socialize.ts` : setVisibility (465) + sendGift receiver check (654–661)
setVisibility uses requireCheckedInBooking (no date restriction) so presence can be visible for past bookings; sendGift checks only presence visibility, never receiver's booking date/status — gifts addressable to absent diners. Fix: verify receiver's booking is today/confirmed.

### M-15. `src/convex/admin.ts` : clearAuditLog (line 603)
Collect + row-by-row delete of entire audit log in one transaction — permanently breaks once log exceeds transaction limits (clearing is the only shrink path). Fix: scheduled batched deletion.

### M-16. `src/convex/admin.ts` : bulkDeleteUsers (line 474)
Up to 50 full GDPR cascades sequentially in one mutation — will blow transaction limits, rolling back everything with no partial progress. Fix: batches of 5–10 or scheduled per-user deletion.

### M-17. `src/convex/adminView.ts` : overview/listRestaurants/listUsers/userDetail (lines 63–246)
Whole-table collects + N+1 fan-out (3 sub-collects per restaurant / per user; overview collects five tables) in single transactions — guaranteed production incident at scale. Also revenue sums non-cancelled (including open/preparing/served) orders → inflated figures. Fix: pagination + aggregates; count only completed orders.

### M-18. `src/convex/dinerNotify.ts` : onStoryPosted (line 165)
`users.collect()` full scan per posted story (hot path) — degrades linearly with user count until story posting breaks. Fix: followers/favorites reverse index.

### M-19. `src/convex/erasure.ts` : cascadeDeleteRestaurant (lines 111–177)
Misses `tableQRCodes`, `walkInRequests`, `bookingQueue` (by_restaurant) — diner contact info persists after venue removal. Fix: add the three deletes.

### M-20. `src/convex/demoRules.ts` : ensureDemoRules (lines 186–223)
Without `force`, requires no authentication yet inserts demo rules + rebuilds 14 days of slots for any exactly-named venue lacking windows — unauth availability mutation + write-amplification loop. Fix: require auth for all non-cron invocations.

### M-21. `src/convex/analytics.ts` : waitTimes/publicWaitSignal/analytics2/predict (lines 45–49, 118–122, 162–166, 266–268)
Load EVERY booking ever via by_restaurant and filter date window in JS despite existing `by_restaurant_date` index; `predict` additionally runs 12×3 sequential queries, unauthenticated, unvalidated `date` (NaN paths). Cost amplifier abusable ~36 queries/call. Fix: ranged index queries, validate date, gate/rate-limit predict.

### M-22. `src/convex/ai.ts` : buildContextPack/ownerInsights unsanitized fields (lines 338, 424–460)
Diner free-text `occasion`, owner-authored `neighborhood/city/priceRange/features`, menu-item names go into prompts without `sanitizeUntrustedText` (reviews are sanitized) — cross-user indirect prompt injection steering other diners' recommendations. Fix: sanitize every interpolated string.

### M-23. `src/convex/settings.ts` : listSettings (lines 107–116)
Non-secret keys return full env value verbatim; SECRET_KEYS deny-list design means any future sensitive key forgotten there leaks. Fix: default-deny mask with explicit PUBLIC_KEYS allowlist.

### M-24. `src/components/SocializeDialog.tsx` : viewerTier/Taste Twins gating (lines 146–148, 310, 347–355)
Server `tasteTwins` gates on stored accessTier and never applies the >15-min "seated" promotion that visibleDiners computes on-the-fly; UI promises "stay seated 15 min to unlock Taste Twins". Feature never unlocks by waiting — only by toggling visibility off/on. Fix: compute promotion server-side consistently.

### M-25. `src/pages/Explore.tsx` : walk-in button binds wrong restaurant (lines 270–283)
Opens WalkInDialog pre-bound to `visible[0]._id` — arbitrarily the first result, no picker. Walk-ins filed against the wrong venue; host approves nonexistent tables. Fix: restaurant-selection step or per-card entry.

### M-26. `src/pages/RestaurantDetail.tsx` : handleJoinWaitlist (lines 365–387)
No anonymous-user handling — raw error toast from `waitlist.join`, unlike booking flow's polished sign-in-and-return. Fix: redirect to `/auth?returnTo=...` when `!user`.

### M-27. `src/pages/MyBookings.tsx` : offline cache merge (lines 134–159)
Cache entries added/trimmed but never evicted on cancelled/no_show/completed — offline banner can surface confirmation codes for cancelled bookings at the door. Fix: rebuild cache from current confirmed set each run.

### M-28. `src/components/BillSplit.tsx` : host badge (lines 40, 63–68)
`isHost` computed correctly but unused; badge keyed on viewer identity — every guest sees themselves badged "Host". Payment-context role misinformation. Fix: badge against booking owner.

### M-29. Hardcoded English + locale in social/dine dialogs — DiningDialog, SocializeDialog, BillSplit, WalkInDialog, WalkInApproval (+ weekday chips in RestaurantDetail.tsx:593–599, Explore.tsx:218; formatClock en-US)
Zero `useTranslation()` usage across the dine-in/socialize/walk-in experience while surrounding pages are fully instrumented. Mixed-language UI for ar/fr locales. Fix: route strings through locales; shared relative-time formatter.

### M-30. `src/pages/Explore.tsx` : memo defeated (lines 169–176, 451–556)
RestaurantCard wrapped in React.memo but parent passes fresh `handleToggleFavorite` identity every render — memo does nothing; every keystroke re-renders all cards (each with two useQuery reconciliations). Fix: useCallback the handler.

### M-31. `src/lib/use-table-pagination.ts` (lines 10–39)
`page` never resets when items/sort/search change (clamp retains stale index — searching from page 5 shows results clamped onto "page 5"); `sortKey/sortDirection` options accepted but dead. Affects every admin list. Fix: reset page on sort/filter change; honor or remove options.

### M-32. `src/pages/admin/AdminAudit.tsx` second unbounded query (line 98)
Loads the ENTIRE audit log a second time just to build the action-filter dropdown alongside the filtered query. Doubles transfer, re-renders on every log write. Fix: distinct-actions facet query.

### M-33. `src/pages/admin/AdminAI.tsx` delete handlers (lines 84, 88)
`void deleteKnowledge({...}).then(toast)` with no `.catch` — failures become unhandled rejections; entry lingers with no feedback. Fix: try/catch + error toast.

### M-34. `src/components/RequireAuth.tsx` (19–48) + `src/hooks/use-auth.ts` (line 11)
Authenticated session whose user doc is deleted resolves `user===null`: isLoading false, isAuthenticated true → renders children that dereference `user._id`/`user.role` (crash); AdminShell redirects such users to /auth where AuthPage's authenticated redirect sends them back — bounce loop until JWT expiry. Fix: treat `isAuthenticated && user===null` explicitly (sign out / error state).

### M-35. `src/hooks/use-geolocation.ts` (53–59, 104–140)
(a) `defaultOptions` recreated every render → unstable callback identities, effects re-fire continuously; (b) watch ids never tracked nor cleared on unmount — GPS polling leaks after unmount (battery/background location); (c) watch errors ignored. Fix: useRef options, track/clear watches in cleanup, surface errors.

### M-36. `src/hooks/use-camera.ts` : processPhoto (44–53)
Updates `photoBase64` only when `result.base64String` exists — with Uri/DataUrl resultType the previous photo's base64 stays in state while displaying the new photo → mismatched upload (possibly another capture's image). Fix: `setPhotoBase64(result.base64String ?? null)`.

### M-37. `src/lib/slotgen.ts` : detectGap (118–132)
Gap math ignores the past-midnight wrap that timesForWindow supports (22:00→01:00 yields bogus 1260-min gap, real circular gaps missed) — owners see false "21h gap" warnings for post-midnight venues. Fix: `(minutesOf(b)-minutesOf(a)+1440)%1440` circular measurement.

### M-38. `src/pages/Auth.tsx` : resolveRedirectAfterAuth backslash bypass (42, 94)
Rejects `//host` but not `/\evil.com` which WHATWG parsers treat scheme-relative. Currently mitigated by client-side navigate(), latent open-redirect for future sinks. Fix: reject leading `/\` or `\\`; whitelist regex `/^\/[^/\\]/`.

### M-39. `src/pages/Auth.tsx` : handleSendOtp Promise.race (177–191)
Timeout doesn't cancel signIn — late rejection unhandled; catch resets `otpSentRef.current=false` allowing immediate resend while original still in flight → duplicate SMS sends (two codes). Fix: `.catch(()=>{})` on loser, generation counter, don't reset ref on timeout.

### M-40. `src/main.tsx` : RouteSyncer postMessage bridge (92–108)
`window.parent.postMessage({...}, "*")` broadcasts every route change — including `/auth?phone=+961…`, invite codes — to any embedding document; inbound listener performs no `event.origin` check (history manipulation). Fix: explicit allowed origin or drop bridge outside preview env; validate origin inbound.

### M-41. `src/pages/Auth.tsx` pre-auth enumeration oracle (81–84)
Unauthenticated `hasPasswordAccount(phone)` boolean drives password-vs-OTP UI — phone-number enumeration/account discovery oracle (noted in repo's own bugs.md BUG-14). Fix: uniform flow/rate limiting.

### M-42. `src/pages/Account.tsx` : handleChangePassword race (line 583)
Submit enabled while `hasPassword` still loading (needsCurrentPassword=false, field hidden) → backend throws "Enter your current password." mid-flow; field pops in unexpectedly. SetPassword.tsx handles this correctly. Fix: disable while `hasPassword === undefined`.

---

# LOW

### L-1. `src/convex/bookings.ts` : cancelBooking (464–473) & waitlist SMS callers (484, 558, 609)
Schedule SMS unconditionally with `to: phone ?? ""` — wasted scheduled actions (harmless today due to twilio skip). Fix: guard on phone presence.

### L-2. `src/convex/dining.ts` : placeOrder/sendAssist (182, 551)
Omit `clientDate` in participant check → server-date midnight false-rejects ("booking in the past") for non-UTC diners ordering during meals — same class as fixed checkIn BUG-05. Fix: thread clientDate through.

### L-3. `src/convex/bookings.ts` : myBookings (296–322)
Takes N most-recently-created then sorts chronologically — far-future trips drop off list once recent history accumulates. Fix: filter `date >= today` before take.

### L-4. `src/convex/bookings.ts` : attemptBooking nearest-slot fallback (121–123)
±2h fallback compares times lexicographically — post-midnight continuations excluded for late-night venues (KB-12 wrap handled elsewhere). Fix: minutesOf modulo-midnight comparison.

### L-5. `src/convex/slotRules.ts` : validateRule (27–29)
Accepts `step=0` (legit fixed seating) but error message says "between 5 and 240 minutes" — contradictory owner-facing error. Fix: message allowing 0.

### L-6. `src/convex/walkIn.ts` : scanTableQR (line 130)
Only rejects inactive QR; null (fabricated table) passes validation despite comment claiming otherwise. Fix: require `qrCode && qrCode.active`.

### L-7. `src/convex/walkIn.ts` mixed clocks (224–226, 295–297)
Date from UTC `toISOString().split("T")[0]`, time from server-local `getHours()` — consistent only while Convex is UTC; fragile day-boundary disagreement risk. Fix: single clock helper.

### L-8. `src/convex/queue.ts` : processSlot (124–168)
Drains entire queue per invocation (transaction-limit stalls under bursts; idempotent so correct) and terminal rows never archived → growing scans. Fix: bounded batch + reschedule; archive terminal entries.

### L-9. `src/convex/notifications.ts` unauthenticated token maintenance (removeToken 302, updateTokenLastUsed 340, cleanupTokens 351)
Anyone can deactivate any token / run cleanupTokens with negative olderThanDays deleting all inactive tokens — push-suppression DoS (amplified by C-3/C-4). Fix: auth/internal gates.

### L-10. `src/convex/dinerNotify.ts` : onGuestConfirmed dedupeKey (line 202)
`guest:${bookingId}:${name.toLowerCase()}` — two same-named guests collide; second confirmation silently produces no host notification. Fix: unique guest identifier in key.

### L-11. `src/convex/dinerNotify.ts` : onStoryPosted contact-info gate (174) + myNotifications collect-sort-slice (100)
(a) Skips users without phone AND email though insert is purely in-app; (b) collects entire notification history then slices 100 in JS. Fixes: drop gate; indexed take pattern.

### L-12. `src/convex/notifications.ts` : myAlerts (111) / `src/convex/admin.ts` : auditLog (115)
`take(N)` applied BEFORE JS filtering — newer non-matching rows fill the page and older matching entries vanish (incomplete feeds/search). Fix: index-filtered queries or pagination.

### L-13. Divergent todayKey implementations — `socialize.ts:16` (local getters) vs `notifications.ts:12` (UTC slice)
Latent midnight divergence if TZ ever differs; extract one shared helper.

### L-14. `src/convex/socialize.ts` : resolveTodayKey ±24h tolerance (line 35)
Client-supplied date accepted up to ±24h — day-of gates trippable one day early by modified client. Documented tradeoff; consider signed tz offset.

### L-15. `src/convex/settings.ts` : listSettings masking design — see M-23 companion note (kept LOW for current keys).

### L-16. `src/convex/sms.ts` : templates (32, 52)
Optional `code` renders literally as "Code: undefined" in SMS. Fix: conditional segment.

### L-17. `src/convex/rateLimit.ts` : checkRateLimit concurrent split (43–61)
Race splits counts across two rows letting effective limit ≈ 2× under concurrent first-hits; misleading fail-safe comment. Fix: sum rows or deterministic single-row upsert.

### L-18. `src/convex/reviews.ts` : remove points reversal (144–153)
Skips clawback when balance < amount but deletes ledger row anyway — idempotency guard gone while points never reclaimed → delete/re-review cycles can net-inflate points. Fix: unconditional max(0, points−amount).

### L-19. UTF-16 emoji truncation — `src/convex/stories.ts` post (46), `src/components/OwnerStoriesTab.tsx` input (83)
`.slice(0,4)` splits surrogate pairs/ZWJ sequences → corrupted emojis. Fix: `[...str].slice()`.

### L-20. `src/convex/loyalty.ts` : leaderboard (97)
Full users-table scan per call (admin-only today). Fix: ordered index/take or cache.

### L-21. `src/convex/reminders.ts` tomorrowUtcDateString (20–26) + analytics heatmap TZ (analytics.ts:181)
Reminder targeting assumes server UTC == venue-local calendar — missed/early reminders and heatmap mis-buckets for extreme offsets. Fix: per-venue tz offset field.

### L-22. `src/convex/auth.config.ts` (line 10)
`process.env.CONVEX_SITE_URL!` non-null assertion — cryptic runtime auth failures if unset. Fix: fail-fast throw.

### L-23. `src/pages/RestaurantDetail.tsx` : success overlay occasion (352, 1359–1363)
Effect calls `setOccasion(null)` before success screen conditionally renders `{occasion && ...}` — note branch is dead; `bookingResult.name` populated with sectionName (copy-paste, line 346) unused. Fix: capture into bookingResult before reset.

### L-24. `src/pages/RestaurantDetail.tsx` : trackedEntry effect deps (340–363)
Depends only on `[trackedEntry]`, closes over `selectedSlot`/`t` — stale-closure fragility. Fix: complete deps array.

### L-25. `src/components/DiningDialog.tsx` bill-line React keys (line 559)
Gift rows keyed by name+note — identical gifts produce duplicate keys (console warning, possible skipped render). Fix: stable row id from backend.

### L-26. Double-submit UX — WalkInDialog submit/close (36–82, 207), WalkInApproval approve/reject (28–52, 119–173)
No busy/disable guards; rapid clicks surface confusing duplicate-request toasts; close setTimeout not cleaned on unmount. Fix: busy state + cleanup effect.

### L-27. `src/components/SocializeDialog.tsx` : timeAgo static (76–82, 460, 512) and `src/pages/Notifications.tsx` : timeAgo (37–43)
Relative timestamps computed once per render — "just now" frozen until unrelated re-render. Fix: low-frequency tick interval.

### L-28. `src/pages/Explore.tsx` : availability badges under "Any day" (78, 196–205, 615–633) + subtitle count (184) + stale date strip memo (97–100)
Today-based badges shown under date-agnostic selection; count excludes availability filter; date strip baked at mount keeps yesterday-as-Today after midnight. Fixes: hide/label badges, use visible?.length, refresh today on interval.

### L-29. `src/pages/RestaurantDetail.tsx` : date strip memo `[]` (218–221)
Same midnight-stale issue as Explore. Fix: derive from stateful refreshed today.

### L-30. `src/components/OwnerDiningTabs.tsx` : Active-orders definition (147 vs dining.ts:800)
Sidebar badge counts open|preparing; tab counts include served — badge disappears while tab says "Active (3)". Fix: unify definition.

### L-31. `src/components/OwnerRestaurantTabs.tsx` : AvailabilityTab sold-out buttons (728–738) + BookingsTab status badge (984)
Sold-out buttons omit disabled guard and tooltip lies ("tap to reopen" actually closes/hides slot); status badge hardcodes success-green for completed/no_show. Fixes: fix tooltip+disabled; map status→variant.

### L-32. `src/components/OwnerGiftsTab.tsx` : handleSave $0 gifts (100–103) + unguarded instant delete (124–131, 210–218)
`Number("")===0` passes `<0` check publishing free gifts accidentally; trash-click deletes instantly with no confirm/in-flight guard (menus/items use AlertDialog pattern). Fixes: require price>0; reuse confirmation pattern.

### L-33. `src/components/OwnerMenuTab.tsx` : ItemFormDialog blob URL leak (line 425)
`URL.createObjectURL` preview never revoked — memory accumulates in long editing sessions. Fix: revoke on replace/close/unmount.

### L-34. `src/pages/OwnerRestaurant.tsx` numeric inputs (520, 704)
Capacity snaps to 1 the moment field is cleared; socMinVisits propagates NaN into state/payload on partial input. Fixes: hold raw string, parse/clamp on submit; Number.isFinite guard.

### L-35. `src/pages/OwnerRestaurant.tsx` : OverviewTab handleSave sequential mutations (354–387)
Three sequential mutations; mid-failure commits earlier writes, generic error — partially saved profile. Fix: surface per-step errors or single backend mutation.

### L-36. `src/components/OwnerShell.tsx` : role gate/signOut (19–25)
`user===undefined` briefly renders owner chrome; signOut rejection skips navigate fallback silently. Fix: spinner while undefined; try/catch + toast.

### L-37. `src/pages/OwnerDashboard.tsx` : nested button in Link (288, 316–327) + whitespace-required fields (143–169; OwnerRestaurant.tsx 408–434, 683)
Invalid interactive-inside-interactive HTML relying on preventDefault luck; HTML required accepts whitespace-only names reaching create/update. Fixes: restructure card; trim-validate in handlers.

### L-38. `src/components/OwnerRestaurantTabs.tsx` : today scope baked at mount (790, 621) + SlotRulesTab shared saving/error state (101–102 rendered 411/545)
Overnight-open dashboard queries yesterday; two forms share one saving/error pair showing errors in the sibling card and disabling both submits. Fixes: refresh date lazily; per-form state.

### L-39. `src/pages/Auth.tsx` misc (111, 551, 195–199) + SetPassword (61)
Auto-redirect effect omits searchParams/redirectAfterAuth deps (stale returnTo); OTP form flashes while hasPassword undefined (`!undefined?.exists` true); StrictMode double auto-send in dev; password validation length-only (all-whitespace allowed, no max) mirrored in backend users.setPassword:290.

### L-40. `src/pages/Notifications.tsx` TYPE_KEYS fallback (82) + Invite/NotificationHandler hardcoded English (various)
Unknown types fall back to "Favorite story" label; invite page copy (most-shared surface) hardcoded English for ar/fr users. Fixes: generic typeUpdate key; move strings to locales.

### L-41. Misc frontend — Account prefs sync overwrite (99–110); main.tsx VITE_CONVEX_URL unchecked (88, blank page before boundary); AdminRegister temp-password minLength missing (131); AdminTag silent short-password skip + partial failure order (28–30); AdminSettings revealed flag couples value-mask and input-type eye toggles (264–302); AdminRestaurants avg-of-averages rating stat (112); AdminReviewDetail/AdminReviews UTC date slicing (83, 397, 464 — reviews 21:00–23:59 UTC+ show previous day); AdminAudit td-instead-of-th header (273); AdminAI thread pane conflates empty/loading (74); i18n detectLanguage case-sensitive saved lang (15–18); formatPrice hardcoded USD/en-US (31–37).

---

## Verified-clean areas (checked, no issue)

- Money math is integer cents throughout (orders, bills, BillSplit — no float division/remainder loss).
- `validateRecommendations` whitelist-checks model output IDs; `prepareConversation` enforces ownership+rate-limit atomically; `awardPoints` idempotent via `loyaltyLedger.by_user_source`.
- `sortTimes`/`minutesOf`/`timesForWindow` midnight-wrap math (KB-12) correct; `minutesOf/formatMinutes/dateLabel` DST-safe.
- Twilio kill-switch/timeout/status mapping sound; BookingReceipt QR generation properly cancellable; push listeners removed correctly; AdminShell body-scroll-lock cleaned up.
- Pagination ceil/clamp/slice in `use-table-pagination.ts` has no off-by-one; RequireAuth returnTo validated against `//` (backslash variant tracked separately, M-38).
- Schema/index definitions match queries in reviewed files; `customSlots.by_restaurant` etc. exist.
- CustomerShell↔Dashboard role routing has no redirect loop.

## Top priorities (recommended fix order)

1. **C-1..C-4** — settings secret exposure + notification-token endpoints (immediate security incident material).
2. **H-1/H-2/H-3** — booking ledger integrity (overbooking + phantom seats + code collisions).
3. **H-9/H-10/H-11** — reminder SMS bug + broken/bypassable phone OTP.
4. **H-14/H-15/H-22/H-23** — broken end-user flows (walk-in stuck pending, check-in TZ rejects, invite wall, 404 push taps).
5. **M-34/M-27/M-17** — crash-loop edge case, wrong-code-at-door, admin console scaling.
