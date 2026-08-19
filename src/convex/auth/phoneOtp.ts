import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: phone, token }) {
    // Call Twilio directly from this server-side provider callback.
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const from = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || (!messagingServiceSid && !from)) {
      console.warn("[phoneOtp] Twilio not configured — skipping SMS OTP");
      return;
    }

    const authUser = apiKeySid || accountSid;
    const authPass = apiKeySid ? apiKeySecret : authToken;
    if (!authUser || !authPass) {
      console.warn("[phoneOtp] Twilio auth incomplete — skipping SMS OTP");
      return;
    }

    const body = `Your Kamix verification code is: ${token}. It expires in 15 minutes.`;

    // Build URLSearchParams properly to satisfy TS
    const params = new URLSearchParams();
    params.set("To", phone);
    params.set("Body", body.slice(0, 1600));
    if (messagingServiceSid) {
      params.set("MessagingServiceSid", messagingServiceSid);
    } else {
      params.set("From", from!);
    }

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " + btoa(`${authUser}:${authPass}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        },
      );
      if (!res.ok) {
        console.error(
          "[phoneOtp] Twilio SMS failed:",
          res.status,
          await res.text(),
        );
      }
    } catch (e) {
      console.error(
        "[phoneOtp] Twilio SMS error:",
        e instanceof Error ? e.message : e,
      );
    }
  },
});
