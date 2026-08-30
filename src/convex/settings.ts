import { v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

/**
 * Platform settings — admin-editable API keys and configuration.
 *
 * Keys stored in the `appSettings` table override environment variables and
 * can be changed at runtime from the admin console (Settings page) without
 * redeploying. When no stored value exists, the code falls back to the
 * process environment, so the existing env-var deployment keeps working.
 *
 * Security:
 *  - Only a platform admin can read/write settings.
 *  - `listSettings` masks secret values (shows a "set"/"••••" placeholder +
 *    last-4) — the raw value is never sent to the client after it's stored.
 *  - Server-side code reads raw values via `getSetting(ctx, key)`, which
 *    resolves through a private DB query (deterministic) then env — never
 *    callable by the client for arbitrary keys.
 */

/** Keys the admin console offers to manage. Order = display order. */
export const SETTING_KEYS = [
  "GEMINI_API_KEY",
  "AI_SYSTEM_PROMPT",
  "AI_MODEL",
  "TWILIO_ENABLED",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_FROM_NUMBER",
] as const;

/**
 * Keys whose values are safe to display verbatim in the admin console.
 * M-23: default-deny — every key NOT listed here is masked, so a future
 * sensitive setting can never leak by being forgotten in a deny-list.
 */
const PUBLIC_KEYS = new Set(["AI_SYSTEM_PROMPT", "AI_MODEL"]);

export const ENV_REFERENCE_PREFIX = "env:";

export function resolveSettingValue(
  storedValue: string | undefined,
  fallbackKey: string,
): string | undefined {
  if (!storedValue) return process.env[fallbackKey];
  if (!storedValue.startsWith(ENV_REFERENCE_PREFIX)) return storedValue;
  const envKey = storedValue.slice(ENV_REFERENCE_PREFIX.length);
  if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(envKey)) return undefined;
  return process.env[envKey];
}

/**
 * Private, deterministic DB read for one setting row. C-1: internal-only so
 * raw values (secrets included) are never callable from any client.
 */
export const getSettingDb = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row
      ? { key: row.key, value: row.value, updatedAt: row.updatedAt }
      : null;
  },
});

/**
 * Private, deterministic read of the current user's role — used by
 * listSettings to authorize. Not for client use.
 */
export const getSettingRoleCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return user?.role ?? null;
  },
});

/**
 * Private, deterministic read of all appSettings rows — used by
 * listSettings. Not for client use.
 */
export const getSettingRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("appSettings").collect();
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updatedAt,
    }));
  },
});

/**
 * Admin-only: list settings with masked secret values + env status.
 * Uses an action (not a query) because it reads `process.env` — Convex
 * queries must stay deterministic.
 */
export const listSettings = action({
  args: {},
  handler: async (ctx) => {
    const role = await ctx.runQuery(internal.settings.getSettingRoleCheck, {});
    if (role !== "admin") throw new Error("Admins only.");

    const rows = await ctx.runQuery(internal.settings.getSettingRows, {});
    const byKey = new Map<
      string,
      { key: string; value: string; updatedAt: number }
    >();
    for (const r of rows) byKey.set(r.key, r);

    return SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      const envValue = process.env[key];
      const isEnvReference =
        row?.value.startsWith(ENV_REFERENCE_PREFIX) ?? false;
      return {
        key,
        configured: isEnvReference
          ? resolveSettingValue(row?.value, key) !== undefined
          : row
            ? true
            : envValue !== undefined,
        // M-23: default-deny masking — only PUBLIC_KEYS values are shown
        // verbatim; everything else is masked to the last 4 chars.
        masked: isEnvReference
          ? resolveSettingValue(row?.value, key)
            ? "(env reference) configured"
            : "(env reference) missing"
          : row && PUBLIC_KEYS.has(key)
            ? row.value
            : row
              ? `••••${row.value.slice(-4)}`
              : envValue && PUBLIC_KEYS.has(key)
                ? `(env) ${envValue}`
                : envValue
                  ? `(env) ••••${envValue.slice(-4)}`
                  : "",
        source: isEnvReference
          ? "env-reference"
          : row
            ? "db"
            : envValue
              ? "env"
              : "unset",
        updatedAt: row?.updatedAt ?? 0,
      };
    });
  },
});

/**
 * Admin-only: upsert one setting. `env:VARIABLE_NAME` stores only a reference
 * and is preferred for provider secrets. Legacy plaintext values remain
 * supported so existing admin-managed deployments do not break.
 */
export const setSetting = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admins only.");

    if (!(SETTING_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    const trimmed = value.trim();
    if (
      trimmed.startsWith(ENV_REFERENCE_PREFIX) &&
      !/^[A-Z][A-Z0-9_]{0,127}$/.test(
        trimmed.slice(ENV_REFERENCE_PREFIX.length),
      )
    ) {
      throw new Error("Environment references must use env:VARIABLE_NAME.");
    }
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) {
      if (!trimmed) {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, {
          value: trimmed,
          updatedBy: userId,
          updatedAt: Date.now(),
        });
      }
    } else if (trimmed) {
      await ctx.db.insert("appSettings", {
        key,
        value: trimmed,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/**
 * Minimal shape of an ActionCtx needed to resolve settings via `runQuery`.
 * Shared by ai.ts and twilio.ts so neither needs an untyped `any` ctx.
 */
export type SettingsReaderCtx = {
  runQuery: <
    Query extends FunctionReference<"query", "public" | "internal">,
  >(
    query: Query,
    args: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>;
};

/**
 * Server-only: resolve a setting's value — stored value wins, else env.
 * `ctx` is an ActionCtx (has runQuery). Used by ai.ts, twilio.ts, etc.
 * Not exposed to the client.
 */
export async function getSetting(
  ctx: SettingsReaderCtx,
  key: string,
): Promise<string | undefined> {
  try {
    const row = await ctx.runQuery(internal.settings.getSettingDb, { key });
    if (row?.value) return resolveSettingValue(row.value, key);
  } catch {
    // DB read failed (e.g. table not migrated yet) — fall through to env.
  }
  return resolveSettingValue(undefined, key);
}
