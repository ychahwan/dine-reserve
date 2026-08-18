import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
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
  booking: { time: string; sectionName?: string; partySize: number; code: string };
};

type GiftLike = {
  _id: string;
  name: string;
  emoji: string;
  description?: string;
  priceCents: number;
  available: boolean;
};

/** Epoch-millisecond timestamp -> "5:30 PM" */
const formatClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const DELIVERY_META: Record<string, { label: string; cls: string }> = {
  ordered: { label: "At the bar", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  delivered: { label: "Delivered", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
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
  const isToday = booking?.date === today();

  const presences = useQuery(api.socialize.myPresence);
  const diners = useQuery(
    api.socialize.visibleDiners,
    booking ? { restaurantId: booking.restaurantId as never } : "skip",
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

  const gifts = (catalog ?? []) as GiftLike[];
  const openCount = (diners ?? []).length;
  const pendingReceived = (received ?? []).filter((g) => g.status === "ordered").length;

  const handleToggleVisible = async () => {
    if (!booking || busy) return;
    setBusy("visibility");
    try {
      await setVisibility({ bookingId: booking._id as never, visible: !visible, clientDate: today() });
      toast.success(
        visible
          ? "You're now invisible — diners here won't see you or send gifts."
          : "You're visible — diners at this restaurant can see you and send you something.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your visibility.");
    } finally {
      setBusy(null);
    }
  };

  // The send-gift sheet below is its own Radix Dialog, portaled to
  // document.body as a *sibling* of this dialog's content (not DOM-nested
  // inside it). That makes this outer dialog's outside-click/dismiss
  // detection treat clicks inside the send-gift sheet as "outside", closing
  // the whole Socialize screen. Guard against that: never let this dialog
  // close while the send-gift sheet is open.
  const handleOuterOpenChange = (open: boolean) => {
    if (!open && sendingTo !== null) return;
    onOpenChange(open);
  };

  return (
    <Dialog open={!!booking} onOpenChange={handleOuterOpenChange}>
      <DialogContent className="relative max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PartyPopper className="size-4" />
            </span>
            Socialize
          </DialogTitle>
          <DialogDescription>
            {booking
              ? `${booking.restaurant?.name ?? "Your table"} · ${formatDate(booking.date)} at ${formatTime(
                  booking.time,
                )} · code ${booking.code}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {sendingTo !== null ? (
          /* Send-gift sheet: fully replaces the tab content below (rather
             than overlaying it) so the dialog's own height always matches
             the sheet's real content instead of whatever the underlying
             tab happened to render at. Since this is just a normal sibling
             swap inside the same DialogContent — not a second Dialog — it
             can never trigger the outer dialog's dismiss handling either. */
          <SendGiftSheet
            recipient={sendingTo}
            gifts={gifts}
            bookingId={booking?._id ?? null}
            onClose={() => setSendingTo(null)}
          />
        ) : (
          <>
            {/* Tabs */}
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "room" as const, label: "Who's dining", icon: Users, count: isToday ? openCount : 0 },
            { key: "gifts" as const, label: "Gifts", icon: Gift, count: pendingReceived },
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
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Socialize goes live on the day of your visit. On the day, appear here to see who
                  else is dining and let them find you.
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
                    {visible ? "Visible in the room" : "Invisible right now"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {visible
                      ? "Other diners here can see you and send you a drink or dessert."
                      : "No one here can see you — and you won't receive gifts."}
                  </p>
                </div>
                <Switch
                  checked={visible}
                  disabled={!isToday || busy === "visibility"}
                  onCheckedChange={handleToggleVisible}
                  aria-label="Toggle Socialize visibility"
                />
              </div>
              {busy === "visibility" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Spinner className="size-3" /> Updating…
                </p>
              )}
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <BellRing className="size-3" /> When you send a gift it's added to your bill at the
                table.
              </p>
            </div>

            {/* Live room */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Dining now · live
              </p>
              {diners === undefined ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Loading the room…
                </div>
              ) : openCount === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <Users className="mx-auto size-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">The room is quiet right now</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {visible
                      ? "You're the first visible diner — others will appear here the moment they show up."
                      : "Turn on your visibility and others will see you here."}
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
                            <CheckCircle2 className="size-3" /> Checked in
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
                            ? "This restaurant hasn't added gifts yet"
                            : `Send ${d.name} something`
                        }
                        onClick={() => setSendingTo(d)}
                      >
                        <Gift className="size-3.5" /> Send
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
                Received
              </p>
              {received === undefined ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Loading…
                </div>
              ) : (received ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  No gifts yet — appear in the room and a fellow diner might send you a drink.
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
                              {g.surprise ? "🎁 A surprise is coming…" : `${g.gift?.emoji ?? "🎁"} ${g.gift?.name ?? "A gift"}`}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {g.surprise
                                ? "Someone sent you something — it stays a secret until the restaurant delivers it."
                                : `From ${g.senderName}${g.gift?.note ? ` · “${g.gift.note}”` : ""}`}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {g.restaurantName} · {timeAgo(g.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge className={cn("gap-1", meta.cls)}>
                              {g.status === "ordered" && g.surprise ? "On its way" : meta.label}
                            </Badge>
                            {g.surprise && g.status === "delivered" && (
                              <span className="text-[10px] text-muted-foreground">
                                from {g.senderName}
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
                Sent
              </p>
              {sent === undefined ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Loading…
                </div>
              ) : (sent ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  Nothing sent yet — pick a diner in the room and surprise them.
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
                                ? "Surprise — revealed when the restaurant delivers it"
                                : "They were told right away"}
                              {g.note ? ` · “${g.note}”` : ""}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {g.restaurantName} · {timeAgo(g.createdAt)}
                              {g.deliveredAt ? ` · delivered ${formatClock(g.deliveredAt)}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-sm font-semibold">{formatPrice(g.priceCents)}</span>
                            <Badge className={cn("gap-1", meta.cls)}>{meta.label}</Badge>
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
            <Users className="size-3" /> {isToday ? `${openCount} visible diner${openCount === 1 ? "" : "s"}` : "Live on the day of your visit"}
          </span>
          <span className="flex items-center gap-1">
            <BellRing className="size-3" /> Gifts are added to your bill
          </span>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
          ? `${selected?.emoji ?? ""} ${selected?.name ?? "Gift"} sent to ${recipient.name} — it's on your bill.`
          : `Surprise on its way to ${recipient.name} — it's revealed when the restaurant delivers it.`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the gift.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <p className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Gift className="size-4 text-primary" />
          Send {recipient?.name ? `to ${recipient.name}` : "a gift"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Picked from this restaurant's gift list — it lands on your bill at the table.
        </p>
      </div>

      <div className="mt-3 space-y-4">
          {/* Gift picker */}
          {gifts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              This restaurant hasn't added gifts yet — check back later.
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Pick a gift</p>
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
              <p className="mb-2 text-xs font-medium text-muted-foreground">When should they find out?</p>
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
                  <p className="text-xs font-semibold">Tell them now</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    They get the notification right away
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
                  <p className="text-xs font-semibold">Keep it a surprise</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Revealed only when the restaurant delivers it
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="gift-note" className="text-xs text-muted-foreground">
              Add a note <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="gift-note"
              rows={2}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reveal === "on_delivery" ? "e.g. Enjoy! 🥂" : "e.g. Cheers from the bar!"}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
              Cancel
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
              Send{selected ? ` · ${formatPrice(selected.priceCents)}` : ""}
            </Button>
          </div>
        </div>
      </div>
  );
}
