import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Gift, Mail, Phone } from "lucide-react";
import { roleBadge, bookingStatusBadge, orderStatusBadge, Stars, EmptyNote } from "./AdminUI";
import { formatDate, formatPrice, formatTime } from "@/lib/format";

export default function AdminUserDetail() {
  const { id } = useParams();
  const data = useQuery(api.adminView.userDetail, { id: id as never });

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading user…
      </div>
    );
  }
  if (data === null) return <EmptyNote>User not found.</EmptyNote>;

  const { user } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All users
      </Link>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight">{user.name ?? "Unnamed user"}</h1>
                {roleBadge(user.role)}
              </div>
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {user.phone && <p className="flex items-center gap-1.5"><Phone className="size-3.5" /> {user.phone}</p>}
                {user.email && <p className="flex items-center gap-1.5"><Mail className="size-3.5" /> {user.email}</p>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.ownedRestaurants.map((r) => (
                  <Link key={r._id} to={`/admin/restaurants/${r._id}`}>
                    <Badge variant="secondary">{r.name}</Badge>
                  </Link>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-xl font-bold">{data.bookings.length}</p><p className="text-[11px] text-muted-foreground">Bookings</p></div>
              <div><p className="text-xl font-bold">{data.orders.length}</p><p className="text-[11px] text-muted-foreground">Orders</p></div>
              <div><p className="text-xl font-bold">{data.reviews.length}</p><p className="text-[11px] text-muted-foreground">Reviews</p></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap">
          <TabsTrigger value="bookings">Bookings ({data.bookings.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({data.orders.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({data.reviews.length})</TabsTrigger>
          <TabsTrigger value="interactions">Interactions</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {data.bookings.length === 0 ? <EmptyNote>No bookings.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><TableHead>When</TableHead><TableHead>Party</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.bookings.map((b) => (
                    <TableRow key={b._id}>
                      <TableCell><Link to={`/admin/restaurants/${b.restaurantId}`} className="font-medium hover:text-primary">{b.restaurantName}</Link></TableCell>
                      <TableCell>{formatDate(b.date)} · {formatTime(b.time)}</TableCell>
                      <TableCell>{b.partySize}</TableCell>
                      <TableCell>{bookingStatusBadge(b.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {data.orders.length === 0 ? <EmptyNote>No dine-in orders.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.orders.map((o) => (
                    <TableRow key={o._id}>
                      <TableCell className="font-medium">{o.restaurantName}</TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{o.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}</TableCell>
                      <TableCell>{formatPrice(o.totalCents)}</TableCell>
                      <TableCell>{orderStatusBadge(o.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {data.reviews.length === 0 ? <EmptyNote>No reviews written.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><TableHead>Rating</TableHead><TableHead className="w-full">Feedback</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.reviews.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="font-medium">{r.restaurantName}</TableCell>
                      <TableCell><Stars rating={r.rating} /></TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{r.text ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="interactions">
          <div className="space-y-4">
            <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
              {data.assists.length === 0 && data.menuRequests.length === 0 ? <EmptyNote>No table requests.</EmptyNote> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Restaurant</TableHead><TableHead>Detail</TableHead><TableHead>Status</TableHead><TableHead>Resolve time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.assists.map((a) => (
                      <TableRow key={`a-${a._id}`}>
                        <TableCell className="font-medium">Assist</TableCell>
                        <TableCell>{a.restaurantName}</TableCell>
                        <TableCell>{a.template}</TableCell>
                        <TableCell>{a.status}</TableCell>
                        <TableCell className="text-muted-foreground">{a.resolveMs != null ? `${Math.round(a.resolveMs / 60000)} min` : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {data.menuRequests.map((m) => (
                      <TableRow key={`m-${m._id}`}>
                        <TableCell className="font-medium">Menu request</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>{m.status}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>

            <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
              {data.giftsSent.length === 0 && data.giftsReceived.length === 0 ? <EmptyNote>No gifts.</EmptyNote> : (
                <Table>
                  <TableHeader><TableRow><TableHead className="flex items-center gap-1"><Gift className="size-3.5" /> Direction</TableHead><TableHead>Restaurant</TableHead><TableHead>Gift</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.giftsSent.map((g) => (
                      <TableRow key={`s-${g._id}`}>
                        <TableCell>Sent</TableCell>
                        <TableCell>{g.restaurantName}</TableCell>
                        <TableCell>{g.emoji} {g.name}</TableCell>
                        <TableCell>{g.status}</TableCell>
                      </TableRow>
                    ))}
                    {data.giftsReceived.map((g) => (
                      <TableRow key={`r-${g._id}`}>
                        <TableCell>Received</TableCell>
                        <TableCell>{g.restaurantName}</TableCell>
                        <TableCell>{g.emoji} {g.name}</TableCell>
                        <TableCell>{g.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
