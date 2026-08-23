import { OwnerShell } from "@/components/OwnerShell";
import { OwnerMenuTab } from "@/components/OwnerMenuTab";
import { OwnerNotificationsTab } from "@/components/OwnerNotificationsTab";
import { OwnerInsightsTab } from "@/components/OwnerInsightsTab";
import { AvailabilityTab, BookingsTab, OwnerCustomersTab, SlotRulesTab } from "@/components/OwnerRestaurantTabs";
import {
  DiningTabCount,
  OwnerAssistsTab,
  OwnerMenuRequestsTab,
  OwnerOrdersTab,
} from "@/components/OwnerDiningTabs";
import { OwnerGiftsTab, OwnerGiftsTabCount } from "@/components/OwnerGiftsTab";
import { OwnerStoriesTab } from "@/components/OwnerStoriesTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChefHat,
  Cigarette,
  Eye,
  Loader2,
  MapPin,
  Pencil,
  ShieldCheck,
  Sofa,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { today } from "@/lib/format";
import { DAY_ROWS, KIND_LABEL, type Kind } from "@/lib/seating";
import { toast } from "sonner";

type FeatureKey = "inside" | "outside" | "bar" | "smoking" | "parking" | "liveMusic" | "soloFriendly";
const FEATURE_OPTIONS: { key: FeatureKey; label: string }[] = [
  { key: "inside", label: "Inside" },
  { key: "outside", label: "Outside" },
  { key: "bar", label: "Bar" },
  { key: "smoking", label: "Smoking area" },
  { key: "parking", label: "Parking" },
  { key: "liveMusic", label: "Live music" },
  { key: "soloFriendly", label: "Solo-friendly" },
];

const POLICY_OPTIONS = [
  { value: 0, label: "No policy (always free)" },
  { value: 1, label: "Free until 1 hour before" },
  { value: 2, label: "Free until 2 hours before" },
  { value: 4, label: "Free until 4 hours before" },
  { value: 12, label: "Free until 12 hours before" },
  { value: 24, label: "Free until 24 hours before" },
  { value: 48, label: "Free until 48 hours before" },
];

type HoursRow = { dayOfWeek: number; open: string; close: string; enabled: boolean };

export default function OwnerRestaurant() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useQuery(api.restaurants.get, { id: id as never });
  const claimDemo = useMutation(api.restaurants.claimDemo);
  const [claiming, setClaiming] = useState(false);
  const [tab, setTab] = useState("overview");

  if (!data) {
    return (
      <OwnerShell title="Restaurant" onBack={() => navigate("/owner")}>
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-sm">Loading restaurant…</p>
        </div>
      </OwnerShell>
    );
  }

  const { restaurant: r, sections, menuDocs, isOwner, ownerIsDemo } = data;

  const handleClaimDemo = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await claimDemo({ id: r._id });
      toast.success(`You are now the owner of ${r.name} — bookings and notifications are visible.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim this restaurant.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <OwnerShell title={r.name} onBack={() => navigate("/owner")}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt={r.name} className="size-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Store className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight">{r.name}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {r.neighborhood || r.city}, {r.city} · {r.cuisine}
          </p>
        </div>
      </div>

      {/* Ownership notice: this account can't see this restaurant's bookings. */}
      {isOwner === false && (
        <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                You don't own {r.name} — that's why bookings and notifications look empty
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                Bookings and notifications are only shown to the restaurant's owner account.
                If you booked a table here with a different account, it won't appear in this
                manager view. Sign in with the account that owns this restaurant, or take
                ownership of this demo restaurant below.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild className="border-amber-700/30 text-amber-900 dark:text-amber-200">
                  <Link to={`/restaurant/${r._id}`}>
                    <Eye className="size-3.5" /> View as diner
                  </Link>
                </Button>
                {ownerIsDemo && (
                  <Button size="sm" onClick={handleClaimDemo} disabled={claiming}>
                    {claiming ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Store className="size-3.5" />
                    )}
                    Become the demo owner
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
          {[
            { key: "overview", label: "Profile" },
            { key: "seating", label: "Seating" },
            { key: "hours", label: "Hours" },
            { key: "slots", label: "Slot rules" },
            { key: "availability", label: "Availability" },
            { key: "menu", label: "Menu" },
            { key: "bookings", label: "Bookings" },
            { key: "customers", label: "Customers" },
            { key: "orders", label: "Orders", badge: "orders" as const },
            { key: "requests", label: "Requests", badge: "assists" as const },
            { key: "menuideas", label: "Menu ideas", badge: "menuRequests" as const },
            { key: "gifts", label: "Gifts", badge: "gifts" as const },
            { key: "stories", label: "Stories" },
            { key: "insights", label: "Insights" },
            { key: "notifications", label: "Notifications", badge: "notifications" as const },
          ].map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="shrink-0 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {t.key === "insights" && <BarChart3 className="mr-1 size-3" />}
              {t.label}
              {t.badge === "notifications" && (
                <NotificationsBadge restaurantId={r._id} active={tab === "notifications"} />
              )}
              {t.badge === "gifts" && <OwnerGiftsTabCount restaurantId={r._id} />}
              {t.badge && t.badge !== "notifications" && t.badge !== "gifts" && (
                <DiningTabCount restaurantId={r._id} kind={t.badge} />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <OverviewTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="seating" className="mt-5">
          <SeatingTab restaurantId={r._id} sections={sections} />
        </TabsContent>
        <TabsContent value="hours" className="mt-5">
          <HoursTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="slots" className="mt-5">
          <SlotRulesTab restaurantId={r._id} sections={sections} />
        </TabsContent>
        <TabsContent value="availability" className="mt-5">
          <AvailabilityTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="menu" className="mt-5">
          <OwnerMenuTab restaurantId={r._id} menuDocs={menuDocs} />
        </TabsContent>
        <TabsContent value="bookings" className="mt-5">
          <BookingsTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="customers" className="mt-5">
          <OwnerCustomersTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="orders" className="mt-5">
          <OwnerOrdersTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="requests" className="mt-5">
          <OwnerAssistsTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="menuideas" className="mt-5">
          <OwnerMenuRequestsTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="gifts" className="mt-5">
          <OwnerGiftsTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="stories" className="mt-5">
          <OwnerStoriesTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="insights" className="mt-5">
          <OwnerInsightsTab restaurantId={r._id} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-5">
          <OwnerNotificationsTab restaurantId={r._id} />
        </TabsContent>
      </Tabs>
    </OwnerShell>
  );
}

function NotificationsBadge({ restaurantId, active }: { restaurantId: string; active: boolean }) {
  const unread = useQuery(api.notifications.unreadCount, {
    restaurantId: restaurantId as never,
  });
  if (!unread || unread === 0) return null;
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4",
        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive text-white",
      )}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Overview: edit profile + amenities + cancellation policy
// ---------------------------------------------------------------------------

function OverviewTab({ restaurantId }: { restaurantId: string }) {
  const data = useQuery(api.restaurants.get, { id: restaurantId as never });
  const update = useMutation(api.restaurants.update);
  const setCancellationPolicy = useMutation(api.restaurants.setCancellationPolicy);

  const [form, setForm] = useState({
    name: "",
    cuisine: "",
    city: "",
    address: "",
    phone: "",
    priceRange: "",
    description: "",
    imageUrl: "",
  });
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    inside: true, outside: false, bar: false, smoking: false, parking: false, liveMusic: false, soloFriendly: false,
  });
  const [policyHours, setPolicyHours] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const r = data.restaurant;
    setForm({
      name: r.name,
      cuisine: r.cuisine,
      city: r.city,
      address: r.address,
      phone: r.phone ?? "",
      priceRange: r.priceRange ?? "$$",
      description: r.description ?? "",
      imageUrl: r.imageUrl ?? "",
    });
    setFeatures({
      inside: r.features.inside,
      outside: r.features.outside,
      bar: r.features.bar,
      smoking: r.features.smoking,
      parking: r.features.parking ?? false,
      liveMusic: r.features.liveMusic ?? false,
      soloFriendly: r.features.soloFriendly ?? false,
    });
    setPolicyHours(r.cancellationPolicyHours ?? 0);
  }, [data]);

  const totalCapacity = (data?.sections ?? []).reduce((sum, s) => sum + s.capacity, 0);
  const menuCount = data?.menuDocs.length ?? 0;
  const todays = useQuery(api.bookings.byRestaurant, {
    restaurantId: restaurantId as never,
    date: today(),
  });
  const todayCount = (todays ?? []).filter((b) => b.status !== "cancelled").length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await update({
        id: restaurantId as never,
        name: form.name,
        cuisine: form.cuisine,
        city: form.city,
        address: form.address,
        phone: form.phone || undefined,
        priceRange: form.priceRange || undefined,
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        features: {
          inside: features.inside,
          outside: features.outside,
          bar: features.bar,
          smoking: features.smoking,
          parking: features.parking,
          liveMusic: features.liveMusic,
          soloFriendly: features.soloFriendly,
        },
      });
      await setCancellationPolicy({ restaurantId: restaurantId as never, hours: policyHours });
      toast.success("Restaurant updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Seats" value={String(totalCapacity)} icon={<Users className="size-4" />} />
        <StatCard label="Sections" value={String(data?.sections.length ?? 0)} icon={<Sofa className="size-4" />} />
        <StatCard label="Booked today" value={String(todayCount)} icon={<CalendarDays className="size-4" />} />
        <StatCard label="Menus" value={String(menuCount)} icon={<ChefHat className="size-4" />} />
      </div>

      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Restaurant profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-name">Name *</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-cuisine">Cuisine *</Label>
                <Input id="p-cuisine" value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-city">City *</Label>
                <Input id="p-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-price">Price range</Label>
                <Select value={form.priceRange} onValueChange={(v) => setForm({ ...form, priceRange: v })}>
                  <SelectTrigger id="p-price" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["$", "$$", "$$$", "$$$$"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-address">Address *</Label>
              <Input id="p-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-phone">Phone</Label>
                <Input id="p-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-image">Photo URL</Label>
                <Input id="p-image" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Amenities</p>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFeatures((x) => ({ ...x, [f.key]: !x[f.key] }))}
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

            {/* No-show protection */}
            <div>
              <Label htmlFor="p-policy" className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Cancellation policy
              </Label>
              <Select
                value={String(policyHours)}
                onValueChange={(v) => setPolicyHours(Number(v))}
              >
                <SelectTrigger id="p-policy" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shown to diners before they book and when they cancel — helps cut no-shows.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-border/70 p-3.5 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-lg font-bold tracking-tight">{value}</span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Seating: sections CRUD
// ---------------------------------------------------------------------------

function SeatingTab({ restaurantId, sections }: { restaurantId: string; sections: { _id: string; name: string; kind: Kind; smoking: boolean; capacity: number; description?: string }[] }) {
  const addSection = useMutation(api.restaurants.addSection);
  const updateSection = useMutation(api.restaurants.updateSection);
  const deleteSection = useMutation(api.restaurants.deleteSection);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", kind: "inside" as Kind, smoking: false, capacity: 24, description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // KB-15: window.confirm is blocked in the sandboxed preview iframe —
  // confirm destructive deletes with an in-app dialog instead.
  const [sectionToDelete, setSectionToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingSection, setDeletingSection] = useState(false);

  const confirmDeleteSection = async () => {
    if (!sectionToDelete || deletingSection) return;
    setDeletingSection(true);
    try {
      await deleteSection({ id: sectionToDelete.id as never });
      toast.success("Section deleted");
      setSectionToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete section.");
    } finally {
      setDeletingSection(false);
    }
  };

  const resetForm = () => setForm({ name: "", kind: "inside", smoking: false, capacity: 24, description: "" });

  const startEdit = (s: (typeof sections)[number]) => {
    setEditingId(s._id);
    setForm({ name: s.name, kind: s.kind, smoking: s.smoking, capacity: s.capacity, description: s.description ?? "" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name,
      kind: form.kind,
      smoking: form.smoking,
      capacity: form.capacity,
      description: form.description || undefined,
    };
    try {
      if (editingId) {
        await updateSection({ id: editingId as never, ...payload });
        toast.success("Section updated");
      } else {
        await addSection({ restaurantId: restaurantId as never, ...payload });
        toast.success("Section added");
      }
      resetForm();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save section.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (s: (typeof sections)[number]) => setSectionToDelete({ id: s._id, name: s.name });

  return (
    <div className="space-y-4 pb-6">
      {sections.length === 0 && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          No seating areas yet — add one to start publishing availability.
        </p>
      )}
      <div className="space-y-2">
        {sections.map((s) => {
          const meta = KIND_LABEL[s.kind];
          return (
            <Card key={s._id} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{s.name}</p>
                    <span className={cn("flex size-6 items-center justify-center rounded-lg", meta.cls)}>
                      <meta.icon className="size-3.5" />
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{meta.label}</span>
                    {s.smoking && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <Cigarette className="size-3" /> Smoking
                      </span>
                    )}
                    <span className="flex items-center gap-1"><Users className="size-3" /> {s.capacity} seats</span>
                  </p>
                  {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => startEdit(s)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" className="text-destructive" onClick={() => handleDelete(s)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{editingId ? "Edit seating area" : "Add seating area"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-name">Name *</Label>
                <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Terrace" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-kind">Zone</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
                  <SelectTrigger id="s-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inside">Inside</SelectItem>
                    <SelectItem value="outside">Outside</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-capacity">Capacity (seats)</Label>
                <Input
                  id="s-capacity"
                  type="number"
                  min={1}
                  max={500}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, smoking: !form.smoking })}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.smoking
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Cigarette className="size-3.5" /> Smoking allowed
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">Description</Label>
              <Input id="s-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Heated terrace, 8 tables" />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : editingId ? "Save changes" : "Add section"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEditingId(null); resetForm(); }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* KB-15: in-app delete confirmation */}
      <AlertDialog
        open={!!sectionToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingSection) setSectionToDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">
              Delete “{sectionToDelete?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This seating area and its slot ledger will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSection}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deletingSection}
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteSection();
              }}
            >
              {deletingSection ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hours: weekly template
// ---------------------------------------------------------------------------

function HoursTab({ restaurantId }: { restaurantId: string }) {
  const data = useQuery(api.restaurants.get, { id: restaurantId as never });
  const saveHours = useMutation(api.restaurants.saveHours);
  const [rows, setRows] = useState<HoursRow[]>(
    DAY_ROWS.map((d) => ({ dayOfWeek: d.dow, open: "17:00", close: "23:00", enabled: false })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setRows(
      DAY_ROWS.map((d) => {
        const h = data.hours.find((x) => x.dayOfWeek === d.dow);
        return {
          dayOfWeek: d.dow,
          open: h?.open ?? "17:00",
          close: h?.close ?? "23:00",
          enabled: h?.enabled ?? false,
        };
      }),
    );
  }, [data]);

  const patchRow = (dow: number, patch: Partial<HoursRow>) =>
    setRows((rs) => rs.map((r) => (r.dayOfWeek === dow ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveHours({ restaurantId: restaurantId as never, hours: rows });
      toast.success("Opening hours saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save hours.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        These hours generate the free-spot ledger for each day. Closed days show as
        unavailable to diners.
      </p>
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardContent className="divide-y divide-border/60 p-0">
          {rows.map((row) => {
            const day = DAY_ROWS.find((d) => d.dow === row.dayOfWeek)!;
            return (
              <div key={row.dayOfWeek} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => patchRow(row.dayOfWeek, { enabled: !row.enabled })}
                  className={cn(
                    "flex w-28 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    row.enabled
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <span className={cn("size-2 rounded-full", row.enabled ? "bg-current" : "bg-muted-foreground/40")} />
                  {day.label}
                </button>
                {row.enabled ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      type="time"
                      value={row.open}
                      onChange={(e) => patchRow(row.dayOfWeek, { open: e.target.value })}
                      className="h-9 flex-1"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={row.close}
                      onChange={(e) => patchRow(row.dayOfWeek, { close: e.target.value })}
                      className="h-9 flex-1"
                    />
                  </div>
                ) : (
                  <span className="flex-1 text-xs text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save weekly hours"}
      </Button>
    </div>
  );
}
