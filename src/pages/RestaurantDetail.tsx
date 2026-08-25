import { CustomerShell } from "@/components/CustomerShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
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
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  ArrowUpDown,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Heart,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
  Sofa,
  Sparkles,
  Star,
  Store,
  Trash2,
  Users,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  bookingShareText,
  dateFromNow,
  formatDate,
  formatPrice,
  formatTime,
  isPastDate,
  occasionEmoji,
  OCCASIONS,
  today,
  whatsappShareUrl,
} from "@/lib/format";
import { spiceEmoji, spiceLabel } from "@/lib/menu";
import { openNavigation } from "@/lib/navigation";

/** "Maria N" → "MN" for the review avatar. */
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "Aug 2026" → "Aug 21, 2026" for review dates. */
function formatReviewDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
import { toast } from "sonner";

const DAYS_TO_SHOW = 14;

type SeatPref = "inside" | "outside" | "bar";
const SEAT_KEYS: { value: SeatPref | null; key: string; icon: LucideIcon }[] = [
  { value: null, key: "common.anySeating", icon: Sofa },
  { value: "inside", key: "common.inside", icon: Sofa },
  { value: "outside", key: "common.outside", icon: Wind },
  { value: "bar", key: "common.bar", icon: Users },
];

type MenuItemLike = {
  _id: string;
  name: string;
  description?: string;
  priceCents: number;
  category?: string;
  popular?: boolean;
  available: boolean;
  imageUrl?: string;
  tags?: string[];
  allergens?: string[];
  spiceLevel?: string;
};

/** Group a flat list of items by category, preserving first-seen order. */
function groupMenuItems(items: MenuItemLike[]): [string, MenuItemLike[]][] {
  const map = new Map<string, MenuItemLike[]>();
  for (const it of items) {
    const key = it.category?.trim() || "Signature";
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return [...map.entries()];
}

export default function RestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const data = useQuery(api.restaurants.get, { id: id as never });
  const reviewsData = useQuery(api.reviews.listForRestaurant, { restaurantId: id as never });
  const stories = useQuery(api.stories.forRestaurant, { restaurantId: id as never });
  const ensureForDate = useMutation(api.availability.ensureForDate);
  const toggleFavorite = useMutation(api.users.toggleFavorite);
  const deleteReview = useMutation(api.reviews.remove);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [deletingReview, setDeletingReview] = useState(false);

  // The date + party size + seating preference chosen on Explore carry over
  // via ?date=&party=&seat=&nonSmoking=, so the diner never has to re-pick
  // them. When a valid date came over, the 14-day strip collapses into a
  // compact chip ("Change date" re-opens it); the seating chips stay fully
  // interactive but start pre-filtered to what was picked on Explore.
  const urlDate = searchParams.get("date");
  const validUrlDate =
    urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && !isPastDate(urlDate) ? urlDate : null;
  const urlSeat = searchParams.get("seat");
  const validSeat: SeatPref | null =
    urlSeat === "inside" || urlSeat === "outside" || urlSeat === "bar" ? urlSeat : null;
  const [date, setDate] = useState<string>(validUrlDate ?? today());
  const [partySize, setPartySize] = useState<number>(() => {
    const p = Number(searchParams.get("party"));
    return Number.isInteger(p) && p >= 1 && p <= 20 ? p : 2;
  });
  const [showDateStrip, setShowDateStrip] = useState(!validUrlDate);
  const [seatPref, setSeatPref] = useState<SeatPref | null>(validSeat);
  const [nonSmoking, setNonSmoking] = useState(searchParams.get("nonSmoking") === "1");
  const [menuTab, setMenuTab] = useState<string>("overview");
  const [reviewRatingFilter, setReviewRatingFilter] = useState(0);
  const [reviewSort, setReviewSort] = useState<"newest" | "highest" | "lowest">("newest");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Prefill the booking contact from the profile; the diner can still edit it.
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name || "");
    setPhone((p) => p || user.phone || "");
  }, [user]);

  // Materialize availability slots for the selected date (idempotent).
  useEffect(() => {
    if (!id || isPastDate(date)) return;
    let cancelled = false;
    ensureForDate({ restaurantId: id as never, date })
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setRefresh((r) => r + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [id, date, ensureForDate]);

  const availability = useQuery(api.availability.forDate, {
    restaurantId: id as never,
    date,
  });
  // Predictive availability (Idea #20) — shown only for dates far enough
  // ahead that real slots aren't materialized yet.
  const prediction = useQuery(
    api.analytics.predict,
    date > dateFromNow(DAYS_TO_SHOW) ? { restaurantId: id as never, date } : "skip",
  );

  const [refresh, setRefresh] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{ sectionId: string; time: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Every booking goes through the FIFO booking queue so peak-hour rushes of
  // 100+ simultaneous requests are processed fairly and never overbook.
  const enqueue = useMutation(api.queue.enqueue);
  const myQueueEntries = useQuery(api.queue.myEntries);
  const [queueEntryId, setQueueEntryId] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [bookingResult, setBookingResult] = useState<{ code: string; name: string; time: string; section: string } | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Waitlist for sold-out times
  const [waitlistSlot, setWaitlistSlot] = useState<{ sectionId: string; sectionName: string; time: string; remaining: number } | null>(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const joinWaitlist = useMutation(api.waitlist.join);

  // Reset selection when availability/date changes.
  useEffect(() => {
    setSelectedSlot(null);
  }, [date, seatPref, nonSmoking, partySize, refresh]);

  const days = useMemo(
    () => Array.from({ length: DAYS_TO_SHOW }, (_, i) => dateFromNow(i)),
    [],
  );

  const availableSlots = useMemo(() => {
    if (!availability || !availability.open) return [];
    return availability.sections
      .filter((s) => (!seatPref || s.kind === seatPref) && (!nonSmoking || !s.smoking))
      .flatMap((s) =>
        s.slots
          .filter((sl) => !sl.closed && sl.remaining >= partySize)
          .map((sl) => ({
            sectionId: s._id,
            sectionName: s.name,
            kind: s.kind,
            smoking: s.smoking,
            time: sl.time,
            remaining: sl.remaining,
          })),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [availability, seatPref, nonSmoking, partySize]);

  /** Times that can't host the party today — waitlist options. */
  const fullSlots = useMemo(() => {
    if (!availability || !availability.open) return [];
    return availability.sections
      .filter((s) => (!seatPref || s.kind === seatPref) && (!nonSmoking || !s.smoking))
      .flatMap((s) =>
        s.slots
          .filter((sl) => !sl.closed && sl.remaining < partySize)
          .map((sl) => ({
            sectionId: s._id,
            sectionName: s.name,
            time: sl.time,
            remaining: sl.remaining,
          })),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [availability, seatPref, nonSmoking, partySize]);

  const selectedSection = availability?.sections.find((s) => s._id === selectedSlot?.sectionId);

  const filteredReviews = useMemo(() => {
    if (!reviewsData?.reviews) return [];
    let list = reviewsData.reviews;
    if (reviewRatingFilter > 0) list = list.filter((r) => r.rating === reviewRatingFilter);
    if (reviewSort === "newest") return list;
    if (reviewSort === "highest") return [...list].sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
    return [...list].sort((a, b) => a.rating - b.rating || b.createdAt - a.createdAt);
  }, [reviewsData, reviewRatingFilter, reviewSort]);

  // MUST stay above the `if (!data)` early return — hooks cannot be called
  // conditionally. Grouping a few dozen menu items is cheap, so a plain call
  // is fine and keeps hook order stable across load/ready renders.
  const groupedItems = useMemo(() => {
    if (!data) return [] as [string, MenuItemLike[]][];
    const all = data.menuDocs.flatMap((m) => m.items);
    const visible = menuTab === "overview" ? all : data.menuDocs.find((m) => m._id === menuTab)?.items ?? [];
    return groupMenuItems(visible);
  }, [data, menuTab]);

  const handleConfirm = async () => {
    if (!selectedSlot || !id) return;
    // KB-20: an anonymous visitor who fills the booking sheet shouldn't get a
    // raw "please sign in" error — send them to sign in and bring them back
    // to this exact restaurant/date/party selection afterwards.
    if (!user) {
      const current = `${location.pathname}${location.search}`;
      navigate(`/auth?returnTo=${encodeURIComponent(current)}`);
      return;
    }
    setSubmitting(true);
    setBookingError(null);
    try {
      const res = await enqueue({
        restaurantId: id as never,
        date,
        time: selectedSlot.time,
        partySize,
        name: name.trim() || (user?.name ?? ""),
        email: user?.email ?? undefined,
        phone: phone.trim() || undefined,
        seat: seatPref ?? undefined,
        nonSmoking: nonSmoking || undefined,
        notes: notes.trim() || undefined,
        occasion: occasion ?? undefined,
      });
      if (!res?.entry) throw new Error("Could not join the booking queue.");
      setQueueEntryId(res.entry._id);
      setQueuePosition(res.position ?? null);
      setConfirmOpen(false);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Could not book that time.");
      toast.error(err instanceof Error ? err.message : "Could not book that time.");
      setSubmitting(false);
    }
  };

  // Follow the queued request until it's booked or fails (reactive — the
  // server patches the entry when the FIFO drain reaches it).
  const trackedEntry = useMemo(
    () => (queueEntryId ? (myQueueEntries ?? []).find((e) => e._id === queueEntryId) ?? null : null),
    [myQueueEntries, queueEntryId],
  );

  // KB-28: if the scheduled queue drain never resolves the entry (a rare
  // scheduler hiccup), the "Holding your table…" overlay would hang forever.
  // After 45s, surface a friendly error with the option to try again.
  useEffect(() => {
    if (!queueEntryId) return;
    const timer = setTimeout(() => {
      setQueueEntryId(null);
      setQueuePosition(null);
      setBookingError(t("detail.errQueueTimeout"));
      setSubmitting(false);
      toast.error(t("detail.errQueueTimeout"));
    }, 45_000);
    return () => clearTimeout(timer);
  }, [queueEntryId, t]);

  useEffect(() => {
    if (!trackedEntry) return;
    if (trackedEntry.status === "booked" && trackedEntry.code) {
      setBookingResult({
        code: trackedEntry.code,
        name: trackedEntry.sectionName ?? "",
        time: trackedEntry.bookedTime ?? selectedSlot?.time ?? "",
        section: trackedEntry.sectionName ?? "",
      });
      setQueueEntryId(null);
      setQueuePosition(null);
      setSubmitting(false);
      setOccasion(null);
      setNotes("");
      toast.success(t("detail.bookedToast"));
    } else if (trackedEntry.status === "failed") {
      const msg = trackedEntry.error ?? t("detail.errNoTables");
      setBookingError(msg);
      setQueueEntryId(null);
      setQueuePosition(null);
      setSubmitting(false);
      toast.error(msg);
    }
  }, [trackedEntry]);

  const handleJoinWaitlist = async () => {
    if (!waitlistSlot || !id) return;
    setWaitlistSubmitting(true);
    setWaitlistError(null);
    try {
      await joinWaitlist({
        restaurantId: id as never,
        sectionId: waitlistSlot.sectionId as never,
        date,
        time: waitlistSlot.time,
        partySize,
        name: name.trim() || (user?.name ?? ""),
        phone: phone.trim() || undefined,
      });
      setWaitlistSlot(null);
      toast.success(t("detail.joinedWaitlist"));
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : t("detail.errWaitlist"));
      toast.error(err instanceof Error ? err.message : t("detail.errWaitlist"));
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!data || favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const res = await toggleFavorite({ restaurantId: data.restaurant._id as never });
      toast.success(res.favorited ? t("detail.savedFav") : t("detail.removedFav"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update favorites.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  // Delete a review — the author (customer) or a platform admin. Confirmed
  // via dialog, then the review (and its loyalty points) are removed.
  const handleDeleteReview = async () => {
    if (!reviewToDelete || deletingReview) return;
    setDeletingReview(true);
    try {
      const res = await deleteReview({ reviewId: reviewToDelete as never });
      if (res.deleted) toast.success("Review deleted.");
      setReviewToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the review.");
    } finally {
      setDeletingReview(false);
    }
  };

  if (!data) {
    return (
      <CustomerShell>
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-sm">{t("detail.loading")}</p>
        </div>
      </CustomerShell>
    );
  }

  const { restaurant: r, menuDocs, rating } = data;
  const isFavorite = (user?.favorites ?? []).includes(r._id);
  const policyHours = r.cancellationPolicyHours ?? 0;

  /** One-tap solo/bar flow: bar seat for one. */
  const quickBarSeat = () => {
    setPartySize(1);
    setSeatPref("bar");
    setNonSmoking(false);
    const panel = document.getElementById("book-panel");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.info(t("detail.barSeatToast"));
  };

  return (
    <CustomerShell>
      <div className="pb-6">
        {/* Hero */}
        <div className="relative h-52 w-full overflow-hidden">
          {r.imageUrl ? (
            <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
              <Store className="size-12" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
            aria-label={t("detail.back")}
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            onClick={handleToggleFavorite}
            disabled={favoriteBusy}
            className={cn(
              "absolute right-4 top-4 flex size-9 items-center justify-center rounded-full backdrop-blur transition-colors",
              isFavorite ? "bg-white text-rose-500" : "bg-black/40 text-white hover:bg-black/60",
            )}
            aria-label={isFavorite ? t("explore.removeFav") : t("explore.saveFav")}
            title={isFavorite ? t("explore.removeFav") : t("explore.saveFav")}
          >
            <Heart className={cn("size-5", isFavorite && "fill-current")} />
          </button>
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight drop-shadow">{r.name}</h1>
              <Badge className="bg-white/90 text-foreground backdrop-blur">{r.priceRange}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
              <MapPin className="size-3.5" /> {r.address} · {r.neighborhood || r.city}
            </p>
            <button
              onClick={() =>
                openNavigation({
                  address: r.address,
                  city: r.city,
                  neighborhood: r.neighborhood,
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
            >
              <Navigation className="size-3.5" /> {t("detail.getDirections")}
            </button>
          </div>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <Badge variant="secondary">{r.cuisine}</Badge>
          {rating.count > 0 && (
            <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
              <Star className="size-3 fill-current" /> {rating.avg.toFixed(1)}
              <span className="font-normal text-muted-foreground">({rating.count})</span>
            </Badge>
          )}
          {r.features.outside && <Badge variant="outline">{t("detail.outside")}</Badge>}
          {r.features.bar && <Badge variant="outline">{t("common.bar")}</Badge>}
          {r.features.smoking && <Badge variant="outline">{t("detail.smokingArea")}</Badge>}
          {r.features.soloFriendly && (
            <Badge variant="outline" className="gap-1 text-primary">
              <Users className="size-3" /> {t("explore.soloFriendly")}
            </Badge>
          )}
          {policyHours > 0 && (
            <Badge variant="outline" className="gap-1 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="size-3" /> {t("detail.freeCancel", { hours: policyHours })}
            </Badge>
          )}
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-3.5" /> {r.phone}
            </a>
          )}
          <button
            onClick={() =>
              openNavigation({
                address: r.address,
                city: r.city,
                neighborhood: r.neighborhood,
              })
            }
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Navigation className="size-3.5" /> {t("detail.directions")}
          </button>
        </div>

        {r.description && (
          <p className="px-4 pt-3 text-sm leading-6 text-muted-foreground">{r.description}</p>
        )}

        {/* Stories (Idea #8) */}
        {(stories ?? []).length > 0 && (
          <div className="px-4 pt-4">
            <div className="no-scrollbar horizontal-rail flex gap-2.5 overflow-x-auto pb-1">
              {(stories ?? []).map((s) => (
                <div
                  key={s._id}
                  className="w-40 shrink-0 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 to-transparent p-3"
                >
                  <p className="text-xl">{s.emoji ?? "🍽️"}</p>
                  <p className="mt-1.5 text-xs leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking panel */}
        <Card id="book-panel" className="mx-4 mt-5 rounded-2xl border-border/70 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="font-semibold">{t("detail.bookTable")}</h2>
            </div>
            {r.features.bar && (
              <Button size="sm" variant="outline" onClick={quickBarSeat}>
                <Users className="size-3.5" /> {t("detail.barSeat1")}
              </Button>
            )}
          </div>

          {/* Date strip — collapsed into a chip when the date already came
              over from Explore; "Change date" re-opens it. */}
          {showDateStrip ? (
            <div className="no-scrollbar horizontal-rail mt-4 flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
                    date === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-[10px] font-medium uppercase opacity-80">
                    {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-6">
                    {new Date(`${d}T00:00:00`).getDate()}
                  </span>
                  <span className="text-[10px] opacity-80">
                    {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-primary" />
                {formatDate(date)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setShowDateStrip(true)}>
                {t("detail.changeDate")}
              </Button>
            </div>
          )}

          {/* Party size */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" /> {t("detail.partySize")}
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

          {/* Seating preference — pre-filtered from Explore, still changeable */}
          <div className="mt-3 flex flex-wrap gap-2">
            {SEAT_KEYS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSeatPref(seatPref === s.value ? null : s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  seatPref === s.value
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
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                nonSmoking
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="size-3.5" /> {t("explore.nonSmoking")}
            </button>
          </div>

          {/* Predictive availability — far-out dates without real slots yet */}
          {prediction && prediction.likelySoldOut !== null && (
            <div
              className={cn(
                "mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs",
                prediction.likelySoldOut >= 70
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
                  : prediction.likelySoldOut >= 40
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
              )}
            >
              <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-medium">{t("detail.prediction")}</span> {prediction.message}{" "}
                <span className="opacity-70">{t("detail.predictionBased", { count: prediction.sampleWeeks, weeks: t("common.week", { count: prediction.sampleWeeks }) })}</span>
              </span>
            </div>
          )}

          {/* Availability */}
          <div className="mt-4">
            {availability == null ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner className="size-4" /> {t("detail.checking")}
              </div>
            ) : !availability.open ? (
              <div className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("detail.closedOn", { date: formatDate(date) })}
              </div>
            ) : (
              <>
                {availableSlots.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    {t("detail.noFreeTables", { count: partySize, guests: t("common.guest", { count: partySize }) })}
                  </div>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {showDateStrip ? `${formatDate(date)} — ` : ""}
                      {t("detail.hoursRange", { open: availability.openTime, close: availability.closeTime })}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={`${slot.sectionId}-${slot.time}`}
                          onClick={() => setSelectedSlot({ sectionId: slot.sectionId, time: slot.time })}
                          className={cn(
                            "rounded-xl border p-2.5 text-center transition-all",
                            selectedSlot?.time === slot.time && selectedSlot?.sectionId === slot.sectionId
                              ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                              : "border-border bg-card hover:border-primary/50",
                          )}
                        >
                          <span className="block text-sm font-semibold">{formatTime(slot.time)}</span>
                          <span
                            className={cn(
                              "block text-[10px]",
                              selectedSlot?.time === slot.time
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {slot.sectionName} · {t("detail.left", { count: slot.remaining })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Sold-out times → waitlist */}
                {fullSlots.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 flex items-center gap-2">
                      <BellRing className="size-3.5 text-muted-foreground" />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("detail.soldOutWaitlist")}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {fullSlots.slice(0, 9).map((slot) => (
                        <button
                          key={`wl-${slot.sectionId}-${slot.time}`}
                          onClick={() => {
                            setWaitlistError(null);
                            setWaitlistSlot(slot);
                          }}
                          className="rounded-xl border border-dashed border-border bg-muted/30 p-2.5 text-center transition-colors hover:border-primary/40 hover:bg-card"
                        >
                          <span className="block text-sm font-semibold text-muted-foreground">
                            {formatTime(slot.time)}
                          </span>
                          <span className="block text-[10px] text-destructive">
                            {slot.remaining === 0 ? t("detail.full") : t("detail.left", { count: slot.remaining })} · {t("bookings.waitlist").toLowerCase()}
                          </span>
                        </button>
                      ))}
                    </div>
                    {fullSlots.length > 9 && (
                      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                        {t("detail.moreSoldOut", { count: fullSlots.length - 9 })}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {t("detail.waitlistHint")}
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {bookingError && !confirmOpen && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {bookingError}
            </p>
          )}

          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={!selectedSlot || submitting}
            onClick={() => {
              setBookingError(null);
              setConfirmOpen(true);
            }}
          >
            {selectedSlot ? (
              <>
                {t("detail.bookTime", { time: formatTime(selectedSlot.time), count: partySize })}
                {selectedSection ? ` · ${selectedSection.name}` : ""}
              </>
            ) : (
              t("detail.selectTime")
            )}
          </Button>
        </Card>

        {/* Menu */}
        <div className="mt-6 px-4">
          <h2 className="font-semibold">{t("detail.menu")}</h2>
          {menuDocs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("detail.menuSoon")}
            </p>
          ) : (
            <>
              <div className="no-scrollbar horizontal-rail mt-3 flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setMenuTab("overview")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    menuTab === "overview"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {t("detail.allItems")}
                </button>
                {menuDocs.map((m) => (
                  <button
                    key={m._id}
                    onClick={() => setMenuTab(m._id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      menuTab === m._id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>

              {groupedItems.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("detail.noItems")}</p>
              ) : (
                <div className="mt-3 space-y-5 pb-4">
                  {groupedItems.map(([category, items]) => (
                    <section key={category}>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {category}
                        </h3>
                        <div className="h-px flex-1 bg-border/80" />
                        <span className="text-[10px] text-muted-foreground/70">
                          {items.length} {t("detail.item", { count: items.length })}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {items.map((item) => {
                          const spice = spiceEmoji(item.spiceLevel);
                          const spiceName = spiceLabel(item.spiceLevel);
                          return (
                            <div
                              key={item._id}
                              className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                            >
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="size-16 shrink-0 rounded-xl object-cover"
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <p className="text-sm font-medium">{item.name}</p>
                                  {item.popular && <span className="text-xs text-primary">★ {t("detail.popular")}</span>}
                                  {spice && (
                                    <span className="text-xs" title={spiceName ?? ""}>
                                      {spice}
                                    </span>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                                )}
                                {(item.tags?.length ?? 0) > 0 || (item.allergens?.length ?? 0) > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {(item.tags ?? []).slice(0, 5).map((t) => (
                                      <span
                                        key={t}
                                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                    {(item.allergens?.length ?? 0) > 0 && (
                                      <span
                                        className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                                        title={t("detail.contains", { list: item.allergens!.join(", ") })}
                                      >
                                        ⚠ {item.allergens!.join(", ")}
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <span className="shrink-0 text-sm font-semibold">
                                {formatPrice(item.priceCents)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reviews */}
        <div className="mt-6 px-4 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("detail.reviewsTitle")}</h2>
          </div>
          {reviewsData === undefined ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="size-4" /> {t("detail.loadingReviews")}
            </div>
          ) : reviewsData.count === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              {t("detail.noReviews")}
            </p>
          ) : (
            <>
              {/* Rating summary — average + distribution bars */}
              <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex items-center gap-3 sm:flex-col sm:gap-1 sm:text-center">
                  <span className="text-4xl font-bold tracking-tight">{reviewsData.avg.toFixed(1)}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn("size-3.5", i < Math.round(reviewsData.avg) ? "fill-current" : "text-muted-foreground/25")}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("detail.reviewCount", { count: reviewsData.count })}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const n = reviewsData.reviews.filter((r) => r.rating === star).length;
                    const pct = reviewsData.count ? (n / reviewsData.count) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{star}</span>
                        <Star className="size-3 shrink-0 fill-current text-amber-500" />
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Review filter chips + sort */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="no-scrollbar horizontal-rail flex gap-1.5 overflow-x-auto pb-1">
                  {[0, 5, 4, 3, 2, 1].map((star) => (
                    <button
                      key={star}
                      onClick={() => setReviewRatingFilter(star)}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        reviewRatingFilter === star
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {star === 0 ? (
                        t("detail.allReviews")
                      ) : (
                        <>
                          {star}<Star className="size-3 fill-current" />
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setReviewSort((s) => (s === "newest" ? "highest" : s === "highest" ? "lowest" : "newest"))}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("detail.sortReviews")}
                >
                  {reviewSort === "newest" ? (
                    <ArrowUpDown className="size-3" />
                  ) : reviewSort === "highest" ? (
                    <ArrowDownAZ className="size-3" />
                  ) : (
                    <ArrowUpAZ className="size-3" />
                  )}
                  {t(`detail.sort${reviewSort.charAt(0).toUpperCase() + reviewSort.slice(1)}`)}
                </button>
              </div>

              {/* Review cards */}
              <div className="mt-3 space-y-2">
                {filteredReviews.map((rev) => (
                  <div key={rev._id} className="rounded-xl border border-border/70 bg-card px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initialsOf(rev.author)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="truncate text-sm font-medium">{rev.author}</span>
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> {t("detail.verifiedVisit")}
                            </span>
                          </div>
                          <span className="mt-0.5 flex items-center gap-0.5 text-amber-500">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn("size-3", i < rev.rating ? "fill-current" : "text-muted-foreground/25")}
                              />
                            ))}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatReviewDate(rev.createdAt)}
                        </span>
                        {/* Diner can delete their own review; admins can delete any */}
                        {(rev.userId === user?._id || user?.role === "admin") && (
                          <button
                            onClick={() => setReviewToDelete(rev._id)}
                            className="flex size-6 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete review"
                            title="Delete review"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {rev.text && <p className="mt-2 text-sm leading-6 text-muted-foreground">{rev.text}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete-review confirmation */}
      <AlertDialog open={!!reviewToDelete} onOpenChange={(open) => !open && !deletingReview && setReviewToDelete(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              Your rating and feedback will be removed from this restaurant permanently. This
              also reverses the loyalty points earned for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingReview}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deletingReview}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteReview();
              }}
            >
              {deletingReview ? <Spinner className="size-4" /> : "Delete review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Queueing state — the table is being confirmed in FIFO order */}
      {queueEntryId && !bookingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
            <Spinner className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 text-lg font-bold tracking-tight">{t("detail.holdingTable")}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {queuePosition && queuePosition > 1
                ? t("detail.queuePosition", { position: queuePosition, name: r.name, time: formatTime(selectedSlot?.time ?? "") })
                : t("detail.confirmingTable", { name: r.name })}
            </p>
            <p className="mt-3 text-xs text-muted-foreground/80">
              {t("detail.queueHint")}
            </p>
          </Card>
        </div>
      )}

      {/* Confirm sheet */}
      {confirmOpen && selectedSlot && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center"
          onClick={() => !submitting && setConfirmOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold tracking-tight">{t("detail.confirmTitle")}</h3>
            <div className="mt-4 space-y-2.5 rounded-2xl bg-muted/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.restaurant")}</span>
                <span className="font-medium">{r.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.when")}</span>
                <span className="font-medium">
                  {formatDate(date)} · {formatTime(selectedSlot.time)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.party")}</span>
                <span className="font-medium">
                  {partySize} {t("common.guest", { count: partySize })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.seating")}</span>
                <span className="font-medium">{selectedSection?.name ?? t("common.bestAvailable")}</span>
              </div>
              {nonSmoking && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("detail.preference")}</span>
                  <span className="font-medium">{t("detail.nonSmokingArea")}</span>
                </div>
              )}
              {occasion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("detail.occasion")}</span>
                  <span className="font-medium">
                    {occasionEmoji(occasion)} {occasion}
                  </span>
                </div>
              )}
            </div>

            {policyHours > 0 && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-3.5 shrink-0" />
                {t("detail.freeCancelUntil", { hours: policyHours })}
              </p>
            )}

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bk-name">{t("detail.nameForBooking")}</Label>
                <Input
                  id="bk-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("onboard.namePlaceholder")}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bk-phone">{t("detail.phoneForBooking")}</Label>
                <Input
                  id="bk-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 010 2030"
                  disabled={submitting}
              />
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">{t("detail.celebrating")}</p>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setOccasion(occasion === o.value ? null : o.value)}
                      disabled={submitting}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        occasion === o.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.emoji} {o.value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bk-notes">{t("detail.specialRequests")}</Label>
                <Textarea
                  id="bk-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("detail.requestsPlaceholder")}
                  rows={2}
                  disabled={submitting}
                />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-primary" /> {t("detail.smsConfirm")}
            </p>
            {bookingError && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {bookingError}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={submitting || !name.trim()}>
                {submitting ? <Spinner className="size-4" /> : t("detail.confirmBooking")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Waitlist sheet */}
      {waitlistSlot && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center"
          onClick={() => !waitlistSubmitting && setWaitlistSlot(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <BellRing className="size-5 text-primary" />
              <h3 className="text-lg font-bold tracking-tight">{t("detail.joinWaitlist")}</h3>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("detail.soldOutFor", { name: r.name, time: formatTime(waitlistSlot.time), count: partySize, guests: t("common.guest", { count: partySize }) })}
            </p>
            <div className="mt-4 space-y-2.5 rounded-2xl bg-muted/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.when")}</span>
                <span className="font-medium">
                  {formatDate(date)} · {formatTime(waitlistSlot.time)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.party")}</span>
                <span className="font-medium">
                  {partySize} {t("common.guest", { count: partySize })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.seating")}</span>
                <span className="font-medium">{waitlistSlot.sectionName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detail.position")}</span>
                <span className="font-medium">{t("detail.fifo")}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wl-name">{t("detail.nameRequired")}</Label>
                <Input
                  id="wl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("onboard.namePlaceholder")}
                  disabled={waitlistSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-phone">{t("detail.phoneAlert")}</Label>
                <Input
                  id="wl-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 010 2030"
                  disabled={waitlistSubmitting}
                />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-primary" /> {t("detail.noPayment")}
            </p>
            {waitlistError && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {waitlistError}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setWaitlistSlot(null)}
                disabled={waitlistSubmitting}
              >
                {t("bookings.notNow")}
              </Button>
              <Button
                className="flex-1"
                onClick={handleJoinWaitlist}
                disabled={waitlistSubmitting || !name.trim()}
              >
                {waitlistSubmitting ? <Spinner className="size-4" /> : t("detail.joinWaitlist")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {bookingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
              <Check className="size-7" />
            </div>
            <h3 className="mt-4 text-xl font-bold tracking-tight">{t("detail.tableBooked")}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("detail.bookedSummary", { section: bookingResult.section || t("common.bestAvailable"), name: r.name, date: formatDate(date), time: formatTime(bookingResult.time) })}
            </p>
            {occasion && (
              <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                {occasionEmoji(occasion)} {t("detail.specialNote", { name: r.name, occasion: occasion.toLowerCase() })}
              </p>
            )}
            <div className="mt-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("detail.confirmationCode")}
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold tracking-widest text-primary">
                {bookingResult.code}
              </p>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {t("detail.showCode")}
            </p>
            <Button
              className="mt-5 w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              asChild
            >
              <a
                href={whatsappShareUrl(
                  bookingShareText({
                    restaurantName: r.name,
                    date,
                    time: bookingResult.time,
                    partySize,
                    code: bookingResult.code,
                    section: bookingResult.section || undefined,
                    city: r.city,
                  }),
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" /> Share on WhatsApp
              </a>
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => navigate("/explore")}>
                Keep exploring
              </Button>
              <Button onClick={() => navigate("/bookings")}>View bookings</Button>
            </div>
          </Card>
        </div>
      )}
    </CustomerShell>
  );
}
