import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Stars, EmptyNote } from "./AdminUI";
import { formatDate } from "@/lib/format";

export default function AdminReviews() {
  const reviews = useQuery(api.adminView.listReviews);

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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
