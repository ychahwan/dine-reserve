import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
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
import { Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Stars, EmptyNote } from "./AdminUI";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export default function AdminReviews() {
  const reviews = useQuery(api.adminView.listReviews);
  const removeReview = useMutation(api.reviews.remove);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
              {reviews.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="font-medium">{r.restaurantName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.authorName}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </div>
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
