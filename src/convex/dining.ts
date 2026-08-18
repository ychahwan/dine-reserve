import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ASSIST_STATUS,
  ASSIST_TEMPLATE,
  MENU_REQUEST_STATUS,
  ORDER_ITEM,
  ORDER_STATUS,
} from "./schema";
import { notifyRestaurant } from "./notifications";
import { safeGet } from "./helpers";
import { assistNoteSchema, menuRequestSchema, parseOrThrow, placeOrderSchema } from "./validation";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 703 characters. Read it separately or use code_search for the relevant section.