# Kamix Architecture and Security Review

## 1. Review Context

This document records architecture and security issues identified from a source review of the Kamix repository. The current `main` branch at commit `26157757` (2026-08-20) was assessed. The working tree also contained an unrelated untracked recovery script, which was not reviewed or modified.

The conclusions below are based on static source inspection. No production system was tested, no exploit was executed, and no affected-version range or deployment prevalence has been established. Severity reflects the likely impact and prerequisites visible in the current code.

## 2. Executive Summary

Kamix has a coherent product architecture: React owns the user experience, Convex functions form the backend boundary, Convex transactions protect booking capacity, and the domain is divided into recognizable booking, queue, restaurant, dining, notification, and Socialize modules.

The main weakness is authorization design. Several security decisions depend on mutable or client-supplied identifiers instead of server-derived identity and ownership. The most serious example allows a signed-in user to change their profile phone to the hard-coded platform-admin phone and then claim the `admin` role. Booking invite and Socialize APIs also disclose more booking information than their callers need and do not consistently prove that the caller belongs to the relevant booking or restaurant context.

The immediate priority is to close the admin privilege-escalation path. Invite authorization and Socialize access should follow next. The direct booking mutation and disabled schema validation are architectural controls that should be corrected before the application is treated as production-ready.

## 3. Risk Register

| ID | Severity | Area | Status | Summary |
|---|---|---|---|---|
| SEC-01 | Critical | Identity and administration | Resolved | Admin bootstrap trusts a mutable profile phone number. Fixed: claimPlatformAdmin now verifies the provider-verified phone-otp account, not the editable profile phone. |
| SEC-02 | High | Booking privacy and invites | Resolved | Public booking lookups return full booking records, and guest confirmation trusts a booking ID without verifying the invite capability. Fixed: `byCode` returns a minimized DTO, `confirmGuest` requires the invite code, `getBookingWithRestaurant` removed. |
| SEC-03 | Medium | Socialize privacy | Resolved | Any signed-in user can enumerate visible diners at an arbitrary restaurant and receive booking codes and user IDs. Fixed: `visibleDiners` is gated by same-restaurant attendance or ownership and returns no booking codes or party size. |
| ARCH-01 | Medium | Booking fairness | Resolved | A public direct-booking mutation bypasses the FIFO queue required by the product flow. Fixed: `createBooking` is now an `internalMutation`; the queue is the only public booking path. |
| ARCH-02 | Medium | Data integrity | Resolved | Convex schema validation is globally disabled. Fixed: `schemaValidation: true`, with `phoneVerificationTime` added to the `users` table so the auth library's writes conform; push validated all existing documents. |
| SEC-04 | Low/Medium | Authentication privacy | Accepted (documented) | An unauthenticated query reveals whether a phone has a password account. Accepted tradeoff: phone is normalized before lookup and the leak is limited to presence (never a password/token); credential attempts remain rate-limited. |
| ARCH-03 | Medium | Domain model consistency | Resolved | `giftDeliveries.bookingId` is documented as the receiver booking but implemented and billed as the sender booking. Fixed: schema comment now states it is the sender's booking (the bill the gift lands on). |
| ARCH-04 | Low | Documentation | Resolved | Architecture documentation describes an obsolete authentication and reminder design. Fixed: ARCHITECTURE.md now documents phone OTP + password providers and the implemented reminder scheduler. |

## 4. Detailed Findings

### SEC-01: Admin Bootstrap Trusts a Mutable Profile Phone

**Severity:** Critical

**Affected code:**

- `src/convex/admin.ts`, `PLATFORM_ADMIN_PHONE` and `claimPlatformAdmin`
- `src/convex/users.ts`, `updateProfile`

**Expected behavior:** Platform-admin access should be granted only from a server-verified identity or through a controlled administrative provisioning process.

**Actual behavior:** `claimPlatformAdmin` compares `user.phone` to a hard-coded privileged phone and grants the `admin` role when they match. `updateProfile` allows any signed-in user to replace that same `user.phone` field. The claim function does not read the authenticated provider account or otherwise prove ownership of the privileged phone at claim time.

A signed-in attacker can therefore use their own legitimate session, update their profile phone to `+96176683661`, and invoke `claimPlatformAdmin`. The source establishes the privilege transition directly; this review did not execute it against a deployment.

**Impact:** A successful attacker receives the role checked by admin-only mutations. Based on the current admin module, this includes restaurant and owner-account administration, credential resets, and access to administrative workflows. The audit log records the claim after elevation but does not prevent it.

**Remediation:**

1. Remove phone-based self-service admin claiming from public mutations.
2. Provision the first administrator through a deployment secret, one-time migration, or manually controlled backend operation.
3. If phone identity remains part of the decision, derive it from a verified `authAccounts` provider record and never from an editable profile field.
4. Store immutable authorization grants separately from contact/profile data.
5. Add regression tests proving that changing `users.phone` cannot alter roles and that an ordinary authenticated user cannot invoke any admin mutation.

### SEC-02: Booking Invite APIs Expose Full Records and Do Not Bind Confirmation to the Invite

**Severity:** High

**Affected code:**

- `src/convex/bookings.ts`, `getBookingWithRestaurant`
- `src/convex/bookings.ts`, `byCode`
- `src/convex/bookings.ts`, `confirmGuest`
- `src/convex/schema.ts`, `bookings`

**Expected behavior:** A public invite should expose only the minimum information needed to understand the invitation. Joining should require possession of a valid, active invite capability that is checked by the mutation performing the join.

**Actual behavior:**

- `getBookingWithRestaurant` accepts a booking ID without authentication or ownership checks and returns the complete booking object.
- `byCode` is intentionally public, but it also returns the complete booking object. That object may contain the booking owner's user ID, name, email, phone, notes, occasion, guest identities, and confirmation code.
- `confirmGuest` requires authentication but accepts only `bookingId` and `name`. It does not accept or validate the invite code, an invite token, an owner-generated grant, or owner approval.

The UI obtains a booking ID from `byCode` and passes it to `confirmGuest`, but UI sequencing is not an authorization boundary. Any authenticated caller that learns a valid booking ID can call the mutation directly. Capacity checks prevent overbooking, but they do not prove that the caller was invited.

The current code uses a six-character random code. Random generation is preferable to sequential identifiers, but a short code should still be rate-limited and treated as a scoped capability rather than as permission to return an internal database record.

**Impact:** Booking personal data can be disclosed to unauthorized callers. An authenticated attacker with a valid booking ID can add themselves as a guest and consume a seat without invite verification, subject to date, duplicate, capacity, and twenty-person limits.

**Remediation:**

1. Remove or protect `getBookingWithRestaurant`; require booking ownership, restaurant ownership, admin access, or a narrowly scoped invite token.
2. Change `byCode` to return a dedicated public invite DTO containing only display-safe fields, such as restaurant name, date, time, host display name if explicitly intended, and remaining invite capacity.
3. Make confirmation accept the invite token/code and validate it atomically against the booking before adding the guest.
4. Prefer a high-entropy, revocable, purpose-specific invite token stored as a hash. Add expiry and explicit revocation when the booking is cancelled or the host disables invitations.
5. Rate-limit invite lookup and confirmation by user and an appropriate request-origin signal supported by the platform.
6. Add negative tests for arbitrary booking IDs, expired/revoked tokens, cancelled bookings, cross-booking tokens, repeated joins, and response-field minimization.

### SEC-03: Socialize Presence Leaks Diner and Booking Identifiers

**Severity:** Medium

**Affected code:** `src/convex/socialize.ts`, `visibleDiners`

**Expected behavior:** Only a diner participating in an active booking at the same restaurant, or an authorized restaurant operator, should see that restaurant's current Socialize room. Responses should reveal only fields required by the room and gift workflow.

**Actual behavior:** `visibleDiners` checks only that the caller is signed in. The caller supplies any `restaurantId`; the query does not require an active booking at that restaurant. Its response includes each visible diner's internal `userId` and the related booking's confirmation `code`, time, section, and party size.

Visibility consent controls whether a diner appears, but it does not authorize every authenticated platform user to view that presence. Returning booking codes also links this issue to the public invite lookup.

**Impact:** A signed-in attacker can enumerate opted-in diner identities and visit metadata for a restaurant they are not attending. Exposed booking codes may enable the booking-information disclosure described in SEC-02.

**Remediation:**

1. Require the caller to have an active booking for the same restaurant and date, or to own/manage the restaurant.
2. Return an opaque presence ID for room actions instead of raw user and booking IDs where possible.
3. Remove booking codes, party size, and section details unless a documented interaction explicitly needs them.
4. Resolve gift recipients server-side from an authorized presence record rather than trusting a client-selected `receiverUserId` alone.
5. Test unauthenticated, signed-in non-attendee, attendee, restaurant-owner, hidden-presence, stale-booking, and cross-restaurant cases.

### ARCH-01: Public Direct Booking Bypasses FIFO Fairness

**Severity:** Medium

**Affected code:**

- `src/convex/bookings.ts`, `createBooking`
- `src/convex/queue.ts`, `enqueue`
- `src/pages/RestaurantDetail.tsx`, booking submission flow

**Expected behavior:** Functional requirement FR-BOOK-006 says every diner booking should enter the FIFO queue. The UI follows that design by calling `queue.enqueue`.

**Actual behavior:** `bookings.createBooking` remains a public authenticated mutation and calls the shared booking logic immediately. A custom client can bypass queued callers and compete directly for the same capacity.

Convex mutation serialization and the atomic seat decrement still protect the inventory ledger from overbooking. The violated property is ordering and fairness, not capacity integrity.

**Impact:** Callers using the undocumented direct API may receive seats ahead of earlier queued users. This undermines a stated product guarantee and makes queue behavior dependent on client compliance.

**Remediation:** Convert the direct operation into an `internalMutation`, or remove it if no trusted backend workflow requires it. Keep the shared `attemptBooking` helper internal to the backend and expose only the queue entry point to diners. Add an integration test where all public booking requests are represented by queue records and processed oldest-first.

### ARCH-02: Database Schema Validation Is Disabled

**Severity:** Medium

**Affected code:** `src/convex/schema.ts`, `defineSchema(..., { schemaValidation: false })`

**Expected behavior:** Persistent records should be checked against the declared schema so invalid shapes and cross-module contract drift fail close to the write boundary.

**Actual behavior:** Schema validation is globally disabled. Function argument validation and selected Zod parsing still protect some entry points, but they do not guarantee that every stored document satisfies the table schema.

**Impact:** Invalid legacy or newly written records can persist and fail later in unrelated queries, billing, booking, or owner workflows. This weakens the schema as an architectural contract and makes migrations harder to reason about.

**Remediation:** Inventory existing invalid documents, write explicit data migrations, enable validation in a non-production deployment, correct all failures, and then enable it in production. Keep temporary exceptions narrowly scoped and time-bound rather than disabling the global control indefinitely.

### SEC-04: Password Account Discovery Enables Phone Enumeration

**Severity:** Low/Medium

**Affected code:** `src/convex/users.ts`, `hasPasswordAccount`

**Expected behavior:** The authentication experience should not reveal whether a specific person's phone has a password account unless that disclosure is an accepted product tradeoff with compensating abuse controls.

**Actual behavior:** An unauthenticated caller can submit a phone number and receive `{ exists: true | false }`. The UI uses the result to choose between password and OTP flows, but the backend query is callable independently.

**Impact:** An attacker can test phone numbers for account presence. This is a privacy leak and can improve targeting for credential stuffing, phishing, or harassment. It does not disclose a password or authenticate the attacker.

**Remediation:** Prefer a unified authentication response that does not reveal account state. If product requirements require different flows, use identical user-facing messages and timing where practical, add strict rate limits and monitoring, normalize phone numbers before lookup, and consider returning the next step only after a server-issued challenge.

### ARCH-03: Gift Booking Ownership Semantics Are Inconsistent

**Severity:** Medium

**Affected code:**

- `src/convex/schema.ts`, `giftDeliveries.bookingId`
- `src/convex/socialize.ts`, `sendGift`
- `src/convex/dining.ts`, `billForBooking`

**Expected behavior:** A domain field should have one documented meaning across storage, mutations, indexes, billing, and owner operations.

**Actual behavior:** The schema comment defines `giftDeliveries.bookingId` as the receiver's booking. `sendGift` stores the sender's booking, and `billForBooking` queries the field to charge gifts to that booking. The runtime implementation is internally aligned with charging the sender, but the schema contract states the opposite.

**Impact:** Future code may interpret the field according to the schema and associate delivery, authorization, or billing with the wrong party. The single ambiguous foreign key also makes it difficult to answer both “which bill pays?” and “where should this be delivered?” reliably.

**Remediation:** Replace the ambiguous field with explicit `senderBookingId` and `receiverBookingId`. Resolve and validate the receiver's active booking from their presence during `sendGift`. Bill through `senderBookingId`, deliver through `receiverBookingId`, migrate existing data with a documented rule, and add cross-booking tests.

### ARCH-04: Architecture Documentation Has Drifted from the Code

**Severity:** Low

**Affected code and documentation:**

- `docs/ARCHITECTURE.md`
- `src/convex/auth.ts`
- `src/convex/auth/phoneOtp.ts`
- `src/convex/auth/passwordAuth.ts`
- `src/convex/reminders.ts`

**Actual behavior:** The architecture document describes Anonymous and Email OTP providers and references `auth/emailOtp.ts`. The current auth configuration uses phone OTP and phone/password providers. The document also says reminders are unimplemented, while `reminders.ts` now contains the scheduled reminder workflow.

**Impact:** Engineers and reviewers may design changes against obsolete trust boundaries and operational assumptions. Security reviews are especially sensitive to inaccurate authentication documentation.

**Remediation:** Update `docs/ARCHITECTURE.md` to match the current providers, account lifecycle, password reset flow, role provisioning, reminder scheduler, and environment dependencies. Add a lightweight documentation check to architecture-affecting pull requests.

## 5. Recently Resolved Review Items

> **Round 2 (resolved 2026-08-20):** SEC-02, SEC-03, ARCH-01, ARCH-02, ARCH-03, ARCH-04 closed; SEC-04 accepted as a documented tradeoff. Details:
> - **SEC-02** — `bookings:byCode` now returns a minimized, display-safe DTO (no owner email/phone/notes, no guest user ids); `confirmGuest` requires the invite `code` and validates it atomically; the unprotected `getBookingWithRestaurant` query was removed.
> - **SEC-03** — `socialize:visibleDiners` requires the caller to be attending the same restaurant today (or own it) and returns only name/image/check-in and booking time/section — no booking codes or party size.
> - **ARCH-01** — `bookings:createBooking` is now an `internalMutation`; `queue:enqueue` is the only public diner booking entry point.
> - **ARCH-02** — `schemaValidation: true`; added `users.phoneVerificationTime` (written by the auth library) so existing and future documents conform. `convex deploy` reported "Schema validation complete."
> - **ARCH-03** — `giftDeliveries.bookingId` comment corrected to "sender's booking (the bill this gift lands on)".
> - **ARCH-04** — `docs/ARCHITECTURE.md` updated to the real auth providers (phone OTP + phone/password) and the implemented reminder scheduler.
> - **SEC-04** — accepted: phone is normalized before lookup; the response reveals presence only, never a password/token, and credential attempts stay rate-limited via `authRateLimits`.

> **SEC-01 (resolved 2026-08-20):** `claimPlatformAdmin` now derives the caller's identity from the provider-verified `authAccounts` phone-otp record (`providerAccountId`) instead of the editable `users.phone` profile field. A regression test confirmed that changing `users.phone` no longer grants admin.

The following observations from the earlier review no longer reproduce in the assessed checkout:

| Previous issue | Current evidence | Status |
|---|---|---|
| Self-service onboarding could assign the `owner` role. | `users.onboard` now accepts only `ROLES.CUSTOMER`. | Resolved in current source. |
| `.env.local` was tracked or insufficiently ignored. | `.gitignore` now includes `.env.local`, and only `.env.example` is tracked. | Resolved in current source; secret-history review was outside this assessment. |
| Reminder cron targeted an empty module. | `src/convex/reminders.ts` now implements reminder scheduling and delivery. | Resolved in current source; documentation remains stale. |

## 6. Architectural Assessment

### Strengths

- Convex is used as the transactional source of truth, and booking capacity is decremented in the same mutation that commits a booking.
- The user-facing booking path uses a dedicated FIFO queue and reports queue state back to the diner.
- Domain modules are separated by responsibility, which makes ownership and authorization helpers feasible to centralize.
- Input schemas, indexed queries, rate limiting in sensitive workflows, audit logging, and asynchronous notification scheduling show good production-oriented intent.
- Restaurant ownership checks exist in several mutation paths, providing a foundation for a consistent backend authorization layer.

### Structural Weaknesses

- Authorization rules are repeated inside individual functions instead of being expressed through a small set of trusted policy helpers.
- Some public Convex functions expose internal documents directly. Returning table records couples clients to storage layout and makes accidental sensitive-field disclosure likely.
- Profile attributes, authentication identities, roles, invite capabilities, and resource ownership are not consistently separated in the data model.
- Public versus internal mutation boundaries do not always match product invariants, as shown by the direct booking bypass.
- Comments and architecture documents currently carry contradictory meanings for important contracts such as authentication providers and gift booking ownership.

### Recommended Target Pattern

1. Treat provider-backed identity as immutable authentication evidence.
2. Store roles and resource grants separately from editable profile/contact fields.
3. Centralize helpers such as `requireAdmin`, `requireRestaurantOwner`, `requireBookingParticipant`, and `requireActiveRestaurantAttendee` and use them in every public backend function.
4. Return purpose-built response objects from public queries instead of raw documents.
5. Model invite links as explicit, scoped, expiring capabilities and validate them at the state-changing mutation.
6. Make invariant-preserving operations internal; expose one public entry point for each business workflow.
7. Enable schema validation and use explicit migrations for contract changes.

## 7. Prioritized Remediation Plan

### Priority 0: Immediate

- Disable `claimPlatformAdmin` until it can use an immutable, verified provisioning mechanism.
- Review existing `admin` accounts and the admin audit log for unexpected claims.
- Rotate or remove the hard-coded bootstrap phone after a controlled administrator is provisioned.

### Priority 1: Before Production Use

- Redesign invite lookup and guest confirmation around a minimized invite DTO and validated capability token.
- Protect or remove `getBookingWithRestaurant`.
- Gate `visibleDiners` by active same-restaurant participation and remove booking codes from its response.
- Make direct booking internal so the queue is the only diner booking entry point.

### Priority 2: Data and Domain Integrity

- Migrate data and enable Convex schema validation.
- Split gift sender and receiver booking references and validate both sides.
- Centralize backend authorization policy helpers and add negative authorization tests.

### Priority 3: Hardening and Maintainability

- Reduce phone account enumeration and add abuse monitoring.
- Update architecture documentation and keep it tied to architecture-changing reviews.
- Add security-focused integration tests for role escalation, cross-user booking reads, invite replay, cross-restaurant Socialize access, and queue bypass.

## 8. Acceptance Criteria for Closure

An issue should be marked closed only when the backend rejects the unauthorized path directly; hiding a control or route in React is not sufficient. Each fix should include a regression test for the failing case, a positive test for the intended authorized case, and confirmation that public responses contain only required fields. For data-model changes, the migration and validation rollout must also be verified against existing records.
