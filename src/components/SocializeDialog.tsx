import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Gift,
  PartyPopper,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDate, formatPrice, formatTime, today } from "@/lib/format";
import { toast } from "sonner";

export type SocializeBooking = {
  _id: string;
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  code: string;
  status: string;
  checkedInAt?: number;
  restaurant?: {
    _id: string;
    name: string;
    imageUrl?: string;
    city?: string;
  } | null;
};

type VisibleDiner = {
  _id: string;
  userId: string;
  name: string;
  image?: string;
  checkedIn: boolean;
  booking: { time: string; sectionName?: string };
};

type GiftLike = {
  _id: string;
  name: string;
  emoji: string;
  description?: string;
  priceCents: number;
  available: boolean;
};

/** Epoch-millisecond timestamp -> localized "5:30 PM" */
const formatClockIn = (ts: number, locale: string) =>
  new Date(ts).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function timeAgo(ts: number, nowMs: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const s = Math.floor((nowMs - ts) / 1000);
  if (s < 60) return t("notif.justNow");
  if (s < 3600) return t("notif.mAgo", { count: Math.floor(s / 60) });
  if (s < 86400) return t("notif.hAgo", { count: Math.floor(s / 3600) });
  return t("notif.dAgo", { count: Math.floor(s / 86400) });
}

const DELIVERY_META: Record<string, { key: string; cls: string }> = {
  ordered: { key: "social.deliveryOrdered", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  delivered: { key: "social.deliveryDelivered", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  cancelled: { key: "social.deliveryCancelled", cls: "bg-muted text-muted-foreground" },
};

/**
 * Socialize — Kamix's diner-to-diner space, opened from a booking card.
 *
 * On the day of your visit you can appear in the restaurant's live "room":
 * other diners who are visible see you (and vice-versa), and anyone can send
 * a drink or dessert from the restaurant's gift catalog. Gifts land on the
 * sender's bill at the table; the sender chooses whether the receiver is told
 * right away or only when the restaurant delivers it (a surprise). Everything
 * here is reactive — the room updates the moment someone checks in, flips
 * visibility, or sends a gift.
 */
export function SocializeDialog({
  booking,
  onOpenChange,
}: {
  booking: SocializeBooking | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const formatClock = (ts: number) => formatClockIn(ts, i18n.language);
  const isToday = booking?.date === today();

  // Low-frequency tick (L-27/M-24): keeps relative times fresh and re-derives
  // the seated tier as checked-in time accumulates.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const bookingKey = booking?._id ?? null;
  useEffect(() => {
    if (!bookingKey) return;
    const update = () => setNowTs(Date.now());
    const first = setTimeout(update, 0);
    const iv = setInterval(update, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [bookingKey]);

  const presences = useQuery(api.socialize.myPresence);
  // KB-04/11: pass the diner's local date so the room's "today" matches the
  // day setVisibility stored (otherwise a diner near midnight turns visibility
  // on but is filtered out of the room).
  const diners = useQuery(
    api.socialize.visibleDiners,
    booking ? { restaurantId: booking.restaurantId as never, clientDate: today() } : "skip",
  );
  const twins = useQuery(
    api.socialize.tasteTwins,
    booking ? { restaurantId: booking.restaurantId as never, clientDate: today() } : "skip",
  );
  const catalog = useQuery(
    api.socialize.giftCatalog,
    booking ? { restaurantId: booking.restaurantId as never } : "skip",
  );
  const received = useQuery(api.socialize.myReceivedGifts);
  const sent = useQuery(api.socialize.mySentGifts);

  const setVisibility = useMutation(api.socialize.setVisibility);

  const [tab, setTab] = useState<"room" | "gifts">("room");
  const [busy, setBusy] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<VisibleDiner | null>(null);

  // Reset transient state whenever the target booking changes.
  useEffect(() => {
    setTab("room");
    setBusy(null);
    setSendingTo(null);
  }, [booking?._id]);

  const myPresence = presences?.find((p) => p.bookingId === booking?._id);
  const visible = myPresence?.visible ?? false;
  const checkedIn = !!booking?.checkedInAt;

  // M-24 (client side): the >15-min "seated" promotion is derived from the
  // checked-in elapsed time (recomputed on the tick above), not from the
  // stored accessTier alone — waiting at the table now actually unlocks.
  const seatedMinutes = booking?.checkedInAt
    ? Math.floor((nowTs - booking.checkedInAt) / 60_000)
    : 0;
  const storedTier =
    (myPresence?.accessTier as "booked" | "checked_in" | "seated" | undefined) ??
    (visible ? "checked_in" : "booked");
  const viewerTier: "booked" | "checked_in" | "seated" =
    storedTier === "seated" || seatedMinutes >= 15 ? "seated" : storedTier;

  const gifts = (catalog ?? []) as GiftLike[];
  const openCount = (diners ?? []).length;
  const pendingReceived = (received ?? []).filter((g) => g.status === "ordered").length;

  const handleToggleVisible = async () => {
    if (!booking || busy) return;
    setBusy("visibility");
    try {
      await setVisibility({ bookingId: booking._id as never, visible: !visible });
      toast.success(
        visible
          ? t("social.nowHiddenToast")
          : t("social.nowVisibleToast"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("social.errVisibility"));
    } finally {
      setBusy(null);
    }
  };

  if (!booking) return null;

  // Back button: when the send-gift sheet is open, go back to the room
  // first; otherwise leave the Socialize screen entirely.
  const handleBack = () => {
    if (sendingTo !== null) {
      setSendingTo(null);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label={t("common.back")}>
          <ArrowLeft className="size-5" />
        </Button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PartyPopper className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight">{t("social.title")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t("social.headerMeta", {
              name: booking.restaurant?.name ?? t("social.yourTable"),
              date: formatDate(booking.date),
              time: formatTime(booking.time),
              code: booking.code,
            })}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {sendingTo !== null ? (
          /* Send-gift sheet: fully replaces the tab content below (rather
             than overlaying it) so this always shows correctly regardless
             of how much content the underlying tab had. */
          <SendGiftSheet
            recipient={sendingTo}
            gifts={gifts}
            bookingId={booking?._id ?? null}
            onClose={() => setSendingTo(null)}
          />
        ) : (
          <>
            {/* Tabs */}
        <div className="no-scrollbar horizontal-rail mt-2 flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "room" as const, label: t("social.tabRoom"), icon: Users, count: openCount },
            { key: "gifts" as const, label: t("social.tabGifts"), icon: Gift, count: pendingReceived },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                tab === t.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-3.5" /> {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
                    tab === t.key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {t.count > 9 ? "9+" : t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Room tab ──────────────────────────────────────────────── */}
        {tab === "room" && (
          <div className="space-y-4">
            {!isToday && (
              <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  {t("social.dayOnlyHint")}
                </span>
              </div>
            )}
            {isToday && !checkedIn && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t("social.checkInFirst")}
                </span>
              </div>
            )}

            {/* Visibility switch */}
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {visible ? (
                      <Eye className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <EyeOff className="size-4 text-muted-foreground" />
                    )}
                    {visible ? t("social.visibleNow") : t("social.invisibleNow")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {!checkedIn
                      ? t("social.hintNotCheckedIn")
                      : visible
                        ? t("social.hintVisible")
                        : t("social.hintInvisible")}
                  </p>
                </div>
                <Switch
                  checked={visible}
                  disabled={busy === "visibility" || !checkedIn}
                  onCheckedChange={handleToggleVisible}
                  aria-label={t("social.toggleVisibility")}
                />
              </div>
              {busy === "visibility" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Spinner className="size-3" /> {t("social.updating")}
                </p>
              )}
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <BellRing className="size-3" /> {t("social.giftBillNote")}
              </p>
            </div>

            {/* Taste Twins — diners whose preferences match yours */}
            {(twins ?? []).length > 0 && viewerTier === "seated" && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3.5" /> {t("social.twinsTitle")}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {t("social.twinsHint")}
                </p>
                <div className="mt-2.5 space-y-2">
                  {(twins ?? []).map((tw) => (
                    <div
                      key={tw._id}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                    >
                      {tw.image ? (
                        <img src={tw.image} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {initials(tw.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tw.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {tw.sharedTags.join(" · ")}
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-primary/10 text-primary">
                        {t("social.matchScore", { score: tw.score })}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tier indicator */}
            {checkedIn && viewerTier === "checked_in" && (
              <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  {t("social.tierHint")}
                </span>
              </div>
            )}

            {/* Live room */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("social.diningNow")}
              </p>
              {diners === undefined ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> {t("social.loadingRoom")}
                </div>
              ) : openCount === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <Users className="mx-auto size-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">{t("social.roomQuiet")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {visible
                      ? t("social.quietAsVisible")
                      : t("social.quietAsInvisible")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(diners ?? []).map((d, i) => (
                    <motion.div
                      key={d._id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3"
                    >
                      {d.image ? (
                        <img src={d.image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {initials(d.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="size-3" /> {formatTime(d.booking.time)}
                          {d.booking.sectionName ? ` · ${d.booking.sectionName}` : ""}
                        </p>
                        {d.checkedIn && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" /> {t("social.checkedInBadge")}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={gifts.length === 0 || !isToday}
                        title={
                          gifts.length === 0
                            ? t("social.venueNoGifts")
                            : t("social.sendSomething", { name: d.name })
                        }
                        onClick={() => setSendingTo(d)}
                      >
                        <Gift className="size-3.5" /> {t("social.send")}
                      </Button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Gifts tab ─────────────────────────────────────────────── */}
        {tab === "gifts" && (
          <div className="space-y-5">
            {/* Received */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("social.received")}
              </p>
              {received === undefined ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> {t("common.loading")}
                </div>
              ) : (received ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("social.receivedEmpty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {(received ?? []).map((g) => {
                    const meta = DELIVERY_META[g.status] ?? DELIVERY_META.ordered;
                    return (
                      <div key={g._id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {g.surprise ? t("social.surpriseComing") : `${g.gift?.emoji ?? "🎁"} ${g.gift?.name ?? t("social.aGift")}`}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {g.surprise
                                ? t("social.surpriseHint")
                                : g.gift?.note
                                  ? `${t("social.from", { name: g.senderName })} · “${g.gift.note}”`
                                  : t("social.from", { name: g.senderName })}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {g.restaurantName} · {timeAgo(g.createdAt, nowTs, t)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge className={cn("gap-1", meta.cls)}>
                              {g.status === "ordered" && g.surprise ? t("social.onItsWay") : t(meta.key)}
                            </Badge>
                            {g.surprise && g.status === "delivered" && (
                              <span className="text-[10px] text-muted-foreground">
                                {t("social.revealedBy", { name: g.senderName })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sent */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("social.sent")}
              </p>
              {sent === undefined ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> {t("common.loading")}
                </div>
              ) : (sent ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("social.sentEmpty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {(sent ?? []).map((g) => {
                    const meta = DELIVERY_META[g.status] ?? DELIVERY_META.ordered;
                    return (
                      <div key={g._id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {g.emoji} {g.name} → {g.receiverName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {g.reveal === "on_delivery"
                                ? t("social.revealOnDelivery")
                                : t("social.revealedNow")}
                              {g.note ? ` · “${g.note}”` : ""}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {g.restaurantName} · {timeAgo(g.createdAt, nowTs, t)}
                              {g.deliveredAt ? ` · ${t("social.deliveredAt", { time: formatClock(g.deliveredAt) })}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-sm font-semibold">{formatPrice(g.priceCents)}</span>
                            <Badge className={cn("gap-1", meta.cls)}>{t(meta.key)}</Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />{" "}
            {isToday ? t("social.visibleDiners", { count: openCount }) : t("social.liveOnDay")}
          </span>
          <span className="flex items-center gap-1">
            <BellRing className="size-3" /> {t("social.giftsOnBillFooter")}
          </span>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send-gift sheet
//
// Rendered as an in-place overlay inside the Socialize dialog's own
// DialogContent (see above), not as a second Radix Dialog. Two independently
// portaled Dialogs previously caused the outer screen to treat clicks inside
// this sheet as "outside" and dismiss itself.
// ---------------------------------------------------------------------------

function SendGiftSheet({
  recipient,
  gifts,
  bookingId,
  onClose,
}: {
  recipient: VisibleDiner;
  gifts: GiftLike[];
  bookingId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sendGift = useMutation(api.socialize.sendGift);

  const [giftId, setGiftId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reveal, setReveal] = useState<"now" | "on_delivery">("now");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever the sheet targets a different recipient.
  useEffect(() => {
    setGiftId(null);
    setNote("");
    setReveal("now");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient._id]);

  const selected = gifts.find((g) => g._id === giftId);

  const handleSend = async () => {
    if (!bookingId || !recipient || !giftId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendGift({
        bookingId: bookingId as never,
        giftId: giftId as never,
        receiverUserId: recipient.userId as never,
        note: note.trim() || undefined,
        reveal,
        clientDate: today(),
      });
      toast.success(
        reveal === "now"
          ? t("social.sentNowToast", {
              emoji: selected?.emoji ?? "",
              name: selected?.name ?? t("social.aGift"),
              recipient: recipient.name,
            })
          : t("social.sentSurpriseToast", { recipient: recipient.name }),
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("social.errSendGift"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <p className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Gift className="size-4 text-primary" />
          {recipient?.name ? t("social.sendToName", { name: recipient.name }) : t("social.sendGift")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("social.sheetHint")}
        </p>
      </div>

      <div className="mt-3 space-y-4">
          {/* Gift picker */}
          {gifts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t("social.venueNoGiftsYet")}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("social.pickGift")}</p>
              <div className="grid grid-cols-2 gap-2">
                {gifts.map((g) => (
                  <button
                    key={g._id}
                    type="button"
                    onClick={() => setGiftId(g._id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer",
                      giftId === g._id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{g.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatPrice(g.priceCents)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {selected?.description && (
                <p className="mt-2 text-[11px] italic text-muted-foreground">{selected.description}</p>
              )}
            </div>
          )}

          {/* Reveal choice */}
          {giftId && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("social.whenFindOut")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReveal("now")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer",
                    reveal === "now"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <p className="text-xs font-semibold">{t("social.tellNow")}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    {t("social.tellNowHint")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setReveal("on_delivery")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer",
                    reveal === "on_delivery"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <p className="text-xs font-semibold">{t("social.keepSurprise")}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    {t("social.keepSurpriseHint")}
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="gift-note" className="text-xs text-muted-foreground">
              {t("social.addNote")} <span className="font-normal">{t("social.optional")}</span>
            </Label>
            <Textarea
              id="gift-note"
              rows={2}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                reveal === "on_delivery" ? t("social.noteSurprisePlaceholder") : t("social.noteCheersPlaceholder")
              }
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1"
              disabled={!giftId || busy}
              onClick={handleSend}
            >
              {busy ? (
                <Spinner className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
              {t("social.send")}
              {selected ? ` · ${formatPrice(selected.priceCents)}` : ""}
            </Button>
          </div>
        </div>
      </div>
  );
}
