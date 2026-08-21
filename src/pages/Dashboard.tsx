import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Loader2, Utensils } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "convex/react";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Not signed in — RequireAuth handles this, but be safe.
  if (!user) return <Navigate to="/auth" replace />;

  // Restaurant accounts that must set a new password go there first.
  if (user.mustChangePassword) return <Navigate to="/set-password" replace />;

  // Already onboarded → send to the right workspace.
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "customer") return <Navigate to="/explore" replace />;
  if (user.role === "owner") return <Navigate to="/owner" replace />;

  // Fresh user → diner onboarding.
  return <Onboarding key={user._id} onDone={() => navigate("/explore", { replace: true })} />;
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const onboard = useMutation(api.users.onboard);
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Everyone who signs up through the app is a diner. Restaurant accounts
      // are created and tagged by the platform admin.
      await onboard({ role: "customer", name, phone: phone || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboard.error"));
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Utensils className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("onboard.welcome")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("onboard.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t("onboard.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboard.namePlaceholder")}
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t("common.phone")}</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 010 2030"
              type="tel"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              {t("onboard.phoneHint")}
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("onboard.settingUp")}
              </>
            ) : (
              t("onboard.start")
            )}
          </Button>
        </form>
      </motion.div>
    </main>
  );
}
