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
import { Trans, useTranslation } from "react-i18next";
import { OCCASIONS } from "@/lib/format";
import { DIETARY_TAGS } from "@/lib/menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEAT_OPTIONS = [
  { value: "inside", key: "common.inside", icon: Sofa },
  { value: "outside", key: "common.outside", icon: Wind },
  { value: "bar", key: "common.bar", icon: Users },
] as const;

export default function Account() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const updateProfile = useMutation(api.users.updateProfile);
  const toggleFavorite = useMutation(api.users.toggleFavorite);
  const favorites = useQuery(api.users.myFavorites);
  const loyalty = useQuery(api.loyalty.myBalance);
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
      toast.success(t("account.updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.errSave"));
    } finally {
      setSaving(false);
    }
  };

  // Send an OTP to the NEW number — nothing moves until the code is verified.
  const handleStartPhoneChange = async () => {
    if (!newPhone.trim()) {
      setPhoneError(t("account.errPhoneEmpty"));
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await startPhoneChange({ newPhone: newPhone.trim() });
      setPhoneStep("code-sent");
      setPhoneCode("");
      toast.success(t("account.codeSent"));
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : t("account.errPhoneSend"));
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
      toast.success(t("account.phoneUpdated", { phone: updated?.phone ?? t("account.notSet") }));
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : t("account.errPhoneConfirm"));
      setPhoneCode("");
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError(t("account.pwMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("account.pwMatch"));
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
      toast.success(needsCurrentPassword ? t("account.pwUpdated") : t("account.pwSet"));
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t("setpw.errGeneric"));
    } finally {
      setPwBusy(false);
    }
  };

  const toggleIn = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const handleRemoveFavorite = async (id: string, name: string) => {
    try {
      await toggleFavorite({ restaurantId: id as never });
      toast.success(t("explore.favRemoved", { name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("explore.favError"));
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
        <h1 className="text-xl font-bold tracking-tight">{t("account.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("account.subtitle")}</p>

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
                      <Store className="size-3" /> {t("account.ownerBadge")}
                    </>
                  ) : (
                    <>
                      <UserRound className="size-3" /> {t("account.dinerBadge")}
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kamix Points (Idea #18) */}
        <Card className="mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl">⭐</span>
                <div>
                  <p className="font-semibold">{t("account.pointsTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("account.pointsSub")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tracking-tight text-primary">
                  {loyalty?.points ?? "…"}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("account.points")}</p>
              </div>
            </div>
            {(loyalty?.activity ?? []).length > 0 && (
              <div className="mt-4 space-y-1.5">
                {loyalty!.activity.slice(0, 5).map((a) => (
                  <div key={a._id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {a.source === "booking_completed"
                        ? t("account.actBooking")
                        : a.source === "review"
                          ? t("account.actReview")
                          : a.source === "gift_sent"
                            ? t("account.actGift")
                            : t("account.actCheckin")}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      +{a.amount} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit form */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("account.contactTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="acc-name">{t("account.name")}</Label>
                <Input
                  id="acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("account.namePlaceholder")}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("account.phoneLabel")}</Label>
                <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {user?.phone ?? t("account.notSet")}
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
                    {t("account.change")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("account.phoneHint")}
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
                    <Loader2 className="size-4 animate-spin" /> {t("account.saving")}
                  </>
                ) : (
                  t("account.saveChanges")
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
              <ShieldCheck className="size-4 text-primary" /> {t("account.securityTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Change phone number */}
            <div className="rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Phone className="size-4 text-primary" /> {t("account.changePhone")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Trans i18nKey="account.changePhoneHint">
                  We text a code to the <strong>new</strong> number. Your login and SMS
                  confirmations move only after you verify it.
                </Trans>
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
                    {t("account.sendCode")}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    <Trans i18nKey="account.enterCode" values={{ phone: newPhone }} components={{ strong: <strong /> }} />
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
                        {t("common.back")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirmPhoneChange}
                        disabled={phoneBusy || phoneCode.length !== 6}
                      >
                        {phoneBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {t("account.confirm")}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("auth.didntGet")}{" "}
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={handleStartPhoneChange}
                      disabled={phoneBusy}
                    >
                      {t("account.resendCode")}
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
                <KeyRound className="size-4 text-primary" /> {t("account.changePassword")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {needsCurrentPassword
                  ? t("account.changePasswordHint")
                  : t("account.setPasswordHint")}
              </p>
              <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
                {needsCurrentPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="acc-current-password">{t("account.currentPassword")}</Label>
                    <Input
                      id="acc-current-password"
                      type="password"
                      placeholder={t("account.currentPasswordPlaceholder")}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={pwBusy}
                      required
                    />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="acc-new-password">{t("account.newPassword")}</Label>
                    <Input
                      id="acc-new-password"
                      type="password"
                      placeholder={t("common.minChars")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={pwBusy}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-confirm-password">{t("account.confirmPassword")}</Label>
                    <Input
                      id="acc-confirm-password"
                      type="password"
                      placeholder={t("account.confirmPasswordPlaceholder")}
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
                  {t("account.updatePassword")}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Dining preferences — pre-fills booking + powers dietary search */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" /> {t("account.prefsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t("account.prefsDietary")}</p>
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
              <p className="mb-2 text-sm font-medium">{t("account.prefsSeating")}</p>
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
                    <s.icon className="size-3.5" /> {t(s.key)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("account.prefsOccasions")}</p>
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
              {t("account.prefsHint")}
            </p>
          </CardContent>
        </Card>

        {/* Favorites */}
        <Card className="mt-4 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-primary" /> {t("account.savedTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favorites === undefined ? (
              <div className="flex justify-center py-4">
                <Spinner className="size-5" />
              </div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("account.savedEmpty")}
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
              <Compass className="size-4 text-primary" /> {t("account.exploreLink")}
            </Link>
            <Link
              to="/bookings"
              className="flex items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
            >
              <CalendarCheck2 className="size-4 text-primary" /> {t("account.myBookingsLink")}
            </Link>
            {isOwner && (
              <Link
                to="/owner"
                className="flex items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
              >
                <Store className="size-4 text-primary" /> {t("account.ownerLink")}
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
            >
              <LogOut className="size-4" /> {t("common.signOut")}
            </button>
          </CardContent>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" /> {t("account.footerNote")}
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
