import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  MessageSquare,
  Phone,
  Store,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

/**
 * Same-origin path check for post-auth redirects (M-38): rejects scheme-
 * relative forms like "//host", "/\evil.com" and "\\evil.com" that WHATWG
 * URL parsers treat as cross-origin, not just the plain "//" prefix.
 */
function safeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  return /^\/[^/\\]/.test(returnTo) ? returnTo : null;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (!returnTo) return fallback;
  return safeReturnTo(returnTo) ?? fallback;
}

/** Canonical phone form: strip spaces, dashes, parens (matches backend). */
function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, "");
}

type AuthStep =
  | "enter-phone"
  | { phone: string; mode: "password" }
  | { phone: string; mode: "otp" }
  | { phone: string; mode: "set-password" }
  | { phone: string; mode: "reset-otp" };

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  // The landing page's hero phone box links here as /auth?phone=… — start
  // straight at the OTP/password step instead of making the user re-type it.
  // Normalize so signIn and the backend lookup use the same canonical form.
  const rawPrefill = searchParams.get("phone")?.trim();
  const prefillPhone = rawPrefill ? normalizePhone(rawPrefill) : undefined;
  const [step, setStep] = useState<AuthStep>("enter-phone");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // M-41: the password-vs-OTP branch is decided by a single rate-limited
  // mutation on phone submit (not a reactive query per keystroke), which
  // shrinks the account-enumeration oracle to one call per attempt.
  const checkPhoneAccount = useMutation(api.users.checkPhoneAccount);

  // Where should a freshly signed-in user land?
  //   1. Restaurant accounts that must set a new password go straight there.
  //   2. A validated same-origin returnTo wins.
  //   3. An existing profile role opens that profile's tabs.
  //   4. Fresh users go to onboarding (diner by default).
  const resolveTarget = useCallback(() => {
    if (user?.mustChangePassword) return "/set-password";
    if (safeReturnTo(searchParams.get("returnTo"))) {
      return safeReturnTo(searchParams.get("returnTo"))!;
    }
    if (user?.role === "admin") return "/admin";
    if (user?.role === "customer") return "/explore";
    if (user?.role === "owner") return "/owner";
    return resolveRedirectAfterAuth(null, redirectAfterAuth);
  }, [user?.mustChangePassword, searchParams, user?.role, redirectAfterAuth]);

  useEffect(() => {
    // Don't auto-redirect while the post-first-login "set a password"
    // screen is up — the user must explicitly save or skip it.
    const isSetPassword =
      typeof step === "object" && step.mode === "set-password";
    if (!authLoading && isAuthenticated && user !== undefined && !isSetPassword) {
      navigate(resolveTarget());
    }
  }, [authLoading, isAuthenticated, user, navigate, step, resolveTarget]);

  // Step 2a: Password login
  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", formData);
      navigate(resolveTarget());
    } catch (err) {
      console.error("Password sign-in error:", err);
      setError(t("auth.errInvalidPassword"));
      setIsLoading(false);
      setPassword("");
    }
  };

  // Step 1: Submit phone number — look up account type once (M-41) and
  // branch straight to password vs OTP.
  const handlePhoneSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    otpSentRef.current = false;
    const formData = new FormData(event.currentTarget);
    await resolvePhone(normalizePhone(formData.get("phone") as string));
  };

  // Track whether OTP has already been sent to prevent duplicate SMS.
  const otpSentRef = useRef(false);
  // Generation counter for in-flight sends — a superseded send must not
  // clobber newer UI state when it finally settles (M-39).
  const sendGenRef = useRef(0);

  // Uses a ref for the phone to avoid stale closures, and a 15s client-side
  // timeout so the UI never stays stuck on "Sending code..." even if the
  // backend hangs.
  const phoneRef = useRef("");
  useEffect(() => {
    if (typeof step === "object" && step.phone) phoneRef.current = step.phone;
  }, [step]);

  const handleSendOtp = useCallback(async (force = false) => {
    const p = phoneRef.current;
    if (!p) return;
    if (otpSentRef.current && !force) return;
    otpSentRef.current = true;
    const gen = ++sendGenRef.current;
    setIsLoading(true);
    setError(null);
    let timerId: ReturnType<typeof setTimeout> | undefined;
    try {
      const formData = new FormData();
      formData.set("phone", p);
      // Safety net so a late rejection after the timeout already settled the
      // race never becomes unhandled (M-39).
      const sendPromise = signIn("phone-otp", formData);
      void sendPromise.catch(() => undefined);
      await Promise.race([
        sendPromise,
        new Promise((_, reject) => {
          timerId = setTimeout(() => reject(new Error("timeout")), 15_000);
        }),
      ]);
      if (gen !== sendGenRef.current) return;
      setIsLoading(false);
    } catch (err) {
      if (gen !== sendGenRef.current) return;
      console.error("OTP send error:", err);
      const timedOut = err instanceof Error && err.message === "timeout";
      setError(timedOut ? t("auth.errSmsSlow") : t("auth.errSendFailed"));
      // On timeout the original request may still deliver — don't allow an
      // immediate resend that would fire a second SMS (M-39).
      if (!timedOut) otpSentRef.current = false;
      setIsLoading(false);
    } finally {
      clearTimeout(timerId);
    }
  }, [signIn, t]);

  // Look up the phone once, then branch: password step vs OTP (auto-sent).
  const resolvePhone = useCallback(
    async (phoneValue: string) => {
      phoneRef.current = phoneValue;
      setIsLoading(true);
      setError(null);
      try {
        const { exists } = await checkPhoneAccount({ phone: phoneValue });
        if (exists) {
          setStep({ phone: phoneValue, mode: "password" });
          setIsLoading(false);
        } else {
          setStep({ phone: phoneValue, mode: "otp" });
          // Sets its own loading/error state once done.
          await handleSendOtp();
        }
      } catch (err) {
        console.error("Phone lookup error:", err);
        setError(err instanceof Error ? err.message : t("auth.errSendFailed"));
        setIsLoading(false);
      }
    },
    [checkPhoneAccount, handleSendOtp, t],
  );

  // Landing-page prefill (/auth?phone=…): run the same single lookup once.
  const prefillResolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      prefillPhone &&
      prefillResolvedRef.current !== prefillPhone
    ) {
      prefillResolvedRef.current = prefillPhone;
      void resolvePhone(prefillPhone);
    }
  }, [prefillPhone, resolvePhone]);

  // Step 2b: Verify OTP
  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("phone-otp", formData);
      // After successful OTP, offer to set a password
      if (typeof step === "object" && step.phone) {
        setStep({ phone: step.phone, mode: "set-password" });
      }
      setIsLoading(false);
    } catch (err) {
      console.error("OTP verification error:", err);
      setError(t("auth.errWrongCode"));
      setIsLoading(false);
      setOtp("");
    }
  };

  // Step 3: Set password after first OTP login.
  // The user is ALREADY signed in via OTP at this point, so we add the
  // password to the SAME account with users.setPassword (which links via
  // shouldLinkViaPhone). Calling signIn("password", flow=signUp) here would
  // create a SECOND, separate user — and signing in with the password later
  // would land on that empty user instead of the onboarded profile.
  const setPasswordMutation = useMutation(api.users.setPassword);
  const handleSetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await setPasswordMutation({ newPassword: password });
      navigate(resolveTarget());
    } catch (err) {
      console.error("Set password error:", err);
      setError(err instanceof Error ? err.message : t("auth.errSetPassword"));
      setIsLoading(false);
    }
  };

  // Step: Forgot password — send a reset OTP via SMS, then verify + set a new password.
  const handleForgotPassword = async () => {
    if (typeof step !== "object" || step.mode !== "password") return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("phone", step.phone);
      formData.set("flow", "reset");
      await signIn("password", formData);
      setStep({ phone: step.phone, mode: "reset-otp" });
      setIsLoading(false);
    } catch (err) {
      console.error("Password reset request error:", err);
      setError(t("auth.errResetFailed"));
      setIsLoading(false);
    }
  };

  // Step: Verify the reset OTP and save the new password.
  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", formData);
      navigate(resolveTarget());
    } catch (err) {
      console.error("Password reset error:", err);
      setError(t("auth.errResetCode"));
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleSkipPassword = () => {
    navigate(resolveTarget());
  };

  const handleBack = () => {
    otpSentRef.current = false;
    phoneRef.current = "";
    if (typeof step === "object") {
      if (step.mode === "reset-otp") {
        setStep({ phone: step.phone, mode: "password" });
      } else {
        setStep("enter-phone");
      }
    }
    setPassword("");
    setOtp("");
    setError(null);
  };

  const stepKey = typeof step === "string" ? step : step.mode;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-background via-background to-primary/5">
      {/* Decorative theme — soft, light */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 size-80 rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute right-1/4 top-16 size-40 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10" />
      </div>

      {/* Brand */}
      <div className="relative flex items-center justify-center gap-3 pt-10">
        <button
          onClick={() => navigate("/")}
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <Store className="size-5" />
          </span>
          <span className="text-left">
            <span className="block text-lg font-bold leading-tight tracking-tight">
              Kamix
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {t("auth.brandTagline")}
            </span>
          </span>
        </button>
        <div className="absolute right-4">
          <LanguageSwitcher />
        </div>
      </div>

      {/* Auth Content */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-border/60 bg-card/90 shadow-none backdrop-blur-sm">
            <div
              key={stepKey}
              className="animate-fade-in-up"
            >
              {/* ─── Step 1: Enter phone ─── */}
              {step === "enter-phone" && (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="text-xl">{t("auth.enterPhoneTitle")}</CardTitle>
                    <CardDescription>
                      {t("auth.enterPhoneDesc")}
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handlePhoneSubmit}>
                    <CardContent>
                      <div className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                          <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            name="phone"
                            placeholder={t("auth.enterPhonePlaceholder")}
                            type="tel"
                            className="pl-9"
                            disabled={isLoading}
                            required
                            autoFocus
                          />
                        </div>
                        <Button
                          type="submit"
                          variant="outline"
                          size="icon"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                    </CardContent>
                  </form>
                </>
              )}

              {/* ─── Step 2a: Password login ─── */}
              {typeof step === "object" && step.mode === "password" && (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                      <KeyRound className="size-5" /> {t("auth.passwordTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t("auth.passwordDesc", { phone: step.phone })}
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handlePasswordSubmit}>
                    <CardContent className="space-y-3">
                      <input type="hidden" name="phone" value={step.phone} />
                      <input type="hidden" name="flow" value="signIn" />
                      <div className="space-y-2">
                        <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          placeholder={t("auth.passwordPlaceholder")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          autoFocus
                          required
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-red-500 text-center">{error}</p>
                      )}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                          onClick={handleForgotPassword}
                          disabled={isLoading}
                        >
                          {t("auth.forgotPassword")}
                        </Button>
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || password.length < 8}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("auth.signingIn")}
                          </>
                        ) : (
                          <>
                            {t("auth.signIn")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleBack}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {t("auth.differentNumber")}
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )}

              {/* ─── Step 2c: Reset password (forgot password) ─── */}
              {typeof step === "object" && step.mode === "reset-otp" && (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                      <KeyRound className="size-5" /> {t("auth.resetTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t("auth.resetDesc", { phone: step.phone })}
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleResetPassword}>
                    <CardContent className="space-y-4">
                      <input type="hidden" name="phone" value={step.phone} />
                      <input type="hidden" name="flow" value="reset-verification" />
                      <input type="hidden" name="code" value={otp} />

                      <div className="flex justify-center">
                        <InputOTP
                          value={otp}
                          onChange={setOtp}
                          maxLength={6}
                          disabled={isLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                              const form = (e.target as HTMLElement).closest("form");
                              if (form) form.requestSubmit();
                            }
                          }}
                        >
                          <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
                        <Input
                          id="new-password"
                          name="newPassword"
                          type="password"
                          placeholder={t("common.minChars")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          autoFocus
                          required
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-red-500 text-center">{error}</p>
                      )}
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || otp.length !== 6 || password.length < 8}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("auth.resetting")}
                          </>
                        ) : (
                          <>
                            {t("auth.resetPassword")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleBack}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {t("auth.backToLogin")}
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )}

              {/* ─── Step 2b: OTP verify ─── */}
              {typeof step === "object" && step.mode === "otp" && (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                      <MessageSquare className="size-5" /> {t("auth.otpTitle")}
                    </CardTitle>
                    <CardDescription>
                      {isLoading
                        ? t("auth.sendingCode")
                        : t("auth.otpDesc", { phone: step.phone })}
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleOtpSubmit}>
                    <CardContent className="pb-4">
                      <input type="hidden" name="phone" value={step.phone} />
                      <input type="hidden" name="code" value={otp} />

                      <div className="flex justify-center">
                        <InputOTP
                          value={otp}
                          onChange={setOtp}
                          maxLength={6}
                          disabled={isLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                              const form = (e.target as HTMLElement).closest("form");
                              if (form) form.requestSubmit();
                            }
                          }}
                        >
                          <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      {error && (
                        <p className="mt-2 text-sm text-red-500 text-center">
                          {error}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground text-center mt-4">
                        {t("auth.didntGet")}{" "}
                        <Button
                          variant="link"
                          className="p-0 h-auto"
                          onClick={() => {
                            setError(null);
                            otpSentRef.current = false;
                            handleSendOtp(true);
                          }}
                        >
                          {t("common.resend")}
                        </Button>
                      </p>
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || otp.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("auth.verifying")}
                          </>
                        ) : (
                          <>
                            {t("auth.verify")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleBack}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {t("auth.differentNumber")}
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )}

              {/* ─── Step 3: Set a password (optional, after first OTP login) ─── */}
              {typeof step === "object" && step.mode === "set-password" && (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                      <KeyRound className="size-5" /> {t("auth.setPasswordTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t("auth.setPasswordDesc")}
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleSetPassword}>
                    <CardContent className="space-y-3">
                      <input type="hidden" name="phone" value={step.phone} />
                      <input type="hidden" name="flow" value="signUp" />
                      <div className="space-y-2">
                        <Label htmlFor="new-password">{t("auth.passwordLabel")}</Label>
                        <Input
                          id="new-password"
                          name="password"
                          type="password"
                          placeholder={t("common.minChars")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          autoFocus
                          required
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-red-500 text-center">{error}</p>
                      )}
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || password.length < 8}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("auth.saving")}
                          </>
                        ) : (
                          <>
                            {t("auth.savePassword")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleSkipPassword}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {t("common.skip")}
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )}
            </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
