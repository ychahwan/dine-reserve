import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  CheckCircle2,
  ChefHat,
  GlassWater,
  Hand,
  Inbox,
  Lightbulb,
  Receipt,
  Sparkles,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatPrice, formatTime } from "@/lib/format";
import { toast } from "sonner";

const ORDER_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  preparing: { label: "Preparing", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  served: { label: "Served", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  completed: { label: "Completed", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

const ASSIST_META: Record<string, { label: string; icon: LucideIcon }> = {
  water: { label: "More water", icon: GlassWater },
  napkins: { label: "More napkins", icon: Sparkles },
  utensils: { label: "More cutlery", icon: Utensils },
  order_status: { label: "Order status", icon: ChefHat },
  bill: { label: "Bring the bill", icon: Receipt },
  help: { label: "Need help", icon: Hand },
  custom: { label: "Custom request", icon: Lightbulb },
};

const MENU_REQUEST_META: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  fulfilled: { label: "Fulfilled", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type BookingBrief = {
  _id: string;
  code: string;
  date: string;
  time: string;
  partySize: number;
  name?: string;
} | null;

type OrderWithMeta = {
  _id: string;
  status: "open" | "preparing" | "served" | "completed" | "cancelled";
  items: { name: string; priceCents: number; quantity: number; note?: string; ingredients?: string[]; removeIngredients?: string[] }[];
  totalCents: number;
  note?: string;
  createdAt: number;
  dinerName: string;
  booking: BookingBrief;
};

type AssistWithMeta = {
  _id: string;
  template: string;
  note?: string;
  status: "open" | "resolved" | "cancelled";
  createdAt: number;
  resolvedAt?: number;
  dinerName: string;
  booking: BookingBrief;
};

type MenuReqWithMeta = {
  _id: string;
  name: string;
  description?: string;
  status: "new" | "in_progress" | "fulfilled" | "declined";
  createdAt: number;
  dinerName: string;
  booking: BookingBrief;
};

/** "no onion · extra parmesan" style summary for a customized order line. */
function lineSummary(line: { removeIngredients?: string[]; note?: string }): string | null {
  const parts: string[] = [];
  if (line.removeIngredients && line.removeIngredients.length > 0) {
    parts.push(`no ${line.removeIngredients.join(", no ")}`);
  }
  if (line.note && line.note.trim()) parts.push(line.note.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Live badge count for the tab bar (Orders / Requests / Menu ideas). */
export function DiningTabCount({ restaurantId, kind }: { restaurantId: string; kind: "orders" | "assists" | "menuRequests" }) {
  const counts = useQuery(api.dining.openCounts, { restaurantId: restaurantId as never });
  const n = counts?.[kind] ?? 0;
  if (n === 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 bg-destructive text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Booking line shown on every dine-in card. */
function BookingLine({ booking }: { booking: BookingBrief }) {
  if (!booking) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <Badge variant="secondary" className="font-mono text-[10px]">{booking.code}</Badge>
      <span>{formatDate(booking.date)} · {formatTime(booking.time)}</span>
      <span>{booking.partySize} {booking.partySize === 1 ? "guest" : "guests"}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export function OwnerOrdersTab({ restaurantId }: { restaurantId: string }) {
  const orders = useQuery(api.dining.restaurantOrders, { restaurantId: restaurantId as never });
  const updateStatus = useMutation(api.dining.updateOrderStatus);
  const cancelOrder = useMutation(api.dining.cancelOrder);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = (orders ?? []) as OrderWithMeta[];
  const visible = filter === "active"
    ? items.filter((o) => o.status === "open" || o.status === "preparing" || o.status === "served")
    : items;

  const setStatus = async (id: string, status: "open" | "preparing" | "served" | "completed" | "cancelled") => {
    setBusyId(id);
    try {
      await updateStatus({ orderId: id as never, status });
      toast.success("Order updated — the diner sees it live.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    } finally {
      setBusyId(null);
    }
  };

  const openCount = items.filter((o) => o.status === "open" || o.status === "preparing" || o.status === "served").length;

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Dine-in orders appear the second the diner sends them — no more running between tables.
        {openCount > 0 && (
          <span className="mt-1 block font-medium text-primary">
            {openCount} active order{openCount === 1 ? "" : "s"} right now.
          </span>
        )}
      </p>

      <div className="flex gap-2">
        {[
          { key: "active" as const, label: `Active (${openCount})` },
          { key: "all" as const, label: "All" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {orders === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading orders…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "No dine-in orders yet — when a diner orders from their table, it appears here instantly."
              : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((o) => {
            const meta = ORDER_META[o.status] ?? ORDER_META.open;
            return (
              <Card key={o._id} className="rounded-2xl border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{o.dinerName}</p>
                      <Badge className={cn("gap-1", meta.cls)}>{meta.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(o.createdAt)}</span>
                    </div>
                    <div className="mt-1">
                      <BookingLine booking={o.booking} />
                    </div>
                  </div>
                  <span className="shrink-0 text-base font-bold tracking-tight">
                    {formatPrice(o.totalCents)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 rounded-xl bg-muted/40 p-3">
                  {o.items.map((line, i) => {
                    const summary = lineSummary(line);
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 text-muted-foreground">
                          {line.quantity}× {line.name}
                          {summary && (
                            <span className="block text-xs italic">{summary}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-medium">{formatPrice(line.priceCents * line.quantity)}</span>
                      </div>
                    );
                  })}
                  {o.note && (
                    <p className="border-t border-border/60 pt-1.5 text-xs italic text-muted-foreground">
                      “{o.note}”
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === "open" && (
                    <Button size="sm" disabled={busyId === o._id} onClick={() => setStatus(o._id, "preparing")}>
                      <ChefHat className="size-3.5" /> Start preparing
                    </Button>
                  )}
                  {o.status === "preparing" && (
                    <Button size="sm" disabled={busyId === o._id} onClick={() => setStatus(o._id, "served")}>
                      <Check className="size-3.5" /> Mark served
                    </Button>
                  )}
                  {o.status === "served" && (
                    <Button size="sm" disabled={busyId === o._id} onClick={() => setStatus(o._id, "completed")}>
                      <CheckCircle2 className="size-3.5" /> Complete
                    </Button>
                  )}
                  {(o.status === "open" || o.status === "preparing") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busyId === o._id}
                      onClick={() => setStatus(o._id, "cancelled")}
                    >
                      <X className="size-3.5" /> Cancel
                    </Button>
                  )}
                  {o.status === "cancelled" && (
                    <Button size="sm" variant="outline" disabled={busyId === o._id} onClick={() => setStatus(o._id, "open")}>
                      Reinstate
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assist requests (pings)
// ---------------------------------------------------------------------------

export function OwnerAssistsTab({ restaurantId }: { restaurantId: string }) {
  const items = useQuery(api.dining.restaurantAssists, { restaurantId: restaurantId as never });
  const resolve = useMutation(api.dining.resolveAssist);
  const [busyId, setBusyId] = useState<string | null>(null);

  const assists = (items ?? []) as AssistWithMeta[];
  const open = assists.filter((a) => a.status === "open");
  const closed = assists.filter((a) => a.status !== "open");

  const handleResolve = async (id: string) => {
    setBusyId(id);
    try {
      await resolve({ id: id as never });
      toast.success("Marked as handled — the diner sees it resolved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve the request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        One-tap pings from the diner&apos;s table — water, cutlery, the bill, anything. Mark each one
        resolved when it&apos;s handled.
      </p>

      {items === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading requests…
        </div>
      ) : assists.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <Hand className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No requests yet — diner pings will land here instantly.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                Waiting on you ({open.length})
              </p>
              {open.map((a) => {
                const meta = ASSIST_META[a.template] ?? ASSIST_META.custom;
                const Icon = meta.icon;
                return (
                  <Card key={a._id} className="rounded-2xl border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <p className="font-semibold">{meta.label}</p>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                        </div>
                        <div className="mt-2">
                          <BookingLine booking={a.booking} />
                        </div>
                        <p className="mt-1 text-sm font-medium">{a.dinerName}</p>
                        {a.note && (
                          <p className="mt-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs italic text-muted-foreground">
                            “{a.note}”
                          </p>
                        )}
                      </div>
                      <Button size="sm" className="shrink-0" disabled={busyId === a._id} onClick={() => handleResolve(a._id)}>
                        {busyId === a._id ? <Spinner className="size-3.5" /> : <Check className="size-3.5" />}
                        Mark resolved
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {closed.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Handled
              </p>
              {closed.map((a) => {
                const meta = ASSIST_META[a.template] ?? ASSIST_META.custom;
                const Icon = meta.icon;
                return (
                  <Card key={a._id} className="rounded-2xl border-border/70 p-4 opacity-80">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Icon className="size-3.5" />
                          </span>
                          <p className="text-sm font-medium">{meta.label}</p>
                          <Badge
                            className={cn(
                              a.status === "resolved"
                                ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {a.status === "resolved" ? "Resolved" : "Withdrawn"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                        </div>
                        <div className="mt-1.5">
                          <BookingLine booking={a.booking} />
                        </div>
                        {a.note && (
                          <p className="mt-1 text-xs text-muted-foreground">“{a.note}”</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Off-menu requests
// ---------------------------------------------------------------------------

export function OwnerMenuRequestsTab({ restaurantId }: { restaurantId: string }) {
  const items = useQuery(api.dining.restaurantMenuRequests, { restaurantId: restaurantId as never });
  const updateStatus = useMutation(api.dining.updateMenuRequestStatus);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reqs = (items ?? []) as MenuReqWithMeta[];
  const visible = filter === "active"
    ? reqs.filter((r) => r.status === "new" || r.status === "in_progress")
    : reqs;
  const activeCount = reqs.filter((r) => r.status === "new" || r.status === "in_progress").length;

  const setStatus = async (id: string, status: "new" | "in_progress" | "fulfilled" | "declined") => {
    setBusyId(id);
    try {
      await updateStatus({ id: id as never, status });
      toast.success("Request updated — the diner sees it live.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Dishes or drinks diners would love that aren&apos;t on the menu yet — a free source of menu
        ideas. Fulfill what you can, decline politely what you can&apos;t.
      </p>

      <div className="flex gap-2">
        {[
          { key: "active" as const, label: `To review (${activeCount})` },
          { key: "all" as const, label: "All" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading requests…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <Lightbulb className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {reqs.length === 0
              ? "No off-menu requests yet — diners can ask for anything from their table."
              : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const meta = MENU_REQUEST_META[r.status] ?? MENU_REQUEST_META.new;
            return (
              <Card key={r._id} className="rounded-2xl border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{r.name}</p>
                      <Badge className={cn(meta.cls)}>{meta.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    </div>
                    <div className="mt-1">
                      <BookingLine booking={r.booking} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">from {r.dinerName}</p>
                    {r.description && (
                      <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                        “{r.description}”
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "new" && (
                    <>
                      <Button size="sm" disabled={busyId === r._id} onClick={() => setStatus(r._id, "in_progress")}>
                        <ChefHat className="size-3.5" /> Start working on it
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busyId === r._id}
                        onClick={() => setStatus(r._id, "declined")}
                      >
                        <X className="size-3.5" /> Decline
                      </Button>
                    </>
                  )}
                  {r.status === "in_progress" && (
                    <>
                      <Button size="sm" disabled={busyId === r._id} onClick={() => setStatus(r._id, "fulfilled")}>
                        <CheckCircle2 className="size-3.5" /> Fulfilled
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busyId === r._id}
                        onClick={() => setStatus(r._id, "declined")}
                      >
                        <X className="size-3.5" /> Decline
                      </Button>
                    </>
                  )}
                  {r.status === "declined" && (
                    <Button size="sm" variant="outline" disabled={busyId === r._id} onClick={() => setStatus(r._id, "new")}>
                      Reopen
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
