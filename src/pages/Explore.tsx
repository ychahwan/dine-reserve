import { CustomerShell } from "@/components/CustomerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  Heart,
  MapPin,
  Search,
  SearchX,
  Sofa,
  Sparkles,
  Star,
  Store,
  Users,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { dateFromNow, dateLabel, formatDate, today } from "@/lib/format";
import { DIETARY_TAGS } from "@/lib/menu";
import { toast } from "sonner";

const CUISINES = ["Italian", "Japanese", "Mediterranean", "Steakhouse", "Mexican", "French", "American"];
const CITIES = ["Milan", "Rome", "New York", "Paris", "London"];
const DIET_CHIPS = DIETARY_TAGS.slice(0, 4); // Vegetarian, Vegan, Gluten-free, Halal
type SeatValue = "inside" | "outside" | "bar";
const SEATS: { value: SeatValue | null; label: string; icon: LucideIcon }[] = [
  { value: null, label: "Anywhere", icon: Sofa },
  { value: "inside", label: "Inside", icon: Sofa },
  { value: "outside", label: "Outside", icon: Wind },
  { value: "bar", label: "Bar", icon: Users },
];

type AvailabilitySummary = {
  restaurantId: string;
  open: boolean;
  freeSeats: number;
  estimated: boolean;
};

export default function Explore() {
  const restaurants = useQuery(api.restaurants.search, {});
  const ensureDemoData = useMutation(api.seed.ensureDemoData);
  const [seeded, setSeeded] = useState(false);

  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [seat, setSeat] = useState<SeatValue | null>(null);
  const [nonSmoking, setNonSmoking] = useState(false);
  const [dietary, setDietary] = useState<string | null>(null);
  const [solo, setSolo] = useState(false);

  // Quick-find: pick a day + party size, and only show places with room.
  const [quickDate, setQuickDate] = useState<string | null>(today());
  const [partySize, setPartySize] = useState(2);

  // Seed demo data once when the app first loads with an empty database.
  useEffect(() => {
    if (restaurants === undefined || seeded) return;
    if (restaurants.length === 0) {
      ensureDemoData().then(() => setSeeded(true)).catch(() => setSeeded(true));
    } else {
      setSeeded(true);
    }
  }, [restaurants, seeded, ensureDemoData]);

  // Live free-seat summary for the selected day (falls back to today).
  const summary = useQuery(api.availability.summary, { date: quickDate ?? today() });
  const summaryMap = useMemo(() => {
    const map = new Map<string, AvailabilitySummary>();
    for (const s of summary ?? []) map.set(s.restaurantId, s);
    return map;
  }, [summary]);

  // Saved restaurants (dining profile) + toggle
  const favorites = useQuery(api.users.myFavorites);
  const toggleFavorite = useMutation(api.users.toggleFavorite);

  const quickDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dateFromNow(i)),
    [],
  );

  // All filters (text, cuisine, city, seating, dietary, solo) are applied
  // server-side; the client then hides places that can't host the party on
  // the chosen quick-find day using the live free-seat summary.
  const searchWithFilters = useQuery(
    api.restaurants.search,
    {
      q: q.trim() || undefined,
      cuisine: cuisine ?? undefined,
      city: city ?? undefined,
      seat: seat ?? undefined,
      nonSmoking: nonSmoking || undefined,
      dietary: dietary ?? undefined,
      solo: solo || undefined,
    },
  );

  const visible = useMemo(() => {
    if (!searchWithFilters) return undefined;
    if (!quickDate) return searchWithFilters;
    const availabilityKnown = summary !== undefined;
    return searchWithFilters.filter((r) => {
      // Only hide places we know can't host the party on the chosen day.
      if (availabilityKnown) {
        const s = summaryMap.get(r._id);
        if (!s?.open) return false;
        if (!s.estimated && s.freeSeats < partySize) return false;
      }
      return true;
    });
  }, [searchWithFilters, quickDate, partySize, summary, summaryMap]);

  const favoriteIds = useMemo(
    () => new Set((favorites ?? []).map((r) => r._id)),
    [favorites],
  );

  const handleToggleFavorite = async (id: string, name: string) => {
    try {
      const res = await toggleFavorite({ restaurantId: id as never });
      toast.success(res.favorited ? `Saved ${name} to your favorites` : `Removed ${name} from favorites`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update favorites.");
    }
  };

  return (
    <CustomerShell>
      <div className="px-4 pt-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Find a table</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live availability from {restaurants?.length ?? "…"} restaurants
          </p>
        </div>

        {/* Quick-find bar */}
        <Card className="mt-4 rounded-2xl border-border/70 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            <p className="text-sm font-semibold">When are you dining?</p>
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setQuickDate(null)}
              className={cn(
                "flex shrink-0 items-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                quickDate === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              Any day
            </button>
            {quickDays.map((d) => (
              <button
                key={d}
                onClick={() => setQuickDate(d)}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
                  quickDate === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-[10px] font-medium uppercase opacity-80">
                  {d === today() ? "Today" : new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="text-base font-bold leading-5">
                  {new Date(`${d}T00:00:00`).getDate()}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" /> Party size
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPartySize((p) => Math.max(1, p - 1))}
                disabled={partySize <= 1}
              >
                −
              </Button>
              <span className="w-6 text-center font-semibold">{partySize}</span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPartySize((p) => Math.min(20, p + 1))}
                disabled={partySize >= 20}
              >
                +
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {quickDate
              ? `Showing restaurants with room for ${partySize} ${partySize === 1 ? "guest" : "guests"} on ${dateLabel(quickDate)}.`
              : `Only places with free spots for ${partySize} ${partySize === 1 ? "guest" : "guests"} today are highlighted.`}
          </p>
        </Card>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, cuisine, city…"
            className="h-11 rounded-xl pl-9 shadow-sm"
          />
        </div>

        {/* Filters */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {CUISINES.slice(0, 6).map((c) => (
            <button
              key={c}
              onClick={() => setCuisine(cuisine === c ? null : c)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                cuisine === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {SEATS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSeat(seat === s.value ? null : s.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                seat === s.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <s.icon className="size-3.5" /> {s.label}
            </button>
          ))}
          <button
            onClick={() => setNonSmoking(!nonSmoking)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              nonSmoking
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5" /> Non-smoking
          </button>
          <button
            onClick={() => setSolo(!solo)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              solo
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            title="Places that welcome solo diners"
          >
            <Users className="size-3.5" /> Solo-friendly
          </button>
          <button
            onClick={() => setCity(city ? null : "Milan")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              city
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <MapPin className="size-3.5" /> {city ?? "Any city"}
          </button>
        </div>

        {/* Dietary filter — uses the menu attribute data */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Diet
          </span>
          {DIET_CHIPS.map((d) => (
            <button
              key={d}
              onClick={() => setDietary(dietary === d ? null : d)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                dietary === d
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
          {dietary && (
            <button
              onClick={() => setDietary(null)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Favorites (dining profile) */}
        {(favorites ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Heart className="size-3.5 fill-primary text-primary" /> Your saved places
            </h2>
            <div className="mt-3 space-y-3">
              {favorites!.map((r) => (
                <Card key={r._id} className="group overflow-hidden rounded-2xl border-border/70 p-0">
                  <Link to={`/restaurant/${r._id}`} className="flex items-center gap-3 p-3">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt={r.name} className="size-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Store className="size-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" /> {r.neighborhood || r.city}, {r.city} · {r.cuisine}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleFavorite(r._id, r.name);
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
                      aria-label={`Remove ${r.name} from favorites`}
                    >
                      <Heart className="size-4 fill-current" />
                    </button>
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        <div className="mt-5 space-y-4 pb-6">
          {visible === undefined || summary === undefined ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              <p className="text-sm">Loading restaurants…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
              <SearchX className="size-8 text-muted-foreground/60" />
              <div>
                <p className="font-medium">No matches yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {quickDate
                    ? `No restaurants with ${partySize} free ${partySize === 1 ? "seat" : "seats"} on ${formatDate(quickDate)} match your filters.`
                    : "Try clearing a filter or searching differently."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("");
                  setCuisine(null);
                  setCity(null);
                  setSeat(null);
                  setNonSmoking(false);
                  setDietary(null);
                  setSolo(false);
                  setQuickDate(null);
                  setPartySize(2);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            visible.map((r) => (
              <RestaurantCard
                key={r._id}
                id={r._id}
                summary={summaryMap.get(r._id)}
                date={quickDate ?? today()}
                favorited={favoriteIds.has(r._id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))
          )}
        </div>
      </div>
    </CustomerShell>
  );
}

/** Card loads its own data so search results re-render cheaply. */
function RestaurantCard({
  id,
  summary,
  date,
  favorited,
  onToggleFavorite,
}: {
  id: string;
  summary?: AvailabilitySummary;
  date: string;
  favorited: boolean;
  onToggleFavorite: (id: string, name: string) => void;
}) {
  const data = useQuery(api.restaurants.get, { id: id as never });
  if (!data) return null;
  const { restaurant: r, sections, rating } = data;
  const tags: string[] = [];
  if (r.features.outside) tags.push("Outside");
  if (r.features.bar) tags.push("Bar");
  if (r.features.smoking) tags.push("Smoking");
  if (r.features.soloFriendly) tags.push("Solo-friendly");
  const totalCapacity = sections.reduce((sum, s) => sum + s.capacity, 0);

  const statusBadge = !summary
    ? null
    : !summary.open
      ? {
          label: `Closed ${new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}`,
          cls: "bg-black/50 text-white/90 backdrop-blur",
        }
      : summary.estimated
        ? { label: "Free spots", cls: "bg-emerald-600 text-white" }
        : {
            label:
              summary.freeSeats > 0
                ? `${summary.freeSeats} ${summary.freeSeats === 1 ? "spot" : "spots"} free`
                : "Sold out",
            cls:
              summary.freeSeats > 0
                ? "bg-emerald-600 text-white"
                : "bg-rose-600 text-white",
          };

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/70 p-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/restaurant/${r._id}`} className="relative block h-36 w-full overflow-hidden">
        {r.imageUrl ? (
          <img
            src={r.imageUrl}
            alt={r.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
            <Store className="size-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {statusBadge && (
          <span
            className={cn(
              "absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold",
              statusBadge.cls,
            )}
          >
            {statusBadge.label}
          </span>
        )}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between">
          <div className="text-white">
            <p className="font-semibold leading-tight drop-shadow">{r.name}</p>
            <p className="flex items-center gap-1 text-xs text-white/85">
              <MapPin className="size-3" /> {r.neighborhood || r.city}, {r.city}
            </p>
          </div>
          <Badge className="bg-white/90 text-foreground backdrop-blur">{r.priceRange}</Badge>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{r.cuisine}</Badge>
          {rating.count > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Star className="size-3.5 fill-current" /> {rating.avg.toFixed(1)}
              <span className="font-normal text-muted-foreground">({rating.count})</span>
            </span>
          )}
          {tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              {t}
            </Badge>
          ))}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {totalCapacity} seats
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => {
              e.preventDefault();
              onToggleFavorite(r._id, r.name);
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-colors",
              favorited
                ? "text-primary"
                : "text-muted-foreground/50 hover:bg-primary/10 hover:text-primary",
            )}
            aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
            title={favorited ? "Remove from favorites" : "Save to favorites"}
          >
            <Heart className={cn("size-4", favorited && "fill-current")} />
          </button>
          <Button size="sm" asChild className="shrink-0">
            <Link to={`/restaurant/${r._id}`}>Book</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
