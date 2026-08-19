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
import { useQuery } from "convex/react";
import { ArrowRight, Loader2, Phone, Store, KeyRound, MessageSquare } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type AuthStep =
  | "enter-phone"
  | { phone: string; mode: "password" }
  | { phone: string; mode: "otp" }
  | { phone: string; mode: "otp"; verified: true }
  | { phone: string; mode: "set-password" };

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [step, setStep] = useState<AuthStep>("enter-phone");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if phone has a password account (only query when we have a phone)
  const phone = typeof step === "object" ? step.phone : undefined;
  const hasPassword = useQuery(
    api.users.hasPasswordAccount,
    phone ? { phone } : "skip",
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Once we know whether the user has a password, route to the right step
  useEffect(() => {
    if (typeof step === "object" && step.mode === "otp" && hasPassword !== undefined) {
      // If we just entered phone and know the password status
      if (step.phone && hasPassword.exists) {
        setStep({ phone: step.phone, mode: "password" });
      }
    }
  }, [hasPassword, step]);

  // Step 1: Submit phone number
  const handlePhoneSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const phoneValue = formData.get("phone") as string;

    // Set step to trigger the hasPassword query
    setStep({ phone: phoneValue, mode: "otp" });
    setIsLoading(false);
  };

  // Step 2a: Password login
  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", formData);
      navigate(redirect);
    } catch (err) {
      console.error("Password sign-in error:", err);
      setError("Invalid phone number or password.");
      setIsLoading(false);
      setPassword("");
    }
  };

  // Step 2b: Send OTP
  const handleSendOtp = async () => {
    if (typeof step !== "object" || step.mode !== "otp" || hasPassword?.exists) return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("phone", step.phone);
      await signIn("phone-otp", formData);
      setStep({ phone: step.phone, mode: "otp" });
      setIsLoading(false);
    } catch (err) {
      console.error("OTP send error:", err);
      setError("Failed to send verification code. Please try again.");
      setIsLoading(false);
    }
  };

  // Auto-send OTP when we determine user has no password
  useEffect(() => {
    if (typeof step === "object" && step.mode === "otp" && step.phone && hasPassword && !hasPassword.exists) {
      handleSendOtp();
    }
  }, [hasPassword, step]);

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
      setError("The verification code is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  // Step 3: Set password after first OTP login
  const handleSetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", formData);
      navigate(redirect);
    } catch (err) {
      console.error("Set password error:", err);
      setError(err instanceof Error ? err.message : "Failed to set password.");
      setIsLoading(false);
    }
  };

  const handleSkipPassword = () => {
    navigate(redirect);
  };

  const handleBack = () => {
    setStep("enter-phone");
    setPassword("");
    setOtp("");
    setError(null);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Decorative theme */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Brand */}
      <div className="relative flex justify-center pt-10">
        <button
          onClick={() => navigate("/")}
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
            <Store className="size-5" />
          </span>
          <span className="text-left">
            <span className="block text-lg font-bold leading-tight tracking-tight">
              Kamix
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Reserve great tables
            </span>
          </span>
        </button>
      </div>

      {/* Auth Content */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-sm border-border/70 shadow-xl shadow-black/5">

          {/* ─── Step 1: Enter phone ─── */}
          {step === "enter-phone" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Welcome</CardTitle>
                <CardDescription>
                  Enter your phone number to continue
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePhoneSubmit}>
                <CardContent>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="phone"
                        placeholder="+961 71 123 456"
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
                  <KeyRound className="size-5" /> Password login
                </CardTitle>
                <CardDescription>
                  Enter your password for {step.phone}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePasswordSubmit}>
                <CardContent className="space-y-3">
                  <input type="hidden" name="phone" value={step.phone} />
                  <input type="hidden" name="flow" value="signIn" />
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
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
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
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
                    Use a different phone number
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {/* ─── Step 2b: OTP verify ─── */}
          {typeof step === "object" && step.mode === "otp" && !hasPassword?.exists && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <MessageSquare className="size-5" /> Verify your phone
                </CardTitle>
                <CardDescription>
                  {isLoading
                    ? "Sending code..."
                    : `Enter the code sent to ${step.phone}`}
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
                    Didn't receive a code?{" "}
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => {
                        setError(null);
                        handleSendOtp();
                      }}
                    >
                      Resend
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
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify
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
                    Use a different phone number
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
                  <KeyRound className="size-5" /> Set a password
                </CardTitle>
                <CardDescription>
                  Speed up your next login — no SMS needed
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSetPassword}>
                <CardContent className="space-y-3">
                  <input type="hidden" name="phone" value={step.phone} />
                  <input type="hidden" name="flow" value="signUp" />
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password</Label>
                    <Input
                      id="new-password"
                      name="password"
                      type="password"
                      placeholder="At least 8 characters"
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
                        Saving...
                      </>
                    ) : (
                      <>
                        Save password
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
                    Skip for now
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

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
