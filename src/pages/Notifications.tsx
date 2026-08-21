import { CustomerShell } from "@/components/CustomerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  BellRing,
  CalendarCheck2,
  CheckCheck,
  ChefHat,
  Clock,
  Gift,
  Sparkles,
  Star,
  UserPlus,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TYPE_META: Record<string, { icon: typeof BellRing; label: string; cls: string }> = {
  favorite_story: { icon: ChefHat, label: "New from a favorite", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  reengage: { icon: Sparkles, label: "We miss you", cls: "bg-primary/10 text-primary" },
  guest_joined: { icon: UserPlus, label: "Your party grew", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  review_nudge: { icon: Star, label: "Rate your visit", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  waitlist_freed: { icon: Gift, label: "Table freed up!", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  booking_reminder: { icon: CalendarCheck2, label: "Reminder", cls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
};

export default function Notifications() {
  const notifications = useQuery(api.dinerNotify.myNotifications);
  const markAllRead = useMutation(api.dinerNotify.markAllRead);

  // Opening the feed marks everything read.
  useEffect(() => {
    markAllRead().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CustomerShell>
      <div className="px-4 pt-5 pb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <BellRing className="size-5 text-primary" /> Notifications
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Personalized updates about your restaurants, bookings and waitlists
        </p>

        {notifications === undefined ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Spinner className="size-6" />
            <p className="text-sm">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <BellRing className="size-9 text-muted-foreground/60" />
            <div>
              <p className="font-medium">All caught up</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Save a restaurant to get notified when they post news, and you'll
                get nudges after your visits and when waitlist tables free up.
              </p>
            </div>
            <Button asChild>
              <Link to="/explore">Explore restaurants</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.favorite_story;
              const Icon = meta.icon;
              const inner = (
                <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5 transition-colors hover:bg-muted/40">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wide", meta.cls)}>
                        {meta.label}
                      </Badge>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                  </div>
                  {!n.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
                </div>
              );
              return n.link ? (
                <Link key={n._id} to={n.link}>
                  {inner}
                </Link>
              ) : (
                <div key={n._id}>{inner}</div>
              );
            })}

            <div className="flex items-center justify-center gap-1.5 pt-4 text-xs text-muted-foreground">
              <CheckCheck className="size-3.5" /> Marked as read
            </div>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
