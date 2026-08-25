# Walk-In Booking Feature — Design Document

## The Problem

A walk-in user arrives at a restaurant without a reservation. They get seated by the host, but have no booking record in the app. This means they can't:
- Order food
- Socialize with tablemates
- Send/receive gifts
- Split the bill
- Get notifications

**Current gap:** The app only supports pre-booked tables. Walk-ins are invisible to the digital layer.

---

## Three Approaches (All Implemented)

### Option A: Walk-In Check-In (Self-Service) 🏆

**Who triggers it:** The diner, after being seated.

**Flow:**
```
Diner opens app → taps "I'm at a restaurant"
    → searches/selects the restaurant
    → enters table number (e.g. "Table 12")
    → party size (default 1)
    → Optional: name, phone
    → Submits → gets "Pending approval" state
    
Restaurant host gets notification: "Walk-in at Table 12, party of 3"
    → Host approves → booking is created instantly
    → Diner sees confirmation → all features activate
```

**Why this is best for most cases:**
- Zero training for the host (they just approve)
- Works with the existing host workflow
- Diner controls the experience
- 4 taps from open to booking

---

### Option B: Table QR Scan

**Who triggers it:** The diner, scanning a QR code on the physical table.

**Flow:**
```
Each table has a QR code encoding: kamix://table/<restaurantId>/<tableNumber>
    (e.g. kamix://table/abc123/12)
    
Diner scans QR with phone camera → opens app
    → App detects table + restaurant from QR
    → Shows "Book Table 12 at [Restaurant Name]"
    → Confirms party size → submits
    → Host approves (or auto-approve if enabled)
    → Booking created → all features activate
```

**When this makes sense:**
- High-volume fast-casual restaurants
- Self-service kiosks (no host stand)
- Food courts where tables have permanent QR codes

**Implementation:**
- Generate printable QR code PDFs per table
- Admin can print QR codes from the dashboard
- QR encodes a deep link URL

---

### Option C: Host-Initiated Walk-In

**Who triggers it:** The restaurant host/manager.

**Flow:**
```
Host opens owner dashboard → taps "Walk-In" button
    → Enters: table #, party size, diner name (optional)
    → Creates a "walk-in booking" instantly
    → Shows a code on screen or sends SMS to diner
    
Diner enters code in app → booking is activated for them
    → They can now order, socialize, etc.
```

**When this makes sense:**
- Fine dining where the host always seats guests
- Restaurants where walk-ins rarely use the app
- When the host wants full control

---

## Schema Changes

### `bookings` table — add `source` field

```typescript
// In schema.ts
source: v.optional(v.union(
  v.literal("online"),      // Default — booked through the app
  v.literal("walk_in"),     // Option A or B — diner checked in at table
  v.literal("host_entry"),  // Option C — host created it
)),
tableNumber: v.optional(v.string()),  // Physical table number
```

### New `walkIns` table — pending approval queue

```typescript
// In schema.ts
walkIns: defineTable({
  restaurantId: v.id("restaurants"),
  userId: v.id("users"),
  tableNumber: v.string(),
  partySize: v.number(),
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  method: v.union(
    v.literal("check_in"),    // Option A: user entered table #
    v.literal("qr_scan"),     // Option B: scanned QR code
  ),
  status: v.union(
    v.literal("pending"),     // Awaiting host approval
    v.literal("approved"),    // Host approved → converted to booking
    v.literal("rejected"),    // Host rejected
    v.literal("expired"),     // Timed out (optional)
  ),
  bookingId: v.optional(v.id("bookings")),  // Set after approval
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
})
  .index("by_restaurant", ["restaurantId"])
  .index("by_restaurant_status", ["restaurantId", "status"])
  .index("by_user", ["userId"]),
```

---

## Backend Functions

### 1. `walkIns.requestWalkIn` (Option A — user check-in)

```typescript
// Diner submits a walk-in request
export const requestWalkIn = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    partySize: v.number(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    
    // Validate restaurant exists
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    
    // Check for existing pending walk-in from this user at this restaurant
    const existing = await ctx.db
      .query("walkIns")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.and(
        q.eq(q.field("restaurantId"), args.restaurantId),
        q.eq(q.field("status"), "pending"),
      ))
      .first();
    if (existing) throw new Error("You already have a pending walk-in request here.");
    
    // Insert walk-in request
    const walkInId = await ctx.db.insert("walkIns", {
      restaurantId: args.restaurantId,
      userId,
      tableNumber: args.tableNumber.trim(),
      partySize: Math.max(1, Math.min(args.partySize, 20)),
      name: args.name?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      method: "check_in",
      status: "pending",
      createdAt: Date.now(),
    });
    
    // Notify restaurant
    await notifyRestaurant(ctx, {
      restaurantId: args.restaurantId,
      bookingId: walkInId as any, // Temp — will be replaced after approval
      userId,
      type: "walk_in_request",
      message: `Walk-in at Table ${args.tableNumber}, party of ${args.partySize}`,
    });
    
    return { walkInId };
  },
});
```

### 2. `walkIns.requestWalkInByQR` (Option B — QR scan)

```typescript
// Diner scans a QR code on the table
export const requestWalkInByQR = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    partySize: v.number(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Same as requestWalkIn but method = "qr_scan"
    // ... identical logic, different method field
  },
});
```

### 3. `walkIns.approve` (Host approves)

```typescript
// Host approves a walk-in request → creates a booking
export const approve = mutation({
  args: {
    walkInId: v.id("walkIns"),
  },
  handler: async (ctx, { walkInId }) => {
    const walkIn = await ctx.db.get(walkInId);
    if (!walkIn) throw new Error("Walk-in request not found.");
    if (walkIn.status !== "pending") throw new Error("This request has already been processed.");
    
    // Verify caller is the restaurant owner
    const restaurant = await ctx.db.get(walkIn.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    const userId = await getAuthUserId(ctx);
    if (userId === null || restaurant.ownerId !== userId) {
      throw new Error("Only the restaurant owner can approve walk-ins.");
    }
    
    // Create a booking
    const code = generateCode();
    const now = Date.now();
    const bookingId = await ctx.db.insert("bookings", {
      restaurantId: walkIn.restaurantId,
      userId: walkIn.userId,
      name: walkIn.name || "Walk-in Guest",
      phone: walkIn.phone,
      date: todayKey(),
      time: new Date().toTimeString().slice(0, 5), // Current time
      partySize: walkIn.partySize,
      status: "confirmed",
      code,
      createdAt: now,
      updatedAt: now,
      source: "walk_in",
      tableNumber: walkIn.tableNumber,
    });
    
    // Update walk-in request
    await ctx.db.patch(walkInId, {
      status: "approved",
      bookingId,
      resolvedAt: now,
    });
    
    // Notify the diner (via diner notification system)
    // ... 
    return { bookingId, code };
  },
});
```

### 4. `walkIns.reject` (Host rejects)

```typescript
export const reject = mutation({
  args: { walkInId: v.id("walkIns") },
  handler: async (ctx, { walkInId }) => {
    // Verify owner, set status = "rejected"
  },
});
```

### 5. `walkIns.pending` (Host dashboard query)

```typescript
export const pending = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    // Return all pending walk-in requests for this restaurant
  },
});
```

### 6. Host-initiated (Option C) — add to `bookings.ts`

```typescript
export const hostCreateWalkIn = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    partySize: v.number(),
    dinerName: v.optional(v.string()),
    dinerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new Error("Only the restaurant owner can create walk-in bookings.");
    }
    
    const code = generateCode();
    const now = Date.now();
    
    // Create a "host-entry" booking
    const bookingId = await ctx.db.insert("bookings", {
      restaurantId: args.restaurantId,
      userId, // Host's user ID — they "own" it until claimed
      name: args.dinerName || "Walk-in",
      phone: args.dinerPhone,
      date: todayKey(),
      time: new Date().toTimeString().slice(0, 5),
      partySize: args.partySize,
      status: "confirmed",
      code,
      createdAt: now,
      updatedAt: now,
      source: "host_entry",
      tableNumber: args.tableNumber,
    });
    
    return { bookingId, code };
  },
});
```

---

## UI Changes

### 1. Explore/Home Page — "I'm Here" button

```tsx
// New floating action button or prominent CTA
<Button onClick={() => setWalkInOpen(true)}>
  <MapPin className="size-4" /> I'm at a restaurant
</Button>

// Opens WalkInDialog
<WalkInDialog
  open={walkInOpen}
  onOpenChange={setWalkInOpen}
  // Pre-selects current restaurant if geo-fenced
/>
```

### 2. WalkInDialog component

```tsx
// Step 1: Select restaurant (or auto-detect if geo-fenced)
// Step 2: Enter table number
// Step 3: Party size + name
// Step 4: Submit → "Waiting for approval"

function WalkInDialog({ open, onOpenChange }) {
  const [step, setStep] = useState<"select" | "details" | "pending">("select");
  const [restaurantId, setRestaurantId] = useState(null);
  const [tableNumber, setTableNumber] = useState("");
  const [partySize, setPartySize] = useState(1);
  
  // ... restaurant search, form submission, polling for approval
}
```

### 3. Owner Dashboard — Walk-In approval card

```tsx
// Shows pending walk-in requests at the top of the dashboard
// Each request shows: table #, party size, diner name
// Approve/Reject buttons

function WalkInApprovalCard({ request }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Walk-in Request</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Table {request.tableNumber} · Party of {request.partySize}</p>
        {request.name && <p>{request.name}</p>}
        <div className="flex gap-2">
          <Button onClick={approve}>Approve</Button>
          <Button variant="destructive" onClick={reject}>Reject</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 4. QR Code generation (Option B)

```tsx
// In owner dashboard: "Print QR Codes" section
// Generates a PDF with QR codes for each table

function QRCodeGenerator({ restaurantId, tables }) {
  const qrUrl = `https://kamix.app/scan/${restaurantId}/${tableNumber}`;
  return <QRCodeSVG value={qrUrl} />;
}
```

---

## Notification Flow

```
Walk-in request created
    ↓
notifyRestaurant() → type: "walk_in_request"
    ↓
Owner dashboard shows pending request
    ↓
Host taps "Approve"
    ↓
Booking created → diner gets notification
    ↓
Diner opens app → full features available
```

---

## Share/Invite Support

Walk-in bookings get the same shareable code as regular bookings:
- Diner can share the code with friends
- Friends can join via `/invite/<code>`
- Bill splitting works the same way
- Gift sending works the same way

The only difference: `source: "walk_in"` or `"host_entry"` on the booking record.

---

## Implementation Phases

### Phase 1: Backend (2 hours)
1. Schema changes: `source`, `tableNumber` on bookings + `walkIns` table
2. `requestWalkIn` mutation
3. `requestWalkInByQR` mutation  
4. `approve` / `reject` mutations
5. `pending` query
6. `hostCreateWalkIn` mutation

### Phase 2: Walk-In UI (2 hours)
1. `WalkInDialog` component (restaurant select → table → submit)
2. "I'm at a restaurant" button on Explore page
3. Pending status display
4. QR scan deep link handler

### Phase 3: Owner Dashboard (1 hour)
1. Walk-in approval cards (pending requests)
2. Approve/Reject buttons
3. Host-initiated walk-in form
4. QR code print section

### Phase 4: Notifications (30 min)
1. Diner notification when approved
2. Host notification when new walk-in request
3. Integration with existing notification system

### Phase 5: Testing & Polish (30 min)
1. End-to-end flow testing
2. Edge cases (restaurant full, duplicate requests)
3. APK build

**Total: ~6 hours**

---

## Edge Cases to Handle

| Case | Solution |
|------|----------|
| Restaurant is full | Block walk-in request, show "Join waitlist" instead |
| Duplicate request | Reject with "You already have a pending request" |
| Invalid table number | Validate against restaurant's sections |
| Walk-in after hours | Block with "Restaurant is closed" |
| Walk-in on past date | Use today's date automatically |
| Host doesn't respond | Optional: auto-expire after 15 minutes |
| Diner leaves before approval | Can cancel the request |
