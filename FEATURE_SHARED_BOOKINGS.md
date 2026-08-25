# 🍽️ Feature Design: Shared Bookings with Per-User Ordering & Bill Splitting

**Status:** Design Phase  
**Author:** Buffy (Codebuff)  
**Date:** August 25, 2026

---

## 📋 Executive Summary

Allow multiple people to share a single booking, each order independently, and automatically split the bill per user. Gifts sent via Socialize are also attributed to the sender's individual share.

---

## 🎯 User Stories

### As a host:
1. "I book a table for 4 and invite my 3 friends via a link"
2. "Each friend joins the booking and orders their own food"
3. "At the end, the bill is split — I pay for my items, each friend pays for theirs"
4. "When I send a drink to someone via Socialize, it's on my bill"

### As a guest:
1. "I open the invite link and confirm my seat"
2. "I can browse the menu and order my own food"
3. "I see only my items on the bill (not the whole table)"
4. "I can pay my share directly"

---

## 🏗️ Current State Analysis

### What Exists:

| Component | Current Behavior | Issue |
|-----------|-----------------|-------|
| **Booking** | Host books, friends join via invite link | ✅ Already works |
| **Guests** | Stored in `booking.guests[]` with `userId` | ✅ Already works |
| **Orders** | Only host (`booking.userId`) can order | ❌ Guests can't order |
| **Bill** | Aggregates ALL orders for the booking | ❌ No per-user breakdown |
| **Gifts** | Already tracked by `senderUserId` | ✅ Already per-user |
| **Payment** | No payment system yet | 🔲 Future milestone |

### Key Code Issues:

```
// src/convex/dining.ts:43 — requireOwnConfirmedBooking
async function requireOwnConfirmedBooking(ctx, userId, bookingId) {
  const booking = await ctx.db.get(bookingId);
  if (booking.userId !== userId) throw new Error("Booking not found.");
  // ❌ This rejects guests!
}
```

---

## 🎨 Proposed Design

### 1. Schema Changes

#### A. Extend `dineOrders` table (no schema change needed!)

The existing `dineOrders` table already has:
- `bookingId` — which booking this order belongs to
- `userId` — who placed the order

**We just need to update the permission logic**, not the schema.

#### B. Add bill split tracking (optional enhancement)

```typescript
// New optional field on dineOrders
billSplit: v.optional(v.object({
  paid: v.boolean(),
  paidAt: v.optional(v.number()),
  paymentMethod: v.optional(v.string()),
})),
```

---

### 2. Backend Changes

#### A. Allow Guests to Order (`dining.ts`)

**Current:**
```typescript
async function requireOwnConfirmedBooking(ctx, userId, bookingId) {
  if (booking.userId !== userId) throw new Error("Booking not found.");
}
```

**Proposed:**
```typescript
async function requireConfirmedBookingParticipant(ctx, userId, bookingId) {
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking not found.");
  if (booking.status !== "confirmed") throw new Error("Booking is no longer active.");
  
  // Check if user is the host OR a confirmed guest
  const isHost = booking.userId === userId;
  const guests = booking.guests ?? [];
  const isGuest = guests.some(g => g.userId === userId);
  
  if (!isHost && !isGuest) {
    throw new Error("You're not part of this booking.");
  }
  return booking;
}
```

**Affected functions:**
- `placeOrder` — Allow guests to order
- `sendAssist` — Allow guests to ping waiter
- `createMenuRequest` — Allow guests to request off-menu items
- `checkIn` — Allow guests to check in

#### B. Per-User Bill Query (`dining.ts`)

```typescript
export const billForBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    // ... existing validation ...
    
    const orders = await ctx.db
      .query("dineOrders")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    
    const billable = orders.filter(o => o.status !== "cancelled");
    
    // Group by userId for per-user breakdown
    const userBreakdown = new Map<string, {
      userId: string;
      name: string;
      orders: typeof billable;
      subtotalCents: number;
    }>();
    
    for (const order of billable) {
      const existing = userBreakdown.get(order.userId);
      if (existing) {
        existing.orders.push(order);
        existing.subtotalCents += order.totalCents;
      } else {
        const user = await safeGet(ctx, order.userId);
        userBreakdown.set(order.userId, {
          userId: order.userId,
          name: user?.name ?? "Guest",
          orders: [order],
          subtotalCents: order.totalCents,
        });
      }
    }
    
    // Add gifts sent by each user
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    
    const billableGifts = gifts.filter(g => g.status !== "cancelled");
    for (const gift of billableGifts) {
      const existing = userBreakdown.get(gift.senderUserId);
      if (existing) {
        existing.subtotalCents += gift.priceCents;
      }
    }
    
    // Build response
    const breakdown = [...userBreakdown.values()].map(b => ({
      userId: b.userId,
      name: b.name,
      orderCount: b.orders.length,
      subtotalCents: b.subtotalCents,
    }));
    
    const totalCents = breakdown.reduce((sum, b) => sum + b.subtotalCents, 0);
    
    return {
      bookingId,
      restaurantId: booking.restaurantId,
      totalCents,
      breakdown, // Per-user split
      // Keep full bill for owner view
      lines: [...billable].map(o => o.items).flat(),
      orderCount: billable.length,
    };
  },
});
```

#### C. New Query: My Share of the Bill

```typescript
export const myBillShare = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Please sign in.");
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    
    // Verify participant
    const isHost = booking.userId === userId;
    const isGuest = (booking.guests ?? []).some(g => g.userId === userId);
    if (!isHost && !isGuest) throw new Error("Not part of this booking.");
    
    // Get my orders for this booking
    const myOrders = await ctx.db
      .query("dineOrders")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    
    const myBillable = myOrders.filter(o => o.userId === userId && o.status !== "cancelled");
    
    // Get gifts I sent from this booking
    const myGifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    
    const myBillableGifts = myGifts.filter(g => g.senderUserId === userId && g.status !== "cancelled");
    
    const ordersTotal = myBillable.reduce((sum, o) => sum + o.totalCents, 0);
    const giftsTotal = myBillableGifts.reduce((sum, g) => sum + g.priceCents, 0);
    
    return {
      bookingId,
      userId,
      orders: myBillable,
      gifts: myBillableGifts,
      ordersTotalCents: ordersTotal,
      giftsTotalCents: giftsTotal,
      subtotalCents: ordersTotal + giftsTotal,
    };
  },
});
```

---

### 3. Frontend Changes

#### A. Order Form Updates

**Current:** Only shows for booking host  
**Proposed:** Shows for all confirmed participants

```tsx
// src/pages/RestaurantDetail.tsx or new component
const { user } = useAuth();
const booking = useQuery(api.bookings.byCode, { code });

const canOrder = booking?.alreadyConfirmed || booking?.booking.userId === user?._id;
```

#### B. Bill Split UI

New component: `BillSplit.tsx`

```tsx
interface BillSplitProps {
  bookingId: Id<"bookings">;
}

export function BillSplit({ bookingId }: BillSplitProps) {
  const bill = useQuery(api.dining.billForBooking, { bookingId });
  const myShare = useQuery(api.dining.myBillShare, { bookingId });
  
  if (!bill || !myShare) return <Spinner />;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Split</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Per-user breakdown */}
        <div className="space-y-3">
          {bill.breakdown.map(person => (
            <div key={person.userId} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Avatar name={person.name} />
                <span>{person.name}</span>
                <Badge>{person.orderCount} items</Badge>
              </div>
              <span className="font-semibold">
                {formatCents(person.subtotalCents)}
              </span>
            </div>
          ))}
        </div>
        
        {/* Total */}
        <Separator className="my-4" />
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatCents(bill.totalCents)}</span>
        </div>
        
        {/* My share */}
        <div className="mt-4 p-4 bg-primary/10 rounded-lg">
          <div className="flex justify-between">
            <span>Your share</span>
            <span className="font-bold text-primary">
              {formatCents(myShare.subtotalCents)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {myShare.orders.length} items + {myShare.gifts.length} gifts
          </p>
        </div>
        
        {/* Pay button (future) */}
        <Button className="w-full mt-4" disabled>
          Pay {formatCents(myShare.subtotalCents)}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

### 4. Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     SHARED BOOKING FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. HOST BOOKS TABLE                                         │
│     └─ Creates booking with partySize = 4                    │
│                                                              │
│  2. FRIENDS JOIN VIA INVITE LINK                             │
│     └─ confirmGuest() adds to booking.guests[]               │
│     └─ Each guest gets a seat from slot ledger               │
│                                                              │
│  3. EVERYONE ORDERS                                          │
│     └─ Host: placeOrder(bookingId, items)                    │
│     └─ Guest 1: placeOrder(bookingId, items)                 │
│     └─ Guest 2: placeOrder(bookingId, items)                 │
│     └─ Each order has userId = who ordered                   │
│                                                              │
│  4. GIFTS (OPTIONAL)                                         │
│     └─ Host sends gift → giftDeliveries.senderUserId = host  │
│     └─ Guest sends gift → giftDeliveries.senderUserId = guest│
│                                                              │
│  5. BILL SPLIT                                               │
│     └─ billForBooking() groups by userId                     │
│     └─ Each person sees only their items + gifts             │
│     └─ Total = sum of all shares                             │
│                                                              │
│  6. PAYMENT (FUTURE)                                         │
│     └─ Each person pays their share                          │
│     └─ Or host pays all, splits later via Venmo/etc          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Security Considerations

| Concern | Solution |
|---------|----------|
| Guest places order for wrong booking | `requireConfirmedBookingParticipant()` checks `booking.guests[].userId` |
| Guest orders at wrong restaurant | Menu items validated against `booking.restaurantId` |
| Guest sees other's orders | `myBillShare` only returns current user's items |
| Guest modifies host's order | Each order has `userId` — only owner can cancel |
| Race condition on slot ledger | Already atomic via Convex serialization |

---

### 6. Implementation Phases

#### Phase 1: Allow Guests to Order (Core)
- [ ] Update `requireOwnConfirmedBooking` → `requireConfirmedBookingParticipant`
- [ ] Update `placeOrder` to allow guests
- [ ] Update `sendAssist` to allow guests
- [ ] Update `createMenuRequest` to allow guests
- [ ] Update `checkIn` to allow guests

#### Phase 2: Bill Splitting (UI)
- [ ] Update `billForBooking` query with per-user breakdown
- [ ] Add `myBillShare` query
- [ ] Create `BillSplit.tsx` component
- [ ] Add bill split view to MyBookings page

#### Phase 3: Gift Attribution (Already works!)
- [ ] Verify gifts show on sender's share in bill
- [ ] Update bill UI to show gifts per user

#### Phase 4: Payment Integration (Future)
- [ ] Add Stripe/payment processing
- [ ] Allow individual payment per user
- [ ] Or host pays all, split via Venmo/Zelle

---

### 7. Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest tries to order before host | ✅ Works — anyone can order first |
| Guest leaves booking | ❌ Not supported — guests can't leave, only host can cancel |
| Host cancels booking | All guest orders are cancelled too |
| Guest orders after check-in | ✅ Allowed — same as host |
| Multiple guests order same item | ✅ Each order is separate, bill groups by user |
| Guest sends gift to host | ✅ Gift charged to guest's share |
| Host sends gift to guest | ✅ Gift charged to host's share |

---

### 8. Testing Checklist

- [ ] Guest can place order after confirming seat
- [ ] Guest cannot order for a booking they're not part of
- [ ] Bill shows per-user breakdown
- [ ] My share only shows my items
- [ ] Gifts appear on sender's share
- [ ] Host can see full bill breakdown
- [ ] Owner sees all orders (not split)
- [ ] Cancel order works per-user
- [ ] Check-in works for guests

---

## 📊 Impact Estimate

| Metric | Estimate |
|--------|----------|
| Files to modify | 4 (dining.ts, schema optional, BillSplit.tsx, MyBookings.tsx) |
| New components | 1 (BillSplit.tsx) |
| New queries | 1 (myBillShare) |
| Modified functions | 4 (placeOrder, sendAssist, createMenuRequest, checkIn) |
| Breaking changes | None |
| Effort | ~2-3 hours |

---

## 🎯 Success Criteria

1. ✅ Guest can open invite link, confirm seat, and place order
2. ✅ Bill shows breakdown: "You: $35 | Alex: $42 | Sam: $28 = Total: $105"
3. ✅ Gifts show on sender's share
4. ✅ Each person can view only their items
5. ✅ No security holes — guests can't access other's data

---

*This design maintains backward compatibility — existing bookings and orders continue to work unchanged.*
