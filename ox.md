# Kamix Security and Performance Audit

**Audit date:** 2026-08-30  
**Scope:** Current application source under `src/` (approximately 40,000 lines), including the Convex backend, React/Vite frontend, admin and owner interfaces, hooks, libraries, and Capacitor-facing code. Generated Convex declarations and third-party UI primitives were not treated as first-party logic.  
**Method:** Six parallel, read-only reviews with disjoint file scopes. Findings were checked against the current implementation and relevant Convex schema indexes. No application code was changed.

## Executive Summary

The review found **81 issues**:

| Severity | Count |
|---|---:|
| Critical | 6 |
| High | 5 |
| Medium | 33 |
| Low | 37 |

The most urgent risks are unauthenticated public Convex functions that can send arbitrary push notifications, broadcast to every device, send arbitrary SMS messages, erase all data, reset the database, or invoke stress seeding. These should be internalized before any production deployment.

## Critical Findings

### OX-C-01: Unauthenticated targeted push delivery

- **Category:** Security
- **Location:** `src/convex/notifications.ts:575-614`
- **Issue:** Public `sendToUser` accepts arbitrary `userId`, title, body, and data without authentication or authorization.
- **Impact:** Anyone can impersonate Kamix and send phishing or misleading notifications to any user, while consuming push-service resources.
- **Proposal:** Convert it to `internalAction`. If an externally callable administrative wrapper is needed, require platform-admin authorization and rate limiting.

### OX-C-02: Unauthenticated global push broadcast

- **Category:** Security
- **Location:** `src/convex/notifications.ts:619-651`
- **Issue:** Public `broadcast` has no authentication check and sends caller-controlled content to every active notification token.
- **Impact:** Any unauthenticated caller can mass-phish the entire user base and cause large outbound push fan-out.
- **Proposal:** Convert it to `internalAction` and expose only an admin-authorized, audited wrapper.

### OX-C-03: Public database wipe mutation

- **Category:** Security
- **Location:** `src/convex/seed.ts:1074-1124`
- **Issue:** Public `wipeAllData` deletes every row from the application tables without authentication.
- **Impact:** Complete production data destruction by an anonymous caller.
- **Proposal:** Convert it to `internalMutation`; restrict invocation to controlled CLI or deployment workflows.

### OX-C-04: Public database reset mutation

- **Category:** Security
- **Location:** `src/convex/seed.ts:1133-1140`
- **Issue:** Public `resetData` wipes the database and reseeds demo data without authentication.
- **Impact:** Anonymous replacement of real production data with demo data.
- **Proposal:** Convert it to `internalMutation` and prohibit client invocation.

### OX-C-05: Public stress-data generator

- **Category:** Security / Performance
- **Location:** `src/convex/stressSeed.ts:62-237`
- **Issue:** `stressSeed` is documented as CLI/test-only but is exported as an unauthenticated public mutation.
- **Impact:** Anonymous callers can attempt to create approximately 100,000 users and thousands of other documents, consuming quota and polluting data.
- **Proposal:** Convert it to `internalMutation` and add an environment guard preventing production execution.

### OX-C-06: Public unauthenticated SMS relay

- **Category:** Security
- **Location:** `src/convex/sms.ts:18,44,64,78`
- **Issue:** `sendBookingSms`, `sendBookingReminder`, `sendOtpSms`, and `sendWaitlistSms` are public actions with no auth check or rate limit. Callers control recipients and substantial portions of message content.
- **Impact:** SMS pumping, direct Twilio cost abuse, harassment, and phishing under the Kamix sender identity.
- **Proposal:** Convert all four to `internalAction`, update internal schedulers to call `internal.sms.*`, and strictly validate OTP codes and message arguments.

## High Findings

### OX-H-01: Public password-account enumeration endpoint remains

- **Category:** Security
- **Location:** `src/convex/users.ts:94-101`; callers in `src/pages/SetPassword.tsx:40` and `src/pages/Account.tsx:65`
- **Issue:** The rate-limited `checkPhoneAccount` mutation exists, but the original public `hasPasswordAccount` query remains unthrottled and is still used.
- **Impact:** Unlimited probing of whether arbitrary phone numbers have password accounts.
- **Proposal:** Migrate all callers to the throttled mutation, then delete or internalize `hasPasswordAccount`.

### OX-H-02: Admin overview and list queries have unbounded fan-out

- **Category:** Performance
- **Location:** `src/convex/adminView.ts:59-299`
- **Issue:** Admin queries collect whole tables and run several indexed subqueries per user or restaurant within one transaction.
- **Impact:** Admin-console latency and transaction reads grow with all platform data and will eventually exceed Convex limits.
- **Proposal:** Use cursor pagination and incrementally maintained aggregate documents for counts and revenue.

### OX-H-03: OTP verification has no attempt limit

- **Category:** Security
- **Location:** `src/convex/auth/phoneOtp.ts:20-57`; `src/convex/auth/passwordAuth.ts:24-33`
- **Issue:** OTP sending is limited, but verification attempts against six-digit codes are not counted or throttled.
- **Impact:** Online brute force within the ten-minute validity window can result in account takeover.
- **Proposal:** Add a verification-attempt limiter keyed by phone and challenge/token, with a small maximum such as five failures per challenge.

### OX-H-04: Unbounded demo-rule slot generation

- **Category:** Security / Performance
- **Location:** `src/convex/demoRules.ts:189-228`; `src/convex/availability.ts:134-158`
- **Issue:** Client-supplied `daysAhead` is not bounded and can be passed by a signed-in non-owner path into mass slot generation.
- **Impact:** A user can trigger extreme parallel writes, transaction failures, and availability-engine denial of service.
- **Proposal:** Clamp the horizon to a small server-defined range and require owner/admin authorization for all manual calls.

### OX-H-05: Explore creates two subscriptions per unbounded card

- **Category:** Performance
- **Location:** `src/pages/Explore.tsx:554-669,711-712`
- **Issue:** Every restaurant card opens two live Convex subscriptions, while the result grid is not paginated or virtualized. Additional rails duplicate cards and subscriptions.
- **Impact:** DOM size, query subscriptions, network traffic, and WebView reconciliation scale linearly with the catalog.
- **Proposal:** Return batched card data from a paginated query and lazy-mount or virtualize below-fold results.

## Medium Findings

### Backend Booking and Availability

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-01 | `src/convex/availability.ts:167-184` | Public `ensureForDate` accepts an unvalidated/unbounded date and has no rate limit, permitting far-future slot-document growth. | Validate with the shared date schema, limit the booking horizon, and rate-limit per user. |
| OX-M-02 | `src/convex/bookings.ts:257-299` | Public booking-code lookup has no rate limit despite returning booking metadata for a six-character capability. | Apply per-user/IP throttling and miss backoff. |
| OX-M-03 | `src/convex/dining.ts:166-245,547-579,675-718`; `src/convex/walkIn.ts:83-233` | Several spam-capable mutations lack rate limits; `createMenuRequest` does not require a booking relationship. | Require a valid relationship and add per-user mutation limits. |
| OX-M-04 | `src/convex/availability.ts:233-284` | Anonymous `summary` collects all restaurants, hours, and sections and performs per-venue slot queries. | Cache/precompute daily summaries, paginate, and apply abuse controls. |
| OX-M-05 | `src/convex/restaurants.ts:129-199` | Search can collect all restaurants, all sections, and all menu items for common filters. | Denormalize searchable flags or query candidates through existing restaurant indexes. |
| OX-M-06 | `src/convex/bookings.ts:389-418` | Owner stats collect all booking and waitlist history before applying a date window in JavaScript. | Apply date bounds through existing compound indexes. |
| OX-M-07 | `src/convex/dining.ts:793-809` | `openCounts` collects full lifetime order/request histories for reactive badge counts. | Maintain counters or add status-oriented indexes and bounded queries. |
| OX-M-08 | `src/convex/waitlist.ts:23-73` | Waitlist VIP scoring scans each candidate's entire booking and review history inside cancellation processing. | Maintain per-user score aggregates. |
| OX-M-09 | `src/convex/availability.ts:131-160`; `src/convex/slotRules.ts:209-220` | Fourteen days of slots are regenerated within one mutation transaction. | Chunk generation into scheduled internal mutations. |

### Backend Identity, Admin, Notifications, and Social

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-10 | `src/convex/users.ts:85-91` | Pre-auth password lookup fallback may scan up to 2,000 auth accounts per request. | Remove the fallback after backfill completion. |
| OX-M-11 | `src/convex/users.ts:464-521` | Phone uniqueness is checked when change starts but not again when it is confirmed. | Recheck user and provider identity uniqueness immediately before patching. |
| OX-M-12 | `src/convex/notifications.ts:317-458` | Users can register unlimited arbitrary active push-token strings; active stale tokens are never garbage-collected. | Validate token shape, rate-limit registration, cap tokens per user, and expire stale active tokens. |
| OX-M-13 | `src/convex/admin.ts:688-742` | Admins can hard-delete selected audit entries, undermining append-only forensic history. | Use immutable/tombstoned audit storage and a separately protected retention workflow. |
| OX-M-14 | `src/convex/seed.ts:618-766` | Public seed/retrofit functions allow unauthenticated write-heavy scans and demo-data insertion. | Make seed/retrofit paths internal; leave only a cheap status query public. |
| OX-M-15 | `src/convex/dinerNotify.ts:274-334` | Daily re-engagement pass scans all users and then each user's full booking history. | Paginate users and use date-bounded booking queries. |
| OX-M-16 | `src/convex/dinerNotify.ts:350-351` | Review-nudge pass collects the entire reviews table daily. | Query reviews only for the small set of recent completed bookings. |
| OX-M-17 | `src/convex/erasure.ts:186-191` | Restaurant erasure scans every user to remove favorites inside a large cascade transaction. | Use a reverse favorites relation or paginated cleanup continuation. |
| OX-M-18 | `src/convex/socialize.ts:243-260,404-423` | Visit thresholds scan each visible diner's lifetime booking history in two separate queries. | Store visit counters and share one server helper. |

### Backend Services, AI, and Auth

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-19 | `src/convex/demoRules.ts:186-231` | Unauthenticated no-arg demo-rule mutation and weak non-force ownership rules expose a write-heavy configuration path. | Split into an internal cron mutation and an owner-authorized public mutation. |
| OX-M-20 | `src/convex/rateLimit.ts:67-77`; `src/convex/auth/phoneOtp.ts:31-36` | OTP sending is limited per phone only, so attackers can spray many destination numbers. | Add deployment-wide and optionally IP/device-wide SMS budgets. |
| OX-M-21 | `src/convex/analytics.ts:174`; `src/convex/bookings.ts:389-393`; `src/convex/ai.ts:294-302` | Owner AI insights repeatedly scan lifetime orders/bookings without caching. | Add date-oriented indexes and cache short-lived analytics packs. |
| OX-M-22 | `src/convex/reviews.ts:82-88` | Public review list returns every review and performs an author lookup per row. | Cursor-paginate and denormalize or batch author display data. |
| OX-M-23 | `src/convex/rateLimit.ts:45-49` | Compound rate-limit index is queried only by key, then window rows are filtered in memory. | Add the `windowStart` lower bound to the index query. |

### Customer Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-24 | `src/pages/MyBookings.tsx:125-156,782-794` | Booking access codes and dining history are stored in plaintext localStorage and not cleared/scoped on sign-out. | Key cache by user, clear it on sign-out/deletion, and avoid showing it before re-authentication. |
| OX-M-25 | Multiple customer image sites, including `src/pages/Explore.tsx:517,584,747` | Third-party images expose client IP, user agent, and request/referrer context to external CDNs. | Proxy/store images first-party and set restrictive referrer policy. |

### Owner Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-26 | `src/components/OwnerRestaurantTabs.tsx:1090-1162`; `src/pages/OwnerRestaurant.tsx:407-414` | Socialize blocklist uses stale client-side read-modify-write replacement, allowing concurrent saves to silently unblock users. | Add atomic server mutations for adding/removing one blocked user. |
| OX-M-27 | `src/components/OwnerDiningTabs.tsx:111-127` | Order badge subscribes to the entire order history even when the tab is closed. | Return the active-order count from a lightweight server query. |
| OX-M-28 | `src/pages/OwnerDashboard.tsx:263-275` | Dashboard restaurant cards fetch complete menus although only summary data is used. | Add a lightweight owner restaurant-summary query. |
| OX-M-29 | Owner list components in `OwnerRestaurantTabs.tsx`, `OwnerDiningTabs.tsx`, `OwnerGiftsTab.tsx`, and `OwnerNotificationsTab.tsx` | Owner histories render unbounded arrays and run full filter/sort work per search keystroke. | Add server pagination/range filters, debounce search, and virtualize long lists. |

### Admin, Hooks, and Shared Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-M-30 | `src/pages/admin/AdminRestaurantDetail.tsx:147-158`; `src/pages/admin/AdminAudit.tsx:59-79` | CSV exports do not neutralize spreadsheet formulas in user-controlled cells. | Prefix dangerous leading characters, including tab and carriage return, before quoting. |
| OX-M-31 | `src/pages/admin/AdminRestaurantDetail.tsx:78-81,446-701` | Fresh inline extractor functions invalidate table sort memoization on every parent render. | Hoist stable extractors outside the component. |
| OX-M-32 | `src/pages/admin/AdminReviewDetail.tsx:38-43` | A single review detail page downloads the entire platform review list and performs `.find()`. | Add a dedicated review-by-id query. |
| OX-M-33 | `src/pages/admin/AdminUsers.tsx`, `AdminRestaurants.tsx`, `AdminReviews.tsx` | Admin lists download complete tables and filter/sort on every keystroke. | Move search, filters, sorting, and pagination to bounded Convex queries. |

## Low Findings

### Backend Booking and Availability

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-01 | `src/convex/walkIn.ts:421-456` | Walk-in rejection reason has no length cap. | Trim and cap free text. |
| OX-L-02 | `src/convex/walkIn.ts:69-70,95,169,265` | Walk-in party sizes allow fractional numbers, corrupting integer seat counts. | Enforce integer party-size schema. |
| OX-L-03 | `src/convex/restaurants.ts:240-266` | Disabled restaurant menus remain publicly readable. | Hide them except from owner/admin callers. |
| OX-L-04 | `src/convex/bookings.ts:503-513,588-606` | Waitlist notifications may fire when cancellation restored no seats. | Notify only when seats were actually restored. |
| OX-L-05 | `src/convex/bookings.ts:12-18`; `src/convex/walkIn.ts:24-32` | Modulo mapping creates a slightly biased booking-code alphabet. | Use rejection sampling for uniform code generation. |
| OX-L-06 | `src/convex/schema.ts:658-664` | Provider secrets are stored as plaintext app-setting values. | Prefer environment-secret storage or envelope encryption. |
| OX-L-07 | Owner list endpoints in `bookings.ts`, `dining.ts`, `waitlist.ts`, and `walkIn.ts` | Several no-date paths collect all lifetime rows and enrich each row. | Add cursors/default date windows and lazy enrichment. |
| OX-L-08 | `src/convex/restaurants.ts:369-426` | Personalized restaurant query collects all restaurants and menu items. | Query candidate venues or maintain preference facets. |
| OX-L-09 | `src/convex/queue.ts:159-230`; `src/convex/waitlist.ts:191-207` | Terminal and historical queue/waitlist rows accumulate and are returned without bounds. | Add TTL cleanup and bounded history queries. |
| OX-L-10 | `src/convex/dining.ts:429-481` | Bill assembly performs sequential user lookups and returns redundant raw and aggregated data. | Dedupe/parallelize lookups and return a slimmer payload. |

### Backend Identity, Admin, Notifications, and Social

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-11 | `src/convex/admin.ts:492-553` | Scheduled bulk deletion does not revalidate eligibility immediately before cascade execution. | Recheck role and restaurant ownership in every batch step. |
| OX-L-12 | `src/convex/notifications.ts:203-309` | Feed methods perform repeated per-row gets; unread counts materialize all rows; patches run serially. | Batch enrichment, maintain counters, and chunk updates. |
| OX-L-13 | `src/convex/socialize.ts:744-868` | Gift history and pending counts use unbounded collects and N+1 enrichment. | Paginate history and add restaurant/status indexes. |
| OX-L-14 | `src/convex/notifications.ts:412-458` | Active/stale token scans lack a matching index. | Add an `active,lastUsed` index. |
| OX-L-15 | `src/convex/loyalty.ts:65-79` | Balance query collects and sorts the complete loyalty ledger to return 20 rows. | Use descending indexed `take(20)`. |
| OX-L-16 | `src/convex/dinerNotify.ts:128-133` | Unread count materializes every unread notification. | Maintain a counter or cap/count through indexed summaries. |

### Backend Services, AI, and Auth

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-17 | `src/convex/ai.ts:252-254` | Agent config collects every setting, including secrets, while using only two values. | Query only the required settings. |
| OX-L-18 | `src/convex/uploads.ts:11-24` | Upload URL creation has no server-side MIME/size limit, rate limit, or attached-object verification. | Limit issuance and validate metadata when storage IDs are attached. |
| OX-L-19 | `src/convex/ai.ts:143-158,459-521` | User preference/favorite strings enter Gemini prompts without the sanitizer used elsewhere. | Sanitize every untrusted prompt field and update privacy documentation. |
| OX-L-20 | `src/convex/ai.ts:67-75,125-133,294-302` | AI retries have no backoff and aggregate usage has no global budget. | Add jittered backoff, caching, and a deployment-wide spend limit. |
| OX-L-21 | `src/convex/reminders.ts`, `stories.ts`, `adminAi.ts`, `analytics.ts` | Residual collect/slice and repeated lookup patterns cause growing read costs; public prediction performs 36 queries. | Use ordered `take`, dedupe gets, paginate admin data, cache/rate-limit prediction. |

### Customer Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-22 | `src/pages/Explore.tsx:145-152` | Filtered zero results trigger the demo-data mutation even when the database is not empty. | Gate on an explicit unfiltered database-empty signal. |
| OX-L-23 | `src/pages/Explore.tsx:339-362` | Walk-in picker runs the same full filter twice per render. | Memoize one filtered result. |
| OX-L-24 | `src/components/SocializeDialog.tsx:127`; `src/pages/MyBookings.tsx:862-867` | Presence subscription runs whenever bookings page is open, even without an active Socialize dialog. | Skip the query until the dialog/booking exists. |
| OX-L-25 | `src/pages/RestaurantDetail.tsx:128,1004-1111` | All reviews are fetched/rendered; rating bars repeatedly re-filter the full list. | Paginate reviews and compute distribution once. |
| OX-L-26 | Customer images across Explore, MyBookings, Account, RestaurantDetail, and Invite | Most below-fold images load eagerly without async decode or dimensions. | Add lazy loading, async decoding, and stable dimensions. |

### Owner Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-27 | `src/components/OwnerRestaurantTabs.tsx:1174-1175` | Owner CSV sanitizer omits tab and carriage-return formula prefixes. | Extend the dangerous-prefix check. |
| OX-L-28 | `src/components/OwnerRestaurantTabs.tsx:1166-1184` | Customer PII export downloads plaintext contact data without confirmation or masking. | Confirm explicitly and default to masked fields. |
| OX-L-29 | `src/components/OwnerShell.tsx:42-45` | Signed-out `user === null` can render owner chrome and fire rejected queries. | Redirect signed-out state before mounting owner content. |
| OX-L-30 | `src/pages/OwnerRestaurant.tsx:147-268` | Non-owners see the warning but owner tab components still mount and query. | Do not mount tab content unless ownership is confirmed. |
| OX-L-31 | `src/components/OwnerRestaurantTabs.tsx:1181-1186` | CSV blob URL is revoked immediately after click and may race WebKit download resolution. | Revoke on a later task/tick. |
| OX-L-32 | Owner image sites in `OwnerDashboard.tsx`, `OwnerRestaurant.tsx`, `OwnerMenuTab.tsx` | Remote images load eagerly without dimensions. | Add lazy loading and stable sizing. |

### Admin, Hooks, and Shared Interface

| ID | Location | Issue and impact | Proposal |
|---|---|---|---|
| OX-L-33 | `src/main.tsx:56-79` | Production error boundary renders raw messages and stack traces. | Show details only in development; use a generic production error reference. |
| OX-L-34 | `src/pages/admin/AdminAudit.tsx:101-124` | Empty filtered results trigger a second unbounded audit-log query for facets. | Add a small dedicated facets query. |
| OX-L-35 | `src/hooks/use-camera.ts:40-64` | Camera defaults to quality-90 base64 without dimension limits, increasing WebView heap use. | Prefer URI uploads or conservative dimension caps. |
| OX-L-36 | `src/hooks/use-push-notifications.ts:163` | Foreground notifications are retained indefinitely in React state. | Cap the in-memory recent list. |
| OX-L-37 | `src/pages/admin/AdminReviews.tsx:149-157` | Review bulk deletion runs mutations sequentially. | Add a batch mutation or bounded parallel execution. |

## Verified-Clean Highlights

The audit also confirmed the following current protections:

- Server-side tenant ownership checks are consistently present on reviewed booking, dining, waitlist, availability, and owner operations.
- Order and gift prices are sourced and snapshotted server-side rather than trusted from clients.
- Seat-ledger mutations use serializable read/check/write flows and block invalid booking revival paths.
- Invite confirmation requires the booking capability code; anonymous invite responses minimize guest PII.
- Push-token ownership is derived from the authenticated session; public bulk token dumps were removed.
- User deletion cascades cover current user-referencing tables, including sessions, notification tokens, AI conversations, queues, and gifts.
- Socialize visibility, venue enablement, blocked-user checks, presence, and gift prices are enforced server-side.
- Settings secret readers are internal, and admin settings responses use default-deny masking.
- Twilio calls validate destination format, cap body length, use timeouts, and support a kill switch.
- AI recommendation output is schema-constrained and restaurant IDs are checked against an eligibility set.
- Custom HTTP surface contains only Convex Auth routes; no unsigned Twilio webhook endpoint exists.
- Customer-facing React components contain no `dangerouslySetInnerHTML` use in the reviewed scope.
- External links reviewed with `target="_blank"` also set `rel="noreferrer"`.
- Route postMessage integration validates the configured origin and excludes sensitive query strings.
- Authentication guards handle loading, orphaned-profile, and disabled-account states.
- Geolocation watches and Capacitor push listeners are cleaned up on unmount.
- App routes, including admin pages, are lazy-loaded.
- Menu-photo object URLs are revoked on replacement, dialog close, and unmount.

## Recommended Fix Order

1. Internalize all public push, SMS, wipe/reset, stress-seed, and seed/retrofit functions.
2. Add OTP verification-attempt limits and global SMS cost controls.
3. Remove the unthrottled phone-account enumeration endpoint.
4. Bound and authorize demo-rule/slot-generation paths.
5. Paginate admin and owner datasets and replace full-table/N+1 dashboard queries with aggregates.
6. Batch Explore restaurant card data and eliminate per-card subscription multiplication.
7. Scope and clear offline booking-code storage on user transitions.
8. Fix CSV formula injection in admin and owner exports.
9. Add bounded indexes, counters, retention jobs, and pagination to growing notification, gift, queue, loyalty, review, and analytics data.
10. Apply the remaining defense-in-depth and mobile performance improvements.
