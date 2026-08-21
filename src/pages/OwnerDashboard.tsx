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
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  Loader2,
  MapPin,
  Plus,
  Store,
  Users,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { today } from "@/lib/format";
import { DEMO_RESTAURANT_NAMES } from "@/lib/demo";
import { toast } from "sonner";

type FeatureKey = "inside" | "outside" | "bar" | "smoking" | "parking" | "liveMusic";

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
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({ ...EMPTY_FEATURES });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFeature = (key: FeatureKey) =>
    setFeatures((f) => ({ ...f, [key]: !f[key] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const id = await createRestaurant({
        name,
        cuisine,
        city,
        address,
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
      setError(err instanceof Error ? err.message : "Could not create the restaurant.");
      setSaving(false);
    }
  };

  return (
    <OwnerShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your restaurants</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage availability, menus and bookings
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Close" : (
            <>
              <Plus className="size-4" /> Add restaurant
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="mt-5 rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New restaurant</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="r-name">Name *</Label>
                  <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trullo" required disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-cuisine">Cuisine *</Label>
                  <Input id="r-cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g. Italian" required disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-city">City *</Label>
                  <Input id="r-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Milan" required disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-price">Price range</Label>
                  <Select value={priceRange} onValueChange={setPriceRange} disabled={saving}>
                    <SelectTrigger id="r-price" className="w-full">
                      <SelectValue placeholder="Price" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-address">Address *</Label>
                <Input id="r-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street and number" required disabled={saving} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="r-phone">Phone</Label>
                  <Input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 02 …" disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-image">Photo URL</Label>
                  <Input id="r-image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" disabled={saving} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-desc">Description</Label>
                <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What makes your place special?" disabled={saving} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Amenities</p>
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
                    <Loader2 className="size-4 animate-spin" /> Creating…
                  </>
                ) : (
                  "Create restaurant"
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
              <p className="font-medium">No restaurants yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Add your first restaurant to start publishing live availability and
                taking bookings.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> Add restaurant
            </Button>
          </div>
        ) : (
          restaurants.map((r) => <OwnerRestaurantCard key={r._id} id={r._id} />)
        )}
      </div>
    </OwnerShell>
  );
}

/** Card that loads its own today-bookings count so the list stays cheap. */
function OwnerRestaurantCard({ id }: { id: string }) {
  const data = useQuery(api.restaurants.get, { id: id as never });
  const todays = useQuery(api.bookings.byRestaurant, {
    restaurantId: id as never,
    date: today(),
  });
  const loadDemoRules = useMutation(api.demoRules.ensureDemoRules);
  const [demoLoading, setDemoLoading] = useState(false);

  if (!data) return null;
  const { restaurant: r, sections } = data;
  const totalCapacity = sections.reduce((sum, s) => sum + s.capacity, 0);
  const todayCount = (todays ?? []).filter((b) => b.status !== "cancelled").length;
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
      toast.error(err instanceof Error ? err.message : "Could not load example windows.");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <Link to={`/owner/restaurant/${r._id}`} className="block">
      <Card className="group overflow-hidden rounded-2xl border-border/70 p-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-4 p-4">
          {r.imageUrl ? (
            <img src={r.imageUrl} alt={r.name} className="size-14 shrink-0 rounded-xl object-cover" />
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
              <Badge variant="outline" className="text-[10px]">{r.cuisine}</Badge>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" /> {totalCapacity} seats
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarDays className="size-3" /> {todayCount} booked today
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
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      </Card>
    </Link>
  );
}
