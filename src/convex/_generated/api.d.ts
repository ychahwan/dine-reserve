/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminView from "../adminView.js";
import type * as ai from "../ai.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as auth_passwordAuth from "../auth/passwordAuth.js";
import type * as auth_phoneOtp from "../auth/phoneOtp.js";
import type * as availability from "../availability.js";
import type * as bookings from "../bookings.js";
import type * as demoRules from "../demoRules.js";
import type * as dinerNotify from "../dinerNotify.js";
import type * as dining from "../dining.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as loyalty from "../loyalty.js";
import type * as notifications from "../notifications.js";
import type * as queue from "../queue.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reminders from "../reminders.js";
import type * as restaurants from "../restaurants.js";
import type * as reviews from "../reviews.js";
import type * as seed from "../seed.js";
import type * as slotRules from "../slotRules.js";
import type * as sms from "../sms.js";
import type * as socialize from "../socialize.js";
import type * as stories from "../stories.js";
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
  admin: typeof admin;
  adminView: typeof adminView;
  ai: typeof ai;
  analytics: typeof analytics;
  auth: typeof auth;
  "auth/passwordAuth": typeof auth_passwordAuth;
  "auth/phoneOtp": typeof auth_phoneOtp;
  availability: typeof availability;
  bookings: typeof bookings;
  demoRules: typeof demoRules;
  dinerNotify: typeof dinerNotify;
  dining: typeof dining;
  helpers: typeof helpers;
  http: typeof http;
  loyalty: typeof loyalty;
  notifications: typeof notifications;
  queue: typeof queue;
  rateLimit: typeof rateLimit;
  reminders: typeof reminders;
  restaurants: typeof restaurants;
  reviews: typeof reviews;
  seed: typeof seed;
  slotRules: typeof slotRules;
  sms: typeof sms;
  socialize: typeof socialize;
  stories: typeof stories;
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
