import { OwnerShell } from "@/components/OwnerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Loader2, MapPin, Plus, Store, Wand2 } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { DEMO_RESTAURANT_NAMES } from "@/lib/demo";
import { toast } from "sonner";

type FeatureKey =
  | "inside"
  | "outside"
  | "bar"
  | "smoking"
  | "parking"
  | "liveMusic";

const FEATURE_OPTIONS: { key: FeatureKey; label: string }[] = [
  { key: "inside", label: "Inside" },
  { key: "outside", label: "Outside" },
  { key: "bar", label: "Bar" },
  { key: "smoking", label: "Smoking area" },
  { key: "parking", label: "Parking" },
  { key: "liveMusic", label: "Live music" },
];

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$"];

const EMPTY_FEATURES: Record<FeatureKey, boolean> = {
  inside: true,
  outside: false,
  bar: false,
  smoking: false,
  parking: false,
  liveMusic: false,
};

// Demo restaurants that ship with predefined service windows; owners can
// restore them with one tap when they've been removed. KB-14: imported from
// the backend so the UI list can never drift from the actual demo definitions
// (previously it listed a non-existent "Casa Oliva" and missed two real ones).

export default function OwnerDashboard() {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (user === null) return <Navigate to="/" replace />;
  if (user.role !== "owner" && user.role !== "admin")
    return <Navigate to="/dashboard" replace />;
  return <OwnerDashboardContent />;
}

function OwnerDashboardContent() {
  const { t } = useTranslation();
  const restaurants = useQuery(api.restaurants.listMine);
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const createRestaurant = useMutation(api.restaurants.create);

  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [priceRange, setPriceRange] = useState<string>("$$");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    ...EMPTY_FEATURES,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFeature = (key: FeatureKey) =>
    setFeatures((f) => ({ ...f, [key]: !f[key] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // L-37: HTML `required` accepts whitespace-only values — trim-validate first.
    if (!name.trim() || !cuisine.trim() || !city.trim() || !address.trim()) {
      setError("Name, cuisine, city and address are required.");
      return;
    }
    setSaving(true);
    try {
      const id = await createRestaurant({
        name: name.trim(),
        cuisine: cuisine.trim(),
        city: city.trim(),
        address: address.trim(),
        phone: phone || undefined,
        priceRange: priceRange || undefined,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        features: {
          inside: features.inside,
          outside: features.outside,
          bar: features.bar,
          smoking: features.smoking,
          parking: features.parking,
          liveMusic: features.liveMusic,
        },
      });
      toast.success("Restaurant created");
      navigate(`/owner/restaurant/${id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the restaurant.",
      );
      setSaving(false);
    }
  };

  return (
    <OwnerShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("owner.yourRestaurants")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("owner.manageSubtitle")}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? (
            t("common.close")
          ) : (
            <>
              <Plus className="size-4" /> {t("owner.addRestaurant")}
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="mt-5 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("owner.newRestaurant")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="r-name">{t("owner.nameLabel")}</Label>
                  <Input
                    id="r-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("owner.namePlaceholder")}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-cuisine">{t("owner.cuisineLabel")}</Label>
                  <Input
                    id="r-cuisine"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    placeholder={t("owner.cuisinePlaceholder")}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-city">{t("owner.cityLabel")}</Label>
                  <Input
                    id="r-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t("owner.cityPlaceholder")}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-price">{t("owner.priceRange")}</Label>
                  <Select
                    value={priceRange}
                    onValueChange={setPriceRange}
                    disabled={saving}
                  >
                    <SelectTrigger id="r-price" className="w-full">
                      <SelectValue placeholder={t("owner.pricePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-address">{t("owner.addressLabel")}</Label>
                <Input
                  id="r-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("owner.addressPlaceholder")}
                  required
                  disabled={saving}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="r-phone">{t("owner.phoneLabel")}</Label>
                  <Input
                    id="r-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+39 02 …"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-image">{t("owner.photoUrl")}</Label>
                  <Input
                    id="r-image"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-desc">{t("owner.descLabel")}</Label>
                <Textarea
                  id="r-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t("owner.descPlaceholder")}
                  disabled={saving}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("owner.amenities")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEATURE_OPTIONS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleFeature(f.key)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        features[f.key]
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />{" "}
                    {t("owner.saving")}
                  </>
                ) : (
                  t("owner.addRestaurant")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="mt-6 space-y-3 pb-6">
        {restaurants === undefined ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Spinner className="size-6" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <Store className="size-9 text-muted-foreground/60" />
            <div>
              <p className="font-medium">{t("owner.noRestaurants")}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {t("owner.noRestaurantsHint")}
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> {t("owner.addRestaurant")}
            </Button>
          </div>
        ) : (
          restaurants.map((restaurant) => (
            <OwnerRestaurantCard key={restaurant._id} restaurant={restaurant} />
          ))
        )}
      </div>
    </OwnerShell>
  );
}

/** Lightweight card backed by the already-subscribed owner restaurant list. */
function OwnerRestaurantCard({
  restaurant: r,
}: {
  restaurant: Doc<"restaurants">;
}) {
  const navigate = useNavigate();
  const loadDemoRules = useMutation(api.demoRules.ensureDemoRules);
  const [demoLoading, setDemoLoading] = useState(false);

  const isDemo = DEMO_RESTAURANT_NAMES.includes(r.name);

  const handleLoadDemo = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      await loadDemoRules({ restaurant: r.name, force: true });
      toast.success(`Example service windows loaded for ${r.name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load example windows.",
      );
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    // L-37: a button can't be nested inside a Link — make the card a plain
    // div that navigates, keeping the demo button a real, accessible button.
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${r.name}`}
      onClick={() => navigate(`/owner/restaurant/${r._id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/owner/restaurant/${r._id}`);
        }
      }}
      className="block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="group overflow-hidden rounded-2xl border-border/70 p-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-4 p-4">
          {r.imageUrl ? (
            <img
              src={r.imageUrl}
              alt={r.name}
              loading="lazy"
              decoding="async"
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="size-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{r.name}</p>
              <Badge variant="secondary">{r.priceRange ?? "–"}</Badge>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {r.neighborhood || r.city}, {r.city}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {r.cuisine}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Manage restaurant
              </span>
            </div>
            {isDemo && (
              <button
                onClick={handleLoadDemo}
                disabled={demoLoading}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/40 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                {demoLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Wand2 className="size-3" />
                )}
                Load example service windows
              </button>
            )}
          </div>
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      </Card>
    </div>
  );
}
