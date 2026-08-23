import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Ban, DollarSign, Star, Store, TrendingUp } from "lucide-react";
import { Stars, EmptyNote, SortableHead, TablePaginationBar } from "./AdminUI";
import { formatPrice } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  useTablePagination,
  useSort,
  sortItems,
} from "@/lib/use-table-pagination";

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.adminView.listRestaurants>>>[number];
type SortKey = "name" | "owner" | "rating" | "bookings" | "orders" | "revenue";

function extractValue(row: Row, key: SortKey): string | number {
  switch (key) {
    case "name": return row.name;
    case "owner": return row.ownerName ?? "";
    case "rating": return row.rating.avg;
    case "bookings": return row.bookingCount;
    case "orders": return row.orderCount;
    case "revenue": return row.revenueCents;
  }
}

export default function AdminRestaurants() {
  const rows = useQuery(api.adminView.listRestaurants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [cityFilter, setCityFilter] = useState("all");
  const { sort, toggleSort } = useSort<SortKey>({ key: "name", direction: "asc" });

  // Extract unique cities for the filter dropdown
  const cities = useMemo(() => {
    if (!rows) return [];
    const set = new Set(rows.map((r) => r.city).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows ?? [];

    // Search by name, cuisine, city, owner name, or owner phone
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          (r.neighborhood && r.neighborhood.toLowerCase().includes(q)) ||
          (r.ownerName && r.ownerName.toLowerCase().includes(q)) ||
          (r.ownerPhone && r.ownerPhone.includes(q)),
      );
    }

    // Status filter
    if (statusFilter === "disabled") {
      list = list.filter((r) => r.disabled);
    } else if (statusFilter === "active") {
      list = list.filter((r) => !r.disabled);
    }

    // City filter
    if (cityFilter !== "all") {
      list = list.filter((r) => r.city === cityFilter);
    }

    return list;
  }, [rows, search, statusFilter, cityFilter]);

  const sortedRows = useMemo(
    () => sortItems(filtered, sort.key, sort.direction, extractValue),
    [filtered, sort.key, sort.direction],
  );

  const { pageItems, page, setPage, totalPages, totalItems } = useTablePagination({
    items: sortedRows,
    sortKey: sort.key,
    sortDirection: sort.direction,
    pageSize: 25,
  });

  // Filter-reactive stats (must be before any early return — React hooks rule)
  const stats = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter((r) => !r.disabled).length;
    const disabled = filtered.filter((r) => r.disabled).length;
    const totalBookings = filtered.reduce((s, r) => s + r.bookingCount, 0);
    const totalRevenue = filtered.reduce((s, r) => s + r.revenueCents, 0);
    const avgRating = total > 0 ? filtered.filter((r) => r.rating.count > 0).reduce((s, r) => s + r.rating.avg, 0) / Math.max(1, filtered.filter((r) => r.rating.count > 0).length) : 0;
    return { total, active, disabled, totalBookings, totalRevenue, avgRating };
  }, [filtered]);

  if (rows === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading restaurants…
      </div>
    );
  }

  const disabledCount = rows.filter((r) => r.disabled).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Restaurants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} restaurants total{filtered.length < rows.length ? ` · ${filtered.length} shown` : ""}. Select one to see its full operational detail.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <Store className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Restaurants</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Bookings</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{stats.totalBookings.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <Star className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Avg rating</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <DollarSign className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Revenue</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{formatPrice(stats.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search name, cuisine, city, or owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:max-w-xs rounded-full text-sm"
        />
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-auto rounded-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="disabled">Disabled only</SelectItem>
            </SelectContent>
          </Select>
          {cities.length > 1 && (
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="h-9 w-auto rounded-full text-sm">
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {(search || statusFilter !== "all" || cityFilter !== "all") && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setSearch(""); setStatusFilter("all"); setCityFilter("all"); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyNote>No restaurants yet.</EmptyNote>
      ) : pageItems.length === 0 ? (
        <EmptyNote>No restaurants match your filters.</EmptyNote>
      ) : (
        <>
          <div className="rounded-2xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Restaurant" sortKey="name" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                  <SortableHead label="Owner" sortKey="owner" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden md:table-cell" />
                  <SortableHead label="Rating" sortKey="rating" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                  <SortableHead label="Bookings" sortKey="bookings" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                  <SortableHead label="Orders" sortKey="orders" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                  <SortableHead label="Revenue" sortKey="revenue" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden lg:table-cell" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link to={`/admin/restaurants/${r._id}`} className="group block">
                        <p className="flex items-center gap-2 font-medium group-hover:text-primary">
                          {r.name}
                          {r.disabled && (
                            <Badge className="gap-1 bg-destructive/10 text-destructive">
                              <Ban className="size-3" /> Disabled
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.cuisine} · {r.city}{r.neighborhood ? `, ${r.neighborhood}` : ""}
                        </p>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-medium">{r.ownerName ?? "—"}</span>
                      <p className="text-xs text-muted-foreground">{r.ownerPhone ?? ""}</p>
                    </TableCell>
                    <TableCell>
                      {r.rating.count > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Stars rating={r.rating.avg} />
                          <span className="text-xs text-muted-foreground">({r.rating.count})</span>
                        </span>
                      ) : (
                        <Badge variant="outline">No reviews</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.bookingCount}</TableCell>
                    <TableCell className="hidden sm:table-cell">{r.orderCount}</TableCell>
                    <TableCell className="hidden lg:table-cell">{formatPrice(r.revenueCents)}</TableCell>
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
