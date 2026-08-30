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
import { Link, useNavigate, useParams } from "react-router";
import { formatDate, formatTime } from "@/lib/format";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const data = useQuery(api.bookings.byCode, { code: code ?? "" });
  const confirmGuest = useMutation(api.bookings.confirmGuest);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!data || confirming) return;
    // KB-20: an anonymous visitor who taps "Confirm my seat" shouldn't get a
    // raw "please sign in" error — send them to sign in first and bring them
    // back to this exact invite afterwards.
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent(`/invite/${code ?? ""}`)}`);
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await confirmGuest({
        bookingId: data.booking._id as never,
        code: code ?? "",
        name: user?.name ?? t("invite.guestName"),
      });
      setConfirmed(true);
      toast.success(t("invite.confirmedToast"));
    } catch {
      setError(t("invite.errConfirm"));
      toast.error(t("invite.errConfirm"));
    } finally {
      setConfirming(false);
    }
  };

  if (data === undefined) {
    return (
      <CustomerShell>
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-sm">{t("invite.lookingUp")}</p>
        </div>
      </CustomerShell>
    );
  }

  if (!data) {
    return (
      <CustomerShell>
        <div className="flex flex-col items-center gap-3 px-4 py-24 text-center">
          <CalendarCheck2 className="size-10 text-muted-foreground/60" />
          <p className="font-medium">{t("invite.notFound")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("invite.notFoundBody")}
          </p>
          <Button asChild>
            <Link to="/explore">{t("invite.findTable")}</Link>
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
              <img
                src={restaurant.imageUrl}
                alt={restaurant.name}
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
                <Store className="size-10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <p className="text-lg font-bold tracking-tight drop-shadow">
                {restaurant?.name ?? t("invite.aTable")}
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
                <p className="text-lg font-bold tracking-tight">{t("invite.confirmedTitle")}</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  <Trans
                    i18nKey="invite.confirmedBody"
                    values={{ name: restaurant?.name ?? t("invite.aTable") }}
                  />
                </p>
                <Button asChild className="mt-2">
                  <Link to="/bookings">{t("invite.viewBookings")}</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 text-primary" />
                  <p className="text-sm font-semibold">{t("invite.invitedTitle")}</p>
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
                      {t("invite.going", { count: booking.partySize + guests.length })}
                      {booking.sectionName ? ` · ${booking.sectionName}` : ""}
                    </span>
                  </div>
                </div>

                {guests.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {t("invite.alreadyConfirmed")}
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
                  {confirming ? t("invite.confirming") : t("invite.confirmSeat")}
                </Button>
                <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                  <Clock className="size-3" /> {t("invite.liveSeats")}
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </CustomerShell>
  );
}
