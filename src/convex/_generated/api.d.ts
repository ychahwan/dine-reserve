/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as availability from "../availability.js";
import type * as bookings from "../bookings.js";
import type * as demoRules from "../demoRules.js";
import type * as dining from "../dining.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as queue from "../queue.js";
import type * as reminders from "../reminders.js";
import type * as restaurants from "../restaurants.js";
import type * as reviews from "../reviews.js";
import type * as seed from "../seed.js";
import type * as slotRules from "../slotRules.js";
import type * as sms from "../sms.js";
import type * as socialize from "../socialize.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  availability: typeof availability;
  bookings: typeof bookings;
  demoRules: typeof demoRules;
  dining: typeof dining;
  helpers: typeof helpers;
  http: typeof http;
  notifications: typeof notifications;
  queue: typeof queue;
  reminders: typeof reminders;
  restaurants: typeof restaurants;
  reviews: typeof reviews;
  seed: typeof seed;
  slotRules: typeof slotRules;
  sms: typeof sms;
  socialize: typeof socialize;
  uploads: typeof uploads;
  users: typeof users;
  validation: typeof validation;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
