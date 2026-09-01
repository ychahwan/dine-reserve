# Solar — Auth, Login, Token & Password Audit

**Project:** Kamix (Convex + React + Capacitor mobile app)
**Scope:** Authentication, login flows, session/token validation, password handling, related performance/security issues.
**Date:** 2026-08-31
**Audience:** whoever owns the mobile app security + auth correctness.

## 1. What this doc covers

- Every login path the app currently supports.
- How the app validates tokens/sessions.
- How password validation and password lifecycle work.
- Concrete security issues and performance issues found by reading the code.
- What I checked in the E2E tests and what is still missing.

This doc is based on reading the actual source, not assumptions:
- `src/convex/auth.ts`
- `src/convex/auth/passwordAuth.ts`
- `src/convex/auth/phoneOtp.ts`
- `src/convex/auth.config.ts`
- `src/convex/users.ts`
- `src/convex/admin.ts`
- `src/convex/erasure.ts`
- `src/convex/sms.ts`
- `src/convex/twilio.ts`
- `src/convex/settings.ts`
- `src/convex/rateLimit.ts`
- `src/convex/schema.ts`
- `src/hooks/use-auth.ts`
- `src/pages/Auth.tsx`
- `src/pages/Account.tsx`
- `src/pages/SetPassword.tsx`（mustChangePassword 强制改密专用页）
- `src/components/RequireAuth.tsx`
- `e2e/auth.spec.ts`
- `e2e/account-switching.spec.ts`
- `e2e/auth-extended.spec.ts`（见 11.3）

---

## 2. Login methods currently implemented

### 2.1 Phone OTP login (primary, first-time + OTP-only users)

Flow:

1. User enters phone.
2. Frontend calls `api.users.checkPhoneAccount`.
3. If the phone has a password account, the UI goes to the password step.
4. Otherwise the UI auto-sends an OTP and goes to the OTP verification step.
5. OTP is a 6-digit numeric code, generated with `crypto.getRandomValues` via `@oslojs/crypto/random`.
6. OTP is sent through Twilio.
7. Verification happens inside `@convex-dev/auth`'s Phone provider.
8. After first OTP login, the app offers a "set password" step.

Good parts:

- OTP generation uses the crypto RNG, not `Math.random`.
- OTP send is rate-limited both per-phone and globally in `checkOtpSendRateLimit`.
- OTP sending is centralized through `sendTwilioMessage`.
- Twilio has a 10-second abort timeout in `sendTwilioMessage`.

### 2.2 Password login (phone + password)

Flow:

1. User enters phone.
2. Frontend asks `checkPhoneAccount`.
3. If a password account exists, the UI shows the password screen.
4. `signIn("password", formData)` is called.
5. Password provider is mapped to phone in `passwordAuth.ts`.

Good parts:

- Password accounts are stored under the normalized phone.
- Password reset also routes through the phone OTP channel.
- Wrong password does not reveal whether the phone exists in the password flow — the router check is separate.

### 2.3 Password reset (`forgot password`)

Flow:

1. From the password screen, user starts reset.
2. `signIn("password", { phone, flow: "reset" })` sends a reset OTP.
3. Then `signIn("password", { phone, flow: "reset-verification", code, newPassword })` verifies and sets the new password.

Comment in the code explicitly says the library types only expose `EmailConfig` for `reset`, but the app casts it to `Phone` and dispatches at runtime. That is the kind of thing that can break if the library changes, so it is worth watching.

### 2.4 Forced password set for newly tagged restaurant accounts

- Admin can register/tag owners.
- Those accounts get `mustChangePassword = true`.
- Auth callback `afterUserCreatedOrUpdated` blocks sign-in if user is disabled.
- Account page shows forced password flow for users with no existing password account.

### 2.5 Platform admin bootstrap

- `claimPlatformAdmin` is phone-based.
- It checks that one of the user's verified auth accounts matches `PLATFORM_ADMIN_PHONE`.
- It refuses re-claim if already admin.
- It audits the action.

---

## 3. Token and session validation

What the code does:

- Convex Auth issues JWTs from the deployment.
- `auth.config.ts` configures the self-issued provider using `CONVEX_SITE_URL`.
- Session + refresh-token invalidation is implemented manually in `invalidateUserSessions`.
- `RequireAuth` checks:
  - `isAuthenticated`
  - `user?.disabled`
  - `user === null` (orphaned session)

Good parts:

- Disabling a user calls `invalidateUserSessions`, so the lock is not only "next time the JWT expires".
- `RequireAuth` handles the case where the session is alive but the user doc is gone, and also the case where the user was disabled while a session was still valid.
- Admin password reset calls `invalidateUserSessions` too.

Things to verify against the real Convex Auth runtime:

- Token lifetime / refresh behavior is largely from `@convex-dev/auth`, not custom code here.
- The app's own defensive code is good, but I cannot re-run the provider's token issuance/validation here because that needs a live Convex deployment.

So the token validation story is mostly "Convex Auth handles it; the app adds client/backend guards on top". That is a reasonable architecture, but it means some security properties are inherited from the library and its deployment config.

---

## 4. Password validation

What the app enforces:

- `setPassword`, `setUserPassword`, `registerRestaurant`, `createUser`, `ensureOwnerPassword` all require `>= 8` characters.
- `Account.tsx` enforces client-side length + confirmations before calling the backend.
- Password reset enforces length too.

What the app does **not** obviously enforce in the code I read:

- No obvious password complexity policy beyond length.
- No obvious password breach-check or strength meter on the backend.
- No obvious password history constraint.
- `Account.tsx` disables the password submit button when `password.length < 8`, but that is client-only; the real gate is the backend mutation.

That is not necessarily wrong for a phone-OTP-first app, but if the product wants stronger passwords, the rule should live server-side.

---

## 5. Security issues and concerns

### 5-1. Pre-auth account enumeration oracle exists

File: `users.ts` — `checkPhoneAccount`, `hasPasswordAccount`

What I see:

- `checkPhoneAccount` is a public mutation that tells the caller whether a phone has a password account.
- The code explicitly documents this as an accepted tradeoff (`SEC-04`).
- It does rate-limit the check to 20/hour per phone.

Risk:

- An attacker can still probe whether a phone is "password-enabled" vs "OTP-only".
- That is not full credential enumeration, but it is account-presence information.

Mitigation already in place:

- Normalization before lookup.
- Rate limit on the check itself.
- Password/OTP attempts are separately rate-limited by the auth library.

If you want to close it fully, the tradeoff is losing the password fast path and forcing OTP for everyone. That is a product decision, not a pure security fix.

### 5-2. Phone format enforcement is slightly inconsistent across paths

Files: `users.ts`, `sms.ts`, `twilio.ts`, `Account.tsx`

What I see:

- `users.ts` normalizes and validates phone in several places.
- `sms.ts` uses a stricter E.164 regex for SMS destinations.
- `twilio.ts` also does its own cleaning and E.164-like validation.
- `Account.tsx` uses placeholder text like `+961 71 123 456` and passes user input through backend mutations.

Risk:

- If one path accepts a looser format and another rejects it, you can get confusing validation errors or, worse, an identity stored in a non-canonical form.
- The codebase has already had this issue historically — `backfillPasswordAccounts` exists to canonicalize legacy password/phone-otp account ids.

This is more of a correctness/maintenance risk than an obvious exploit, but canonical identity handling is exactly where auth bugs hide.

### 5-3. OTP brute-force protections are present but should be audited end-to-end

Files: `rateLimit.ts`, `users.ts`, `auth/phoneOtp.ts`

What I see:

- `confirmPhoneChange` and `deleteAccount` both throttle OTP verification attempts with `checkRateLimit`.
- OTP send is rate-limited per-phone and globally for the send side.
- `@convex-dev/auth` has its own `authRateLimits` behavior for verification attempts.

Risk:

- 6-digit OTP is brute-forceable if verification is not throttled well.
- The app does throttle several verification paths, which is good, but the actual OTP verification inside Convex Auth is part of the library runtime.
- The app's extra throttles are a good defense-in-depth layer, not a replacement for the library's limits.

This is one of those things that should be exercised against a real deployment, not just read statically.

### 5-4. Password reset path has a library/types mismatch comment

File: `auth/passwordAuth.ts`

What I see:

- `reset` is wired through `Phone(...) as never`.
- The code explains that library types only expose `EmailConfig`, but runtime dispatch works for Phone.

Risk:

- This is an explicit type deception.
- It works now, but it is fragile if the library's reset contract tightens.
- It is not an obvious hack, but it is the kind of thing that can silently degrade if dependencies change.

If password reset is a core flow for a mobile app, I would test the reset OTP + verification path against real SMS if possible, or at least against the library's current shape.

### 5-5. Settings/secrets handling is good, but the app still trusts runtime DB + env

File: `settings.ts`, `twilio.ts`

What I see:

- Admin-only setting mutation and masked listing.
- Default-deny masking: only `PUBLIC_KEYS` are shown verbatim.
- Secrets can be stored as `env:VARIABLE_NAME` references.
- Twilio config prefers API Key auth over main auth token when present.

Good:

- This is a strong pattern for rotating secrets without redeploying.

Concerns:

- `appSettings` values are plaintext in the DB.
- Access control depends on the admin role check in `setSetting` / `listSettings`.
- If there is any admin-account compromise or admin-function bug, secrets are exposed.

There is no obvious equivalent of "encrypt secrets at rest" here, which is normal for this kind of managed backend, but it means the admin surface is security-critical.

### 5-6. Admin bootstrap is phone-based and deployment-specific

File: `admin.ts`

What I see:

- `PLATFORM_ADMIN_PHONE = "+96176683661"` is hardcoded.
- Claiming admin requires owning that phone in a verified auth account.

Risk:

- Hardcoded platform admin phone is fine as a bootstrap mechanism, but it should be treated as sensitive configuration.
- If this number is not actually controlled by the operator, the whole admin model is meaningless.

I would not call this a bug by itself, but it is a critical secret/identity assumption.

### 5-7. RequireAuth edge cases are handled well, but the app still depends on client-side session state

File: `RequireAuth.tsx`, `hooks/use-auth.ts`

What I see:

- Good handling for:
  - disabled user still holding a session
  - orphaned session where user doc is null
- `useAuth()` combines auth state and user query.

Risk:

- Client-side auth state can be stale for a moment.
- The app mitigates with backend role/account checks in mutations, which is the right place for real security.
- Any mobile-specific concern is more about how the Convex client persists/restore auth state across app backgrounds, kills, and installs.

That is not something I can fully assess from source alone; it depends on the Capacitor/mobile lifecycle and Convex client storage behavior.

---

## 6. Performance issues and concerns

### 6-1. Rate-limit table can grow if pruning does not keep up

File: `rateLimit.ts`

What I see:

- Rate-limit rows are created per key + window.
- `pruneOldLimits` removes rows older than 48 hours.
- OTP send rate limiting uses both per-phone and global buckets.

Concern:

- If cron/pruning is delayed or disabled, stale windows accumulate.
- The limiter itself only queries the current window, so old rows are overhead, not correctness bugs.

This is a maintenance/performance issue more than a live failure path, assuming pruning runs.

### 6-2. `pruneOldLimits` collects all old rows before deleting

File: `rateLimit.ts`

What I see:

- The prune query collects matching rows, then deletes in a loop.

Concern:

- For a very large rate-limit table, collecting then deleting could be heavy.
- A batched/scheduled prune can be safer than one big collect.

Not a blocking issue unless the table grows large.

### 6-3. Auth router check is cheap, but it is an extra round trip on every login start

File: `users.ts`, `Auth.tsx`

What I see:

- `checkPhoneAccount` does an indexed query on `authAccounts`.
- The frontend calls it to decide password vs OTP.

Concern:

- This is fine for a single user, but it is still a separate mutation before the real sign-in.
- Under load or on slow mobile networks, that adds latency to the login start.

This is a UX/performance tradeoff, not a serious performance bug. The code already uses it intentionally to reduce reactive enumeration.

### 6-4. Some admin queries paginate, others historically did not

File: `admin.ts`

What I see:

- `auditLog` is paginated and filtered server-side.
- Other admin paths use direct reads and rate limits.

Good:

- The audit log pagination comment is explicit about avoiding a bad `take(500)` approach.

No obvious performance issue here beyond normal admin-use scaling.

### 6-5. Cascade deletes are batched, which is good

File: `erasure.ts`, `admin.ts`

What I see:

- `bulkDeleteUsers` and `bulkDeleteUsersStep` split work into batches.
- `cascadeDeleteUser` and `cascadeDeleteRestaurant` delete related rows in bulk.

Good:

- This avoids giant synchronous cascades.

Concern:

- Cascades still touch a lot of tables; heavy deletion workloads should be scheduled and monitored rather than triggered inline by a user action under load.

---

## 7. Login correctness issues I found

### 7-1. Ownership transfer during password account creation can surprise the frontend

File: `users.ts`, `auth/passwordAuth.ts`, `Auth.tsx`

What I see:

- `setPassword` and admin mutations use `shouldLinkViaPhone: true` when creating a password account.
- That can link to an existing user instead of creating a new one.
- The frontend has an explicit comment about this in `Auth.tsx`: setting password after OTP login must use `users.setPassword`, not a second `signIn("password", signUp)`, because the latter could create a separate empty user.

Good:

- The frontend already knows about this trap and avoids it.

Concern:

- This is exactly the area where a future developer could reintroduce a double-account bug.
- It should stay documented and covered by tests.

### 7-2. OTP send + verify state machine in `Auth.tsx` is careful, but still depends on timing

File: `Auth.tsx`

What I see:

- OTP send uses a generation counter, a timeout, and a ref-based duplicate-send guard.
- The UI avoids letting a stale send clobber newer state.

Good:

- This is a strong client implementation for a flaky SMS path.

Concern:

- SMS delivery can be slow or nondeterministic.
- If Twilio is misconfigured or disabled, the OTP path behavior matters a lot for login success.
- In `twilio.ts`, misconfiguration returns a graceful no-op rather than throwing, which is good for not breaking everything, but it can also make login fail in a way that looks generic unless the UI surfaces the exact case.

### 7-3. `safeReturnTo` is good, but only covers same-origin redirect safety

File: `Auth.tsx`

What I see:

- `safeReturnTo` rejects `/\/[^/\\]/` forms.
- This blocks scheme-relative and backslash tricks.

Good:

- This is a real redirect-safety check.

Concern:

- It only guards `returnTo`-style routing.
- If the app ever builds redirect URLs from other user input, the same class of bug could reappear there.

### 7-4. Account deletion OTP verifies ownership of the login identity

File: `users.ts`

Good:

- Self-delete sends OTP to the user's own phone before wiping.
- That is the right direction for a sensitive operation.

Concern:

- If a user's phone was already changed or compromised, deletion still depends on that channel.
- The app does try to prove current control, which is the important part.

---

## 8. What the E2E tests cover, and what they do not

What is covered:

- `auth.spec.ts`:
  - Auth page loads
  - Phone routes to password for an existing account
  - Password login works for admin
  - Wrong password shows an error
  - Back button returns to phone entry
  - Empty phone prevents submission
  - Brand logo visible
  - Submit disabled with short password

- `account-switching.spec.ts`:
  - Login as customer -> sign out -> login as owner lands on `/owner`
  - Login as owner -> sign out -> login as customer lands on `/explore`

What is not obviously covered:

- OTP send + verify as a complete login path
- Password reset request + verification + new password login
- Forced password change for a tagged owner
- Phone change flow
- Account deletion flow
- Disabled-account behavior after session invalidation
- Rate-limit behavior under repeated attempts
- Twilio-disabled / no-SMS behavior on login

So the app's login tests are real but narrow. For a mobile app where login is the main gate, the OTP and reset paths deserve their own E2E coverage.

> **Update:** the gaps below OTP login, password reset, forced password change,
> phone change, account deletion, and disabled-account behavior are now covered
> by `e2e/auth-extended.spec.ts` — see Section 11.3. Still open: rate-limit
> behavior under repeated attempts, and Twilio-disabled/no-SMS login behavior.

---

## 9. Recommendations

### Security

1. **Decide intentionally about the enumeration tradeoff.**
   If you want the strictest posture, force OTP for every login and remove the password fast path. If you want the fast path, keep the current rate-limited router but acknowledge the leak.

2. **Keep OTP verification throttling defense-in-depth and test it.**
   Make sure:
   - per-phone verification limits are actually enforced by the auth library runtime
   - the app's extra throttles are not the only protection

3. **Treat password reset as a core flow and test it end-to-end.**
   Because `reset` is wired through a cast Phone provider, I would not assume it is stable just because it looks correct in source.

4. **Protect the admin surface aggressively.**
   - Platform admin phone is effectively a root secret.
   - Admin settings store secrets in plaintext in the DB.
   - Any admin-account compromise is severe.

5. **Enforce password rules server-side if you want more than length.**
   Today the only visible server rule is `>= 8` characters.

6. **Keep identity canonical everywhere.**
   The existence of `backfillPasswordAccounts` is a strong hint that canonical phone normalization is important and historically imperfect.

### Performance

7. **Make sure rate-limit pruning is actually scheduled and monitored.**
   If it slips, the rate-limit table grows unnecessarily.

8. **Watch heavy cascades under load.**
   Cascades are batched, which is good, but deletion-heavy admin work should still be treated as background work, not instant user-facing work at scale.

9. **Expect SMS latency on login.**
   The OTP UI is good, but mobile login will still be sensitive to Twilio delivery speed and to the kill-switch configuration.

### Testing

10. **Add E2E coverage for:**
    - OTP login
    - password reset flow
    - phone change
    - account deletion
    - disabled-user session behavior
    - Twilio-off behavior
    - repeated failed login / OTP attempts

---

## 10. Bottom line

The auth design is solid for a phone-OTP-first app:

- OTP generation is cryptographically random.
- SMS sending is centralized and timeout-bounded.
- Several sensitive mutations are rate-limited.
- Session invalidation is implemented for disable, password reset, and deletion.
- Settings masking is default-deny.
- Frontend knows about the password-account linking trap and avoids it.

The main things to tighten are:

- the intentional pre-auth enumeration channel
- the password-reset provider wiring, which is clever but fragile-looking
- the dependence on the runtime library for token/OTP-verification behavior
- test coverage for the non-password login paths

## 11. What I added to make the auth flows rerunnable

I added a test harness so the OTP, reset, phone-change, and account-deletion
flows can be run headlessly and deterministically.

### 11.1 Test SMS recording mode

- `src/convex/twilio.ts` now has a `KAMIX_E2E_SMS_MODE=record` switch.
  When active, `sendTwilioMessage` records OTP codes in memory instead of
  sending them over the network.
- `src/convex/sms.ts` exposes two internal helpers:
  - `internal.sms.lastOtpForTest` — returns the last recorded OTP for a phone
  - `internal.sms.clearRecordedOtps` — wipes the recorded OTP store
- Both helpers are inert unless `KAMIX_E2E_SMS_MODE=record` is set, so
  production deployments are unaffected.

### 11.2 New test users

`e2e/global.setup.ts` now creates additional test phones for the extended
scenarios:

- OTP-only test user
- password-reset test user
- phone-change test user
- account-deletion test user

### 11.3 New E2E scenarios

`e2e/auth-extended.spec.ts` covers:

- OTP login for a phone with no password account
- phone routing to password vs OTP
- password login and role-based landing pages
- wrong password error handling
- wrong OTP code error handling
- OTP code rotation on resend
- full password reset: request OTP, verify, set new password, log in with new password
- forced password set after first OTP login
- phone change verification
- account deletion via OTP to the user's own phone
- disabled-user session kill
- role-based redirects for customer / owner / admin
- admin bootstrap guard
- logout then login as a different user: the account page must show the NEW
  user's name/phone, and the previous user identity must no longer be present

### 11.4 How to run

From the project root:

```bash
# 1. Deploy or start the Convex backend with test SMS recording enabled.
export KAMIX_E2E_SMS_MODE=record

# 2. Install dependencies if needed.
pnpm install

# 3. Run the full E2E suite.
pnpm test:e2e

# Or run just the extended auth suite:
pnpm exec playwright test e2e/auth-extended.spec.ts
```

Notes:

- The OTP flows will fail if `KAMIX_E2E_SMS_MODE=record` is not set on the
  backend the test runner hits.
- The suite still depends on a live Convex deployment with Twilio disabled or
  in recording mode. It is not a pure offline suite.
- The disabled-user and admin-bootstrap scenarios skip themselves when the
  E2E browser session cannot call the required admin APIs.

## 12. Remaining gaps after this pass

- OTP delivery behavior under real Twilio is not exercised by these tests.
- Token lifetime / refresh behavior is mostly inherited from Convex Auth and
  is not fully re-validated here.
- Mobile-specific auth lifecycle (backgrounding, process death, install/
  reinstall, storage migration) still needs device-level testing.
- The `passwordAuth.reset` Phone-provider cast is still a fragile dependency
  point and should be re-checked when `@convex-dev/auth` is upgraded.

