import { CustomerShell } from "@/components/CustomerShell";
import AiConcierge from "@/components/AiConcierge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  Clock,
  Flame,
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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { dateFromNow, dateLabel, formatDate, today } from "@/lib/format";
import { DIETARY_TAGS } from "@/lib/menu";
import { toast } from "sonner";

// KB-25: cuisine/city filter chips are now derived from the live data via
// restaurants.facetValues (previously hardcoded to Milan/Italian lists that
// never matched the seeded restaurants). DIET chips stay static (well-known
// tags).
const DIET_CHIPS = DIETARY_TAGS.slice(0, 4); // Vegetarian, Vegan, Gluten-free, Halal
type SeatValue = "inside" | "outside" | "bar";
const SEAT_KEYS: { value: SeatValue | null; key: string; icon: LucideIcon }[] = [
  { value: null, key: "common.anywhere", icon: Sofa },
  { value: "inside", key: "common.inside", icon: Sofa },
  { value: "outside", key: "common.outside", icon: Wind },
  { value: "bar", key: "common.bar", icon: Users },
];

type AvailabilitySummary = {
  restaurantId: string;
  open: boolean;
  freeSeats: number;
  estimated: boolean;
};

export default function Explore() {
  const { t } = useTranslation();
  const restaurants = useQuery(api.restaurants.search, {});
  const facets = useQuery(api.restaurants.facetValues);
  const cuisines = facets?.cuisines ?? [];
  const cities = facets?.cities ?? [];
  const trending = useQuery(api.restaurants.trending);
  const forYou = useQuery(api.restaurants.forYou);
  const stories = useQuery(api.stories.recent, {});
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

  // Discovery rails only show in the unfiltered "browse" state.
  const hasActiveFilters = !!(
    q.trim() || cuisine || city || seat || nonSmoking || dietary || solo
  );

  // The chosen day + party (+ seating preference) carry into the restaurant
  // page so the diner never has to re-pick them — the detail page opens with
  // the same date, party size and seating filter they picked here.
  const cardLink = (restaurantId: string) => {
    const params = new URLSearchParams();
    if (quickDate) {
      params.set("date", quickDate);
      params.set("party", String(partySize));
    }
    if (seat) params.set("seat", seat);
    if (nonSmoking) params.set("nonSmoking", "1");
    const qs = params.toString();
    return `/restaurant/${restaurantId}${qs ? `?${qs}` : ""}`;
  };

  const handleToggleFavorite = async (id: string, name: string) => {
    try {
      const res = await toggleFavorite({ restaurantId: id as never });
      toast.success(res.favorited ? t("explore.favSaved", { name }) : t("explore.favRemoved", { name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("explore.favError"));
    }
  };

  return (
    <CustomerShell>
      <div className="px-4 pt-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("explore.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("explore.subtitle", { count: restaurants?.length ?? "…" })}
          </p>
        </div>

        {/* Quick-find bar */}
        <Card className="mt-4 rounded-2xl border-border/70 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            <p className="text-sm font-semibold">{t("explore.whenDining")}</p>
          </div>
          <div className="no-scrollbar horizontal-rail mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setQuickDate(null)}
              className={cn(
                "flex shrink-0 items-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                quickDate === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t("explore.anyDay")}
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
                  {d === today() ? t("explore.today") : new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="text-base font-bold leading-5">
                  {new Date(`${d}T00:00:00`).getDate()}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" /> {t("explore.partySize")}
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
              ? t("explore.showingForDate", { count: partySize, guests: t("common.guest", { count: partySize }), date: dateLabel(quickDate) })
              : t("explore.showingToday", { count: partySize, guests: t("common.guest", { count: partySize }) })}
          </p>
        </Card>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("explore.searchPlaceholder")}
            className="h-11 rounded-xl pl-9 shadow-sm"
          />
        </div>

        {/* Filters — cuisine chips from real data */}
        <div className="no-scrollbar horizontal-rail mt-3 flex gap-2 overflow-x-auto pb-1">
          {cuisines.slice(0, 8).map((c) => (
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
        <div className="no-scrollbar horizontal-rail mt-2 flex gap-2 overflow-x-auto pb-1">
          {SEAT_KEYS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSeat(seat === s.value ? null : s.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                seat === s.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <s.icon className="size-3.5" /> {t(s.key)}
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
            <Sparkles className="size-3.5" /> {t("explore.nonSmoking")}
          </button>
          <button
            onClick={() => setSolo(!solo)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              solo
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            title={t("explore.soloFriendly")}
          >
            <Users className="size-3.5" /> {t("explore.soloFriendly")}
          </button>
          {/* City selector — cycles through the cities that actually exist */}
          <button
            onClick={() => {
              if (cities.length === 0) return;
              const idx = city ? cities.indexOf(city) : -1;
              const next = cities[(idx + 1) % cities.length] ?? null;
              setCity(next === city ? null : next);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              city
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            title={t("explore.anyCity")}
          >
            <MapPin className="size-3.5" /> {city ?? t("explore.anyCity")}
          </button>
        </div>

        {/* Dietary filter — uses the menu attribute data */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("explore.diet")}
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
              {t("explore.clear")}
            </button>
          )}
        </div>

        {/* Favorites (dining profile) */}
        {(favorites ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Heart className="size-3.5 fill-primary text-primary" /> {t("explore.savedPlaces")}
            </h2>
            <div className="mt-3 space-y-3">
              {favorites!.map((r) => (
                <Card key={r._id} className="group overflow-hidden rounded-2xl border-border/70 p-0">
                  <Link to={cardLink(r._id)} className="flex items-center gap-3 p-3">
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

        {/* For you — personalized recommendations (deterministic concierge) */}
        {!hasActiveFilters && (forYou ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> {t("explore.forYou")}
            </h2>
            <div className="mt-3 space-y-3">
              {forYou!.map((id) => (
                <RestaurantCard
                  key={id}
                  id={id}
                  to={cardLink(id)}
                  summary={summaryMap.get(id)}
                  date={quickDate ?? today()}
                  favorited={favoriteIds.has(id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stories — behind-the-scenes from restaurants (Idea #8) */}
        {(stories ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> {t("explore.freshKitchens")}
            </h2>
            <div className="no-scrollbar horizontal-rail mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {(stories ?? []).slice(0, 12).map((s) => (
                <Link
                  key={s._id}
                  to={`/restaurant/${s.restaurant?._id}`}
                  className="w-36 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative flex h-20 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-card">
                    {s.restaurant?.imageUrl ? (
                      <img src={s.restaurant.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                    ) : null}
                    <span className="relative text-2xl">{s.emoji ?? "🍽️"}</span>
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs font-semibold">{s.restaurant?.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {s.text}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Trending now — popular this week */}
        {!hasActiveFilters && (trending ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Flame className="size-3.5 text-orange-500" /> {t("explore.trending")}
            </h2>
            <div className="mt-3 space-y-3">
              {trending!.map((id) => (
                <RestaurantCard
                  key={id}
                  id={id}
                  to={cardLink(id)}
                  summary={summaryMap.get(id)}
                  date={quickDate ?? today()}
                  favorited={favoriteIds.has(id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        <div className="mt-5 space-y-4 pb-6">
          {visible === undefined || summary === undefined ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              <p className="text-sm">{t("explore.loadingRestaurants")}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
              <SearchX className="size-8 text-muted-foreground/60" />
              <div>
                <p className="font-medium">{t("explore.noMatches")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {quickDate
                    ? t("explore.noMatchesDate", { count: partySize, seats: t("common.seat", { count: partySize }), date: formatDate(quickDate) })
                    : t("explore.noMatchesAny")}
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
                {t("explore.clearFilters")}
              </Button>
            </div>
          ) : (
            visible.map((r) => (
              <RestaurantCard
                key={r._id}
                id={r._id}
                to={cardLink(r._id)}
                summary={summaryMap.get(r._id)}
                date={quickDate ?? today()}
                favorited={favoriteIds.has(r._id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))
          )}
        </div>
      </div>
      <AiConcierge />
    </CustomerShell>
  );
}

/** Card loads its own (lightweight) data so search results re-render cheaply. */
function RestaurantCard({
  id,
  to,
  summary,
  date,
  favorited,
  onToggleFavorite,
}: {
  id: string;
  to: string;
  summary?: AvailabilitySummary;
  date: string;
  favorited: boolean;
  onToggleFavorite: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  // KB-31: use the light `card` query (no menus/items/storage resolution)
  // instead of the full `get` — a screen of cards no longer runs dozens of
  // heavy queries.
  const data = useQuery(api.restaurants.card, { id: id as never });
  const wait = useQuery(api.analytics.publicWaitSignal, { restaurantId: id as never });
  if (!data) return null;
  const { restaurant: r, totalCapacity, rating } = data;
  const tags: string[] = [];
  if (r.features.outside) tags.push(t("common.outside"));
  if (r.features.bar) tags.push(t("common.bar"));
  if (r.features.smoking) tags.push(t("detail.smokingArea"));
  if (r.features.soloFriendly) tags.push(t("explore.soloFriendly"));

  const statusBadge = !summary
    ? null
    : !summary.open
      ? {
          label: t("explore.closedOn", { weekday: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }) }),
          cls: "bg-black/50 text-white/90 backdrop-blur",
        }
      : summary.estimated
        ? { label: t("explore.freeSpots"), cls: "bg-emerald-600 text-white" }
        : {
            label:
              summary.freeSeats > 0
                ? t("explore.spotsFree", { count: summary.freeSeats, spots: t("common.spot", { count: summary.freeSeats }) })
                : t("explore.soldOut"),
            cls:
              summary.freeSeats > 0
                ? "bg-emerald-600 text-white"
                : "bg-rose-600 text-white",
          };

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/70 p-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link to={to} className="relative block h-36 w-full overflow-hidden">
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
            <Users className="size-3.5" /> {t("explore.seats", { count: totalCapacity })}
          </span>
          {wait?.label && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {wait.label}
            </span>
          )}
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
            aria-label={favorited ? t("explore.removeFav") : t("explore.saveFav")}
            title={favorited ? t("explore.removeFav") : t("explore.saveFav")}
          >
            <Heart className={cn("size-4", favorited && "fill-current")} />
          </button>
          <Button size="sm" asChild className="shrink-0">
            <Link to={to}>{t("explore.book")}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
