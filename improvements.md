# Kamix — Improvements Tracker

Status legend: **Todo** (not started) · **In progress** (being built) · **Done** (shipped & verified) · **Planned** (scoped, not started — needs API keys or future work)

---

# Security & Architecture Review (2026-08-20 — updated)

Full-code review performed as a super-architect / security expert pass. Findings
are graded **High / Medium / Low** and tied to the code. Items that shipped with
this review are marked **Done**; everything else is a recommendation.

## 1. Architecture assessment

**Strengths (what's already right):**

| Area | Assessment |
|------|------------|
| Single source of truth for availability | The `slots` ledger is the canonical count; every booking, cancel and guest-confirm mutates it inside one serializable Convex mutation, so the no-overbooking guarantee holds under 100+ concurrent requests. This is the right call — no cache, no client-side count. |
| FIFO booking queue | `bookingQueue` drains one entry per (restaurant, date, time) — fair and overflow-safe. The `test-backend` suite proves 4 diners on 2 seats ⇒ exactly 2 booked. |
| Realtime without a second transport | All live surfaces (availability, orders, pings, notifications) stream through Convex reactive queries. Evaluating (and rejecting) Socket.io was the correct decision — it would have added a second auth surface and fought the transactional model. |
| Server-side authz on every mutation | `requireOwner`, `isRestaurantOwner`, user-scoped queries (`by_user`, `by_owner`) are applied consistently; tests verify no data leaks (E-2: non-owner sees `[]`). |
| Centralized input validation | Zod schemas in `validation.ts` back every mutation (`parseOrThrow`), with the same error strings the UI/tests match. Wire types are enforced by Convex `v` validators. |
| Graceful feature degradation | Twilio SMS is a guarded no-op when keys are absent; demo ownership (claimDemo) is strictly scoped to seeded demo accounts. |
| Clean module boundaries | Domain files (bookings, waitlist, dining, socialize, notifications) each own one surface; helpers (`safeGet`) tolerate legacy/bare-identity rows instead of crashing. |
| **Admin role model** | Platform admin (`+96176683661`) is the only party allowed to register restaurants and tag accounts. Diner-only self-registration. Forced password change for restaurant accounts. Audit log tracks all admin actions. |
| **Rate limiting** | Database-backed per-user rate limiter (`rateLimits` table) applied to gift sends (20/hr) and all admin mutations (30–60/hr). |
| **Auth resilience** | OTP send has dual timeout protection: 10s AbortController on server-side Twilio fetch, 15s Promise.race on client-side signIn call. Stale closure bugs fixed with useRef. |

**Weaknesses / opportunities:**

| # | Finding | Grade | Recommendation | Status |
|---|---------|-------|----------------|--------|
| A-1 | **Self-serve owner role was an authorization hole.** Any signed-in user could onboard as `owner` and create restaurants. The role model now has a platform admin who is the **only** party allowed to register restaurants and tag accounts as restaurants. | High | Shipped: `admin.registerRestaurant` / `admin.tagAsRestaurant` (admin-only), diner-only onboarding, `claimDemo` promotes to owner. | **Done** |
| A-2 | **No forced password change after admin-issued temporary passwords.** An admin-created owner could keep the temp password forever. | Medium | Shipped: `users.mustChangePassword` flag + `/set-password` flow enforced in `resolveTarget`, `Dashboard` and `SetPassword` page. | **Done** |
| A-3 | Convex actions with `use node` must live alone; helpers like `safeGet` return `null` on invalid ids. Fine as-is, but a stricter `DataModel` would catch more at compile time. | Low | Keep; consider enabling `schemaValidation` incrementally (currently `false` for auth-table flexibility). | Todo |
| A-4 | `bookings.byCode` returns the booking + restaurant to **any** signed-in caller (invite flow). Acceptable for invites, but PII (guest names) is exposed via a guessable 6-char code. | Medium | Rate-limit `byCode` lookups and/or require the inviter's session; consider showing names only after the guest confirms. | Todo |
| A-5 | Restaurant search does a full `collect()` + in-memory filter for cuisine/city/seat/dietary. With the 50-restaurant cap this is fine today, but it won't scale to thousands of venues. | Low | Move filtering into the search index (filterFields already exist) and paginate with `paginate` instead of `collect`. | Planned |
| A-6 | `stats` (insights) scans all bookings for a restaurant then filters by window; fine for demo scale. | Low | Add a `date` range index + `paginate` when datasets grow. | Planned |
| A-7 | Invite codes use a 31-char alphabet (no `0/O/1/I`); 6 chars ⇒ ~887M combos — good. `generateCode` uses `crypto.getRandomValues`. No change needed. | — | None. | — |
| A-8 | Secrets (Twilio) live in the Convex env + `.env`. New API key provided but still returns **401** on message send — likely lacks write permissions. | High | Regenerate API key with **Full Access** permissions, or provide the Auth Token. | Todo |

## 2. Authentication & session security

| ID | Finding | Grade | Status |
|----|---------|-------|--------|
| A-9 | Phone-OTP with 6-digit codes, 15-min expiry, hashed at rest (`sha256` in `authVerificationCodes`) and 1M-combination space. Codes are rate-limited by the auth library (`isSignInRateLimited`). | — | **Good** — but see S-4 (SMS delivery) and S-5 (OTP brute-force window). |
| A-10 | Passwords hashed with **Scrypt** (lucia) via the Password provider — memory-hard, per-instance salt. | — | **Good.** |
| A-11 | JWT access tokens + rotating refresh tokens (`authRefreshTokens`), sessions invalidated on password reset (`invalidateSessions`). | — | **Good.** |
| A-12 | Password reset (`flow: reset` / `reset-verification`) wired through a `password-reset` phone provider sharing the OTP sender — no new SMS surface. | Medium | **Done** |
| A-13 | `users.setPassword` verifies the current password when one exists before rotating — prevents stale-session password theft. | — | **Done** |
| A-14 | No 2FA, no passkeys, no account-recovery beyond SMS. Acceptable for v1 (SMS OTP is already the 2nd factor). | Low | Optional: TOTP for admin accounts. | Planned |
| A-15 | **OTP infinite loop (fixed).** `handleSendOtp` called `setStep()` after `signIn`, creating a new object reference that re-triggered the auto-send `useEffect`, causing an infinite loop where `isLoading` stayed `true` forever. Fixed by removing the redundant `setStep` call and adding `otpSentRef`. | High | **Done** |
| A-16 | **Stale closure in auto-send effect.** `handleSendOtp` captured stale `step` via closure when called from the `useEffect`. Fixed by using `useRef` for the phone value and `useCallback` with proper dependencies. | Medium | **Done** |
| A-17 | **No timeout on Twilio fetch.** `sendOtpSms` had no timeout on `fetch()` — a hung Twilio connection could block the Convex action indefinitely. Fixed with 10s `AbortController` on server + 15s `Promise.race` on client. | High | **Done** |

## 3. Non-functional requirements review

### Security (NFR-S)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| S-1 | RBAC: every mutation verifies caller identity; restaurant writes verify `ownerId === caller`; bookings readable only by owner or diner; notifications by owner. | ✅ **Good** | Verified in code (`requireOwner`, `isRestaurantOwner`, `by_user` indexes) and by the test suite (E-2, C-9, H-8). |
| S-2 | Input validation on every public mutation. | ✅ **Good** | Zod + Convex validators. |
| S-3 | No secrets in client bundle. | ✅ **Good** | `VITE_CONVEX_URL` only; Twilio reads server-side env. |
| S-4 | SMS delivery actually works in production. | ❌ **Broken** | Twilio API key returns 401 on message send — likely lacks write permissions. **Regenerate key with Full Access or provide Auth Token.** |
| S-5 | OTP brute-force window. | ⚠️ **Partial** | Auth-library rate limiting exists, but verify the effective limit; 6 digits is brute-forceable offline only if the DB leaks — hashing prevents that. |
| S-6 | Kill-switch honored. | ✅ **Done** | `phoneOtp.ts` now respects `TWILIO_ENABLED` kill-switch, matching `sms.ts`. |
| S-7 | Admin account protection. | ✅ **Done** | Re-claim blocked when already admin. Audit log (`adminAuditLog` table) records all admin mutations. |
| S-8 | Abuse: rate limiting on public endpoints. | ✅ **Done** | `rateLimits` table + `checkRateLimit()` utility. Applied to `sendGift` (20/hr) and admin mutations (30–60/hr). |
| S-9 | **`onboard` mutation accepts OWNER role.** The Convex validator still allows `v.union(v.literal(ROLES.CUSTOMER), v.literal(ROLES.OWNER))`, so a malicious client could call `onboard` with `role: "owner"` directly, bypassing the admin-only restriction. The UI always sends `"customer"`, but the backend doesn't enforce this. | Medium | **Done.** Restricted to `v.literal(ROLES.CUSTOMER)` only. Owner/admin roles are set exclusively by admin mutations. | **Done** |
| S-10 | **Temporary password visible in plaintext.** `Admin.tsx` RegisterRestaurant form shows the temp password in `type="text"` input. Anyone looking over the admin's shoulder can see it. | Low | **Done.** Both Register and Tag forms now use `type="password"` with Eye/EyeOff toggle. | **Done** |
| S-11 | **SetPassword page always shows "Current password" field.** For OTP-only users tagged as restaurant (no password account yet), the field is shown but not required by the backend. The UI marks it `required`, which is confusing. | Low | **Done.** SetPassword queries `hasPasswordAccount` and hides the field when no password account exists. | **Done** |

### Performance & scalability (NFR-P)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| P-1 | No-overbooking under concurrency. | ✅ **Pass** | 100-seat concurrent booking test in `tests.md`; atomic slot decrement. |
| P-2 | Search latency. | ⚠️ | Full scan + in-memory filter for non-search filters (A-5). Fine at 50 restaurants. |
| P-3 | Real-time streams. | ✅ | Convex reactive queries; no polling. |
| P-4 | Image delivery. | ⚠️ | Menu photos resolve storage URLs per query — cacheable, but add CDN + `Cache-Control` headers. | Planned |
| P-5 | SMS fan-out. | ✅ | Scheduled actions (`scheduler.runAfter`) never block mutations. |
| P-6 | **Rate limits table grows unbounded.** Old `rateLimits` rows are never cleaned up. At scale, this table will accumulate millions of stale rows. | Low | Add a Convex cron job to delete rows older than 24 hours, or add a TTL index. | Planned |

### Reliability & availability (NFR-R)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-1 | Idempotent check-ins / order flows. | ✅ | `checkedInAt` idempotent (H-1); guest-confirm rejects duplicates (G-2). |
| R-2 | Graceful degradation without external services. | ✅ | Twilio no-op, demo data retrofit, error boundary in `main.tsx`. |
| R-3 | Backups / DR. | ⚠️ | Convex-managed; no export schedule. Add `npx convex export` cron. | Planned |
| R-4 | Deploy pipeline. | ✅ | `web-hosted.sh` preflight-checks backend reachability; Render blueprint + Docker exist. |

### Maintainability (NFR-M)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| M-1 | Single validation source. | ✅ | `validation.ts`. |
| M-2 | Type safety across the stack. | ✅ | `tsc -b` clean; `_generated` bindings. |
| M-3 | Test coverage. | ✅ | Backend suite P1–P4 (77 tests) + UI-flow suite (31). A-1…A-5 remain manual (browser). |
| M-4 | Documentation. | ⚠️ | README + docs/ good; new admin role needs a short ops doc (add to README). | Todo |
| M-5 | Auth conventions doc. | ✅ | README "Using Authentication" section; do-not-modify list for auth files. |

### Usability & accessibility (NFR-U)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| U-1 | Mobile-first. | ✅ | All pages mobile-responsive; OwnerShell max-w-2xl. |
| U-2 | Toasts for every result. | ✅ | Sonner used throughout. |
| U-3 | Accessibility. | ⚠️ | Buttons have aria-labels where icon-only; color contrast + focus rings should be audited with a screen reader. | Todo |

### Privacy & compliance (NFR-Priv)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| Pv-1 | PII minimization. | ⚠️ | Bookings store name/phone/email — needed for SMS. Guest names exposed via invite codes (A-4). Add data-retention policy + export/delete endpoint (`users:deleteAccount`). | Todo |
| Pv-2 | GDPR-style erasure. | ⚠️ | No account-deletion endpoint. Add `users:deleteAccount` (cascade bookings/orders, keep restaurant data for owner accounts). | Planned |
| Pv-3 | Logging of auth events. | ✅ **Done** | `adminAuditLog` table with `by_admin` index. Every admin mutation writes an audit entry. |

## 4. Role model & auth flow (current state)

### Roles

| Role | How assigned | Permissions |
|------|-------------|-------------|
| **Platform admin** | Phone `+96176683661` claims via `admin:claimPlatformAdmin` (one-time bootstrap) | Register restaurants, tag accounts as owner, view audit log, view any restaurant |
| **Restaurant owner** | Created/tagged exclusively by admin | Manage own restaurant, view bookings, menu, orders, insights |
| **Customer (diner)** | Self-registers via app (`/auth` → OTP → onboarding) | Browse, book, order, socialize, reviews |

### Login flow

```
1. Enter phone number
2. hasPasswordAccount query fires
   ├── Has password account → Password login screen
   │   ├── Sign in with password → post-login redirect
   │   └── Forgot password? → SMS OTP → verify → set new password
   └── No password account → Auto-send OTP (with 15s timeout)
       ├── Enter 6-digit code → verify → OTP login
       └── Optional: "Set a password" screen (skip or save)
```

### Post-login redirect

```
mustChangePassword → /set-password (forced)
role: admin       → /admin
role: customer    → /explore
role: owner       → /owner
fresh (no role)   → Diner onboarding (name + phone)
```

### Registration flow (diner)

```
1. /auth → Enter phone → OTP sent
2. Verify OTP → signed in (no role yet)
3. Dashboard shows onboarding: name + phone
4. onboard({ role: "customer", name, phone })
5. Redirect to /explore
```

### Restaurant registration (admin-only)

```
1. Admin logs in → /admin
2. "Register restaurant" tab:
   - Owner name, phone, temp password
   - Restaurant name, cuisine, city, address, features
3. admin:registerRestaurant → creates:
   - User doc (role: owner, mustChangePassword: true)
   - Password auth account (temp password)
   - Restaurant doc + default section
   - Audit log entry
4. Owner logs in with temp password → forced to /set-password
5. Owner sets new password → can use the app
```

### Account tagging (admin-only)

```
1. Admin logs in → /admin
2. "Tag owner" tab:
   - Existing account phone
   - Optional: owner name, temp password
3. admin:tagAsRestaurant → sets:
   - role: owner, mustChangePassword: true, onboarded: true
4. admin:ensureOwnerPassword → creates password account if none exists
5. Owner logs in → forced to /set-password
```

## 5. New findings (this review cycle)

| # | Finding | Grade | Recommendation | Status |
|---|---------|-------|----------------|--------|
| N-1 | **OTP infinite loop.** `handleSendOtp` called `setStep()` after `signIn`, creating a new object reference that re-triggered the auto-send `useEffect`. UI stuck on "Sending code..." forever. | High | Removed redundant `setStep` call; added `otpSentRef` to prevent double-sends. | **Done** |
| N-2 | **Stale closure in auto-send effect.** `handleSendOtp` captured stale `step` via closure when called from `useEffect`. | Medium | Used `useRef` for phone value + `useCallback` with proper dependencies. | **Done** |
| N-3 | **No timeout on Twilio fetch.** `sendOtpSms` had no timeout — a hung connection blocked the auth action indefinitely. | High | Added 10s `AbortController` on server + 15s `Promise.race` on client. | **Done** |
| N-4 | **`onboard` accepts OWNER role.** Convex validator allows `role: "owner"` in the `onboard` mutation, so a malicious client could self-promote to owner. | Medium | Restrict to `v.literal(ROLES.CUSTOMER)` only. | Todo |
| N-5 | **Temp password in plaintext.** Admin.tsx shows temp password in `type="text"` input. | Low | Change to `type="password"` with show/hide toggle. | Todo |
| N-6 | **SetPassword always shows "Current password".** Confusing for OTP-only users who have no password account. | Low | Conditionally hide field when no password account exists. | Todo |
| N-7 | **Rate limits table grows unbounded.** Old rows never cleaned up. | Low | Add Convex cron to delete rows older than 24h. | Planned |
| N-8 | **Unused AuthStep variant.** `\| { phone: string; mode: "otp"; verified: true }` is defined but never set anywhere. | Low | Remove dead type variant. | Todo |

---

# Feature & Platform Tracker

Status legend: **Todo** (not started) · **In progress** (being built) · **Done** (shipped & verified) · **Planned** (scoped, not started — needs API keys or future work)

## Tier 1 — Core enrichment (no external services)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-01 | Reviews & ratings | Verified-booking 1–5 star reviews + text on restaurant pages; average rating shown on search cards and detail; review entry from My Bookings. | **Done** |
| I-02 | Diner dining profile | Dietary preferences, seating vibe, occasions and favorite restaurants saved to the profile; pre-fills bookings; "For you" section in Explore. | **Done** |
| I-03 | No-show mitigation | Per-restaurant cancellation policy ("free until X hours before"), SMS reminder the day before the booking, no-show tracking. | **Done** |
| I-04 | Owner analytics / insights | Occupancy, covers, no-show & cancellation rates, busiest times, waitlist conversion — new Insights tab. | **Done** |
| I-05 | Dietary search | Filter restaurants by menu tags (vegetarian, vegan, gluten-free, halal…) — search uses the menu attribute data. | **Done** |
| I-06 | Group invites | Share a booking link; friends confirm their seat and the party grows atomically (never overbooks). | **Done** |
| I-07 | Solo-friendly flag + bar-seat shortcut | "Solo-friendly" amenity with filter, plus a one-tap "Book a bar seat" quick action. | **Done** |
| I-08 | Dine-in: confirm arrival | Diner taps "I'm here" on the day of the booking; `checkedInAt` recorded (idempotent); owner's Bookings tab shows the party as **Checked in** live. | **Done** |
| I-09 | At-the-table ordering | Diner orders from the restaurant's live menu inside the booking — no assistant needed. Kitchen status flow (open → preparing → served → completed) with live owner view. | **Done** |
| I-10 | Waiter/manager ping with templates | One-tap request templates (water, bill, order, other) + free text ping the restaurant; owner sees it live and marks it resolved (with timestamp). | **Done** |
| I-11 | Off-menu / special requests | Diner asks for anything not on the menu; the restaurant sees it in a dedicated Requests tab and can mark it fulfilled. | **Done** |
| I-12 | Itemized bill at the table | Persistent itemized bill per booking (lines, quantities, totals, paid flag). Payment via Stripe is the Tier-2 I-20 item — the bill is already shaped for it. | **Done** |
| I-13 | Journey continuity (date carry-over) | Selected date + party size carry over from search into the restaurant detail booking sheet — the date is never asked twice. | **Done** |
| I-14 | Menu ingredients + order customization | Restaurants define each dish's ingredients in the menu editor (chips in the item form). Diners customize at the table — leave any ingredient out (validated against the restaurant's list) and add per-line instructions; the kitchen's order view and the itemized bill both carry the customization. Seed demo items now ship ingredient lists. | **Done** |
| I-15 | Socialize room | Diner-to-diner space next to booking: appear/invisible on the day of a visit, live "who's dining" room, and send drinks/desserts from the restaurant's gift catalog — charged to the sender's bill, revealed now or as a delivery surprise. Owner Gifts tab manages the catalog and the prepare/deliver queue; demo venues ship gift catalogs (seed + retrofit). | **Done** |

## Tier 2 — Needs API keys (payments / notifications / AI)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-20 | Pay-at-table & deposits (Stripe) | Diner pays the itemized bill at the table; owner-configurable deposits or prepaid seatings (Tock-style) with refunds; kills no-shows. | Planned |
| I-21 | Push notifications | Booking reminders, waitlist alerts, and dine-in pings beyond SMS (web push / app push). | Planned |
| I-22 | AI dining concierge | Chat-to-book assistant ("table for 4 near Duomo, no shellfish") + owner AI daily brief. | Planned |

## Tier 3 — Later roadmap

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| I-30 | QR menu at the table | Menu at the table via QR, live updates (specials, sold-out items). | Planned |
| I-31 | Loyalty program | Points per visit, rewards, and repeat-diner perks. | Planned |
| I-32 | Private dining & events | Large-party and private-room booking requests. | Planned |
| I-33 | Table floor plans | Visual table map with per-table booking. | Planned |
| I-34 | Multi-language (i18n) | UI + booking flows in multiple languages. | Planned |
| I-35 | POS integration | Two-way sync with restaurant POS systems. | Planned |

## Production readiness — realtime & scale

| ID | Decision | Rationale | Status |
|----|----------|-----------|--------|
| I-40 | Realtime event service = Convex reactive queries | Every live surface (availability, bookings, orders, waiter pings, off-menu requests, notifications) already streams through Convex's built-in realtime subscriptions — the app's event bus. **Socket.io was evaluated and rejected**: it would add a second transport + auth surface with no benefit, fights Convex's optimistic-concurrency model, and cannot scale the write side (atomic no-overbooking guarantees stay in Convex mutations). | **Done** (architecture) |
| I-41 | Scale path to millions of users | Convex serverless autoscaling + regional deployments; DB sharding by city/region (restaurants are naturally partitionable); CDN for static assets; rate limiting + abuse protection on public endpoints; background job queues (SMS/push/email via Convex cron + queue); read replicas for search; pagination + `withIndex` discipline already in place. See the load-test scenario in `tests.md` for the 100-seat concurrent-booking guarantee. | Planned |
| I-42 | Observability | Structured logging per request, error tracking, latency alerts on booking mutations, dashboard for slot-consistency (no-overbooking) enforcement. | Planned |
