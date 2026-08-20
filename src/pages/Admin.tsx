import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Store, UserCog, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";

import { cn } from "@/lib/utils";
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

export default function Admin() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useQuery(api.admin.isAdmin);

  const [tab, setTab] = useState<"register" | "tag">("register");

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (isAdmin === false) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">Kamix Admin</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              className="text-muted-foreground"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight">Platform admin</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Register restaurants and manage their owner accounts.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("register")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
              tab === "register"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Store className="size-4" /> Register restaurant
          </button>
          <button
            type="button"
            onClick={() => setTab("tag")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
              tab === "tag"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <UserCog className="size-4" /> Tag owner
          </button>
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "register" ? <RegisterRestaurant /> : <TagOwner />}
        </motion.div>
      </main>
    </div>
  );
}

function RegisterRestaurant() {
  const registerRestaurant = useMutation(api.admin.registerRestaurant);
  const navigate = useNavigate();

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

  const toggleFeature = (key: FeatureKey) =>
    setFeatures((f) => ({ ...f, [key]: !f[key] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const id = await registerRestaurant({
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
      toast.success(
        `Restaurant registered. Owner ${ownerName} must change their password on first login.`,
      );
      // Reset the form; the owner manages the restaurant from their own account.
      setName("");
      setCuisine("");
      setCity("");
      setAddress("");
      setPhone("");
      setDescription("");
      setImageUrl("");
      setFeatures({ ...EMPTY_FEATURES });
      setOwnerPhone("");
      setOwnerName("");
      setTempPassword("");
      void id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the restaurant.");
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/70 p-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UtensilsCrossed className="size-4 text-primary" /> New restaurant
        </CardTitle>
        <CardDescription>
          Creates the restaurant and its owner account. The owner signs in with
          the temporary password and is required to set a new one.
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
                <Input id="a-temp-pass" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="At least 8 characters" type={showTempPass ? "text" : "password"} required disabled={saving} className="pr-10" />
                <button type="button" tabIndex={-1} onClick={() => setShowTempPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showTempPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this with the owner — they must change it at first login.
              </p>
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

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Registering…
              </>
            ) : (
              "Register restaurant"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TagOwner() {
  const tagAsRestaurant = useMutation(api.admin.tagAsRestaurant);
  const ensureOwnerPassword = useMutation(api.admin.ensureOwnerPassword);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTagPass, setShowTagPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await tagAsRestaurant({
        phone,
        name: name || undefined,
      });
      // If the account has no password yet, create one so the owner can sign in.
      if (tempPassword.length >= 8) {
        await ensureOwnerPassword({ phone, tempPassword });
      }
      toast.success(`Account tagged as restaurant (${result?.name || phone}).`);
      setPhone("");
      setName("");
      setTempPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not tag the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/70 p-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="size-4 text-primary" /> Tag an account as restaurant
        </CardTitle>
        <CardDescription>
          Promote an existing account to restaurant owner. They must set a new
          password on their next login.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleTag} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-phone">Account phone *</Label>
            <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 71 123 456" type="tel" required disabled={saving} />
            <p className="text-xs text-muted-foreground">
              The account must already exist (registered with this phone).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-name">Owner name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-pass">Temporary password (optional)</Label>
            <div className="relative">
              <Input id="t-pass" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="At least 8 characters — if the account has none" type={showTagPass ? "text" : "password"} disabled={saving} className="pr-10" />
              <button type="button" tabIndex={-1} onClick={() => setShowTagPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showTagPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
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
                <Loader2 className="size-4 animate-spin" /> Tagging…
              </>
            ) : (
              "Tag as restaurant"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
