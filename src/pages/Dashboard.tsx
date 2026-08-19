import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Loader2, ShoppingBag, Store, Utensils } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
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

  // Already onboarded → send to the right workspace.
  if (user.role === "customer") return <Navigate to="/explore" replace />;
  if (user.role === "owner") return <Navigate to="/owner" replace />;

  // Fresh user → onboarding.
  return <Onboarding key={user._id} onDone={() => navigate("/dashboard", { replace: true })} />;
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const onboard = useMutation(api.users.onboard);
  // The login page passes ?role=customer|owner so first-run onboarding
  // opens with the role already picked — no redundant tap.
  const [searchParams] = useSearchParams();
  const paramRole = searchParams.get("role");
  const [role, setRole] = useState<"customer" | "owner" | null>(
    paramRole === "owner" ? "owner" : paramRole === "customer" ? "customer" : null,
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setError(null);
    setSaving(true);
    try {
      await onboard({ role, name, phone: phone || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Utensils className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Kamix</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us who you are and we&apos;ll set up your space.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setRole("customer")}
              className={
                "group rounded-2xl border-2 p-4 text-left transition-all " +
                (role === "customer"
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40")
              }
            >
              <ShoppingBag className={"mb-3 size-6 " + (role === "customer" ? "text-primary" : "text-muted-foreground")} />
              <p className="font-semibold">I&apos;m a diner</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Find restaurants, check availability and book tables.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setRole("owner")}
              className={
                "group rounded-2xl border-2 p-4 text-left transition-all " +
                (role === "owner"
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40")
              }
            >
              <Store className={"mb-3 size-6 " + (role === "owner" ? "text-primary" : "text-muted-foreground")} />
              <p className="font-semibold">I run a restaurant</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Publish availability, manage menus and track bookings.
              </p>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (for SMS confirmations)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 010 2030"
              type="tel"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Optional — but booking confirmations by SMS need it.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={!role || saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Setting up…
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </form>
      </motion.div>
    </main>
  );
}
