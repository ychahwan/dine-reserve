# Bugs & Edge Cases — Kamix Code Review

Reviewed: all convex mutations/queries, auth flow, pages, and components.

---

## BUG-01 — `hasPasswordAccount` fallback does a full table scan (perf)

**File:** `src/convex/users.ts` → `hasPasswordAccount`
**Severity:** Medium (performance)

The indexed fast-path works for new (canonical) accounts, but the fallback scans **every** password `authAccounts` row and normalizes each one. As the user base grows this degrades the login screen (the query runs before the user is signed in, on every phone submit).

**Fix:** Normalize all password account `providerAccountId` values at write time (already done for new writes). Remove the full-scan fallback once no legacy accounts remain, or replace it with a targeted search on a normalized-index.

---

## BUG-02 — `SetPassword.tsx` hardcodes redirect to `/owner`

**File:** `src/pages/SetPassword.tsx` → `handleSubmit`
**Severity:** Low

After a successful password change, the page always navigates to `/owner`. If the platform ever uses `mustChangePassword` for a diner or admin, they'd land on the wrong page.

**Fix:** Use role-based redirect (same as Auth.tsx's `resolveTarget`).

---

## BUG-03 — `onboard` accepts any string as phone — no format validation

**File:** `src/convex/users.ts` → `onboard`
**Severity:** Low (data quality)

The phone field from the onboarding form is stored as-is with no format check. A user could enter `"hello"` and it would be their phone for SMS confirmations.

**Fix:** Validate phone format (starts with `+`, 8–15 digits after normalization).

---

## BUG-04 — `todayKey()` uses server UTC, but bookings store local dates

**Files:** `src/convex/notifications.ts`, `src/convex/dining.ts`, `src/convex/socialize.ts`
**Severity:** Medium (edge case near midnight UTC)

`todayKey()` returns the server's UTC date. Bookings store the diner's local date. Near midnight UTC (e.g., 23:00 UTC = 01:00 EET), `todayKey()` says "today" is one day behind the diner's local "today". This can:
- Prevent check-in alerts on the day of the booking (dining.ts `requireOwnConfirmedBooking`)
- Block Socialize visibility (socialize.ts `requireActiveTodayBooking`)
- Skip day-before reminders

`socialize.ts` has `resolveTodayKey(clientDate?)` which accepts a client-supplied date (bounded ±1 day), but `dining.ts` and `notifications.ts` still use bare `todayKey()`.

**Fix:** Use `resolveTodayKey` consistently across all day-of-visit checks, or always accept an optional `clientDate` parameter.

---

## BUG-05 — `cancelBooking` silently leaks seats when slot is missing

**File:** `src/convex/bookings.ts` → `cancelBooking`
**Severity:** Medium

If `findBestSlotFromDb` returns `null` (section was deleted or slot data is missing), the seat-restoration block is skipped entirely and the seats are permanently leaked — the slot's `remaining` is never restored.

**Fix:** At minimum, log the anomaly. Ideally, attempt a fallback restore by scanning the slot's parent section and adjusting the remaining count.

---

## BUG-06 — Host can confirm themselves as a guest via invite link

**File:** `src/convex/bookings.ts` → `confirmGuest`
**Severity:** Low

A host who opens their own invite link and submits their name can add themselves as a guest. They consume an extra seat from the slot ledger and appear twice in the guest list (once as host, once as guest).

**Fix:** Check `booking.userId === userId` and reject with "You're the host — you're already on the list."

---

## BUG-07 — `visibleDiners` attendance check uses server `todayKey()` instead of `resolveTodayKey`

**File:** `src/convex/socialize.ts` → `visibleDiners`
**Severity:** Low (same root cause as BUG-04)

The authorization check uses `todayKey()` (server UTC) while the presence filter also uses `todayKey()`, so they're internally consistent — but both can disagree with the diner's local date near midnight, causing the Socialize room to appear empty when the diner is actually at the restaurant.

**Fix:** Accept `clientDate` in `visibleDiners` and use `resolveTodayKey`.

---

## BUG-08 — `SetPassword` shows password field while `hasPassword` is still loading

**File:** `src/pages/SetPassword.tsx`
**Severity:** Medium (security)

When `hasPassword` is `undefined` (still loading), `showCurrentPassword` defaults to `false`, hiding the current-password field. If the user submits quickly, they set a new password **without verifying the old one**, even though they already have a password account.

**Fix:** Disable the submit button while `hasPassword === undefined`.

---

## BUG-09 — SMS actions don't validate phone format before calling Twilio

**Files:** `src/convex/sms.ts` → all four actions
**Severity:** Low

Empty or malformed phone numbers hit the Twilio API and get silently caught. A minor waste of an API call and potentially confusing in logs.

**Fix:** Add a quick guard: `if (!to || !/^\+\d{8,15}$/.test(to)) return { sent: false, skipped: true, reason: "invalid phone" };`.

---

## BUG-10 — `admin.registerRestaurant` doesn't validate owner phone format

**File:** `src/convex/admin.ts` → `registerRestaurant`
**Severity:** Low

After `normalizePhone`, there's no minimum-length check. A single-character phone (e.g. `"+"`) would pass.

**Fix:** Add `if (ownerPhone.length < 8 || ownerPhone.length > 15) throw new Error("Enter a valid phone number.");` after normalization.

---

## BUG-11 — `Account.tsx` change password doesn't clear form on success for the "first-time" (no password) case

**File:** `src/pages/Account.tsx` → `handleChangePassword`
**Severity:** Cosmetic

When a user sets a password for the first time (`needsCurrentPassword = false`), the success toast shows but `currentPassword` isn't cleared (it's not used, so it doesn't matter) — but `newPassword` and `confirmPassword` are correctly cleared. No actual bug, but the `needsCurrentPassword` state should be rechecked after the mutation succeeds (the query may still say `false` briefly).

**Fix:** Force a re-query or reload `hasPassword` after success.

---

## BUG-12 — `AdminUserDetail.tsx` — no loading/error state for `setUserPassword` mutation

**File:** `src/pages/admin/AdminUserDetail.tsx`
**Severity:** Cosmetic

The mutation call is wrapped in try/catch with toast + error state, but there's no visual confirmation beyond the toast. If the toast auto-dismisses, the admin might not notice a subtle failure.

**Fix:** Show a success/error banner below the form (already handled by `error` state, but add a `success` state with a brief green banner).

---

## BUG-13 — `sendForBooking` allows alerts for same-day bookings in different timezones

**File:** `src/convex/notifications.ts` → `sendForBooking`
**Severity:** Low

The date comparison `booking.date < localToday` uses server UTC time, same as BUG-04. A diner whose local "today" differs from server UTC could be blocked from sending alerts.

**Fix:** Accept optional `clientDate` and use `resolveTodayKey`.

---

## BUG-14 — `hasPasswordAccount` is an unauthenticated query (by design) but can be abused for high-frequency enumeration

**File:** `src/convex/users.ts` → `hasPasswordAccount`
**Severity:** Low (documented SEC-04)

No rate limiting on the query itself. An attacker could brute-force phone numbers to discover which have password accounts. The auth library rate-limits actual login attempts, but the routing query doesn't.

**Fix (optional):** Add a lightweight per-IP or per-session rate limit, or accept the tradeoff as documented.

---

## BUG-15 — `phoneOtp.ts` `sendOtpSms` duplicates the Twilio logic in `sms.ts`

**Files:** `src/convex/auth/phoneOtp.ts`, `src/convex/sms.ts`
**Severity:** Low (maintainability)

Both files contain independent Twilio API calls with slightly different error handling (phoneOtp has a 10s AbortController timeout, sms.ts does not). A credentials change or API update must be applied in two places.

**Fix:** Extract a shared `sendTwilioSms` helper used by both.

---

*All bugs are categorized by severity and fix priority. Critical/high items should be addressed before the next release.*
