import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useParams, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Ban, Loader2, MapPin, Phone, ShieldCheck, Star, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { roleBadge, bookingStatusBadge, orderStatusBadge, Stars, EmptyNote } from "./AdminUI";
import { formatDate, formatPrice, formatTime } from "@/lib/format";
import { toast } from "sonner";

export default function AdminRestaurantDetail() {
  const { id } = useParams();
  const data = useQuery(api.adminView.restaurantDetail, { id: id as never });
  const setRestaurantDisabled = useMutation(api.admin.setRestaurantDisabled);
  const deleteRestaurant = useMutation(api.admin.deleteRestaurant);
  const [modBusy, setModBusy] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSetDisabled = async (disabled: boolean) => {
    if (!id || modBusy) return;
    setModBusy(true);
    setModError(null);
    try {
      await setRestaurantDisabled({ restaurantId: id as never, disabled });
      toast.success(disabled ? "Restaurant disabled — hidden from diners." : "Restaurant re-enabled.");
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Could not update the restaurant.");
    } finally {
      setModBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!id || modBusy) return;
    setModBusy(true);
    setModError(null);
    try {
      const res = await deleteRestaurant({ restaurantId: id as never });
      if (res.deleted) {
        toast.success("Restaurant and all its data deleted.");
        setConfirmDelete(false);
      }
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Could not delete the restaurant.");
      setConfirmDelete(false);
    } finally {
      setModBusy(false);
    }
  };

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading restaurant…
      </div>
    );
  }
  if (data === null) return <EmptyNote>Restaurant not found.</EmptyNote>;

  const { restaurant, owner, rating } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/admin/restaurants" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All restaurants
      </Link>

      {/* Header */}
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight">{restaurant.name}</h1>
                {restaurant.disabled && (
                  <Badge className="gap-1 bg-destructive/10 text-destructive">
                    <Ban className="size-3" /> Disabled
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {restaurant.cuisine} · {restaurant.city} · {restaurant.priceRange ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {restaurant.address}</span>
                {restaurant.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {restaurant.phone}</span>}
                {rating.count > 0 && (
                  <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-current text-amber-500" /> {rating.avg.toFixed(1)} ({rating.count})</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="font-medium">{owner?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{owner?.phone ?? owner?.email ?? ""}</p>
              <div className="mt-1">{roleBadge(owner?.role)}</div>
            </div>
          </div>
          {restaurant.description && <p className="mt-3 text-sm text-muted-foreground">{restaurant.description}</p>}
        </CardContent>
      </Card>

      {/* Moderation: disable / delete */}
      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Moderation
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant={restaurant.disabled ? "outline" : "destructive"}
            disabled={modBusy}
            onClick={() => handleSetDisabled(!restaurant.disabled)}
          >
            {modBusy ? <Loader2 className="size-4 animate-spin" /> : restaurant.disabled ? <Store className="size-4" /> : <Ban className="size-4" />}
            {restaurant.disabled ? "Re-enable restaurant" : "Disable restaurant"}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={modBusy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" /> Delete restaurant permanently
          </Button>
          {restaurant.disabled && (
            <p className="text-xs text-muted-foreground">
              Hidden from Explore and new bookings until re-enabled. The owner can still see it.
            </p>
          )}
          {modError && (
            <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{modError}</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap">
          <TabsTrigger value="bookings">Bookings ({data.bookings.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({data.orders.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({data.reviews.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({data.assists.length + data.menuRequests.length})</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-0">
              {data.bookings.length === 0 ? <EmptyNote>No bookings.</EmptyNote> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diner</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bookings.map((b) => (
                      <TableRow key={b._id}>
                        <TableCell><span className="font-medium">{b.userName}</span><p className="text-xs text-muted-foreground">{b.phone}</p></TableCell>
                        <TableCell>{formatDate(b.date)} · {formatTime(b.time)}</TableCell>
                        <TableCell>{b.partySize}</TableCell>
                        <TableCell>{bookingStatusBadge(b.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-0">
              {data.orders.length === 0 ? <EmptyNote>No dine-in orders.</EmptyNote> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diner</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((o) => (
                      <TableRow key={o._id}>
                        <TableCell className="font-medium">{o.userName}</TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          {o.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}
                        </TableCell>
                        <TableCell>{formatPrice(o.totalCents)}</TableCell>
                        <TableCell>{orderStatusBadge(o.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-0">
              {data.reviews.length === 0 ? <EmptyNote>No reviews yet.</EmptyNote> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diner</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead className="w-full">Feedback</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reviews.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="font-medium">{r.authorName}</TableCell>
                        <TableCell><Stars rating={r.rating} /></TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">{r.text ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <div className="space-y-4">
            <Card className="rounded-2xl border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Assist requests (table pings)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.assists.length === 0 ? <EmptyNote>No assist requests.</EmptyNote> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time to resolve</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.assists.map((a) => (
                        <TableRow key={a._id}>
                          <TableCell className="font-medium">{a.template}</TableCell>
                          <TableCell>{a.status}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {a.resolveMs != null ? `${Math.round(a.resolveMs / 60000)} min` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Menu requests (off-menu)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.menuRequests.length === 0 ? <EmptyNote>No menu requests.</EmptyNote> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.menuRequests.map((m) => (
                        <TableRow key={m._id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">{m.description ?? "—"}</TableCell>
                          <TableCell><Badge variant="secondary">{m.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="setup">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-5">
              <h3 className="font-semibold">Sections</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.sections.map((s) => (
                  <Badge key={s._id} variant="outline">{s.name} · {s.kind} · {s.capacity} seats{s.smoking ? " · smoking" : ""}</Badge>
                ))}
                {data.sections.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
              </div>
              <h3 className="mt-4 font-semibold">Hours</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.hours.filter((h) => h.enabled).map((h) => (
                  <Badge key={h._id} variant="secondary">Day {h.dayOfWeek}: {formatTime(h.open)}–{formatTime(h.close)}</Badge>
                ))}
                {data.hours.filter((h) => h.enabled).length === 0 && <span className="text-sm text-muted-foreground">No hours set</span>}
              </div>
              <h3 className="mt-4 font-semibold">Menus</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.menus.map((m) => (
                  <Badge key={m._id} variant="outline">{m.name}</Badge>
                ))}
                {data.menus.length === 0 && <span className="text-sm text-muted-foreground">No menus</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !open && !modBusy && setConfirmDelete(false)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Delete this restaurant permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases {restaurant.name} and everything attached to it — sections,
              hours, menus, bookings, reviews, stories, gifts and waitlists. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={modBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={modBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {modBusy ? <Loader2 className="size-4 animate-spin" /> : "Delete restaurant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
