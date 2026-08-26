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
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * Forced password change. Restaurant accounts created/tagged by the platform
 * admin arrive here (users.mustChangePassword) and must set a new password
 * before they can use the app.
 */
export default function SetPassword() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const setPassword = useMutation(api.users.setPassword);
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Check if the user already has a password account. If not (OTP-only
  // user tagged as restaurant), the "current password" field is unnecessary.
  const hasPassword = useQuery(
    api.users.hasPasswordAccount,
    user?.phone ? { phone: user.phone } : "skip",
  );

  const showCurrentPassword = hasPassword?.exists === true;
  const passwordStatusLoading = hasPassword === undefined;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError(t("setpw.errMin"));
      return;
    }
    // Mirror the backend's intent: no whitespace-only secrets, sane upper bound.
    if (!/\S/.test(newPassword) || newPassword.length > 128) {
      setError(t("setpw.errMin"));
      return;
    }
    if (newPassword !== confirm) {
      setError(t("setpw.errMatch"));
      return;
    }
    setSaving(true);
    try {
      await setPassword({
        newPassword,
        currentPassword: currentPassword || undefined,
      });
      // Role-based redirect (same logic as Auth.tsx resolveTarget).
      // Never redirect to /dashboard — it checks mustChangePassword and could
      // loop back here before the Convex reactive query refreshes.
      const target =
        user?.role === "admin" ? "/admin"
        : user?.role === "owner" ? "/owner"
        : "/explore";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setpw.errGeneric"));
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-background via-background to-primary/5">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 size-80 rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-border/60 bg-card/90 shadow-none backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="size-6" />
              </div>
              <CardTitle className="text-xl">{t("setpw.title")}</CardTitle>
              <CardDescription className="mx-auto max-w-xs">
                {t("setpw.desc")}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-3">
              {showCurrentPassword && (
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t("setpw.current")}</Label>
                  <Input
                    id="current-password"
                    name="currentPassword"
                    type="password"
                    placeholder={t("setpw.currentPlaceholder")}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
              )}
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("setpw.new")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder={t("common.minChars")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("setpw.confirm")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder={t("setpw.confirmPlaceholder")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                {error && (
                  <p className="text-center text-sm text-red-500">{error}</p>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={saving || passwordStatusLoading || newPassword.length < 8 || newPassword !== confirm}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> {t("setpw.saving")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 size-4" /> {t("setpw.save")}
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
