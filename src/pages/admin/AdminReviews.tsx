import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
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
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Star, Trash2, Loader2, MessageSquareQuote, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Stars, EmptyNote } from "./AdminUI";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** "Maria N." → "MN" for avatars. */
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const RATING_FILTERS = [0, 5, 4, 3, 2, 1] as const;

export default function AdminReviews() {
  const reviews = useQuery(api.adminView.listReviews);
  const removeReview = useMutation(api.reviews.remove);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<number>(0); // 0 = all

  const stats = useMemo(() => {
    if (!reviews || reviews.length === 0) return null;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const avg = Math.round((sum / reviews.length) * 10) / 10;
    const byStar = [0, 0, 0, 0, 0, 0];
    for (const r of reviews) byStar[r.rating] = (byStar[r.rating] ?? 0) + 1;
    return { avg, byStar };
  }, [reviews]);

  const filtered = useMemo(() => {
    if (!reviews) return [];
    return filter === 0 ? reviews : reviews.filter((r) => r.rating === filter);
  }, [reviews, filter]);

  const handleDelete = async () => {
    if (!reviewToDelete || busy) return;
    setBusy(true);
    try {
      const res = await removeReview({ reviewId: reviewToDelete as never });
      if (res.deleted) toast.success("Review deleted.");
      setReviewToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the review.");
    } finally {
      setBusy(false);
    }
  };

  if (reviews === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading reviews…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every diner rating across the platform ({reviews.length}).
        </p>
      </div>

      {reviews.length === 0 ? (
        <EmptyNote>No reviews yet — diners can rate a visit from My Bookings after it completes.</EmptyNote>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <TrendingUp className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Average rating</p>
                <p className="text-xl font-bold tracking-tight">
                  {stats?.avg.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ 5</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareQuote className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total reviews</p>
                <p className="text-xl font-bold tracking-tight">{reviews.length}</p>
              </div>
            </div>
          </div>

          {/* Rating distribution + filter */}
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setFilter(0)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                All
              </button>
              {RATING_FILTERS.filter((r) => r > 0).map((star) => (
                <button
                  key={star}
                  onClick={() => setFilter(filter === star ? 0 : star)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filter === star
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  <Star className={cn("size-3", filter === star ? "fill-current" : "fill-current text-amber-500")} />
                  {star}
                  <span className="opacity-60">{stats ? stats.byStar[star] ?? 0 : 0}</span>
                </button>
              ))}
            </div>
            {stats && (
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = stats.byStar[star] ?? 0;
                  const pct = (n / reviews.length) * 100;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{star}</span>
                      <Star className="size-3 shrink-0 fill-current text-amber-500" />
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{n}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Diner</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="w-full">Feedback</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No {filter > 0 ? `${filter}-star ` : ""}reviews match.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="font-medium">{r.restaurantName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                              {initialsOf(r.authorName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">{r.authorName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Stars rating={r.rating} />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {formatDate(new Date(r.createdAt).toISOString().slice(0, 10))}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {r.text ?? <span className="italic opacity-60">No comment</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setReviewToDelete(r._id)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog open={!!reviewToDelete} onOpenChange={(open) => !open && !busy && setReviewToDelete(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              The rating and feedback are removed permanently from the platform. This is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Delete review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
