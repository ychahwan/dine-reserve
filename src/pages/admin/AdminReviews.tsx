import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/format";
import { filterAdminReviews } from "@/lib/admin-review-filters";
import {
  useTablePagination,
  useSort,
  sortItems,
} from "@/lib/use-table-pagination";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Loader2, MessageSquareQuote, Search, SlidersHorizontal, Star, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyNote, SortableHead, Stars, TablePaginationBar } from "./AdminUI";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

type ReviewRow = NonNullable<ReturnType<typeof useQuery<typeof api.adminView.listReviews>>>[number];
type SortKey = "restaurant" | "diner" | "rating" | "date";

function extractReviewValue(row: ReviewRow, key: SortKey): string | number {
  switch (key) {
    case "restaurant": return row.restaurantName;
    case "diner": return row.authorName;
    case "rating": return row.rating;
    case "date": return row.createdAt;
  }
}

export default function AdminReviews() {
  const reviews = useQuery(api.adminView.listReviews);
  const removeReview = useMutation(api.reviews.remove);
  const [restaurantId, setRestaurantId] = useState("all");
  const [userId, setUserId] = useState("all");
  const [rating, setRating] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { sort, toggleSort } = useSort<SortKey>({ key: "date", direction: "desc" });

  const restaurantOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const review of reviews ?? []) options.set(review.restaurantId, review.restaurantName);
    return [...options].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews]);

  const dinerOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const review of reviews ?? []) options.set(review.userId, review.authorName);
    return [...options].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews]);

  const filtered = useMemo(() => {
    const byFilters = filterAdminReviews(reviews ?? [], { restaurantId, userId, rating });
    if (!searchText.trim()) return byFilters;
    const query = searchText.trim().toLowerCase();
    return byFilters.filter((r) => r.text?.toLowerCase().includes(query) || r.authorName.toLowerCase().includes(query) || r.restaurantName.toLowerCase().includes(query));
  }, [reviews, restaurantId, userId, rating, searchText]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const sum = filtered.reduce((total, review) => total + review.rating, 0);
    return { average: Math.round((sum / filtered.length) * 10) / 10 };
  }, [filtered]);

  const sorted = useMemo(
    () => sortItems(filtered, sort.key, sort.direction, extractReviewValue),
    [filtered, sort.key, sort.direction],
  );

  const { pageItems, page, setPage, totalPages, totalItems } = useTablePagination({
    items: sorted,
    sortKey: sort.key,
    sortDirection: sort.direction,
    pageSize: 20,
  });

  const selectedFilteredCount = filtered.reduce(
    (count, review) => count + (selected.has(review._id) ? 1 : 0),
    0,
  );
  const allFilteredSelected = filtered.length > 0 && selectedFilteredCount === filtered.length;
  const selectedReviewIds = useMemo(
    () => [...selected].filter((id) => reviews?.some((review) => review._id === id)),
    [reviews, selected],
  );

  const toggleAllFiltered = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const review of filtered) {
        if (allFilteredSelected) next.delete(review._id);
        else next.add(review._id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (busy || selectedReviewIds.length === 0) return;
    setBusy(true);
    const deleted: string[] = [];
    let failed = 0;

    for (const reviewId of selectedReviewIds) {
      try {
        const result = await removeReview({ reviewId: reviewId as never });
        if (result.deleted) deleted.push(reviewId);
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    setSelected((current) => {
      const next = new Set(current);
      for (const reviewId of deleted) next.delete(reviewId);
      return next;
    });
    setConfirmBulkDelete(false);
    setBusy(false);

    if (deleted.length > 0) {
      toast.success(`${deleted.length} review${deleted.length === 1 ? "" : "s"} deleted.`);
    }
    if (failed > 0) {
      toast.error(`${failed} review${failed === 1 ? "" : "s"} could not be deleted.`);
    }
  };

  const resetFilters = () => {
    setRestaurantId("all");
    setUserId("all");
    setRating(0);
    setSearchText("");
  };

  if (reviews === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">Moderate diner feedback across the platform.</p>
        </div>
        <EmptyNote>No reviews yet — diners can rate a visit from My Bookings after it completes.</EmptyNote>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderate every diner rating and open the complete review record.
          </p>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          {filtered.length} of {reviews.length} shown
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Avg rating{filtered.length < reviews.length ? " (filtered)" : ""}</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{stats ? `${stats.average.toFixed(1)} / 5` : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <MessageSquareQuote className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Reviews{filtered.length < reviews.length ? ` (${filtered.length}/${reviews.length})` : ""}</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3 shadow-none sm:gap-3 sm:py-4">
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <Star className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Total platform</p>
              <p className="text-lg font-bold tracking-tight sm:text-xl">{reviews.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4 py-4 shadow-none">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4 text-primary" /> Review filters
          </CardTitle>
          <CardDescription>Combine restaurant, diner, and rating filters to narrow the moderation queue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger className="w-full" aria-label="Filter by restaurant">
                <SelectValue placeholder="All restaurants" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All restaurants</SelectItem>
                  {restaurantOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full" aria-label="Filter by diner">
                <SelectValue placeholder="All diners" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All diners</SelectItem>
                  {dinerOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select value={String(rating)} onValueChange={(value) => setRating(Number(value))}>
              <SelectTrigger className="w-full" aria-label="Filter by rating">
                <SelectValue placeholder="All ratings" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="0">All ratings</SelectItem>
                  {[5, 4, 3, 2, 1].map((star) => (
                    <SelectItem key={star} value={String(star)}>{star} stars</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search review text, diner, or restaurant…"
              className="pl-9"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          {(restaurantId !== "all" || userId !== "all" || rating !== 0 || searchText) ? (
            <Button variant="ghost" size="sm" className="w-fit" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                aria-label="Select all filtered reviews"
                checked={allFilteredSelected ? true : selectedFilteredCount > 0 ? "indeterminate" : false}
                onCheckedChange={toggleAllFiltered}
                disabled={filtered.length === 0}
              />
              <span>
                Select all filtered
                <span className="ml-1 text-muted-foreground">({selectedFilteredCount} selected here)</span>
              </span>
            </label>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedReviewIds.length === 0}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 data-icon="inline-start" />
              Delete selected ({selectedReviewIds.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
              <SortableHead label="Restaurant" sortKey="restaurant" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
              <SortableHead label="Diner" sortKey="diner" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
              <SortableHead label="Rating" sortKey="rating" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
              <SortableHead label="Date" sortKey="date" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
              <TableHead className="w-full">Feedback</TableHead>
              <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No reviews match these filters.
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((review) => (
                <TableRow key={review._id} data-state={selected.has(review._id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select review from ${review.authorName} for ${review.restaurantName}`}
                      checked={selected.has(review._id)}
                      onCheckedChange={(checked) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(review._id);
                          else next.delete(review._id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{review.restaurantName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {initialsOf(review.authorName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="whitespace-nowrap text-muted-foreground">{review.authorName}</span>
                    </div>
                  </TableCell>
                  <TableCell><Stars rating={review.rating} /></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(new Date(review.createdAt).toISOString().slice(0, 10))}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {review.text ?? <span className="italic opacity-60">No comment</span>}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link
                        to={`/admin/reviews/${review._id}`}
                        aria-label={`View review details for ${review.restaurantName}`}
                      >
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {/* Desktop pagination */}
      <div className="hidden md:block">
        <TablePaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          showingCount={pageItems.length}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {pageItems.length === 0 ? (
          <EmptyNote>No reviews match these filters.</EmptyNote>
        ) : (
          pageItems.map((review) => (
            <Card key={review._id} className="gap-4 py-4 shadow-none" data-state={selected.has(review._id) ? "selected" : undefined}>
              <CardHeader className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4">
                <Checkbox
                  className="mt-1"
                  aria-label={`Select review from ${review.authorName} for ${review.restaurantName}`}
                  checked={selected.has(review._id)}
                  onCheckedChange={(checked) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(review._id);
                      else next.delete(review._id);
                      return next;
                    });
                  }}
                />
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{review.restaurantName}</CardTitle>
                  <CardDescription className="truncate">{review.authorName}</CardDescription>
                </div>
                <Stars rating={review.rating} />
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {review.text ?? <span className="italic opacity-60">No comment</span>}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(new Date(review.createdAt).toISOString().slice(0, 10))}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/admin/reviews/${review._id}`}
                      aria-label={`View review details for ${review.restaurantName}`}
                    >
                      View details <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {/* Mobile pagination */}
      <div className="md:hidden">
        <TablePaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          showingCount={pageItems.length}
          onPageChange={setPage}
        />
      </div>

      <AlertDialog
        open={confirmBulkDelete}
        onOpenChange={(open) => !busy && setConfirmBulkDelete(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected reviews?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedReviewIds.length} selected review{selectedReviewIds.length === 1 ? "" : "s"} will be permanently removed.
              Loyalty points linked to each review will be reversed, and every admin deletion will be audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleBulkDelete();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
