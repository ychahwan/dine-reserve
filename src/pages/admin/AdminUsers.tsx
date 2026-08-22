import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Ban, Search } from "lucide-react";
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

type UserRow = NonNullable<ReturnType<typeof useQuery<typeof api.adminView.listUsers>>>[number];
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
        <Badge variant="outline" className="w-fit tabular-nums">
          {filteredRows.length} of {rows.length} shown
        </Badge>
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
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    No users match that phone number.
                  </TableCell>
                </TableRow>
              ) : pageItems.map((u) => (
                <TableRow key={u._id}>
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
    </div>
  );
}
