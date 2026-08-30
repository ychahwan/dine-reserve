import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useParams, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Ban, Eye, EyeOff, Gift, KeyRound, Loader2, Mail, Phone, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import { roleBadge, bookingStatusBadge, orderStatusBadge, Stars, EmptyNote } from "./AdminUI";
import { formatDate, formatPrice, formatTime } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SortableHead, TablePaginationBar } from "./AdminUI";
import { useTablePagination, useSort, sortItems } from "@/lib/use-table-pagination";

const EMPTY_ROWS: never[] = [];

export default function AdminUserDetail() {
  const { id } = useParams();
  const data = useQuery(api.adminView.userDetail, { id: id as never });
  const setUserPassword = useMutation(api.admin.setUserPassword);
  const setUserDisabled = useMutation(api.admin.setUserDisabled);
  const deleteUser = useMutation(api.admin.deleteUser);
  const updateUserProfile = useMutation(api.admin.updateUserProfile);

  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modBusy, setModBusy] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFamilyName, setEditFamilyName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const handleSetDisabled = async (disabled: boolean) => {
    if (!id || modBusy) return;
    setModBusy(true);
    setModError(null);
    try {
      await setUserDisabled({ userId: id as never, disabled });
      toast.success(disabled ? "User disabled — they can no longer sign in." : "User re-enabled.");
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Could not update the user.");
    } finally {
      setModBusy(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!id || modBusy) return;
    setModBusy(true);
    setModError(null);
    try {
      const res = await deleteUser({ userId: id as never });
      if (res.deleted) {
        toast.success("User and all their data deleted.");
        setConfirmDelete(false);
      }
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Could not delete the user.");
      setConfirmDelete(false);
    } finally {
      setModBusy(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSaving(true);
    try {
      await setUserPassword({ userId: id as never, newPassword });
      toast.success("Password set — the user must change it on next login.");
      setNewPassword("");
      setShowPass(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password.");
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || profileBusy) return;
    setProfileBusy(true);
    try {
      await updateUserProfile({ userId: id as never, name: editName, familyName: editFamilyName });
      toast.success("User profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the profile.");
    } finally { setProfileBusy(false); }
  };

  const userForHooks = data?.user;
  const bookings = data?.bookings ?? EMPTY_ROWS;
  const orders = data?.orders ?? EMPTY_ROWS;
  const reviews = data?.reviews ?? EMPTY_ROWS;
  const bookingSort = useSort<"date" | "party" | "status">({ key: "date", direction: "desc" });
  const orderSort = useSort<"createdAt" | "total" | "status">({ key: "createdAt", direction: "desc" });
  const reviewSort = useSort<"createdAt" | "rating">({ key: "createdAt", direction: "desc" });
  const sortedBookings = useMemo(() => sortItems(bookings, bookingSort.sort.key, bookingSort.sort.direction, (b, k) => k === "date" ? `${b.date}T${b.time}` : k === "party" ? b.partySize : b.status), [bookings, bookingSort.sort]);
  const sortedOrders = useMemo(() => sortItems(orders, orderSort.sort.key, orderSort.sort.direction, (o, k) => k === "createdAt" ? o.createdAt : k === "total" ? o.totalCents : o.status), [orders, orderSort.sort]);
  const sortedReviews = useMemo(() => sortItems(reviews, reviewSort.sort.key, reviewSort.sort.direction, (r, k) => k === "createdAt" ? r.createdAt : r.rating), [reviews, reviewSort.sort]);
  const bookingPage = useTablePagination({ items: sortedBookings, sortKey: bookingSort.sort.key, sortDirection: bookingSort.sort.direction, pageSize: 10 });
  const orderPage = useTablePagination({ items: sortedOrders, sortKey: orderSort.sort.key, sortDirection: orderSort.sort.direction, pageSize: 10 });
  const reviewPage = useTablePagination({ items: sortedReviews, sortKey: reviewSort.sort.key, sortDirection: reviewSort.sort.direction, pageSize: 10 });
  useEffect(() => {
    if (userForHooks) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditName(userForHooks.name ?? "");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditFamilyName(userForHooks.familyName ?? "");
    }
  }, [userForHooks]);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading user…
      </div>
    );
  }
  if (data === null) return <EmptyNote>User not found.</EmptyNote>;
  const user = data.user;


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
                {user.disabled && (
                  <Badge className="gap-1 bg-destructive/10 text-destructive">
                    <Ban className="size-3" /> Disabled
                  </Badge>
                )}
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

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3"><CardTitle className="text-base">Edit user name</CardTitle><CardDescription>Update the user&apos;s first and family name.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleProfileSave}>
            <div className="min-w-52 flex-1"><label className="mb-1 block text-xs text-muted-foreground">First name</label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
            <div className="min-w-52 flex-1"><label className="mb-1 block text-xs text-muted-foreground">Family name</label><Input value={editFamilyName} onChange={(e) => setEditFamilyName(e.target.value)} /></div>
            <Button type="submit" disabled={profileBusy}>{profileBusy ? <Loader2 className="size-4 animate-spin" /> : "Save name"}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Moderation: disable / delete */}
      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Moderation
          </CardTitle>
          <CardDescription>
            Disabling locks the account immediately — existing sessions are revoked and the
            user cannot sign in again. Deleting permanently erases the account and all their
            data (bookings, orders, reviews, loyalty points).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant={user.disabled ? "outline" : "destructive"}
            disabled={modBusy}
            onClick={() => handleSetDisabled(!user.disabled)}
          >
            {modBusy ? <Loader2 className="size-4 animate-spin" /> : user.disabled ? <UserRoundCheck className="size-4" /> : <Ban className="size-4" />}
            {user.disabled ? "Re-enable account" : "Disable account"}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={modBusy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" /> Delete user permanently
          </Button>
          {modError && (
            <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{modError}</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" /> Set a password
          </CardTitle>
          <CardDescription>
            Create or reset {user.name ?? "this user"}&apos;s password. They&apos;ll be asked to
            set a new one on their next login — you won&apos;t need to know it afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-60 flex-1">
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                type={showPass ? "text" : "password"}
                disabled={saving}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="submit" disabled={saving || newPassword.length < 8}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Setting…
                </>
              ) : (
                "Set password"
              )}
            </Button>
            {error && (
              <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap">
          <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="interactions">Interactions</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {bookings.length === 0 ? <EmptyNote>No bookings.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><SortableHead label="When" sortKey="date" activeSortKey={bookingSort.sort.key} direction={bookingSort.sort.direction} onToggle={bookingSort.toggleSort} /><SortableHead label="Party" sortKey="party" activeSortKey={bookingSort.sort.key} direction={bookingSort.sort.direction} onToggle={bookingSort.toggleSort} /><SortableHead label="Status" sortKey="status" activeSortKey={bookingSort.sort.key} direction={bookingSort.sort.direction} onToggle={bookingSort.toggleSort} /></TableRow></TableHeader>
                <TableBody>
                  {bookingPage.pageItems.map((b) => (
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
            <TablePaginationBar page={bookingPage.page} totalPages={bookingPage.totalPages} totalItems={bookingPage.totalItems} showingCount={bookingPage.pageItems.length} onPageChange={bookingPage.setPage} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {orders.length === 0 ? <EmptyNote>No dine-in orders.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><TableHead>Items</TableHead><SortableHead label="Total" sortKey="total" activeSortKey={orderSort.sort.key} direction={orderSort.sort.direction} onToggle={orderSort.toggleSort} /><SortableHead label="Status" sortKey="status" activeSortKey={orderSort.sort.key} direction={orderSort.sort.direction} onToggle={orderSort.toggleSort} /></TableRow></TableHeader>
                <TableBody>
                  {orderPage.pageItems.map((o) => (
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
            <TablePaginationBar page={orderPage.page} totalPages={orderPage.totalPages} totalItems={orderPage.totalItems} showingCount={orderPage.pageItems.length} onPageChange={orderPage.setPage} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card className="rounded-2xl border-border/70"><CardContent className="p-0">
            {reviews.length === 0 ? <EmptyNote>No reviews written.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead>Restaurant</TableHead><SortableHead label="Rating" sortKey="rating" activeSortKey={reviewSort.sort.key} direction={reviewSort.sort.direction} onToggle={reviewSort.toggleSort} /><SortableHead label="Feedback" sortKey="createdAt" activeSortKey={reviewSort.sort.key} direction={reviewSort.sort.direction} onToggle={reviewSort.toggleSort} /></TableRow></TableHeader>
                <TableBody>
                  {reviewPage.pageItems.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="font-medium">{r.restaurantName}</TableCell>
                      <TableCell><Stars rating={r.rating} /></TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{r.text ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <TablePaginationBar page={reviewPage.page} totalPages={reviewPage.totalPages} totalItems={reviewPage.totalItems} showingCount={reviewPage.pageItems.length} onPageChange={reviewPage.setPage} />
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

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !open && !modBusy && setConfirmDelete(false)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Delete this user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases {user.name ?? "this user"}'s account, bookings, orders, reviews,
              Socialize gifts and loyalty points. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={modBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={modBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteUser();
              }}
            >
              {modBusy ? <Loader2 className="size-4 animate-spin" /> : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
