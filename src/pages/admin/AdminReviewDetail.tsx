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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { formatDate, localDateKey } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CalendarDays, Loader2, MessageSquareQuote, Store, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { EmptyNote, Stars } from "./AdminUI";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export default function AdminReviewDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const reviews = useQuery(api.adminView.listReviews);
  const removeReview = useMutation(api.reviews.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const review = reviews?.find((item) => item._id === id);

  const handleDelete = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      const result = await removeReview({ reviewId: id as never });
      if (result.deleted) {
        toast.success("Review deleted.");
        navigate("/admin/reviews", { replace: true });
        return;
      }
      toast.error("This review no longer exists.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the review.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (reviews === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading review…
      </div>
    );
  }

  if (!review) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link to="/admin/reviews"><ArrowLeft data-icon="inline-start" /> All reviews</Link>
        </Button>
        <EmptyNote>Review not found. It may have already been deleted.</EmptyNote>
      </div>
    );
  }

  // Local-calendar rendering — UTC slicing showed the previous day for
  // evening timestamps in UTC+ zones.
  const date = formatDate(localDateKey(review.createdAt));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/admin/reviews"><ArrowLeft data-icon="inline-start" /> All reviews</Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.reviewDetails")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.reviewDetailsDesc")}</p>
        </div>
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 data-icon="inline-start" /> Delete review
        </Button>
      </div>

      <Card className="shadow-none">
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {initialsOf(review.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">{review.authorName}</CardTitle>
                <CardDescription>Diner review for {review.restaurantName}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Stars rating={review.rating} />
              <Badge variant="secondary">{review.rating} / 5</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section className="flex flex-col gap-2" aria-labelledby="feedback-heading">
            <h2 id="feedback-heading" className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareQuote className="size-4 text-primary" /> Feedback
            </h2>
            <p className="whitespace-pre-wrap text-base leading-7 text-foreground">
              {review.text ?? <span className="italic text-muted-foreground">{t("admin.noComment")}</span>}
            </p>
          </section>

          <Separator />

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Restaurant</dt>
                <dd className="font-medium">
                  <Link className="hover:text-primary hover:underline" to={`/admin/restaurants/${review.restaurantId}`}>
                    {review.restaurantName}
                  </Link>
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Diner</dt>
                <dd className="font-medium">
                  <Link className="hover:text-primary hover:underline" to={`/admin/users/${review.userId}`}>
                    {review.authorName}
                  </Link>
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Submitted</dt>
                <dd className="font-medium">{date}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Review ID</dt>
              <dd className="break-all font-mono text-xs text-muted-foreground">{review._id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !busy && setConfirmDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteReviewTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              This review will be permanently removed, its loyalty reward reversed, and the admin action audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
