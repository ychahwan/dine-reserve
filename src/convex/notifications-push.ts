"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { GoogleAuth } from "google-auth-library";
import { api } from "./_generated/api";

const FCM_V1_API = "https://fcm.googleapis.com/v1/projects";

/**
 * Get an access token using the service account from env var.
 */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const client = await auth.getIdTokenClient();
  const accessToken = await client.idTokenProvider.getAccessToken();

  return accessToken;
}

/**
 * Send a single FCM v1 notification
 */
async function sendFcmV1(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  const url = `${FCM_V1_API}/${projectId}/messages:send`;

  const message = {
    message: {
      token,
      notification: { title, body },
      ...(data && { data }),
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`FCM v1 error ${response.status}:`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send FCM v1 notification:", error);
    return false;
  }
}

/**
 * Send a push notification to a specific user
 */
export const sendToUser = action({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(api.notifications.getUserTokens, {
      userId: args.userId,
    });

    if (tokens.length === 0) {
      console.log("No active tokens for user:", args.userId);
      return { sent: 0 };
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      console.error("FIREBASE_SERVICE_ACCOUNT not configured");
      return { sent: 0, error: "Service account not configured" };
    }

    const projectId = JSON.parse(serviceAccountJson).project_id;
    const accessToken = await getAccessToken(serviceAccountJson);

    let sentCount = 0;
    for (const tokenRecord of tokens) {
      try {
        const success = await sendFcmV1(
          accessToken,
          projectId,
          tokenRecord.token,
          args.title,
          args.body,
          args.data as Record<string, string> | undefined,
        );

        if (success) {
          sentCount++;
          await ctx.runMutation(api.notifications.updateTokenLastUsed, {
            tokenId: tokenRecord._id,
          });
        }
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    }

    return { sent: sentCount, total: tokens.length };
  },
});

/**
 * Send a broadcast notification to all users
 */
export const broadcast = action({
  args: {
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(api.notifications.getAllActiveTokens);

    if (tokens.length === 0) {
      return { sent: 0 };
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      return { sent: 0, error: "Service account not configured" };
    }

    const projectId = JSON.parse(serviceAccountJson).project_id;
    const accessToken = await getAccessToken(serviceAccountJson);

    let sentCount = 0;

    for (const tokenRecord of tokens) {
      try {
        const success = await sendFcmV1(
          accessToken,
          projectId,
          tokenRecord.token,
          args.title,
          args.body,
          args.data as Record<string, string> | undefined,
        );

        if (success) {
          sentCount++;
        }
      } catch (error) {
        console.error("Failed to send broadcast notification:", error);
      }
    }

    return { sent: sentCount, total: tokens.length };
  },
});
