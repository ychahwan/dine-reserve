import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useParams, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import {
  ArrowLeft,
  Ban,
  Download,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  roleBadge,
  bookingStatusBadge,
  orderStatusBadge,
  Stars,
  EmptyNote,
  SortableHead,
  TablePaginationBar,
} from "./AdminUI";
import {
  dateFromNow,
  formatDate,
  formatPrice,
  formatTime,
  localDateKey,
  today,
} from "@/lib/format";
import { toast } from "sonner";
import {
  useTablePagination,
  useSort,
  sortItems,
  sanitizeCsvCell,
} from "@/lib/use-table-pagination";
import type { SortDirection } from "@/lib/use-table-pagination";

// ── Reusable tab-panel wrapper with search + sort + pagination ──

function FilteredTable<T extends Record<string, unknown>, SK extends string>({
  items,
  search,
  onSearchChange,
  searchPlaceholder,
  sortKey,
  sortDirection,
  toggleSort,
  columns,
  renderRow,
  emptyText,
  extractValue,
  filters,
}: {
  items: T[];
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  sortKey: SK;
  sortDirection: SortDirection;
  toggleSort: (key: SK) => void;
  columns: {
    label: string;
    sortKey?: SK;
    className?: string;
    headClassName?: string;
  }[];
  renderRow: (item: T, idx: number) => React.ReactNode;
  emptyText: string;
  extractValue: (row: T, key: SK) => string | number;
  filters?: React.ReactNode;
}) {
  const sorted = useMemo(
    () => sortItems(items, sortKey, sortDirection, extractValue),
    [items, sortKey, sortDirection, extractValue],
  );

  const { pageItems, page, setPage, totalPages, totalItems } =
    useTablePagination({
      items: sorted,
      sortKey,
      sortDirection,
      pageSize: 15,
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-full sm:max-w-xs rounded-full text-xs"
        />
        {filters}
      </div>
      {items.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : pageItems.length === 0 ? (
        <EmptyNote>No results match your filters.</EmptyNote>
      ) : (
        <>
          <div className="rounded-2xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.label} className={col.headClassName}>
                      {col.sortKey ? (
                        <SortableHead
                          label={col.label}
                          sortKey={col.sortKey}
                          activeSortKey={sortKey}
                          direction={sortDirection}
                          onToggle={toggleSort}
                        />
                      ) : (
                        col.label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((item, i) => renderRow(item, i))}
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

/** Export rows to a CSV file and trigger download. */
function exportToCsv(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Types ──

type Detail = NonNullable<
  ReturnType<typeof useQuery<typeof api.adminView.restaurantDetail>>
>;
type BookingRow = Detail["bookings"][number];
type OrderRow = Detail["orders"][number];
type ReviewRow = Detail["reviews"][number];
type AssistRow = Detail["assists"][number];
type MenuReqRow = Detail["menuRequests"][number];

function extractBookingValue(
  row: BookingRow,
  key: "when" | "diner" | "party" | "status",
) {
  if (key === "when") return `${row.date}T${row.time}`;
  if (key === "diner") return row.userName;
  if (key === "party") return row.partySize;
  return row.status;
}

function extractOrderValue(row: OrderRow, key: "diner" | "total" | "status") {
  if (key === "diner") return row.userName;
  if (key === "total") return row.totalCents;
  return row.status;
}

function extractReviewValue(row: ReviewRow, key: "diner" | "rating" | "when") {
  if (key === "diner") return row.authorName;
  if (key === "rating") return row.rating;
  return row.createdAt;
}

function extractAssistValue(row: AssistRow, key: "type" | "status" | "time") {
  if (key === "type") return row.template;
  if (key === "status") return row.status;
  return row.createdAt;
}

function extractMenuRequestValue(row: MenuReqRow, key: "name" | "status") {
  return key === "name" ? row.name : row.status;
}

// ── Date presets ──

// Booking dates are local-calendar strings (see format.ts) — build keys from
// local components so "Today" doesn't lag into yesterday for UTC+ zones
// between local midnight and 03:00 (H-27).
const DATE_PRESETS = [
  { label: "Today", getRange: () => ({ from: today(), to: today() }) },
  {
    label: "Last 7 days",
    getRange: () => ({ from: dateFromNow(-6), to: today() }),
  },
  {
    label: "This month",
    getRange: () => {
      const now = new Date();
      return {
        from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: today(),
      };
    },
  },
  {
    label: "Last 30 days",
    getRange: () => ({ from: dateFromNow(-29), to: today() }),
  },
];

// ── Main component ──

export default function AdminRestaurantDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const data = useQuery(api.adminView.restaurantDetail, { id: id as never });
  const setRestaurantDisabled = useMutation(api.admin.setRestaurantDisabled);
  const deleteRestaurant = useMutation(api.admin.deleteRestaurant);
  const [modBusy, setModBusy] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tab filter state
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatus, setBookingStatus] = useState("all");
  const [bookingDateFrom, setBookingDateFrom] = useState("");
  const [bookingDateTo, setBookingDateTo] = useState("");
  const bookingSort = useSort<"when" | "diner" | "party" | "status">({
    key: "when",
    direction: "desc",
  });

  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const orderSort = useSort<"diner" | "total" | "status">({
    key: "total",
    direction: "desc",
  });

  const [reviewSearch, setReviewSearch] = useState("");
  const reviewSort = useSort<"diner" | "rating" | "when">({
    key: "when",
    direction: "desc",
  });

  const [assistSearch, setAssistSearch] = useState("");
  const assistSort = useSort<"type" | "status" | "time">({
    key: "time",
    direction: "desc",
  });

  const [menuReqSearch, setMenuReqSearch] = useState("");
  const menuReqSort = useSort<"name" | "status">({
    key: "name",
    direction: "asc",
  });

  const handleSetDisabled = async (disabled: boolean) => {
    if (!id || modBusy) return;
    setModBusy(true);
    setModError(null);
    try {
      await setRestaurantDisabled({ restaurantId: id as never, disabled });
      toast.success(
        disabled
          ? "Restaurant disabled — hidden from diners."
          : "Restaurant re-enabled.",
      );
    } catch (err) {
      setModError(
        err instanceof Error ? err.message : "Could not update the restaurant.",
      );
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
      setModError(
        err instanceof Error ? err.message : "Could not delete the restaurant.",
      );
      setConfirmDelete(false);
    } finally {
      setModBusy(false);
    }
  };

  // ── Filtered data ──

  const filteredBookings = useMemo(() => {
    let list = data?.bookings ?? [];
    if (bookingSearch.trim()) {
      const q = bookingSearch.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.userName.toLowerCase().includes(q) ||
          b.phone?.includes(q) ||
          b.code?.toLowerCase().includes(q),
      );
    }
    if (bookingStatus !== "all")
      list = list.filter((b) => b.status === bookingStatus);
    if (bookingDateFrom) list = list.filter((b) => b.date >= bookingDateFrom);
    if (bookingDateTo) list = list.filter((b) => b.date <= bookingDateTo);
    return list;
  }, [
    data?.bookings,
    bookingSearch,
    bookingStatus,
    bookingDateFrom,
    bookingDateTo,
  ]);

  const filteredOrders = useMemo(() => {
    let list = data?.orders ?? [];
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.userName.toLowerCase().includes(q) ||
          o.items.some((it) => it.name.toLowerCase().includes(q)),
      );
    }
    if (orderStatus !== "all")
      list = list.filter((o) => o.status === orderStatus);
    // Orders have createdAt (ms timestamp) — filter by date range
    if (orderDateFrom) {
      const from = new Date(orderDateFrom + "T00:00:00").getTime();
      list = list.filter((o) => o.createdAt >= from);
    }
    if (orderDateTo) {
      const to = new Date(orderDateTo + "T23:59:59").getTime();
      list = list.filter((o) => o.createdAt <= to);
    }
    return list;
  }, [data?.orders, orderSearch, orderStatus, orderDateFrom, orderDateTo]);

  const filteredReviews = useMemo(() => {
    let list = data?.reviews ?? [];
    if (reviewSearch.trim()) {
      const q = reviewSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.authorName.toLowerCase().includes(q) ||
          r.text?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data?.reviews, reviewSearch]);

  const filteredAssists = useMemo(() => {
    let list = data?.assists ?? [];
    if (assistSearch.trim()) {
      const q = assistSearch.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.template.toLowerCase().includes(q) ||
          a.note?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data?.assists, assistSearch]);

  const filteredMenuReqs = useMemo(() => {
    let list = data?.menuRequests ?? [];
    if (menuReqSearch.trim()) {
      const q = menuReqSearch.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data?.menuRequests, menuReqSearch]);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading restaurant…
      </div>
    );
  }
  if (data === null) return <EmptyNote>Restaurant not found.</EmptyNote>;

  const { restaurant, owner, rating } = data;

  const handleExportBookings = () => {
    const headers = [
      "Diner",
      "Phone",
      "Date",
      "Time",
      "Party",
      "Status",
      "Code",
    ];
    const rows = filteredBookings.map((b) => [
      b.userName,
      b.phone ?? "",
      b.date,
      b.time,
      b.partySize,
      b.status,
      b.code ?? "",
    ]);
    exportToCsv(
      headers,
      rows,
      `bookings-${restaurant.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toast.success(`Exported ${rows.length} bookings.`);
  };

  const handleExportOrders = () => {
    const headers = ["Diner", "Items", "Total", "Status"];
    const rows = filteredOrders.map((o) => [
      o.userName,
      o.items.map((it) => `${it.quantity}× ${it.name}`).join(", "),
      formatPrice(o.totalCents),
      o.status,
    ]);
    exportToCsv(
      headers,
      rows,
      `orders-${restaurant.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toast.success(`Exported ${rows.length} orders.`);
  };

  const handleExportReviews = () => {
    const headers = ["Diner", "Rating", "Date", "Feedback"];
    const rows = filteredReviews.map((r) => [
      r.authorName,
      r.rating,
      new Date(r.createdAt).toLocaleDateString(),
      r.text ?? "",
    ]);
    exportToCsv(
      headers,
      rows,
      `reviews-${restaurant.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toast.success(`Exported ${rows.length} reviews.`);
  };

  const handleExportAssists = () => {
    const headers = ["Type", "Status", "Note", "Resolve time (min)"];
    const rows = filteredAssists.map((a) => [
      a.template,
      a.status,
      a.note ?? "",
      a.resolveMs != null ? Math.round(a.resolveMs / 60000) : "",
    ]);
    exportToCsv(
      headers,
      rows,
      `assists-${restaurant.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toast.success(`Exported ${rows.length} assist requests.`);
  };

  const handleExportMenuReqs = () => {
    const headers = ["Name", "Description", "Status"];
    const rows = filteredMenuReqs.map((m) => [
      m.name,
      m.description ?? "",
      m.status,
    ]);
    exportToCsv(
      headers,
      rows,
      `menu-requests-${restaurant.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toast.success(`Exported ${rows.length} menu requests.`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/admin/restaurants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All restaurants
      </Link>

      {/* Header */}
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight">
                  {restaurant.name}
                </h1>
                {restaurant.disabled && (
                  <Badge className="gap-1 bg-destructive/10 text-destructive">
                    <Ban className="size-3" /> Disabled
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {restaurant.cuisine} · {restaurant.city} ·{" "}
                {restaurant.priceRange ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> {restaurant.address}
                </span>
                {restaurant.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3.5" /> {restaurant.phone}
                  </span>
                )}
                {rating.count > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-current text-amber-500" />{" "}
                    {rating.avg.toFixed(1)} ({rating.count})
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="font-medium">{owner?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {owner?.phone ?? owner?.email ?? ""}
              </p>
              <div className="mt-1">{roleBadge(owner?.role)}</div>
            </div>
          </div>
          {restaurant.description && (
            <p className="mt-3 text-sm text-muted-foreground">
              {restaurant.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Moderation */}
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
            {modBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : restaurant.disabled ? (
              <Store className="size-4" />
            ) : (
              <Ban className="size-4" />
            )}
            {restaurant.disabled
              ? "Re-enable restaurant"
              : "Disable restaurant"}
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
              {t("admin.hiddenFromExplore")}
            </p>
          )}
          {modError && (
            <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {modError}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap">
          <TabsTrigger value="bookings">
            Bookings ({data.bookings.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            Orders ({data.orders.length})
          </TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews ({data.reviews.length})
          </TabsTrigger>
          <TabsTrigger value="requests">
            Requests ({data.assists.length + data.menuRequests.length})
          </TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        {/* ── Bookings ── */}
        <TabsContent value="bookings">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {filteredBookings.length} bookings
                  {bookingSearch ||
                  bookingStatus !== "all" ||
                  bookingDateFrom ||
                  bookingDateTo
                    ? " (filtered)"
                    : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportBookings}
                  disabled={filteredBookings.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <FilteredTable
                items={filteredBookings}
                search={bookingSearch}
                onSearchChange={setBookingSearch}
                searchPlaceholder="Search diner, phone, or code…"
                sortKey={bookingSort.sort.key}
                sortDirection={bookingSort.sort.direction}
                toggleSort={bookingSort.toggleSort}
                extractValue={extractBookingValue}
                columns={[
                  { label: "Diner", sortKey: "diner" },
                  { label: "When", sortKey: "when" },
                  {
                    label: "Party",
                    sortKey: "party",
                    className: "hidden sm:table-cell",
                    headClassName: "hidden sm:table-cell",
                  },
                  { label: "Status", sortKey: "status" },
                ]}
                renderRow={(b) => (
                  <TableRow key={b._id}>
                    <TableCell>
                      <span className="font-medium">{b.userName}</span>
                      <p className="text-xs text-muted-foreground">{b.phone}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(b.date)} · {formatTime(b.time)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {b.partySize}
                    </TableCell>
                    <TableCell>{bookingStatusBadge(b.status)}</TableCell>
                  </TableRow>
                )}
                emptyText="No bookings."
                filters={
                  <>
                    <Select
                      value={bookingStatus}
                      onValueChange={setBookingStatus}
                    >
                      <SelectTrigger className="h-8 w-auto rounded-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="no_show">No-show</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    {DATE_PRESETS.map((p) => {
                      const r = p.getRange();
                      const active =
                        bookingDateFrom === r.from && bookingDateTo === r.to;
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            setBookingDateFrom(r.from);
                            setBookingDateTo(r.to);
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    <span className="text-xs text-muted-foreground">From</span>
                    <input
                      type="date"
                      value={bookingDateFrom}
                      onChange={(e) => setBookingDateFrom(e.target.value)}
                      className="h-8 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground">To</span>
                    <input
                      type="date"
                      value={bookingDateTo}
                      onChange={(e) => setBookingDateTo(e.target.value)}
                      className="h-8 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground"
                    />
                  </>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Orders ── */}
        <TabsContent value="orders">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {filteredOrders.length} orders
                  {orderSearch ||
                  orderStatus !== "all" ||
                  orderDateFrom ||
                  orderDateTo
                    ? " (filtered)"
                    : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportOrders}
                  disabled={filteredOrders.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <FilteredTable
                items={filteredOrders}
                search={orderSearch}
                onSearchChange={setOrderSearch}
                searchPlaceholder="Search diner or item name…"
                sortKey={orderSort.sort.key}
                sortDirection={orderSort.sort.direction}
                toggleSort={orderSort.toggleSort}
                extractValue={extractOrderValue}
                columns={[
                  { label: "Diner", sortKey: "diner" },
                  { label: "Items", className: "max-w-xs" },
                  {
                    label: "Total",
                    sortKey: "total",
                    headClassName: "text-right",
                    className: "text-right",
                  },
                  { label: "Status", sortKey: "status" },
                ]}
                renderRow={(o) => (
                  <TableRow key={o._id}>
                    <TableCell className="font-medium">{o.userName}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {o.items
                        .map((it) => `${it.quantity}× ${it.name}`)
                        .join(", ")}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(o.totalCents)}
                    </TableCell>
                    <TableCell>{orderStatusBadge(o.status)}</TableCell>
                  </TableRow>
                )}
                emptyText="No dine-in orders."
                filters={
                  <>
                    <Select value={orderStatus} onValueChange={setOrderStatus}>
                      <SelectTrigger className="h-8 w-auto rounded-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="preparing">Preparing</SelectItem>
                        <SelectItem value="served">Served</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    {DATE_PRESETS.map((p) => {
                      const r = p.getRange();
                      const active =
                        orderDateFrom === r.from && orderDateTo === r.to;
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            setOrderDateFrom(r.from);
                            setOrderDateTo(r.to);
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    <span className="text-xs text-muted-foreground">From</span>
                    <input
                      type="date"
                      value={orderDateFrom}
                      onChange={(e) => setOrderDateFrom(e.target.value)}
                      className="h-8 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground">To</span>
                    <input
                      type="date"
                      value={orderDateTo}
                      onChange={(e) => setOrderDateTo(e.target.value)}
                      className="h-8 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground"
                    />
                  </>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Reviews ── */}
        <TabsContent value="reviews">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {filteredReviews.length} reviews
                  {reviewSearch ? " (filtered)" : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportReviews}
                  disabled={filteredReviews.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <FilteredTable
                items={filteredReviews}
                search={reviewSearch}
                onSearchChange={setReviewSearch}
                searchPlaceholder="Search diner or feedback…"
                sortKey={reviewSort.sort.key}
                sortDirection={reviewSort.sort.direction}
                toggleSort={reviewSort.toggleSort}
                extractValue={extractReviewValue}
                columns={[
                  { label: "Diner", sortKey: "diner" },
                  { label: "Rating", sortKey: "rating" },
                  {
                    label: "When",
                    sortKey: "when",
                    className: "hidden sm:table-cell",
                    headClassName: "hidden sm:table-cell",
                  },
                  { label: "Feedback" },
                ]}
                renderRow={(r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">
                      {r.authorName}
                    </TableCell>
                    <TableCell>
                      <Stars rating={r.rating} />
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {r.text ?? "—"}
                    </TableCell>
                  </TableRow>
                )}
                emptyText="No reviews yet."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Requests ── */}
        <TabsContent value="requests">
          <div className="space-y-4">
            {/* Assist requests */}
            <Card className="rounded-2xl border-border/70">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">
                  {t("admin.assistRequests")}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAssists}
                  disabled={filteredAssists.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                <FilteredTable
                  items={filteredAssists}
                  search={assistSearch}
                  onSearchChange={setAssistSearch}
                  searchPlaceholder="Search type or note…"
                  sortKey={assistSort.sort.key}
                  sortDirection={assistSort.sort.direction}
                  toggleSort={assistSort.toggleSort}
                  extractValue={extractAssistValue}
                  columns={[
                    { label: "Type", sortKey: "type" },
                    { label: "Status", sortKey: "status" },
                    { label: "Time to resolve", sortKey: "time" },
                  ]}
                  renderRow={(a) => (
                    <TableRow key={a._id}>
                      <TableCell className="font-medium">
                        {a.template}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{a.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.resolveMs != null
                          ? `${Math.round(a.resolveMs / 60000)} min`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  )}
                  emptyText="No assist requests."
                />
              </CardContent>
            </Card>

            {/* Menu requests */}
            <Card className="rounded-2xl border-border/70">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">
                  {t("admin.menuRequests")}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMenuReqs}
                  disabled={filteredMenuReqs.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                <FilteredTable
                  items={filteredMenuReqs}
                  search={menuReqSearch}
                  onSearchChange={setMenuReqSearch}
                  searchPlaceholder="Search name or description…"
                  sortKey={menuReqSort.sort.key}
                  sortDirection={menuReqSort.sort.direction}
                  toggleSort={menuReqSort.toggleSort}
                  extractValue={extractMenuRequestValue}
                  columns={[
                    { label: "Name", sortKey: "name" },
                    { label: "Description" },
                    { label: "Status", sortKey: "status" },
                  ]}
                  renderRow={(m) => (
                    <TableRow key={m._id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {m.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{m.status}</Badge>
                      </TableCell>
                    </TableRow>
                  )}
                  emptyText="No menu requests."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Setup ── */}
        <TabsContent value="setup">
          <Card className="rounded-2xl border-border/70">
            <CardContent className="p-5">
              <h3 className="font-semibold">Sections</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.sections.map((s) => (
                  <Badge key={s._id} variant="outline">
                    {s.name} · {s.kind} · {s.capacity} seats
                    {s.smoking ? " · smoking" : ""}
                  </Badge>
                ))}
                {data.sections.length === 0 && (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
              <h3 className="mt-4 font-semibold">Hours</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.hours
                  .filter((h) => h.enabled)
                  .map((h) => (
                    <Badge key={h._id} variant="secondary">
                      Day {h.dayOfWeek}: {formatTime(h.open)}–
                      {formatTime(h.close)}
                    </Badge>
                  ))}
                {data.hours.filter((h) => h.enabled).length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    {t("admin.noHoursSet")}
                  </span>
                )}
              </div>
              <h3 className="mt-4 font-semibold">Menus</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.menus.map((m) => (
                  <Badge key={m._id} variant="outline">
                    {m.name}
                  </Badge>
                ))}
                {data.menus.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    {t("admin.noMenus")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && !modBusy && setConfirmDelete(false)}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">
              {t("admin.deleteRestaurantTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases {restaurant.name} and everything attached
              to it — sections, hours, menus, bookings, reviews, stories, gifts
              and waitlists. This cannot be undone.
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
              {modBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete restaurant"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
