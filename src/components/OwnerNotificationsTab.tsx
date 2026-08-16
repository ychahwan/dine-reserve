import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  BellOff,
  BellRing,
  Car,
  CheckCheck,
  ChefHat,
  Clock,
  Hand,
  Inbox,
  Lightbulb,
  MapPin,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "sonner";

const TYPE_META: Record<
  string,
  { label: string; icon: LucideIcon; cls: string }
> = {
  on_my_way: { label: "On my way", icon: Car, cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  running_late: { label: "Running late", icon: Clock, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  arrived: { label: "Arrived", icon: MapPin, cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  special_request: { label: "Special request", icon: Sparkles, cls: "bg-violet-600/10 text-violet-700 dark:text-violet-400" },
  booking_created: { label: "New booking", icon: BellRing, cls: "bg-primary/10 text-primary" },
  booking_cancelled: { label: "Booking cancelled", icon: BellOff, cls: "bg-destructive/10 text-destructive" },
  new_order: { label: "New order", icon: ChefHat, cls: "bg-primary/10 text-primary" },
  assist_request: { label: "Team request", icon: Hand, cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  menu_request: { label: "Off-menu request", icon: Lightbulb, cls: "bg-violet-600/10 text-violet-700 dark:text-violet-400" },
};

const DINER_ALERT_TYPES = new Set(["on_my_way", "running_late", "arrived", "special_request"]);

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type Notif = {
  _id: string;
  type: string;
  message?: string;
  read: boolean;
  createdAt: number;
  dinerName: string;
  bookingId?: string;
  booking: {
    _id: string;
    date: string;
    time: string;
    partySize: number;
    code: string;
    sectionName?: string;
  } | null;
};

export function OwnerNotificationsTab({ restaurantId }: { restaurantId: string }) {
  const all = useQuery(api.notifications.forRestaurant, {
    restaurantId: restaurantId as never,
  });
  const unread = useQuery(api.notifications.unreadCount, {
    restaurantId: restaurantId as never,
  });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const [kind, setKind] = useState<"all" | "alerts" | "events">("all");
  const [bookingFilter, setBookingFilter] = useState<string>("__all__");
  const [markingAll, setMarkingAll] = useState(false);

  const items = (all ?? []) as Notif[];

  const bookingOptions = useMemo(() => {
    const seen = new Map<string, Notif["booking"]>();
    for (const n of items) {
      if (n.booking && !seen.has(n.booking._id)) seen.set(n.booking._id, n.booking);
    }
    return [...seen.values()].sort((a, b) => `${b!.date}T${b!.time}`.localeCompare(`${a!.date}T${a!.time}`));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (kind === "alerts" && !DINER_ALERT_TYPES.has(n.type)) return false;
      if (kind === "events" && DINER_ALERT_TYPES.has(n.type)) return false;
      if (bookingFilter !== "__all__" && n.bookingId !== bookingFilter) return false;
      return true;
    });
  }, [items, kind, bookingFilter]);

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllRead({ restaurantId: restaurantId as never });
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleOpen = async (n: Notif) => {
    if (!n.read) {
      try {
        await markRead({ id: n._id as never });
      } catch {
        // non-fatal
      }
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Diner check-ins (on my way, running late…), dine-in activity (orders, pings, off-menu
          requests) and automatic booking events — tap a notification to mark it as read.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={(unread ?? 0) === 0 || markingAll}
          onClick={handleMarkAll}
        >
          {markingAll ? <Spinner className="size-3.5" /> : <CheckCheck className="size-3.5" />}
          Mark all read
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "all" as const, label: `All (${items.length})` },
          { key: "alerts" as const, label: "Diner alerts" },
          { key: "events" as const, label: "Booking & dine-in" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setKind(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              kind === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}

        <Select value={bookingFilter} onValueChange={setBookingFilter}>
          <SelectTrigger className="ml-auto h-9 w-auto gap-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All bookings</SelectItem>
            {bookingOptions.map((b) => (
              <SelectItem key={b!._id} value={b!._id}>
                {formatDate(b!.date)} · {formatTime(b!.time)} · {b!.partySize} guests
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {unread !== undefined && unread > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <BellRing className="size-3.5" /> {unread} unread notification{unread === 1 ? "" : "s"}
        </p>
      )}

      {all === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading notifications…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "No notifications yet — diner alerts, dine-in activity and booking events will appear here."
              : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? {
              label: n.type,
              icon: BellRing,
              cls: "bg-muted text-muted-foreground",
            };
            const Icon = meta.icon;
            return (
              <Card
                key={n._id}
                className={cn(
                  "cursor-pointer rounded-2xl border-border/70 p-3.5 shadow-sm transition-colors hover:bg-muted/30",
                  !n.read && "border-primary/40 bg-primary/5",
                )}
                onClick={() => handleOpen(n)}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm", !n.read ? "font-semibold" : "font-medium")}>
                        {meta.label}
                        {!n.read && <span className="ml-2 inline-block size-2 shrink-0 rounded-full bg-primary align-middle" />}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{n.dinerName}</span>
                      {n.booking ? (
                        <>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" /> {formatDate(n.booking.date)} · {formatTime(n.booking.time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="size-3" /> {n.booking.partySize}{" "}
                            {n.booking.partySize === 1 ? "guest" : "guests"}
                          </span>
                          {n.booking.sectionName && <span>{n.booking.sectionName}</span>}
                          <Badge variant="secondary" className="font-mono text-[10px]">{n.booking.code}</Badge>
                        </>
                      ) : (
                        <span>Restaurant-wide</span>
                      )}
                    </p>
                    {n.message && (
                      <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                        “{n.message}”
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
