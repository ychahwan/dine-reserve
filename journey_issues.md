# User Journey Issues — Kamix

End-to-end review of every user role's flow: Admin, Owner (restaurant), Diner (customer), and Guest (invite link).

---

## J-01 — Diner can't review until owner marks booking as "completed"

**Severity:** Medium (UX gap)
**Journey:** Register → Book → Visit → Pay → **Review blocked**

`reviews.create` requires `booking.status === "completed"`. Only the owner can set this via `bookings.updateStatus`. If the owner forgets or doesn't know to mark it, the diner **can never review** — there's no fallback (e.g., auto-complete after N days, or allow review for any confirmed past booking).

**Fix options:**
- Auto-mark bookings as `completed` 2 hours after the booking time (via a cron job)
- Allow reviews for `confirmed` bookings whose date is in the past (not just `completed`)

---

## J-02 — Owner can't recover from a lost temp password before first login

**Severity:** Low (already works via "Forgot password?")
**Journey:** Admin creates restaurant → Owner receives temp password → Owner loses it before first login

The "Forgot password?" flow on the login screen sends an OTP to the phone and lets the user set a new password. Since the restaurant account has a password account (created by `admin.registerRestaurant`), this flow works. **No issue — documented for completeness.**

---

## J-03 — After admin resets a user's password, existing sessions on other devices remain valid

**Severity:** Medium (security window)
**Journey:** Admin sets new password → User's old session on phone/browser still works until JWT expires

`admin.setUserPassword` replaces the password hash and sets `mustChangePassword: true`, but the existing JWT (valid for up to 1 hour) continues to authenticate. A stolen or compromised session isn't revoked.

**Fix options:**
- Accept the window (standard for JWT-based auth; short-lived tokens mitigate)
- Add a `sessionRevokedAt` timestamp on the user doc; check it in `currentUser` and `RequireAuth`

---

## J-04 — Diner can't send a gift after the booking time has passed but they haven't checked in yet

**Severity:** Low (edge case)
**Journey:** Booked for 8 PM → arrives at 8:15 PM → hasn't checked in → tries to send gift

`sendGift` calls `requireActiveTodayBooking`, which checks `booking.date === today` (correct) but doesn't check if the booking time has passed. The gift should work as long as the booking is confirmed and today. **No actual bug** — the time check isn't enforced, which is correct for the Socialize use case.

---

## J-05 — Socialize room disappears after midnight (local time) even though the diner is still at the restaurant

**Severity:** Medium (UX near midnight)
**Journey:** Late dinner → past midnight → Socialize room shows empty

Same root cause as BUG-04/07: `todayKey()` uses server UTC. A diner in EET (UTC+2/3) past midnight local time sees an empty Socialize room because the server thinks it's still "yesterday."

**Fix:** Use `resolveTodayKey(clientDate)` consistently (as socialize.ts already does for some calls).

---

## J-06 — Owner has no way to view the list of active diner guests (confirmed invitees) at a glance

**Severity:** Low (informational gap)
**Journey:** Owner manages bookings → wants to see who's at which table → only sees party size, not individual guest names

`bookings.byRestaurant` returns the booking but not the expanded guest list. The owner must click into each booking to see guests. **Improvement opportunity:** include `guests` in the owner query response.

---

## J-07 — Diner can't cancel an order after it moves to "preparing"

**Severity:** By design (kitchen can't undo prep)
**Journey:** Places order → order starts preparing → tries to cancel → blocked

`cancelOrder` only allows cancellation while `status === "open"`. Once the kitchen starts preparing, the diner is told to ask the team. This is correct behavior for a restaurant kitchen workflow.

---

## J-08 — Owner can't see when a diner last checked in across all bookings

**Severity:** Low (informational gap)
**Journey:** Owner wants to know which diners have arrived → checks each booking individually

`checkedInAt` exists on each booking but isn't surfaced in the owner's booking list view. **Improvement:** show a check-in badge/icon in the owner's booking table.

---

## J-09 — Admin "Tag owner" page doesn't show a list of existing tags

**Severity:** Low (discoverability)
**Journey:** Admin tags accounts → wants to review who's been tagged → no overview

The admin can see all users in the Users list (with role badges), but there's no dedicated "tagged owners" view or filter. The Users list with the "Owner" role badge serves this purpose, but it's not obvious.

---

## J-10 — Diner's favorites list doesn't show if a favorited restaurant is closed/permanently gone

**Severity:** Low (data staleness)
**Journey:** Favorites a restaurant → restaurant is deactivated (not currently possible, but future-proofing)

The `myFavorites` query does a live lookup per favorite, so if a restaurant is deleted, the favorite silently disappears (the `if (r) out.push(r)` guard handles it). No crash, but no user-facing explanation either.

---

## J-11 — Onboarding form doesn't pre-fill the phone from the auth account

**Severity:** Low (already fixed)
**Journey:** New diner signs up via OTP → lands on onboarding → phone field is empty

The `onboard` mutation auto-populates phone from the auth account if not provided. The onboarding form shows an empty phone input with "Optional — but booking confirmations by SMS need it." The phone is already stored from the OTP verification. **No actual issue.**

---

## J-12 — Multiple pending phone change requests can pile up

**Severity:** Low (cleaned up on new request)
**Journey:** User requests phone change → code sent → user requests again → first request deleted

`startPhoneChange` deletes any prior pending request before inserting a new one. This is correct behavior. **No bug.**

---

## J-13 — `mustChangePassword` redirect loop if role is missing

**Severity:** Medium (potential deadlock)
**Journey:** Restaurant owner with `mustChangePassword=true` → lands on `/set-password` → sets password → navigates to `/owner`

If `setPassword` succeeds but `mustChangePassword` isn't cleared (e.g., a network error after the mutation but before the UI update), the user would be stuck in a redirect loop: `/set-password` → `/owner` → (auth check) → `/set-password`.

**Fix:** The `SetPassword` page already checks `if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />`. But `user` is from the client-side `useAuth()` hook which may be stale. After a successful `setPassword`, force a refresh or navigate directly without re-rendering the check.

---

*All journey issues are categorized by severity. Items marked "Medium" should be addressed before production launch.*
