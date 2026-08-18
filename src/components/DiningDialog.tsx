import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ChefHat,
  GlassWater,
  Hand,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Send,
  ShoppingBag,
  Sparkles,
  Utensils,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatPrice, formatTime, today } from "@/lib/format";
import { toast } from "sonner";

export type DineBooking = {
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

type MenuItemLike = {
  _id: string;
  name: string;
  description?: string;
  priceCents: number;
  category?: string;
  available: boolean;
  tags?: string[];
  ingredients?: string[];
};

type OrderLine = {
  menuItemId?: string;
  name: string;
  priceCents: number;
  quantity: number;
  note?: string;
  ingredients?: string[];
  removeIngredients?: string[];
};

type OrderLike = {
  _id: string;
  status: "open" | "preparing" | "served" | "completed" | "cancelled";
  items: OrderLine[];
  totalCents: number;
  note?: string;
  createdAt: number;
};

type BillLineLike = {
  name: string;
  quantity: number;
  priceCents: number;
  lineTotal: number;
  removeIngredients?: string[];
  note?: string;
};

/** A cart line: quantity + per-item customization (ingredients to drop, note). */
type CartEntry = {
  qty: number;
  removed: string[];
  note?: string;
};

/** Epoch-millisecond timestamp -> "5:30 PM" (formatTime only takes "HH:mm" strings). */
const formatClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Sent to kitchen", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  preparing: { label: "Preparing", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  served: { label: "Served", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  completed: { label: "Completed", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

const ASSIST_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "water", label: "More water", icon: GlassWater },
  { value: "napkins", label: "Napkins", icon: Sparkles },
  { value: "utensils", label: "Cutlery", icon: Utensils },
  { value: "order_status", label: "Order status", icon: ChefHat },
  { value: "bill", label: "Bring the bill", icon: Receipt },
  { value: "help", label: "Need help", icon: Hand },
  { value: "custom", label: "Custom…", icon: BellRing },
];

const MENU_REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  fulfilled: { label: "Fulfilled", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
};

function groupItems(items: MenuItemLike[]): [string, MenuItemLike[]][] {
  const map = new Map<string, MenuItemLike[]>();
  for (const it of items) {
    const key = it.category?.trim() || "Signature";
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return [...map.entries()];
}

/** "No onion, no garlic" style summary for a customized line. */
function removalSummary(removed: string[] | undefined, note?: string): string | null {
  const parts: string[] = [];
  if (removed && removed.length > 0) parts.push(`no ${removed.join(", no ")}`);
  if (note && note.trim()) parts.push(note.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The dine-in experience for one booking: order from the menu (with per-dish
 * customization), ping the waiter/manager, ask for something off-menu, and
 * view the saved bill. Everything is reactive — the restaurant's screens
 * update the instant the diner acts, and this dialog updates the instant the
 * kitchen responds.
 */
export function DiningDialog({
  booking,
  onOpenChange,
}: {
  booking: DineBooking | null;
  onOpenChange: (open: boolean) => void;
}) {
  const restaurantData = useQuery(
    api.restaurants.get,
    booking ? { id: booking.restaurantId as never } : "skip",
  );
  const orders = useQuery(
    api.dining.myOrders,
    booking ? { bookingId: booking._id as never } : "skip",
  );
  const assists = useQuery(
    api.dining.myAssists,
    booking ? { bookingId: booking._id as never } : "skip",
  );
  const menuReqs = useQuery(
    api.dining.myMenuRequests,
    booking ? { restaurantId: booking.restaurantId as never } : "skip",
  );
  const bill = useQuery(
    api.dining.billForBooking,
    booking ? { bookingId: booking._id as never } : "skip",
  );

  const checkIn = useMutation(api.dining.checkIn);
  const placeOrder = useMutation(api.dining.placeOrder);
  const cancelOrder = useMutation(api.dining.cancelOrder);
  const sendAssist = useMutation(api.dining.sendAssist);
  const cancelAssist = useMutation(api.dining.cancelAssist);
  const createMenuRequest = useMutation(api.dining.createMenuRequest);

  const [tab, setTab] = useState<"order" | "assist" | "menu" | "bill">("order");
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [orderNote, setOrderNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState<{ item: MenuItemLike; existing?: CartEntry } | null>(null);

  const [assistTemplate, setAssistTemplate] = useState("water");
  const [assistNote, setAssistNote] = useState("");
  const [menuName, setMenuName] = useState("");
  const [menuDesc, setMenuDesc] = useState("");

  // Reset transient state whenever the target booking changes.
  useEffect(() => {
    setCart({});
    setOrderNote("");
    setAssistTemplate("water");
    setAssistNote("");
    setMenuName("");
    setMenuDesc("");
    setCustomizing(null);
  }, [booking?._id]);

  const allItems = useMemo(
    () => (restaurantData?.menuDocs ?? []).flatMap((m) => m.items),
    [restaurantData],
  );
  const availableItems = useMemo(
    () => allItems.filter((i) => i.available),
    [allItems],
  );
  const grouped = useMemo(() => groupItems(availableItems), [availableItems]);

  const cartCount = Object.values(cart).reduce((s, e) => s + e.qty, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, entry]) => {
    const item = availableItems.find((i) => i._id === id);
    return sum + (item?.priceCents ?? 0) * entry.qty;
  }, 0);

  const isToday = booking?.date === today();

  /** Open the customize sheet for an item, or add directly when it has no ingredients. */
  const handleAdd = (item: MenuItemLike) => {
    if (item.ingredients && item.ingredients.length > 0) {
      setCustomizing({ item, existing: cart[item._id] });
    } else {
      setCart((c) => {
        const prev = c[item._id] ?? { qty: 0, removed: [] };
        return { ...c, [item._id]: { ...prev, qty: prev.qty + 1 } };
      });
    }
  };

  /** Stepper +/- on a cart line keeps its customization. */
  const bumpQty = (id: string, delta: number) => {
    setCart((c) => {
      const prev = c[id];
      if (!prev) return c;
      const qty = prev.qty + delta;
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = { ...prev, qty };
      return next;
    });
  };

  const confirmCustomize = (item: MenuItemLike, entry: CartEntry) => {
    setCart((c) => ({ ...c, [item._id]: entry }));
    setCustomizing(null);
  };

  const handleCheckIn = async () => {
    if (!booking || busy) return;
    setBusy("checkin");
    try {
      await checkIn({ bookingId: booking._id as never });
      toast.success("Checked in! The team knows you're here.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check in.");
    } finally {
      setBusy(null);
    }
  };

  const handlePlaceOrder = async () => {
    if (!booking || cartCount === 0 || busy) return;
    setBusy("order");
    try {
      await placeOrder({
        bookingId: booking._id as never,
        items: Object.entries(cart).map(([menuItemId, entry]) => ({
          menuItemId: menuItemId as never,
          quantity: entry.qty,
          removeIngredients: entry.removed.length > 0 ? entry.removed : undefined,
          note: entry.note?.trim() || undefined,
        })),
        note: orderNote.trim() || undefined,
      });
      toast.success("Order sent to the kitchen — they'll confirm shortly.");
      setCart({});
      setOrderNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the order.");
    } finally {
      setBusy(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (busy) return;
    setBusy(orderId);
    try {
      await cancelOrder({ orderId: orderId as never });
      toast.success("Order cancelled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the order.");
    } finally {
      setBusy(null);
    }
  };

  const handleSendAssist = async () => {
    if (!booking || busy) return;
    setBusy("assist");
    try {
      await sendAssist({
        bookingId: booking._id as never,
        template: assistTemplate as never,
        note: assistNote.trim() || undefined,
      });
      toast.success("Request sent — the team will be right over.");
      setAssistNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the request.");
    } finally {
      setBusy(null);
    }
  };

  const handleCancelAssist = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await cancelAssist({ id: id as never });
      toast.success("Request withdrawn.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the request.");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateMenuRequest = async () => {
    if (!booking || busy) return;
    if (!menuName.trim()) {
      toast.error("Tell us what you'd like.");
      return;
    }
    setBusy("menu");
    try {
      await createMenuRequest({
        restaurantId: booking.restaurantId as never,
        bookingId: booking._id as never,
        name: menuName.trim(),
        description: menuDesc.trim() || undefined,
      });
      toast.success("Request sent — the kitchen will review it.");
      setMenuName("");
      setMenuDesc("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the request.");
    } finally {
      setBusy(null);
    }
  };

  const cartItems = Object.entries(cart)
    .map(([id, entry]) => ({ item: availableItems.find((i) => i._id === id), entry }))
    .filter((x) => x.item);

  if (!booking) return null;

  // Back button: when customizing an item, go back to the menu first;
  // otherwise leave the dine-in screen entirely.
  const handleBack = () => {
    if (customizing !== null) {
      setCustomizing(null);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight">
            {booking.restaurant?.name ?? "Your table"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {`${formatDate(booking.date)} · ${formatTime(booking.time)} · ${booking.partySize} ${
              booking.partySize === 1 ? "guest" : "guests"
            } · code ${booking.code}`}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {customizing !== null ? (
          /* Customize sheet: fully replaces the tab content below (rather
             than overlaying it) so this always shows correctly regardless
             of how much content the underlying tab had. */
          <CustomizeSheet
            item={customizing.item}
            initial={customizing.existing}
            onClose={() => setCustomizing(null)}
            onConfirm={(entry) => confirmCustomize(customizing.item, entry)}
          />
        ) : (
          <>
            {/* Check-in strip */}
        {booking &&
          (booking.checkedInAt ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3.5 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Checked in at {formatClock(booking.checkedInAt)} —
              the team knows you&apos;re here.
            </div>
          ) : isToday ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
              <div className="text-sm">
                <p className="font-medium">Arriving today?</p>
                <p className="text-xs text-muted-foreground">
                  Let the restaurant know you&apos;re here so they can seat you right away.
                </p>
              </div>
              <Button size="sm" onClick={handleCheckIn} disabled={busy === "checkin"}>
                {busy === "checkin" ? <Spinner className="size-3.5" /> : <MapPin className="size-3.5" />}
                I&apos;m here
              </Button>
            </div>
          ) : null)}

        {/* Tabs */}
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "order" as const, label: "Order", icon: ShoppingBag, count: orders?.length },
            { key: "assist" as const, label: "Ask the team", icon: Hand, count: (assists ?? []).filter((a) => a.status === "open").length },
            { key: "menu" as const, label: "Menu ideas", icon: Utensils, count: menuReqs?.length },
            { key: "bill" as const, label: "Bill", icon: Receipt },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
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
                    tab === t.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
                  )}
                >
                  {t.count > 9 ? "9+" : t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Order tab ─────────────────────────────────────────────── */}
        {tab === "order" && (
          <div className="space-y-4">
            {orders !== undefined && orders.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Your orders · live
                </p>
                {orders.map((o: OrderLike) => {
                  const meta = ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.open;
                  return (
                    <div key={o._id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={cn("gap-1", meta.cls)}>{meta.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatClock(o.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {o.items.map((line, i) => {
                          const summary = removalSummary(line.removeIngredients, line.note);
                          return (
                            <div key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 text-muted-foreground">
                                {line.quantity}× {line.name}
                                {summary ? (
                                  <span className="ml-1 block text-xs italic">
                                    ({summary})
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 font-medium">{formatPrice(line.priceCents * line.quantity)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                        <span className="text-xs text-muted-foreground">
                          {o.note ? `“${o.note}”` : "Total"}
                        </span>
                        <span className="text-sm font-semibold">{formatPrice(o.totalCents)}</span>
                      </div>
                      {o.status === "open" && (
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busy === o._id}
                            onClick={() => handleCancelOrder(o._id)}
                          >
                            Cancel order
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {restaurantData === undefined ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Loading menu…
              </div>
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <ChefHat className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">No menu items available yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Want something specific? Use the “Menu ideas” tab and the kitchen will review it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([category, items]) => (
                  <section key={category}>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {category}
                      </h3>
                      <div className="h-px flex-1 bg-border/80" />
                    </div>
                    <div className="mt-2 space-y-2">
                      {items.map((item) => {
                        const entry = cart[item._id];
                        const customizable = (item.ingredients ?? []).length > 0;
                        const summary = entry ? removalSummary(entry.removed, entry.note) : null;
                        return (
                          <div
                            key={item._id}
                            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{item.name}</p>
                              {item.description && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {item.description}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="text-sm font-semibold">{formatPrice(item.priceCents)}</span>
                                {(item.tags ?? []).slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                              {summary && (
                                <p className="mt-1 text-[11px] italic text-muted-foreground">
                                  {summary}
                                </p>
                              )}
                            </div>
                            {!entry ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={() => handleAdd(item)}
                              >
                                <Plus className="size-3.5" /> {customizable ? "Customize" : "Add"}
                              </Button>
                            ) : (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button variant="outline" size="icon-sm" onClick={() => bumpQty(item._id, -1)}>
                                  <Minus className="size-3.5" />
                                </Button>
                                <span className="w-5 text-center text-sm font-semibold">{entry.qty}</span>
                                <Button size="icon-sm" onClick={() => bumpQty(item._id, 1)}>
                                  <Plus className="size-3.5" />
                                </Button>
                                {customizable && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Customize"
                                    className="text-muted-foreground"
                                    onClick={() => setCustomizing({ item, existing: entry })}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Cart bar */}
            {cartCount > 0 && (
              <div className="sticky bottom-0 -mx-1 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                  </span>
                  <span className="text-base font-bold">{formatPrice(cartTotal)}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {cartItems.map(({ item, entry }) => {
                    const summary = removalSummary(entry.removed, entry.note);
                    return (
                      <div key={item!._id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0">
                          {entry.qty}× {item!.name}
                          {summary ? <span className="block text-[10px] italic">({summary})</span> : null}
                        </span>
                        <span className="shrink-0">{formatPrice(item!.priceCents * entry.qty)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="order-note" className="text-xs text-muted-foreground">
                    Note for the kitchen <span className="font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="order-note"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    maxLength={200}
                    placeholder="e.g. No onions on the pasta, extra parmesan"
                  />
                </div>
                <Button className="mt-3 w-full" onClick={handlePlaceOrder} disabled={busy === "order"}>
                  {busy === "order" ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send order to the kitchen
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Ask the team tab ──────────────────────────────────────── */}
        {tab === "assist" && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                One tap and the waiter or manager gets it instantly — no hunting for someone.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ASSIST_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setAssistTemplate(o.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                      assistTemplate === o.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <o.icon className="size-4 shrink-0 text-primary" />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assist-note" className="text-xs text-muted-foreground">
                Add a detail <span className="font-normal">(optional)</span>
              </Label>
              <Textarea
                id="assist-note"
                rows={2}
                value={assistNote}
                maxLength={300}
                onChange={(e) => setAssistNote(e.target.value)}
                placeholder={
                  assistTemplate === "custom"
                    ? "e.g. Could we move to a quieter table?"
                    : "e.g. Two glasses, please"
                }
              />
            </div>
            <Button className="w-full" onClick={handleSendAssist} disabled={busy === "assist"}>
              {busy === "assist" ? <Spinner className="size-4" /> : <Send className="size-4" />}
              Send to the team
            </Button>

            {(assists ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Your requests
                </p>
                {(assists ?? []).map((a) => (
                  <div
                    key={a._id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5",
                      a.status === "open" ? "border-primary/30 bg-primary/5" : "border-border/70 bg-card",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ASSIST_OPTIONS.find((o) => o.value === a.template)?.label ?? a.template}
                      </p>
                      {a.note && <p className="mt-0.5 text-xs text-muted-foreground">“{a.note}”</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatClock(a.createdAt)}
                        {a.resolvedAt ? ` · handled at ${formatClock(a.resolvedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge
                        className={cn(
                          a.status === "open"
                            ? "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                            : a.status === "resolved"
                              ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {a.status === "open" ? "Sent" : a.status}
                      </Badge>
                      {a.status === "open" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-muted-foreground"
                          disabled={busy === a._id}
                          onClick={() => handleCancelAssist(a._id)}
                        >
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Menu ideas tab ────────────────────────────────────────── */}
        {tab === "menu" && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-dashed border-border p-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="menu-name" className="text-xs font-medium">
                  What would you like? *
                </Label>
                <Input
                  id="menu-name"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Dairy-free tiramisù, matcha latte, garlic bread"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="menu-desc" className="text-xs font-medium">
                  Details <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="menu-desc"
                  rows={2}
                  value={menuDesc}
                  maxLength={400}
                  onChange={(e) => setMenuDesc(e.target.value)}
                  placeholder="e.g. No eggs please — my partner has an allergy."
                />
              </div>
              <Button className="w-full" onClick={handleCreateMenuRequest} disabled={busy === "menu"}>
                {busy === "menu" ? <Spinner className="size-4" /> : <Send className="size-4" />}
                Send request to the kitchen
              </Button>
            </div>

            {(menuReqs ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Your requests
                </p>
                {(menuReqs ?? []).map((m) => {
                  const meta = MENU_REQUEST_STATUS[m.status] ?? MENU_REQUEST_STATUS.new;
                  return (
                    <div key={m._id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{m.name}</p>
                        <Badge className={cn(meta.cls)}>{meta.label}</Badge>
                      </div>
                      {m.description && (
                        <p className="mt-1 text-xs text-muted-foreground">“{m.description}”</p>
                      )}
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Sent {formatClock(m.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Bill tab ──────────────────────────────────────────────── */}
        {tab === "bill" && (
          <div className="space-y-3">
            {bill === undefined ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Loading your bill…
              </div>
            ) : bill.lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <Receipt className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">No charges yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Order from the menu and your bill builds up here automatically — no paper, no
                  waiting for the waiter.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                  <div className="divide-y divide-border/60">
                    {bill.lines.map((line: BillLineLike) => {
                      const summary = removalSummary(line.removeIngredients, line.note);
                      return (
                        <div key={`${line.name}-${summary ?? "plain"}`} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                          <span className="min-w-0 flex-1 text-muted-foreground">
                            {line.name}
                            <span className="ml-1.5 text-xs">× {line.quantity}</span>
                            {summary ? (
                              <span className="block text-[11px] italic">({summary})</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-medium">{formatPrice(line.lineTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3.5 py-3">
                    <span className="text-sm font-semibold">Total ({bill.orderCount} order{bill.orderCount === 1 ? "" : "s"})</span>
                    <span className="text-lg font-bold tracking-tight">{formatPrice(bill.totalCents)}</span>
                  </div>
                </div>
                <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Receipt className="mt-0.5 size-3.5 shrink-0" />
                  Your bill is saved to this booking. Pay at the table for now — in-app card payment
                  is coming in the next milestone.
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" /> Party of {booking?.partySize ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <BellRing className="size-3" /> Live — updates arrive instantly
          </span>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customize dialog — ingredient removals + note + quantity
// ---------------------------------------------------------------------------
// Customize sheet — ingredient removals + note + quantity
//
// Rendered as an in-place content swap inside the dine-in page above (not a
// separate overlay/dialog): picking removals/quantity/note here fully
// replaces the menu tab until confirmed or cancelled.
// ---------------------------------------------------------------------------

function CustomizeSheet({
  item,
  initial,
  onClose,
  onConfirm,
}: {
  item: MenuItemLike;
  initial?: CartEntry;
  onClose: () => void;
  onConfirm: (entry: CartEntry) => void;
}) {
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [removed, setRemoved] = useState<string[]>(initial?.removed ?? []);
  const [note, setNote] = useState(initial?.note ?? "");

  // Reset local state whenever the sheet targets a different item.
  useEffect(() => {
    setQty(initial?.qty ?? 1);
    setRemoved(initial?.removed ?? []);
    setNote(initial?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item._id]);

  const ingredients = item.ingredients ?? [];

  const toggleRemoved = (ing: string) =>
    setRemoved((prev) =>
      prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing],
    );

  const handleConfirm = () => {
    if (qty < 1) return;
    onConfirm({ qty, removed, note: note.trim() || undefined });
  };

  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <p className="text-base font-semibold tracking-tight">Customize {item.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap any ingredient to leave it out — the kitchen sees exactly what you want.
        </p>
      </div>

      <div className="mt-3 space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-2.5">
          <span className="text-sm font-semibold">{formatPrice(item.priceCents)}</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus className="size-3.5" />
            </Button>
            <span className="w-5 text-center text-sm font-semibold">{qty}</span>
            <Button size="icon-sm" onClick={() => setQty((q) => Math.min(20, q + 1))}>
              <Plus className="size-3.5" />
            </Button>
          </span>
        </div>

        {ingredients.length > 0 ? (
          <div>
            <p className="text-sm font-medium">Leave something out?</p>
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              Tap an ingredient to remove it from this dish.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ingredients.map((ing) => {
                const off = removed.includes(ing);
                return (
                  <button
                    key={ing}
                    type="button"
                    onClick={() => toggleRemoved(ing)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      off
                        ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {off ? "No " : ""}
                    {ing}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No ingredient list on this one — add a note below if you&apos;d like to change something.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="customize-note" className="text-xs text-muted-foreground">
            Extra instructions <span className="font-normal">(optional)</span>
          </Label>
          <Textarea
            id="customize-note"
            rows={2}
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Extra parmesan on the side"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleConfirm}>
            <Plus className="size-4" /> Add {qty > 1 ? `${qty} ` : ""}to order ·{" "}
            {formatPrice(item.priceCents * qty)}
          </Button>
        </div>
      </div>
    </div>
  );
}
