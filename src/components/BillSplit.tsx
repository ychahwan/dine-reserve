import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { Receipt, Gift, ShoppingCart } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

interface BillSplitProps {
  bookingId: Id<"bookings">;
}

/**
 * Displays a per-user breakdown of the bill for a shared booking.
 * Shows each person's orders and gifts separately, with totals.
 */
export function BillSplit({ bookingId }: BillSplitProps) {
  const { user } = useAuth();
  const bill = useQuery(api.dining.billForBooking, { bookingId });
  const myShare = useQuery(api.dining.myBillShare, { bookingId });

  if (bill === undefined || myShare === undefined) {
    return (
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardContent className="flex justify-center py-8">
          <Spinner className="size-5" />
        </CardContent>
      </Card>
    );
  }

  if (bill === null || myShare === null) {
    return null;
  }

  const isHost = bill.breakdown.some((b) => b.userId === user?._id);

  return (
    <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4 text-primary" /> Bill Split
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Per-user breakdown */}
        <div className="space-y-3">
          {bill.breakdown.map((person) => (
            <div
              key={person.userId}
              className="flex items-center justify-between rounded-xl border border-border/70 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {person.userId === user?._id ? "You" : person.name}
                    {person.userId === user?._id && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Host
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {person.orderCount} {person.orderCount === 1 ? "order" : "orders"}
                  </p>
                </div>
              </div>
              <span className="font-semibold">{formatPrice(person.subtotalCents)}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total</span>
          <span className="text-lg font-bold">{formatPrice(bill.totalCents)}</span>
        </div>

        {/* My share highlight */}
        <div className="rounded-xl bg-primary/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Your share</span>
            <span className="text-lg font-bold text-primary">
              {formatPrice(myShare.subtotalCents)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {myShare.orders.length} items
            {myShare.gifts.length > 0 && (
              <> + {myShare.gifts.length} gifts</>
            )}
          </p>

          {/* Items breakdown */}
          {myShare.orders.length > 0 && (
            <div className="mt-3 space-y-1">
              {myShare.orders.map((order) =>
                order.items.map((item, idx) => (
                  <div key={`${order._id}-${idx}`} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {item.quantity}× {item.name}
                    </span>
                    <span>{formatPrice(item.priceCents * item.quantity)}</span>
                  </div>
                )),
              )}
            </div>
          )}

          {/* Gifts breakdown */}
          {myShare.gifts.length > 0 && (
            <div className="mt-3 space-y-1">
              {myShare.gifts.map((gift) => (
                <div key={gift._id} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Gift className="size-3" />
                    {gift.emoji} {gift.name}
                  </span>
                  <span>{formatPrice(gift.priceCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pay button placeholder */}
        <Button className="w-full" disabled>
          <ShoppingCart className="mr-2 size-4" />
          Pay {formatPrice(myShare.subtotalCents)}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Payment integration coming soon
        </p>
      </CardContent>
    </Card>
  );
}
