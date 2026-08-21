import { CustomerShell } from "@/components/CustomerShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Store,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "sonner";

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const data = useQuery(api.bookings.byCode, { code: code ?? "" });
  const confirmGuest = useMutation(api.bookings.confirmGuest);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!data || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmGuest({
        bookingId: data.booking._id as never,
        code: code ?? "",
        name: user?.name ?? "Guest",
      });
      setConfirmed(true);
      toast.success("You're on the list — see you there!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm your seat.");
      toast.error(err instanceof Error ? err.message : "Could not confirm your seat.");
    } finally {
      setConfirming(false);
    }
  };

  if (data === undefined) {
    return (
      <CustomerShell>
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-sm">Looking up this invitation…</p>
        </div>
      </CustomerShell>
    );
  }

  if (!data) {
    return (
      <CustomerShell>
        <div className="flex flex-col items-center gap-3 px-4 py-24 text-center">
          <CalendarCheck2 className="size-10 text-muted-foreground/60" />
          <p className="font-medium">Invitation not found</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            This booking code isn't active. Ask your friend to re-share the invite, or book your own
            table.
          </p>
          <Button asChild>
            <Link to="/explore">Find a table</Link>
          </Button>
        </div>
      </CustomerShell>
    );
  }

  const { booking, restaurant, alreadyConfirmed } = data;
  const guests = booking.guests ?? [];

  return (
    <CustomerShell>
      <div className="px-4 pt-6 pb-8">
        <Card className="overflow-hidden rounded-3xl border-border/70 p-0 shadow-sm">
          <div className="relative h-40 w-full">
            {restaurant?.imageUrl ? (
              <img src={restaurant.imageUrl} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
                <Store className="size-10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <p className="text-lg font-bold tracking-tight drop-shadow">
                {restaurant?.name ?? "A table"}
              </p>
              {restaurant && (
                <p className="flex items-center gap-1 text-xs text-white/90">
                  <MapPin className="size-3" /> {restaurant.address} · {restaurant.city}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 p-5">
            {confirmed || alreadyConfirmed ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
                  <Check className="size-7" />
                </div>
                <p className="text-lg font-bold tracking-tight">You're confirmed!</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Your name is on the list for {restaurant?.name ?? "the table"} — see you there.
                </p>
                <Button asChild className="mt-2">
                  <Link to="/bookings">View my bookings</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 text-primary" />
                  <p className="text-sm font-semibold">You're invited to dinner</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="size-4 text-muted-foreground" />
                    <span className="font-medium">
                      {formatDate(booking.date)} · {formatTime(booking.time)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span>
                      {booking.partySize + guests.length} going
                      {booking.sectionName ? ` · ${booking.sectionName}` : ""}
                    </span>
                  </div>
                </div>

                {guests.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Already confirmed
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {guests.map((g, i) => (
                        <Badge key={`${g.name}-${i}`} variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3" /> {g.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}

                <Button className="w-full" size="lg" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? <Spinner className="size-4" /> : <UserPlus className="size-4" />}
                  {confirming ? "Confirming…" : "Confirm my seat"}
                </Button>
                <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                  <Clock className="size-3" /> Seats are confirmed live against the restaurant's
                  availability — no double-booking, ever.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </CustomerShell>
  );
}
