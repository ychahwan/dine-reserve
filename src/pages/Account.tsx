import { CustomerShell } from "@/components/CustomerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarCheck2,
  Compass,
  Heart,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sofa,
  Sparkles,
  Store,
  UserRound,
  Wind,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { OCCASIONS } from "@/lib/format";
import { DIETARY_TAGS } from "@/lib/menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEAT_OPTIONS = [
  { value: "inside", label: "Inside", icon: Sofa },
  { value: "outside", label: "Outside", icon: Wind },
  { value: "bar", label: "Bar", icon: Users },
] as const;

export default function Account() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useMutation(api.users.updateProfile);
  const toggleFavorite = useMutation(api.users.toggleFavorite);
  const favorites = useQuery(api.users.myFavorites);
  const setPassword = useMutation(api.users.setPassword);
  const startPhoneChange = useMutation(api.users.startPhoneChange);
  const confirmPhoneChange = useMutation(api.users.confirmPhoneChange);

  // OTP-only diners have no password yet — setting one for the first time
  // doesn't require a "current" password.
  const hasPassword = useQuery(
    api.users.hasPasswordAccount,
    user?.phone ? { phone: user.phone } : "skip",
  );
  const needsCurrentPassword = hasPassword?.exists === true;

  const [name, setName] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [seating, setSeating] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Change phone (OTP to the NEW number) ──
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"idle" | "code-sent" | "verifying">("idle");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // ── Change password (with current password) ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name !== undefined) setName(user.name ?? "");
    if (user?.prefs) {
      setDietary(user.prefs.dietary ?? []);
      setSeating(user.prefs.seating ?? []);
      setOccasions(user.prefs.occasions ?? []);
    } else {
      setDietary([]);
      setSeating([]);
      setOccasions([]);
    }
  }, [user?.name, user?.prefs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        name,
        prefs: { dietary, seating: seating as ("inside" | "outside" | "bar")[], occasions },
      });
      toast.success("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  // Send an OTP to the NEW number — nothing moves until the code is verified.
  const handleStartPhoneChange = async () => {
    if (!newPhone.trim()) {
      setPhoneError("Enter the new phone number.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await startPhoneChange({ newPhone: newPhone.trim() });
      setPhoneStep("code-sent");
      setPhoneCode("");
      toast.success("Code sent to the new number");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleConfirmPhoneChange = async () => {
    if (phoneCode.length !== 6) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const updated = await confirmPhoneChange({ code: phoneCode });
      setPhoneStep("idle");
      setNewPhone("");
      setPhoneCode("");
      toast.success(`Phone updated to ${updated?.phone ?? "the new number"}`);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Incorrect code. Try again.");
      setPhoneCode("");
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await setPassword({
        newPassword,
        ...(needsCurrentPassword ? { currentPassword } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(needsCurrentPassword ? "Password updated" : "Password set");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setPwBusy(false);
    }
  };

  const toggleIn = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const handleRemoveFavorite = async (id: string, name: string) => {
    try {
      await toggleFavorite({ restaurantId: id as never });
      toast.success(`Removed ${name} from favorites`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update favorites.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isOwner = user?.role === "owner";
  const initials =
    (user?.name ?? "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <CustomerShell>
      <div className="px-4 pt-5 pb-6">
        <h1 className="text-xl font-bold tracking-tight">Your account</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Profile, preferences and security</p>

        {/* Profile card */}
        <Card className="mt-5 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-md shadow-primary/20">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{user?.name ?? "…"}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {user?.phone ?? user?.email ?? "…"}
                </p>
                <Badge
                  variant="secondary"
                  className="mt-1.5 gap-1 rounded-full text-[10px] uppercase tracking-wide"
                >
                  {isOwner ? (
                    <>
                      <Store className="size-3" /> Restaurant owner
                    </>
                  ) : (
                    <>
                      <UserRound className="size-3" /> Diner
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit form */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="acc-name">Name</Label>
                <Input
                  id="acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone (for SMS confirmations)</Label>
                <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {user?.phone ?? "Not set"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-primary"
                    onClick={() => {
                      setPhoneStep("idle");
                      document
                        .getElementById("change-phone-card")
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    Change
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Changing your number sends a verification code to the new number first.
                </p>
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security — change phone (OTP on new number) + change password */}
        <Card
          id="change-phone-card"
          className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Change phone number */}
            <div className="rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Phone className="size-4 text-primary" /> Change phone number
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                We text a code to the <strong>new</strong> number. Your login and SMS
                confirmations move only after you verify it.
              </p>
              {phoneStep === "idle" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="tel"
                    placeholder="+961 71 123 456"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    disabled={phoneBusy}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStartPhoneChange}
                    disabled={phoneBusy || !newPhone.trim()}
                    className="shrink-0"
                  >
                    {phoneBusy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <MessageSquare className="mr-2 size-4" />
                    )}
                    Send code
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code sent to <strong>{newPhone}</strong>
                  </p>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                    <InputOTP
                      value={phoneCode}
                      onChange={setPhoneCode}
                      maxLength={6}
                      disabled={phoneBusy}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPhoneStep("idle");
                          setPhoneError(null);
                          setPhoneCode("");
                        }}
                        disabled={phoneBusy}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirmPhoneChange}
                        disabled={phoneBusy || phoneCode.length !== 6}
                      >
                        {phoneBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Confirm
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Didn&apos;t get it?{" "}
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={handleStartPhoneChange}
                      disabled={phoneBusy}
                    >
                      Resend code
                    </Button>
                  </p>
                </div>
              )}
              {phoneError && (
                <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {phoneError}
                </p>
              )}
            </div>

            {/* Change password */}
            <div className="rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4 text-primary" /> Change password
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {needsCurrentPassword
                  ? "Use your current password. If you forgot it, sign out and use “Forgot password?” on the login screen — a temporary code is texted to your phone."
                  : "You don't have a password yet — set one here so you can log in without SMS."}
              </p>
              <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
                {needsCurrentPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="acc-current-password">Current password</Label>
                    <Input
                      id="acc-current-password"
                      type="password"
                      placeholder="Your current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={pwBusy}
                      required
                    />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="acc-new-password">New password</Label>
                    <Input
                      id="acc-new-password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={pwBusy}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-confirm-password">Confirm new password</Label>
                    <Input
                      id="acc-confirm-password"
                      type="password"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={pwBusy}
                      required
                    />
                  </div>
                </div>
                {pwError && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {pwError}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={pwBusy || newPassword.length < 8 || newPassword !== confirmPassword}
                  className="w-full sm:w-auto"
                >
                  {pwBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Dining preferences — pre-fills booking + powers dietary search */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" /> Dining preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Dietary</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleIn(dietary, setDietary, d)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      dietary.includes(d)
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Seating vibe</p>
              <div className="flex flex-wrap gap-2">
                {SEAT_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleIn(seating, setSeating, s.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      seating.includes(s.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <s.icon className="size-3.5" /> {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Occasions you celebrate</p>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleIn(occasions, setOccasions, o.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      occasions.includes(o.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.emoji} {o.value}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These are used to personalize your search and booking experience.
            </p>
          </CardContent>
        </Card>

        {/* Favorites */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-primary" /> Saved restaurants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favorites === undefined ? (
              <div className="flex justify-center py-4">
                <Spinner className="size-5" />
              </div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tap the ♥ on any restaurant to save it here for quick access.
              </p>
            ) : (
              <div className="space-y-2">
                {favorites.map((r) => (
                  <div key={r._id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt={r.name} className="size-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store className="size-5" />
                      </div>
                    )}
                    <Link to={`/restaurant/${r._id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.neighborhood || r.city}, {r.city} · {r.cuisine}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleRemoveFavorite(r._id, r.name)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
                      aria-label={`Remove ${r.name} from favorites`}
                    >
                      <Heart className="size-4 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardContent className="divide-y divide-border/60 p-0">
            <Link
              to="/explore"
              className="flex items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
            >
              <Compass className="size-4 text-primary" /> Explore restaurants
            </Link>
            <Link
              to="/bookings"
              className="flex items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
            >
              <CalendarCheck2 className="size-4 text-primary" /> My bookings
            </Link>
            {isOwner && (
              <Link
                to="/owner"
                className="flex items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
              >
                <Store className="size-4 text-primary" /> Owner dashboard
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </CardContent>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" /> Your data is protected — seat
          bookings are atomic and can never double-book.
        </p>

        {isLoading && (
          <div className="flex justify-center pt-4">
            <Spinner className="size-5" />
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
