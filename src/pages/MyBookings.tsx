import { CustomerShell } from "@/components/CustomerShell";
import { BookingReceiptDialog } from "@/components/BookingReceipt";
import { DiningDialog } from "@/components/DiningDialog";
import { SocializeDialog } from "@/components/SocializeDialog";
import { BillSplit } from "@/components/BillSplit";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  BellRing,
  CalendarCheck2,
  CalendarX2,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MapPin,
  MessageCircle,
  PartyPopper,
  QrCode,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  bookingShareText,
  dateLabel,
  formatDate,
  formatTime,
  publicAppUrl,
  today,
  whatsappShareUrl,
} from "@/lib/format";
import { toast } from "sonner";

type AlertType = "on_my_way" | "running_late" | "arrived" | "special_request";

const ALERT_KEYS: { type: AlertType; labelKey: string; descKey: string; icon: LucideIcon }[] = [
  { type: "on_my_way", labelKey: "bookings.alertOnMyWay", descKey: "bookings.alertOnMyWayDesc", icon: Car },
  { type: "running_late", labelKey: "bookings.alertRunningLate", descKey: "bookings.alertRunningLateDesc", icon: Clock },
  { type: "arrived", labelKey: "bookings.alertArrived", descKey: "bookings.alertArrivedDesc", icon: MapPin },
  { type: "special_request", labelKey: "bookings.alertSpecial", descKey: "bookings.alertSpecialDesc", icon: Sparkles },
];

const ALERT_LABEL_KEY: Record<AlertType, string> = {
  on_my_way: "bookings.alertOnMyWay",
  running_late: "bookings.alertRunningLate",
  arrived: "bookings.alertArrived",
  special_request: "bookings.alertSpecial",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: {
      label: t("bookings.statusConfirmed"),
      cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    },
    completed: {
      label: t("bookings.statusCompleted"),
      cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
    },
    cancelled: { label: t("bookings.statusCancelled"), cls: "bg-muted text-muted-foreground" },
    no_show: { label: t("bookings.statusNoShow"), cls: "bg-destructive/10 text-destructive" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge className={cn("gap-1", m.cls)}>{m.label}</Badge>;
}

export default function MyBookings() {
  const { t } = useTranslation();
  const bookings = useQuery(api.bookings.myBookings);
  const cancelBooking = useMutation(api.bookings.cancelBooking);
  const waitlist = useQuery(api.waitlist.myWaitlist);
  const cancelWaitlist = useMutation(api.waitlist.cancel);
  const myAlerts = useQuery(api.notifications.myAlerts);
  const sendForBooking = useMutation(api.notifications.sendForBooking);
  const reviewable = useQuery(api.reviews.myReviewable);
  const createReview = useMutation(api.reviews.create);
  const checkIn = useMutation(api.dining.checkIn);
  const releaseBooking = useMutation(api.bookings.releaseBooking);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Booking receipt (Idea #6) + release-to-pool (Idea #15)
  const [receiptBookingId, setReceiptBookingId] = useState<string | null>(null);
  const [releaseBookingId, setReleaseBookingId] = useState<string | null>(null);
  const [releaseResult, setReleaseResult] = useState<string | null>(null);

  // Offline cache (Idea #10): the last 5 confirmed bookings are kept in
  // localStorage so codes are available at the door with no signal.
  const [cachedBookings, setCachedBookings] = useState<Record<string, { code: string; restaurantName: string; date: string; time: string }>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("kamix:offline-bookings");
      setCachedBookings(raw ? JSON.parse(raw) : {});
    } catch {
      /* storage unavailable — fine, online-only */
    }
  }, []);
  useEffect(() => {
    if (!bookings) return;
    const recent = (bookings as any[])
      .filter((b) => b.status === "confirmed")
      .slice(0, 5);
    if (recent.length === 0) return;
    const next = { ...cachedBookings };
    for (const b of recent) {
      next[b._id as string] = {
        code: (b as any).code,
        restaurantName: (b as any).restaurant?.name ?? "Restaurant",
        date: (b as any).date,
        time: (b as any).time,
      };
    }
    // keep only the newest 10 to bound storage
    const ordered = Object.entries(next).sort((a, b) => (b[1].date + b[1].time).localeCompare(a[1].date + a[1].time));
    const trimmed = Object.fromEntries(ordered.slice(0, 10));
    setCachedBookings(trimmed);
    try {
      localStorage.setItem("kamix:offline-bookings", JSON.stringify(trimmed));
    } catch {
      /* quota — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  // In-app confirmation (native window.confirm is blocked in the sandboxed
  // preview iframe and would silently do nothing).
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [cancelWaitlistId, setCancelWaitlistId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Notify-restaurant dialog
  const [notifyBookingId, setNotifyBookingId] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<AlertType>("on_my_way");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // Rate-your-visit dialog (verified reviews)
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Invite-friends dialog (group invites)
  const [inviteBookingId, setInviteBookingId] = useState<string | null>(null);

  // Bill split dialog: per-user breakdown of shared booking
  const [billSplitBookingId, setBillSplitBookingId] = useState<string | null>(null);
  const billSplitBooking = billSplitBookingId
    ? (bookings ?? []).find((b) => b._id === billSplitBookingId) ?? null
    : null;

  // Dine-in dialog: order, ping the team, menu ideas, bill
  const [dineBookingId, setDineBookingId] = useState<string | null>(null);
  const dineBooking = dineBookingId
    ? (bookings ?? []).find((b) => b._id === dineBookingId) ?? null
    : null;

  // Socialize dialog: who's dining + diner-to-diner gifts
  const [socializeBookingId, setSocializeBookingId] = useState<string | null>(null);
  const socializeBooking = socializeBookingId
    ? (bookings ?? []).find((b) => b._id === socializeBookingId) ?? null
    : null;

  // KB-27: "upcoming" must compare against the current TIME, not midnight —
  // a confirmed booking whose time already passed today belongs in the past
  // section (previously it lingered under "Upcoming" all day).
  const now = new Date();
  const nowKey = `${today()}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = (bookings ?? []).filter(
    (b) => b.status === "confirmed" && `${b.date}T${b.time}` >= nowKey,
  );
  const earlier = (bookings ?? []).filter(
    (b) => b.status !== "confirmed" || `${b.date}T${b.time}` < nowKey,
  );
  const activeWaitlist = (waitlist ?? []).filter((w) => w.status !== "cancelled");

  const bookingToCancel = cancelBookingId
    ? (bookings ?? []).find((b) => b._id === cancelBookingId) ?? null
    : null;
  const bookingToReceipt = receiptBookingId
    ? (bookings ?? []).find((b) => b._id === receiptBookingId) ?? null
    : null;
  const bookingToRelease = releaseBookingId
    ? (bookings ?? []).find((b) => b._id === releaseBookingId) ?? null
    : null;
  const waitlistToLeave = cancelWaitlistId
    ? (waitlist ?? []).find((w) => w._id === cancelWaitlistId) ?? null
    : null;
  const bookingToNotify = notifyBookingId
    ? (bookings ?? []).find((b) => b._id === notifyBookingId) ?? null
    : null;
  const bookingToReview = reviewBookingId
    ? (reviewable ?? []).find((b) => b._id === reviewBookingId) ?? null
    : null;
  const bookingToInvite = inviteBookingId
    ? (bookings ?? []).find((b) => b._id === inviteBookingId) ?? null
    : null;

  // KB-27: "reviewed" must come from the ACTUAL reviews, not from "not
  // confirmed" — previously any completed-but-unreviewed booking was labeled
  // "Reviewed" whenever the reviewable query hadn't populated yet. A booking
  // is reviewed when it's completed AND absent from the reviewable (still
  // needing a rating) list.
  const reviewedIds = useMemo(() => {
    if (reviewable === undefined) return new Set<string>();
    const reviewableIds = new Set(reviewable.map((b) => b._id));
    return new Set(
      (bookings ?? [])
        .filter((b) => b.status === "completed" && !reviewableIds.has(b._id))
        .map((b) => b._id),
    );
  }, [bookings, reviewable]);

  // latest diner alert sent per booking (for the "you notified" state on cards)
  const latestAlertByBooking = useMemo(() => {
    const map = new Map<string, { type: AlertType; createdAt: number }>();
    for (const a of myAlerts ?? []) {
      if (!a.bookingId) continue;
      if (!(a.type in ALERT_LABEL_KEY)) continue;
      const type = a.type as AlertType;
      if (!map.has(a.bookingId)) map.set(a.bookingId, { type, createdAt: a.createdAt });
    }
    return map;
  }, [myAlerts]);

  const confirmCancelBooking = async () => {
    if (!cancelBookingId || busyId) return;
    setBusyId(cancelBookingId);
    setCancelError(null);
    try {
      await cancelBooking({ bookingId: cancelBookingId as never });
      toast.success(t("bookings.cancelled"));
      setCancelBookingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not cancel the booking.";
      setCancelError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const confirmReleaseBooking = async () => {
    if (!releaseBookingId || busyId) return;
    setBusyId(releaseBookingId);
    setReleaseResult(null);
    try {
      const res = await releaseBooking({ bookingId: releaseBookingId as never });
      setReleaseResult(
        res.waitlistNotified
          ? t("bookings.releasedWaitlist")
          : t("bookings.releasedPool"),
      );
      toast.success(t("bookings.released"));
      setReleaseBookingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not release the table.";
      setReleaseResult(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const confirmLeaveWaitlist = async () => {
    if (!cancelWaitlistId || busyId) return;
    setBusyId(cancelWaitlistId);
    setCancelError(null);
    try {
      await cancelWaitlist({ waitlistId: cancelWaitlistId as never });
      toast.success(t("bookings.leftWaitlist"));
      setCancelWaitlistId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not leave the waitlist.";
      setCancelError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckIn = async (bookingId: string) => {
    if (busyId) return;
    setBusyId(bookingId);
    try {
      // KB-04: pass the diner's local date so day-of-visit checks near
      // midnight aren't rejected by the UTC server clock.
      await checkIn({ bookingId: bookingId as never, clientDate: today() });
      toast.success(t("bookings.checkedIn"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check in.");
    } finally {
      setBusyId(null);
    }
  };

  const sendAlert = async () => {
    if (!notifyBookingId || sending) return;
    setSending(true);
    setNotifyError(null);
    try {
      await sendForBooking({
        bookingId: notifyBookingId as never,
        type: alertType,
        message: note.trim() || undefined,
        clientDate: today(), // KB-04: diner-local "today" for the past-date check
      });
      toast.success(t("bookings.notifiedRestaurant"));
      setNotifyBookingId(null);
      setNote("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send the notification.";
      setNotifyError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const submitReview = async () => {
    if (!reviewBookingId || reviewSending) return;
    setReviewSending(true);
    setReviewError(null);
    try {
      await createReview({
        bookingId: reviewBookingId as never,
        rating,
        text: reviewText.trim() || undefined,
      });
      toast.success(t("bookings.thanksReview"));
      setReviewBookingId(null);
      setReviewText("");
      setRating(5);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit the review.";
      setReviewError(msg);
      toast.error(msg);
    } finally {
      setReviewSending(false);
    }
  };

  const copyInviteLink = async (code: string) => {
    const link = `${publicAppUrl()}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("bookings.inviteCopied"));
    } catch {
      toast.info(`Invite link: ${link}`);
    }
  };

  return (
    <CustomerShell>
      <div className="px-4 pt-5 pb-6">
        <h1 className="text-xl font-bold tracking-tight">{t("bookings.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("bookings.subtitle")}
        </p>

        {bookings === undefined || waitlist === undefined || myAlerts === undefined ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Spinner className="size-6" />
            <p className="text-sm">{t("bookings.loading")}</p>
          </div>
        ) : bookings.length === 0 && activeWaitlist.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <CalendarCheck2 className="size-9 text-muted-foreground/60" />
            <div>
              <p className="font-medium">{t("bookings.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("bookings.emptyBody")}
              </p>
            </div>
            <Button asChild>
              <Link to="/explore">{t("bookings.emptyCta")}</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Waitlist */}
            {activeWaitlist.length > 0 && (
              <section className="mt-5">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <BellRing className="size-3.5" /> {t("bookings.waitlist")}
                </h2>
                <div className="mt-3 space-y-3">
                  {activeWaitlist.map((w) => {
                    const notified = w.status === "notified";
                    return (
                      <Card
                        key={w._id}
                        className={cn(
                          "overflow-hidden rounded-2xl border-border/70 p-0",
                          notified && "border-emerald-600/40",
                        )}
                      >
                        <div className="flex gap-3 p-4">
                          {w.restaurant?.imageUrl ? (
                            <img
                              src={w.restaurant.imageUrl}
                              alt=""
                              className="size-16 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Store className="size-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold">
                                {w.restaurant?.name ?? "Restaurant"}
                              </p>
                              <Badge
                                className={cn(
                                  "gap-1",
                                  notified
                                    ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                <BellRing className="size-3" />
                                {notified ? t("bookings.tableFreed") : t("bookings.waiting")}
                              </Badge>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarCheck2 className="size-3.5" />
                              {dateLabel(w.date)} · {formatTime(w.time)}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="size-3.5" /> {w.partySize}{" "}
                              {t("common.guest", { count: w.partySize })} · {w.sectionName ?? t("common.bestAvailable")}
                            </p>
                            {notified && (
                              <p className="mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                {t("bookings.freedBody")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5">
                          {notified ? (
                            <Button size="sm" asChild>
                              <Link to={`/restaurant/${w.restaurantId}`}>{t("bookings.bookNow")}</Link>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={busyId === w._id}
                              onClick={() => {
                                setCancelError(null);
                                setCancelWaitlistId(w._id);
                              }}
                            >
                              {busyId === w._id ? <Spinner className="size-3.5" /> : t("bookings.leaveWaitlist")}
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section className={cn(activeWaitlist.length > 0 && "mt-7")}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("bookings.upcoming")}
                </h2>
                <div className="mt-3 space-y-3">
                  {upcoming.map((b) => {
                    const sent = latestAlertByBooking.get(b._id);
                    const guests = b.guests ?? [];
                    const canCheckIn = b.date === today() && !b.checkedInAt;
                    return (
                      <Card
                        key={b._id}
                        className="overflow-hidden rounded-2xl border-border/70 p-0"
                      >
                        <div className="flex gap-3 p-4">
                          {b.restaurant?.imageUrl ? (
                            <img
                              src={b.restaurant.imageUrl}
                              alt=""
                              className="size-16 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Store className="size-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold">
                                {b.restaurant?.name ?? "Restaurant"}
                              </p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {b.checkedInAt && (
                                  <Badge className="gap-1 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 className="size-3" /> {t("bookings.checkedIn")}
                                  </Badge>
                                )}
                                <StatusBadge status={b.status} />
                              </div>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarCheck2 className="size-3.5" />
                              {dateLabel(b.date)} · {formatTime(b.time)}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="size-3.5" /> {b.partySize}{" "}
                              {t("common.guest", { count: b.partySize })}
                              {b.sectionName ? ` · ${b.sectionName}` : ""}
                            </p>
                            {guests.length > 0 && (
                              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                                <UserPlus className="size-3.5" />
                                {t("bookings.guestsConfirmed", { names: guests.map((g) => g.name).join(", ") })}
                              </p>
                            )}
                            {sent && (
                              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary">
                                <BellRing className="size-3" />
                                {t("bookings.notified", { type: t(ALERT_LABEL_KEY[sent.type]) })}
                              </p>
                            )}
                            {canCheckIn && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-8 gap-1 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 dark:text-emerald-400"
                                disabled={busyId === b._id}
                                onClick={() => handleCheckIn(b._id)}
                              >
                                {busyId === b._id ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <MapPin className="size-3.5" />
                                )}
                                {t("bookings.checkIn")}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="border-t border-border/60 bg-muted/30 px-3 py-3 sm:px-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {t("bookings.bookingCode")}
                            </span>
                            <span className="font-mono text-xs font-semibold tracking-widest text-primary">
                              {b.code}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 sm:h-8 sm:w-auto dark:text-emerald-400"
                              asChild
                              title="Share on WhatsApp"
                            >
                              <a
                                href={whatsappShareUrl(
                                  bookingShareText({
                                    restaurantName: b.restaurant?.name ?? "Restaurant",
                                    date: b.date,
                                    time: b.time,
                                    partySize: b.partySize,
                                    code: b.code,
                                    section: b.sectionName ?? undefined,
                                    city: b.restaurant?.city ?? undefined,
                                  }),
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle className="size-3.5" /> {t("bookings.share")}
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="Invite friends to this booking"
                              onClick={() => setInviteBookingId(b._id)}
                            >
                              <UserPlus className="size-3.5" /> {t("bookings.invite")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="See who's dining and send a gift"
                              onClick={() => setSocializeBookingId(b._id)}
                            >
                              <PartyPopper className="size-3.5" /> {t("bookings.socialize")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="Order, ping the team, view your bill"
                              onClick={() => setDineBookingId(b._id)}
                            >
                              <Utensils className="size-3.5" /> {t("bookings.dine")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="View bill split by person"
                              onClick={() => setBillSplitBookingId(b._id)}
                            >
                              <Receipt className="size-3.5" /> {t("bookings.viewBillSplit")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="Notify the restaurant"
                              onClick={() => {
                                setNotifyError(null);
                                setNote("");
                                setAlertType("on_my_way");
                                setNotifyBookingId(b._id);
                              }}
                            >
                              <BellRing className="size-3.5" /> {t("bookings.notify")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-auto"
                              title="Print or save a receipt with QR code"
                              onClick={() => setReceiptBookingId(b._id)}
                            >
                              <QrCode className="size-3.5" /> {t("bookings.receipt")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start text-amber-700 hover:bg-amber-500/10 hover:text-amber-700 sm:h-8 sm:w-auto dark:text-amber-400"
                              title="Release the table back to other diners"
                              disabled={busyId === b._id}
                              onClick={() => {
                                setReleaseResult(null);
                                setReleaseBookingId(b._id);
                              }}
                            >
                              {busyId === b._id ? <Spinner className="size-3.5" /> : t("bookings.release")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-auto"
                              disabled={busyId === b._id}
                              onClick={() => {
                                setCancelError(null);
                                setCancelBookingId(b._id);
                              }}
                            >
                              {busyId === b._id ? <Spinner className="size-3.5" /> : t("bookings.cancel")}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {earlier.length > 0 && (
              <section className="mt-7">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("bookings.past")}
                </h2>
                <div className="mt-3 space-y-2">
                  {earlier.map((b) => {
                    const reviewableBooking = (reviewable ?? []).find((rb) => rb._id === b._id);
                    return (
                      <Card
                        key={b._id}
                        className="rounded-2xl border-border/70 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {b.restaurant?.name ?? "Restaurant"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDate(b.date)} · {formatTime(b.time)} · {b.partySize}{" "}
                              {t("common.guest", { count: b.partySize })}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {reviewableBooking && b.status === "completed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400"
                                onClick={() => {
                                  setReviewError(null);
                                  setReviewText("");
                                  setRating(5);
                                  setReviewBookingId(b._id);
                                }}
                              >
                                <Star className="size-3.5" /> {t("bookings.rateVisit")}
                              </Button>
                            ) : reviewedIds.has(b._id) && b.status === "completed" ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <Star className="size-3.5 fill-current" /> {t("bookings.reviewed")}
                              </span>
                            ) : null}
                            <StatusBadge status={b.status} />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {upcoming.length === 0 && earlier.length === 0 && activeWaitlist.length === 0 && (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
                <CalendarX2 className="size-9 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">{t("bookings.nothingHere")}</p>
              </div>
            )}
          </>
        )}

        {(bookings ?? []).length > 0 || (waitlist ?? []).length > 0 ? (
          <p className="mt-8 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" /> {t("bookings.codesAtDoor")}
          </p>
        ) : null}
      </div>

      {/* Offline booking codes (Idea #10) */}
      {bookings === undefined && Object.keys(cachedBookings).length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="flex items-center gap-1.5 font-medium">
            <QrCode className="size-4" /> {t("bookings.offlineTitle")}
          </p>
          <p className="mt-1 text-xs">
            {Object.values(cachedBookings)
              .slice(0, 5)
              .map((c) => `${c.restaurantName} · ${c.code}`)
              .join(" · ")}
          </p>
        </div>
      )}

      {/* Booking receipt (Idea #6) */}
      <BookingReceiptDialog
        booking={bookingToReceipt}
        onOpenChange={(open) => {
          if (!open) setReceiptBookingId(null);
        }}
      />

      {/* Release table to the pool (Idea #15) */}
      <Dialog
        open={!!releaseBookingId}
        onOpenChange={(open) => {
          if (!open && busyId === null) setReleaseBookingId(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">{t("bookings.releaseTitle")}</DialogTitle>
            <DialogDescription>
              {bookingToRelease
                ? t("bookings.releaseDesc", {
                    name: bookingToRelease.restaurant?.name ?? t("common.restaurant"),
                    date: dateLabel(bookingToRelease.date),
                    time: formatTime(bookingToRelease.time),
                  })
                : t("bookings.releaseDescFallback")}
            </DialogDescription>
          </DialogHeader>
          {releaseResult && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {releaseResult}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (busyId === null) setReleaseBookingId(null);
              }}
              disabled={busyId !== null}
            >
              {t("bookings.keepTable")}
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={(e) => {
                e.preventDefault();
                confirmReleaseBooking();
              }}
            >
              {busyId === releaseBookingId ? <Spinner className="size-4" /> : t("bookings.releaseTable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dine-in experience (order / ask / menu ideas / bill) */}
      <DiningDialog
        booking={dineBooking}
        onOpenChange={(open) => {
          if (!open) setDineBookingId(null);
        }}
      />

      {/* Socialize: who's dining + diner-to-diner gifts */}
      <SocializeDialog
        booking={socializeBooking}
        onOpenChange={(open) => {
          if (!open) setSocializeBookingId(null);
        }}
      />

      {/* Confirm cancel booking */}
      <AlertDialog
        open={!!cancelBookingId}
        onOpenChange={(open) => {
          if (!open && busyId === null) setCancelBookingId(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">{t("bookings.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {bookingToCancel
                ? t("bookings.cancelDesc", {
                    name: bookingToCancel.restaurant?.name ?? t("common.restaurant"),
                    date: dateLabel(bookingToCancel.date),
                    time: formatTime(bookingToCancel.time),
                  })
                : t("bookings.cancelDescFallback")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bookingToCancel && (bookingToCancel.restaurant?.cancellationPolicyHours ?? 0) > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-emerald-600/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {t("bookings.freeCancelUntil", { hours: bookingToCancel.restaurant!.cancellationPolicyHours })}
            </p>
          )}
          {cancelError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {cancelError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busyId !== null}
              onClick={() => setCancelError(null)}
            >
              {t("bookings.keepIt")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyId !== null}
              onClick={(e) => {
                e.preventDefault();
                confirmCancelBooking();
              }}
            >
              {busyId === cancelBookingId ? <Spinner className="size-4" /> : t("bookings.cancelBooking")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm leave waitlist */}
      <AlertDialog
        open={!!cancelWaitlistId}
        onOpenChange={(open) => {
          if (!open && busyId === null) setCancelWaitlistId(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">{t("bookings.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {waitlistToLeave
                ? t("bookings.leaveDesc", {
                    name: waitlistToLeave.restaurant?.name ?? t("common.restaurant"),
                    date: dateLabel(waitlistToLeave.date),
                    time: formatTime(waitlistToLeave.time),
                  })
                : t("bookings.leaveDescFallback")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {cancelError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busyId !== null}
              onClick={() => setCancelError(null)}
            >
              {t("bookings.stayOnList")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyId !== null}
              onClick={(e) => {
                e.preventDefault();
                confirmLeaveWaitlist();
              }}
            >
              {busyId === cancelWaitlistId ? <Spinner className="size-4" /> : t("bookings.leaveWaitlist")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Notify restaurant */}
      <Dialog
        open={!!notifyBookingId}
        onOpenChange={(open) => {
          if (!open && !sending) {
            setNotifyBookingId(null);
            setNotifyError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">{t("bookings.notifyTitle", { name: bookingToNotify?.restaurant?.name ?? t("common.restaurant") })}</DialogTitle>
            <DialogDescription>
              {bookingToNotify
                ? t("bookings.notifyDesc", {
                    date: dateLabel(bookingToNotify.date),
                    time: formatTime(bookingToNotify.time),
                    count: bookingToNotify.partySize,
                    guests: t("common.guest", { count: bookingToNotify.partySize }),
                  })
                : t("bookings.notifyDescFallback")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {ALERT_KEYS.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => setAlertType(o.type)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
                  alertType === o.type
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg",
                    alertType === o.type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <o.icon className="size-4" />
                </span>
                <span className="text-xs font-semibold leading-tight">{t(o.labelKey)}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{t(o.descKey)}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notify-note" className="text-xs font-medium text-muted-foreground">
              {t("bookings.addNote")} <span className="font-normal">{t("bookings.optional")}</span>
            </label>
            <Textarea
              id="notify-note"
              rows={2}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                alertType === "special_request"
                  ? t("bookings.notePlaceholderSpecial")
                  : alertType === "running_late"
                    ? t("bookings.notePlaceholderLate")
                    : t("bookings.notePlaceholder")
              }
            />
          </div>

          {notifyError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{notifyError}</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!sending) {
                  setNotifyBookingId(null);
                  setNotifyError(null);
                }
              }}
              disabled={sending}
            >
              {t("common.close")}
            </Button>
            <Button onClick={sendAlert} disabled={sending}>
              {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
              {t("bookings.sendNotification")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate your visit */}
      <Dialog
        open={!!reviewBookingId}
        onOpenChange={(open) => {
          if (!open && !reviewSending) {
            setReviewBookingId(null);
            setReviewError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">
              {t("bookings.reviewTitle", { name: bookingToReview?.restaurant?.name ?? t("common.restaurant") })}
            </DialogTitle>
            <DialogDescription>
              {t("bookings.reviewDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-1.5 py-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={cn(
                  "rounded-lg p-1 transition-transform hover:scale-110",
                  star <= rating ? "text-amber-500" : "text-muted-foreground/30",
                )}
                aria-label={`${star} star${star === 1 ? "" : "s"}`}
              >
                <Star className={cn("size-8", star <= rating && "fill-current")} />
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="review-text" className="text-xs font-medium text-muted-foreground">
              {t("bookings.yourReview")} <span className="font-normal">{t("bookings.optional")}</span>
            </label>
            <Textarea
              id="review-text"
              rows={3}
              value={reviewText}
              maxLength={500}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t("bookings.reviewPlaceholder")}
            />
          </div>

          {reviewError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{reviewError}</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!reviewSending) {
                  setReviewBookingId(null);
                  setReviewError(null);
                }
              }}
              disabled={reviewSending}
            >
              {t("bookings.notNow")}
            </Button>
            <Button onClick={submitReview} disabled={reviewSending}>
              {reviewSending ? <Spinner className="size-4" /> : <Star className="size-4" />}
              {t("bookings.postReview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill split per-user breakdown */}
      <Dialog
        open={!!billSplitBookingId}
        onOpenChange={(open) => {
          if (!open) setBillSplitBookingId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">
              {billSplitBooking
                ? t("bookings.billSplitTitle", { name: billSplitBooking.restaurant?.name ?? t("common.restaurant") })
                : t("bookings.billSplitTitleFallback")}
            </DialogTitle>
            <DialogDescription>
              {billSplitBooking
                ? t("bookings.billSplitDesc", {
                    date: dateLabel(billSplitBooking.date),
                    time: formatTime(billSplitBooking.time),
                  })
                : t("bookings.billSplitDescFallback")}
            </DialogDescription>
          </DialogHeader>
          {billSplitBooking && (
            <BillSplit bookingId={billSplitBooking._id as never} />
          )}
        </DialogContent>
      </Dialog>

      {/* Invite friends */}
      <Dialog
        open={!!inviteBookingId}
        onOpenChange={(open) => {
          if (!open) setInviteBookingId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">{t("bookings.inviteTitle")}</DialogTitle>
            <DialogDescription>
              {t("bookings.inviteDesc")}
            </DialogDescription>
          </DialogHeader>
          {bookingToInvite && (
            <>
              <div className="rounded-2xl bg-muted/40 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common.restaurant")}</span>
                  <span className="font-medium">{bookingToInvite.restaurant?.name ?? "—"}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted-foreground">{t("common.when")}</span>
                  <span className="font-medium">
                    {formatDate(bookingToInvite.date)} · {formatTime(bookingToInvite.time)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted-foreground">{t("common.party")}</span>
                  <span className="font-medium">
                    {t("bookings.partyGoing", { count: bookingToInvite.partySize + (bookingToInvite.guests?.length ?? 0) })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {publicAppUrl()}/invite/{bookingToInvite.code}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copyInviteLink(bookingToInvite.code)}
                >
                  <Copy className="size-3.5" /> {t("bookings.copy")}
                </Button>
              </div>
              <Button
                className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                asChild
              >
                <a
                  href={whatsappShareUrl(
                    `🍽️ Join us at ${bookingToInvite.restaurant?.name ?? "our table"} on ${formatDate(
                      bookingToInvite.date,
                    )} at ${formatTime(bookingToInvite.time)}!\nTap here to confirm your seat: ${
                      publicAppUrl()
                    }/invite/${bookingToInvite.code}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> {t("bookings.shareWhatsapp")}
                </a>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </CustomerShell>
  );
}
