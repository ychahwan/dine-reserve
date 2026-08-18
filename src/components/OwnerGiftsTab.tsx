import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Check, CheckCircle2, Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatPrice, formatTime } from "@/lib/format";
import { toast } from "sonner";

/** Live badge count for the Gifts tab (gifts waiting to be delivered). */
export function OwnerGiftsTabCount({ restaurantId }: { restaurantId: string }) {
  const n = useQuery(api.socialize.pendingGiftCount, { restaurantId: restaurantId as never });
  if (!n || n === 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 bg-destructive text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

type GiftDraft = {
  id?: string;
  name: string;
  emoji: string;
  description: string;
  price: string; // dollars in the input, stored as cents
  available: boolean;
};

type DeliveryLike = {
  _id: string;
  name: string;
  emoji: string;
  priceCents: number;
  note?: string;
  reveal: "now" | "on_delivery";
  status: "ordered" | "delivered" | "cancelled";
  createdAt: number;
  deliveredAt?: number;
  senderName: string;
  receiverName: string;
  booking: { code: string; time: string; sectionName: string; partySize: number } | null;
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Socialize gifts for the restaurant: the gift catalog diners can send each
 * other from the Socialize room, and the live queue of gift orders the team
 * has to prepare and deliver. Marking an order delivered is what reveals a
 * "surprise" gift to the receiver.
 */
export function OwnerGiftsTab({ restaurantId }: { restaurantId: string }) {
  const gifts = useQuery(api.socialize.ownerGiftTypes, { restaurantId: restaurantId as never });
  const deliveries = useQuery(api.socialize.restaurantGiftDeliveries, {
    restaurantId: restaurantId as never,
  });
  const saveGiftType = useMutation(api.socialize.saveGiftType);
  const deleteGiftType = useMutation(api.socialize.deleteGiftType);
  const markDelivered = useMutation(api.socialize.markGiftDelivered);

  const [draft, setDraft] = useState<GiftDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const startEdit = (g: NonNullable<typeof gifts>[number]) => {
    setDraft({
      id: g._id,
      name: g.name,
      emoji: g.emoji,
      description: g.description ?? "",
      price: (g.priceCents / 100).toString(),
      available: g.available,
    });
    setError(null);
  };

  const startNew = () => {
    setDraft({ name: "", emoji: "🍹", description: "", price: "5", available: true });
    setError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    setError(null);
    const priceCents = Math.round(Number(draft.price) * 100);
    if (!draft.name.trim()) { setError("Give the gift a name, e.g. “Aperol spritz”."); return; }
    if (!draft.emoji.trim()) { setError("Pick an emoji for the gift."); return; }
    if (!Number.isFinite(priceCents) || priceCents < 0) { setError("Enter a valid price."); return; }
    setSaving(true);
    try {
      await saveGiftType({
        restaurantId: restaurantId as never,
        id: draft.id ? (draft.id as never) : undefined,
        name: draft.name,
        emoji: draft.emoji,
        description: draft.description.trim() || undefined,
        priceCents,
        available: draft.available,
      });
      toast.success(draft.id ? "Gift updated" : "Gift added — diners can send it right away");
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the gift.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGiftType({ id: id as never });
      toast.success("Gift removed from the catalog");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the gift.");
    }
  };

  const handleDeliver = async (id: string) => {
    setBusyId(id);
    try {
      await markDelivered({ id: id as never });
      toast.success("Marked delivered — the receiver sees it now.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as delivered.");
    } finally {
      setBusyId(null);
    }
  };

  const allDeliveries = (deliveries ?? []) as DeliveryLike[];
  const toPrepare = allDeliveries.filter((d) => d.status === "ordered");
  const done = allDeliveries.filter((d) => d.status !== "ordered");

  return (
    <div className="space-y-5 pb-6">
      <p className="text-sm text-muted-foreground">
        The Socialize room lets diners send each other drinks and desserts from this catalog —
        charged to the sender&apos;s bill. Orders appear here the second they&apos;re sent; mark them
        delivered to close the loop (and reveal surprises).
      </p>

      {/* Catalog */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Gift catalog
          </p>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={startNew}>
            <Plus className="size-3.5" /> Add gift
          </Button>
        </div>

        {gifts === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading…
          </div>
        ) : (gifts ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <Gift className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No gifts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a drink or dessert diners can send each other — a glass of wine, an espresso, a
              dessert. It lands on the sender&apos;s bill.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(gifts ?? []).map((g) => (
              <Card key={g._id} className="rounded-2xl border-border/70 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{g.name}</p>
                      {!g.available && (
                        <Badge variant="secondary" className="opacity-70">Hidden</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(g.priceCents)}
                      {g.description ? ` · ${g.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit gift"
                      onClick={() => startEdit(g)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete gift"
                      className="text-destructive"
                      onClick={() => handleDelete(g._id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add / edit form */}
        {draft && (
          <Card className="mt-3 rounded-2xl border-primary/40 p-4">
            <p className="text-sm font-semibold">{draft.id ? "Edit gift" : "New gift"}</p>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-[64px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="g-emoji" className="text-xs">Emoji</Label>
                  <Input
                    id="g-emoji"
                    value={draft.emoji}
                    maxLength={8}
                    onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                    className="text-center text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-name" className="text-xs">Name *</Label>
                  <Input
                    id="g-name"
                    value={draft.name}
                    maxLength={60}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Aperol spritz"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-price" className="text-xs">Price ($)</Label>
                <Input
                  id="g-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-desc" className="text-xs">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="g-desc"
                  rows={2}
                  value={draft.description}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="e.g. Sunset in a glass"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-medium">Available to send</p>
                  <p className="text-[11px] text-muted-foreground">
                    Hidden gifts stay in the catalog but aren&apos;t offered to diners.
                  </p>
                </div>
                <Switch
                  checked={draft.available}
                  onCheckedChange={(v) => setDraft({ ...draft, available: v })}
                  aria-label="Gift available"
                />
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
                  {draft.id ? "Save gift" : "Add gift"}
                </Button>
                <Button variant="outline" onClick={() => { setDraft(null); setError(null); }} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Deliveries */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Gift orders
        </p>
        {deliveries === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading…
          </div>
        ) : allDeliveries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <CheckCircle2 className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No gift orders yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When a diner sends a gift from the Socialize room, it lands here for your team to
              prepare and deliver to the table.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {toPrepare.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  To prepare ({toPrepare.length})
                </p>
                {toPrepare.map((d) => {
                  const surprise = d.reveal === "on_delivery";
                  return (
                    <Card key={d._id} className="rounded-2xl border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xl">{d.emoji}</span>
                            <p className="font-semibold">{d.name}</p>
                            <Badge className="gap-1 bg-sky-600/10 text-sky-700 dark:text-sky-400">
                              {surprise ? "🎁 Surprise" : "Revealed now"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{timeAgo(d.createdAt)}</span>
                          </div>
                          <p className="mt-1.5 text-sm">
                            <span className="font-medium">{d.senderName}</span>
                            <span className="text-muted-foreground"> → </span>
                            <span className="font-medium">{d.receiverName}</span>
                          </p>
                          {d.booking && (
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="font-mono text-[10px]">{d.booking.code}</Badge>
                              <span>{formatTime(d.booking.time)}</span>
                              {d.booking.sectionName ? <span>{d.booking.sectionName}</span> : null}
                              <span>{d.booking.partySize} guests</span>
                            </p>
                          )}
                          {d.note && (
                            <p className="mt-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs italic text-muted-foreground">
                              “{d.note}”
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-sm font-bold">{formatPrice(d.priceCents)}</span>
                          <Button
                            size="sm"
                            className="shrink-0"
                            disabled={busyId === d._id}
                            onClick={() => handleDeliver(d._id)}
                          >
                            {busyId === d._id ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                            Mark delivered
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {done.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Delivered
                </p>
                {done.map((d) => (
                  <Card key={d._id} className="rounded-2xl border-border/70 p-4 opacity-80">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">{d.emoji}</span>
                          <p className="text-sm font-medium">{d.name}</p>
                          <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                            {d.status === "delivered" ? "Delivered" : "Cancelled"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(d.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {d.senderName} → {d.receiverName}
                          {d.booking ? ` · ${d.booking.code}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">{formatPrice(d.priceCents)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
