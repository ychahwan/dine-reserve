import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Eye, EyeOff, Loader2, Store, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export default function AdminRegister() {
  const registerRestaurant = useMutation(api.admin.registerRestaurant);

  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [priceRange, setPriceRange] = useState<string>("$$");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({ ...EMPTY_FEATURES });
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPass, setShowTempPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFeature = (key: FeatureKey) => setFeatures((f) => ({ ...f, [key]: !f[key] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // HTML required accepts whitespace-only input — enforce the real minimum.
    if (tempPassword.trim().length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await registerRestaurant({
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
        ownerPhone,
        ownerName,
        tempPassword,
      });
      toast.success(`Restaurant registered. Owner ${ownerName} must change their password on first login.`);
      setName(""); setCuisine(""); setCity(""); setAddress(""); setPhone("");
      setDescription(""); setImageUrl(""); setFeatures({ ...EMPTY_FEATURES });
      setOwnerPhone(""); setOwnerName(""); setTempPassword("");
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the restaurant.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Store className="size-5" /> Register restaurant
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the restaurant and its owner account in one step.
        </p>
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UtensilsCrossed className="size-4 text-primary" /> New restaurant
          </CardTitle>
          <CardDescription>
            The owner signs in with the temporary password and is required to set a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="mb-3 text-sm font-semibold">Owner account</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a-owner-name">Owner name *</Label>
                  <Input id="a-owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Marco Rossi" required disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-owner-phone">Owner phone *</Label>
                  <Input id="a-owner-phone" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="+39 02 555 0101" type="tel" required disabled={saving} />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="a-temp-pass">Temporary password *</Label>
                <div className="relative">
                  <Input id="a-temp-pass" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="At least 8 characters" type={showTempPass ? "text" : "password"} required minLength={8} disabled={saving} className="pr-10" />
                  <button type="button" tabIndex={-1} onClick={() => setShowTempPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showTempPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Share this with the owner — they must change it at first login.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="r-name">Restaurant name *</Label>
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
                  <SelectTrigger id="r-price" className="w-full"><SelectValue placeholder="Price" /></SelectTrigger>
                  <SelectContent>
                    {PRICE_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
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
                <Label htmlFor="r-phone">Restaurant phone</Label>
                <Input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 02 …" disabled={saving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-image">Photo URL</Label>
                <Input id="r-image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" disabled={saving} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-desc">Description</Label>
              <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What makes your place special?" disabled={saving} />
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

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? (<><Loader2 className="size-4 animate-spin" /> Registering…</>) : "Register restaurant"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
