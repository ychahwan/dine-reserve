import { CustomerShell } from "@/components/CustomerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarCheck2,
  Compass,
  Heart,
  Loader2,
  LogOut,
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

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [seating, setSeating] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name !== undefined) setName(user.name ?? "");
    if (user?.phone !== undefined) setPhone(user.phone ?? "");
    if (user?.prefs) {
      setDietary(user.prefs.dietary ?? []);
      setSeating(user.prefs.seating ?? []);
      setOccasions(user.prefs.occasions ?? []);
    } else {
      setDietary([]);
      setSeating([]);
      setOccasions([]);
    }
  }, [user?.name, user?.phone, user?.prefs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        name,
        phone: phone || undefined,
        prefs: { dietary, seating: seating as ("inside" | "outside" | "bar")[], occasions },
      });
      toast.success("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
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
                  {user?.email ?? (user?.isAnonymous ? "Guest account" : "…")}
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
                <Label htmlFor="acc-phone">Phone (for SMS confirmations)</Label>
                <Input
                  id="acc-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 010 2030"
                  type="tel"
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Booking confirmations and day-before reminders are sent here by SMS.
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
