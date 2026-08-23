import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ban, Search, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleBadge, EmptyNote, SortableHead, TablePaginationBar } from "./AdminUI";
import { formatPrice } from "@/lib/format";
import { filterAdminUsersByPhone } from "@/lib/admin-user-filters";
import { useMemo, useState } from "react";
import {
  useTablePagination,
  useSort,
  sortItems,
} from "@/lib/use-table-pagination";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UserRow = NonNullable<ReturnType<typeof useQuery<typeof api.adminView.listUsers>>[number]>;
type SortKey = "name" | "role" | "phone" | "bookings" | "orders" | "reviews" | "spend";

function extractValue(row: UserRow, key: SortKey): string | number {
  switch (key) {
    case "name": return row.name ?? "";
    case "role": return row.role ?? "";
    case "phone": return row.phone ?? "";
    case "bookings": return row.bookingCount;
    case "orders": return row.orderCount;
    case "reviews": return row.reviewCount;
    case "spend": return row.totalSpendCents;
  }
}

export default function AdminUsers() {
  const rows = useQuery(api.adminView.listUsers);
  const [phoneQuery, setPhoneQuery] = useState("");
  const { sort, toggleSort } = useSort<SortKey>({ key: "name", direction: "asc" });
  const bulkDelete = useMutation(api.admin.bulkDeleteUsers);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const filteredRows = useMemo(
    () => filterAdminUsersByPhone(rows ?? [], phoneQuery),
    [rows, phoneQuery],
  );

  const sortedRows = useMemo(
    () => sortItems(filteredRows, sort.key, sort.direction, extractValue),
    [filteredRows, sort.key, sort.direction],
  );

  const { pageItems, page, setPage, totalPages, totalItems } = useTablePagination({
    items: sortedRows,
    sortKey: sort.key,
    sortDirection: sort.direction,
    pageSize: 25,
  });

  // Selection helpers
  const allPageSelected = pageItems.length > 0 && pageItems.every((u) => selected.has(u._id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const u of pageItems) next.delete(u._id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const u of pageItems) next.add(u._id);
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const ids = Array.from(selected) as never[];
      const res = await bulkDelete({ userIds: ids });
      if (res.deleted > 0) {
        toast.success(`Deleted ${res.deleted} user${res.deleted === 1 ? "" : "s"}.`);
      }
      if (res.skipped.length > 0) {
        const reasons = res.skipped.map((s) => s.reason).join(", ");
        toast.warning(`Skipped ${res.skipped.length} user(s): ${reasons}`);
      }
      setSelected(new Set());
      setConfirmBulkDelete(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed.");
    } finally {
      setBusy(false);
    }
  };

  if (rows === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading users…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All {rows.length} accounts. Select one to see their bookings, orders and interactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={busy}
            >
              <Trash2 className="size-3.5" /> Delete ({selected.size})
            </Button>
          )}
          <Badge variant="outline" className="w-fit tabular-nums">
            {filteredRows.length} of {rows.length} shown
          </Badge>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyNote>No users yet.</EmptyNote>
      ) : (
        <>
          <Card className="gap-4 py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="size-4 text-primary" /> Find a user
              </CardTitle>
              <CardDescription>Search by phone number. Spaces, dashes, and parentheses are ignored.</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <Field>
                <FieldLabel htmlFor="user-phone-filter">Phone number</FieldLabel>
                <Input
                  id="user-phone-filter"
                  type="search"
                  inputMode="tel"
                  autoComplete="off"
                  value={phoneQuery}
                  onChange={(event) => setPhoneQuery(event.target.value)}
                  placeholder="Search +961 76 683 661"
                />
              </Field>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-border accent-primary cursor-pointer"
                    aria-label="Select all on this page"
                  />
                </TableHead>
                <SortableHead label="User" sortKey="name" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                <SortableHead label="Role" sortKey="role" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                <SortableHead label="Contact" sortKey="phone" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden md:table-cell" />
                <SortableHead label="Bookings" sortKey="bookings" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                <SortableHead label="Orders" sortKey="orders" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                <SortableHead label="Reviews" sortKey="reviews" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden lg:table-cell" />
                <SortableHead label="Spend" sortKey="spend" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden lg:table-cell" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No users match that phone number.
                  </TableCell>
                </TableRow>
              ) : pageItems.map((u) => (
                <TableRow key={u._id} className={selected.has(u._id) ? "bg-primary/5" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(u._id)}
                      onChange={() => toggleRow(u._id)}
                      className="size-4 rounded border-border accent-primary cursor-pointer"
                      aria-label={`Select ${u.name ?? "user"}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link to={`/admin/users/${u._id}`} className="group block">
                      <p className="flex items-center gap-2 font-medium group-hover:text-primary">
                        {u.name ?? "Unnamed"}
                        {u.disabled && (
                          <Badge className="gap-1 bg-destructive/10 text-destructive">
                            <Ban className="size-3" /> Disabled
                          </Badge>
                        )}
                      </p>
                      {u.ownedRestaurants.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          owns {u.ownedRestaurants.map((r) => r.name).join(", ")}
                        </p>
                      )}
                      {u.phone && <p className="text-xs text-muted-foreground md:hidden">{u.phone}</p>}
                    </Link>
                  </TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm">{u.phone ?? ""}</p>
                    {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{u.bookingCount}</TableCell>
                  <TableCell className="hidden sm:table-cell">{u.orderCount}</TableCell>
                  <TableCell className="hidden lg:table-cell">{u.reviewCount}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatPrice(u.totalSpendCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            showingCount={pageItems.length}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Bulk delete confirmation dialog */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> Delete {selected.size} user{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all data for the selected users (bookings, orders, reviews, loyalty, auth accounts). Users who own restaurants will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={busy}>
              {busy ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
              Delete {selected.size} user{selected.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
