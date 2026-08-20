# Kamix Functional Requirements

## 1. Purpose

This document captures the functional requirements implemented or directly implied by the current Kamix codebase. It is written from repository evidence, primarily the React routes in `src/pages`, shared components in `src/components`, and Convex backend functions in `src/convex`.

The broader product SRS remains in `docs/REQUIREMENTS.md`. This document is narrower: it describes what the current application must do from a functional point of view.

## 2. Product Scope

Kamix is a restaurant discovery, booking, and dine-in experience platform. Diners search for restaurants, book live availability, manage visits, join waitlists, order during a visit, and use social dining features. Restaurant owners manage restaurants, availability, menus, bookings, waitlists, notifications, dine-in operations, gifts, and insights. Platform admins register and manage restaurant owner accounts.

## 3. User Roles

### 3.1 Diner

A diner is a signed-in customer who can search restaurants, book tables, manage bookings, maintain a dining profile, review completed visits, interact with the restaurant during a visit, and use Socialize features.

### 3.2 Restaurant Owner

A restaurant owner manages one or more restaurants assigned to their account. Owners can create or edit restaurants, manage availability and menus, view bookings and waitlists, operate dine-in workflows, manage gift catalogs, and inspect analytics.

### 3.3 Platform Admin

A platform admin can claim admin access only from the configured platform admin phone number and can register restaurants, create or tag owner accounts, reset temporary owner passwords, and view admin audit logs.

## 4. Authentication and Access

| ID | Requirement |
|---|---|
| FR-AUTH-001 | The app shall protect dashboard, customer, owner, invite, account, bookings, and admin routes behind authentication. |
| FR-AUTH-002 | Unauthenticated users accessing protected routes shall be redirected to `/auth?returnTo=<original route>`. |
| FR-AUTH-003 | Users shall sign in by phone number using either password authentication or phone OTP, depending on whether a password account exists for that phone. |
| FR-AUTH-004 | Users without a password account shall be sent a phone OTP and may set a password after OTP verification. |
| FR-AUTH-005 | Existing password users shall be able to request a password reset by OTP. |
| FR-AUTH-006 | Users marked `mustChangePassword` shall be redirected to `/set-password` before entering their normal workspace. |
| FR-AUTH-007 | Fresh self-service users shall complete diner onboarding by providing a name and optional phone number. |
| FR-AUTH-008 | Self-service onboarding shall create only customer accounts; owner and admin roles are assigned by admin or demo-claim flows. |
| FR-AUTH-009 | The dashboard shall route users by role: admin to `/admin`, customer to `/explore`, and owner to `/owner`. |

## 5. Diner Discovery

| ID | Requirement |
|---|---|
| FR-DISC-001 | Diners shall search restaurants by text across searchable restaurant content. |
| FR-DISC-002 | Diners shall filter restaurants by cuisine, city, seating type, non-smoking seating, dietary menu tags, and solo-friendly venue support. |
| FR-DISC-003 | Diners shall choose a quick-search date and party size to filter venues by current or estimated availability. |
| FR-DISC-004 | The Explore page shall seed demo data when the restaurant database is empty. |
| FR-DISC-005 | Restaurant cards shall show core restaurant metadata and live or estimated availability for the selected day. |
| FR-DISC-006 | Diners shall save and remove favorite restaurants from Explore, Restaurant Detail, and Account surfaces. |
| FR-DISC-007 | Search result links shall carry selected date, party size, seating, and non-smoking preferences into the Restaurant Detail booking flow. |

## 6. Restaurant Detail and Booking

| ID | Requirement |
|---|---|
| FR-BOOK-001 | The Restaurant Detail page shall show restaurant profile data, seating information, opening hours, menu content, ratings, reviews, and cancellation policy when available. |
| FR-BOOK-002 | Menu items shall display grouped categories, prices, availability, photos, tags, allergens, and spice levels when provided. |
| FR-BOOK-003 | The app shall materialize availability for a selected restaurant and date before showing bookable slots. |
| FR-BOOK-004 | Diners shall view availability for the next 14 days from the Restaurant Detail page. |
| FR-BOOK-005 | Diners shall select party size from 1 to 20, date, seating preference, non-smoking preference, slot, name, phone, notes, and occasion before confirming. |
| FR-BOOK-006 | Every diner booking from the UI shall enter a FIFO booking queue rather than writing a booking directly. |
| FR-BOOK-007 | The booking queue shall report the user's queue entry and line position. |
| FR-BOOK-008 | The queue processor shall drain requests oldest-first for the same restaurant, date, and time. |
| FR-BOOK-009 | Booking commit shall atomically check slot capacity and decrement remaining seats inside one Convex mutation. |
| FR-BOOK-010 | If the requested exact time lacks capacity, the booking engine may shift the diner to the next later matching available slot that can fit the party. |
| FR-BOOK-011 | Successful bookings shall create a confirmed booking with a six-character confirmation code. |
| FR-BOOK-012 | Booking creation shall write an unread owner notification and schedule an SMS confirmation action. |
| FR-BOOK-013 | Failed queue entries shall store a user-safe error and must not block later queued requests. |
| FR-BOOK-014 | Sold-out slots shall allow the diner to join a waitlist if the slot has no room for the party. |
| FR-BOOK-015 | Waitlist join shall be idempotent per diner, restaurant, date, time, and section. |

## 7. Diner Booking Management

| ID | Requirement |
|---|---|
| FR-MYB-001 | Diners shall view upcoming and earlier bookings sorted by date and time. |
| FR-MYB-002 | Diners shall cancel their own bookings. |
| FR-MYB-003 | Cancelling a booking shall restore seats to the matching slot up to the slot total. |
| FR-MYB-004 | Booking cancellation shall write an owner notification and schedule a cancellation SMS action. |
| FR-MYB-005 | When cancellation frees seats, the first eligible waiting diner shall be marked notified and a waitlist SMS shall be scheduled. |
| FR-MYB-006 | Diners shall view and cancel their own waitlist entries. |
| FR-MYB-007 | Diners shall send owner-visible booking alerts: on my way, running late, arrived, or special request. |
| FR-MYB-008 | Diner booking alerts shall be allowed only for the caller's confirmed, non-past booking and may include a note up to 300 characters. |
| FR-MYB-009 | Diners shall check in for a confirmed booking only on the day of the booking. |
| FR-MYB-010 | Check-in shall stamp the booking and create an arrived notification for the owner. |
| FR-MYB-011 | Diners shall share bookings through generated share text and invite links. |
| FR-MYB-012 | Invite link users shall confirm one additional seat on a confirmed, non-past booking, subject to capacity and a total party cap of 20. |
| FR-MYB-013 | Diners shall review only their own completed bookings, one review per booking, with a rating from 1 to 5 and optional text. |

## 8. Diner Account and Preferences

| ID | Requirement |
|---|---|
| FR-ACCT-001 | Diners shall update their name, phone number, and dining preferences. |
| FR-ACCT-002 | Dining preferences shall include dietary tags, seating preferences, and occasions. |
| FR-ACCT-003 | Profile preference lists shall be deduplicated and capped server-side. |
| FR-ACCT-004 | Diners shall view and remove favorite restaurants from the Account page. |

## 9. Dine-In Experience

| ID | Requirement |
|---|---|
| FR-DINE-001 | Diners with their own confirmed, non-past booking shall access dine-in tools for that booking. |
| FR-DINE-002 | Diners shall place orders from available menu items at the booking's restaurant. |
| FR-DINE-003 | Order line items shall snapshot menu item name, price, quantity, ingredients, removed ingredients, and notes at order time. |
| FR-DINE-004 | Diner ingredient removals shall be validated against the restaurant-defined ingredient list for the dish. |
| FR-DINE-005 | Placing an order shall create a dine-in order and an owner notification summarizing the order. |
| FR-DINE-006 | Diners shall view their own orders and cancel an order only while it is still open. |
| FR-DINE-007 | Diners shall send waiter assistance requests using predefined templates or a custom note. |
| FR-DINE-008 | Assistance requests shall create owner notifications and remain visible until resolved or cancelled. |
| FR-DINE-009 | Diners shall submit off-menu requests tied optionally to a booking. |
| FR-DINE-010 | Off-menu requests shall create owner notifications and have statuses managed by the owner. |
| FR-DINE-011 | Diners and owners shall view a booking bill aggregating non-cancelled orders and billable gifts. |
| FR-DINE-012 | The bill shall indicate that payment is not yet implemented. |

## 10. Socialize and Gifts

| ID | Requirement |
|---|---|
| FR-SOC-001 | Diners shall control their visibility in a restaurant Socialize room for a confirmed booking on the day of visit. |
| FR-SOC-002 | Visible diners shall appear to other signed-in diners at the same restaurant, excluding the current user. |
| FR-SOC-003 | Diners shall view available gift catalog items for a restaurant. |
| FR-SOC-004 | Diners shall send available gifts to visible diners at the same restaurant, with optional note and reveal mode. |
| FR-SOC-005 | Diners shall not send gifts to themselves. |
| FR-SOC-006 | Gift sends shall be rate-limited per sender. |
| FR-SOC-007 | Gift delivery shall create an owner notification and add the gift cost to the sender's bill. |
| FR-SOC-008 | Recipients shall see gifts sent to them; surprise gifts shall hide gift details until the owner marks them delivered. |
| FR-SOC-009 | Senders shall see gifts they sent and their delivery status. |

## 11. Owner Restaurant Management

| ID | Requirement |
|---|---|
| FR-OWN-001 | Owners shall view restaurants they own from the owner dashboard. |
| FR-OWN-002 | Owners shall create restaurants with name, cuisine, city, address, optional phone, price range, description, image URL, and features. |
| FR-OWN-003 | Creating a restaurant shall create a default non-smoking inside section with capacity 24. |
| FR-OWN-004 | Owners shall edit and delete restaurants they own. |
| FR-OWN-005 | Restaurant deletion shall cascade sections, hours, menus, and slots. |
| FR-OWN-006 | Owners shall claim seeded demo restaurants only when the current owner account is a recognized demo owner. |
| FR-OWN-007 | Claiming a demo restaurant shall promote the claimer to owner when needed. |
| FR-OWN-008 | Owners shall manage cancellation policy hours for their restaurants. |
| FR-OWN-009 | Owners shall manage seating sections with name, kind, smoking flag, capacity, and description. |
| FR-OWN-010 | Deleting a section shall delete that section's slots. |
| FR-OWN-011 | Owners shall save exactly seven weekly hours records for a restaurant. |

## 12. Owner Availability Management

| ID | Requirement |
|---|---|
| FR-AVL-001 | Owners shall generate and view availability by date for their restaurant. |
| FR-AVL-002 | Availability shall use restaurant hours and sections when no enabled slot rules exist. |
| FR-AVL-003 | Enabled slot rules shall replace the default grid for the days they cover. |
| FR-AVL-004 | Slot rules shall support name, days, start time, end time, interval step, optional section restrictions, and enabled state. |
| FR-AVL-005 | Slot rules shall rebuild upcoming availability while preserving booked slots. |
| FR-AVL-006 | Owners shall preview the next seven days of generated times without materializing slots. |
| FR-AVL-007 | Owners shall add and remove one-off custom slots for a future date and optional section. |
| FR-AVL-008 | Custom slot changes shall rebuild that date's availability while preserving booked slots. |
| FR-AVL-009 | Owners shall close and reopen individual slots. |
| FR-AVL-010 | Stale unbooked slots shall be pruned when availability rules change. |

## 13. Owner Menu Management

| ID | Requirement |
|---|---|
| FR-MENU-001 | Owners shall create, rename, describe, and delete menus. |
| FR-MENU-002 | Deleting a menu shall delete its menu items and best-effort delete stored item images. |
| FR-MENU-003 | Owners shall create, update, delete, and toggle availability of menu items. |
| FR-MENU-004 | Menu items shall support name, description, price, category, popular flag, availability, image upload, image URL, tags, allergens, ingredients, and spice level. |
| FR-MENU-005 | Menu item tags, allergens, and ingredients shall be trimmed, deduplicated, length-limited, and capped server-side. |
| FR-MENU-006 | Uploaded menu item image storage URLs shall be generated through Convex storage. |
| FR-MENU-007 | Uploaded images and external image URLs shall be treated as mutually exclusive on update. |

## 14. Owner Booking, Waitlist, and Notifications

| ID | Requirement |
|---|---|
| FR-OPS-001 | Owners shall view bookings for a restaurant, optionally filtered by date. |
| FR-OPS-002 | Owners shall update booking status to confirmed, completed, no-show, or cancelled. |
| FR-OPS-003 | Owner cancellation of a booking shall restore seats and notify the waitlist when applicable. |
| FR-OPS-004 | Owners shall view restaurant waitlist entries, optionally filtered by date. |
| FR-OPS-005 | Owners shall cancel waitlist entries for their restaurant. |
| FR-OPS-006 | Owners shall view notifications for a restaurant, optionally filtered by booking. |
| FR-OPS-007 | Notifications shall include booking events, diner alerts, dine-in orders, assistance requests, menu requests, and gift orders. |
| FR-OPS-008 | Owners shall see unread notification counts. |
| FR-OPS-009 | Owners shall mark one notification or all restaurant notifications as read. |

## 15. Owner Dine-In Operations and Gifts

| ID | Requirement |
|---|---|
| FR-RESTOPS-001 | Owners shall view dine-in orders for a restaurant with diner and booking context. |
| FR-RESTOPS-002 | Owners shall update order status through open, preparing, served, completed, or cancelled. |
| FR-RESTOPS-003 | Owners shall cancel open dine-in orders. |
| FR-RESTOPS-004 | Owners shall view assistance requests and mark open requests resolved. |
| FR-RESTOPS-005 | Owners shall view off-menu requests and update their status through new, in progress, fulfilled, or declined. |
| FR-RESTOPS-006 | Owners shall see live open counts for orders, assistance requests, and menu requests. |
| FR-RESTOPS-007 | Owners shall manage gift catalog items with name, emoji, description, price, and availability. |
| FR-RESTOPS-008 | Owners shall view gift deliveries with sender, receiver, and booking context. |
| FR-RESTOPS-009 | Owners shall see pending gift counts and mark ordered gifts delivered. |
| FR-RESTOPS-010 | Delivering a surprise gift shall reveal it to the receiver. |

## 16. Owner Insights

| ID | Requirement |
|---|---|
| FR-INS-001 | Owners shall view booking statistics for restaurants they own. |
| FR-INS-002 | Insights shall support a lookback window bounded between 7 and 90 days, defaulting to 30 days. |
| FR-INS-003 | Insights shall include total bookings, covers, completed bookings, no-shows, cancellations, no-show rate, cancellation rate, average party size, recent daily covers, top times, and waitlist counts. |

## 17. Platform Admin

| ID | Requirement |
|---|---|
| FR-ADM-001 | A signed-in user whose phone matches the configured platform admin phone shall be able to claim the admin role once. |
| FR-ADM-002 | Admin-only pages and functions shall reject non-admin users. |
| FR-ADM-003 | Admins shall register a restaurant and create or link an owner password account with a temporary password. |
| FR-ADM-004 | Registered owner accounts shall be marked owner, onboarded, and required to change password. |
| FR-ADM-005 | Admins shall tag an existing phone-verified account as a restaurant owner. |
| FR-ADM-006 | Admins shall ensure an owner has a working password account by creating or replacing password credentials. |
| FR-ADM-007 | Admin mutations shall be rate-limited. |
| FR-ADM-008 | Admin actions shall be written to an append-only audit log, and admins shall view their recent audit entries. |

## 18. Integrations and Platform Behavior

| ID | Requirement |
|---|---|
| FR-PLAT-001 | Twilio SMS actions shall send booking confirmations, cancellations, reminders, and waitlist alerts when credentials are configured. |
| FR-PLAT-002 | SMS actions shall no-op gracefully when required Twilio credentials or destination phone numbers are absent. |
| FR-PLAT-003 | Demo data seeding shall run only when needed and shall provide usable restaurants, menus, sections, hours, slots, waitlist/review data, and gift data. |
| FR-PLAT-004 | Convex reactive queries shall provide the live transport for bookings, queues, notifications, dine-in operations, and gift workflows. |
| FR-PLAT-005 | The same React application shall run as a web app and through Capacitor mobile shells. |

## 19. Validation and Authorization Rules

| ID | Requirement |
|---|---|
| FR-VAL-001 | Server mutations shall resolve the caller identity from Convex Auth and must not trust client-supplied user IDs. |
| FR-VAL-002 | Restaurant-scoped owner mutations shall verify the caller owns the target restaurant. |
| FR-VAL-003 | Diner-scoped mutations shall verify the booking, order, waitlist entry, review, or presence belongs to the caller where applicable. |
| FR-VAL-004 | Core inputs shall be validated server-side with Convex validators and zod parsing. |
| FR-VAL-005 | Dates shall use `YYYY-MM-DD`, times shall use `HH:mm`, and party sizes shall be constrained to 1 through 20. |
| FR-VAL-006 | User-facing text fields shall be trimmed and length-limited before persistence. |
| FR-VAL-007 | Cancellation shall be idempotent when a booking or waitlist entry is already cancelled. |
| FR-VAL-008 | Queue enqueue shall be idempotent for an already queued request by the same user for the same slot and party size. |

## 20. Known Functional Gaps and Ambiguities

| ID | Gap |
|---|---|
| GAP-001 | `src/convex/reminders.ts` is empty while the broader docs describe day-before booking reminders. Reminder SMS support exists in `sms.ts`, but the scheduled reminder implementation is not present in the inspected code. |
| GAP-002 | Payment is explicitly not implemented; dine-in bills return `paid: false`. |
| GAP-003 | Booking invite links are based on booking confirmation code in the current implementation; there is no separate invite token table in the inspected schema. |
| GAP-004 | Some availability estimates on Explore are based on total section capacity when slots have not been materialized yet. |
| GAP-005 | The current codebase contains both an existing roadmap SRS and implemented features that extend beyond it, including dine-in orders and Socialize gifts. |

## 21. Primary Code References

- Routing and auth guards: `src/main.tsx`, `src/components/RequireAuth.tsx`, `src/pages/Auth.tsx`, `src/pages/Dashboard.tsx`
- User profile and admin: `src/convex/users.ts`, `src/convex/admin.ts`
- Restaurant discovery and management: `src/pages/Explore.tsx`, `src/pages/RestaurantDetail.tsx`, `src/pages/OwnerDashboard.tsx`, `src/pages/OwnerRestaurant.tsx`, `src/convex/restaurants.ts`
- Availability and queueing: `src/convex/availability.ts`, `src/convex/slotRules.ts`, `src/convex/queue.ts`, `src/convex/bookings.ts`
- Waitlist, notifications, and reviews: `src/convex/waitlist.ts`, `src/convex/notifications.ts`, `src/convex/reviews.ts`
- Dine-in and Socialize: `src/convex/dining.ts`, `src/convex/socialize.ts`, `src/components/DiningDialog.tsx`, `src/components/SocializeDialog.tsx`
- Data model: `src/convex/schema.ts`
