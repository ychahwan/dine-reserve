/**
 * Shared Twilio SMS sender (KB-30).
 *
 * Previously sms.ts and auth/phoneOtp.ts each had their own Twilio
 * implementation with slightly different behavior (phoneOtp had a 10s abort
 * timeout; sms.ts did not). A credentials/API change had to be made in two
 * places. This module is the single source of truth — both call sites go
 * through `sendTwilioMessage`.
 *
 * Credentials resolve from the admin-editable `appSettings` table first
 * (settings.ts), falling back to the process environment — so the admin
 * console Settings page can change them at runtime without a redeploy.
 */

import { api } from "./_generated/api";

/** Result of a send attempt. `sent: true` only on an HTTP 2xx. */
export type TwilioSendResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  error?: string;
};

/**
 * Resolve Twilio credentials from admin settings (stored) or the
 * environment. Supports two auth modes:
 *  - Account SID + main Auth Token (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)
 *  - Account SID + API Key (TWILIO_ACCOUNT_SID stays the URL/account, but
 *    Basic Auth uses TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET instead —
 *    Twilio API Keys authenticate as themselves, never as the Account SID).
 * Returns null (graceful no-op) when neither mode is fully configured.
 *
 * Sender resolution prefers a Messaging Service
 * (TWILIO_MESSAGING_SERVICE_SID) over a bare From number
 * (TWILIO_FROM_NUMBER): a Messaging Service with a registered Alphanumeric
 * Sender ID (e.g. "Beity") routes far more reliably into markets like
 * Lebanon than a raw US long code.
 */
async function twilioConfig(ctx: { runQuery: (q: any, a: any) => Promise<any> } | undefined) {
  const env = process.env;
  // Read a value from admin settings if present, else from the environment.
  const setting = async (key: string): Promise<string | undefined> => {
    if (ctx) {
      try {
        const row = await ctx.runQuery(api.settings.getSettingDb, { key });
        if (row?.value) return row.value;
      } catch {
        // fall through to env
      }
    }
    return env[key];
  };

  // Respect the TWILIO_ENABLED kill-switch: when set to "false" all SMS
  // sending is skipped regardless of whether credentials are present.
  const enabled = await setting("TWILIO_ENABLED");
  if (enabled !== undefined && enabled.toLowerCase() === "false") return null;

  const accountSid = await setting("TWILIO_ACCOUNT_SID");
  const messagingServiceSid = await setting("TWILIO_MESSAGING_SERVICE_SID");
  const from = await setting("TWILIO_FROM_NUMBER");
  if (!accountSid || (!messagingServiceSid && !from)) return null;

  const apiKeySid = await setting("TWILIO_API_KEY_SID");
  const apiKeySecret = await setting("TWILIO_API_KEY_SECRET");
  const authToken = await setting("TWILIO_AUTH_TOKEN");

  const authUser = apiKeySid || accountSid;
  const authPass = apiKeySid ? apiKeySecret : authToken;
  if (!authUser || !authPass) return null;

  return {
    accountSid,
    messagingServiceSid,
    from,
    authHeader: "Basic " + btoa(`${authUser}:${authPass}`),
  };
}

/**
 * Send a text message via the Twilio REST API. Graceful no-op (returns
 * `skipped`) when Twilio isn't configured or the destination is invalid —
 * callers must never break their flow because SMS is down. 10-second abort
 * so a hung Twilio connection can't block an auth action or a booking.
 *
 * `ctx` is optional and only used to resolve admin-stored credentials; when
 * omitted (or when nothing is stored) the process environment is used.
 */
export async function sendTwilioMessage(
  to: string,
  body: string,
  ctx?: { runQuery: (q: any, a: any) => Promise<any> },
): Promise<TwilioSendResult> {
  const cfg = await twilioConfig(ctx);
  if (!cfg) return { sent: false, skipped: true, reason: "twilio not configured" };
  if (!to || !/^\+\d{8,15}$/.test(to)) return { sent: false, skipped: true, reason: "invalid phone" };

  const params = new URLSearchParams();
  params.set("To", to);
  if (cfg.messagingServiceSid) {
    params.set("MessagingServiceSid", cfg.messagingServiceSid);
  } else {
    params.set("From", cfg.from!);
  }
  params.set("Body", body.slice(0, 1600));

  try {
    // 10-second timeout so a hung Twilio connection never blocks the caller.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[twilio] SMS failed:", res.status, detail.slice(0, 500));
    }
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
