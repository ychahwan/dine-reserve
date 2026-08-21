import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { CheckCircle2, MapPin, Printer, QrCode, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { dateLabel, formatDate, formatTime } from "@/lib/format";

/**
 * Booking receipt (Idea #6) — a professional, printable confirmation with a
 * QR code that encodes the public invite/confirmation URL. Business diners
 * can print or save it, and the code scans to the booking's public page.
 */

type ReceiptBooking = {
  _id: string;
  date: string;
  time: string;
  partySize: number;
  code: string;
  sectionName?: string;
  name?: string;
  status?: string;
  restaurant?: {
    _id: string;
    name?: string;
    address?: string;
    city?: string;
    imageUrl?: string;
  } | null;
};

async function qrDataUrl(text: string): Promise<string> {
  const mod = await import("qrcode");
  return mod.default.toDataURL(text, { width: 220, margin: 1, errorCorrectionLevel: "M" });
}

export function BookingReceiptDialog({
  booking,
  onOpenChange,
}: {
  booking: ReceiptBooking | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    setQr(null);
    setQrError(false);
    if (!booking) return;
    const url = `${window.location.origin}/invite/${booking.code}`;
    let cancelled = false;
    qrDataUrl(url)
      .then((d) => {
        if (!cancelled) setQr(d);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [booking?._id, booking?.code]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md print:max-w-full print:border-0 print:shadow-none">
        {booking && (
          <>
            <DialogHeader className="print:hidden">
              <DialogTitle className="flex items-center gap-2 tracking-tight">
                <QrCode className="size-5 text-primary" /> Booking receipt
              </DialogTitle>
              <DialogDescription>
                Show this at the door, or print/save it for your records.
              </DialogDescription>
            </DialogHeader>

            {/* Printable receipt body */}
            <div className="rounded-2xl border border-border/70 p-5 print:border-0 print:p-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold tracking-tight">
                    {booking.restaurant?.name ?? "Restaurant"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {booking.restaurant?.address ?? ""}
                    {booking.restaurant?.city ? `, ${booking.restaurant.city}` : ""}
                  </p>
                </div>
                <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Confirmed
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Date</p>
                  <p className="mt-0.5 text-sm font-semibold">{dateLabel(booking.date)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(booking.date)}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Time</p>
                  <p className="mt-0.5 text-sm font-semibold">{formatTime(booking.time)}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Party</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                    <Users className="size-3.5" /> {booking.partySize}{" "}
                    {booking.partySize === 1 ? "guest" : "guests"}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Table</p>
                  <p className="mt-0.5 text-sm font-semibold">{booking.sectionName ?? "Best available"}</p>
                </div>
              </div>

              {/* QR + code */}
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                  {qr ? (
                    <img src={qr} alt="Booking QR code" className="size-full object-contain" />
                  ) : qrError ? (
                    <span className="flex size-full items-center justify-center text-2xl">🍽️</span>
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <QrCode className="size-8" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Confirmation code
                  </p>
                  <p className="font-mono text-2xl font-bold tracking-widest text-primary">
                    {booking.code}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Scan the QR or show the code at the door.
                  </p>
                </div>
              </div>

              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Booked via Kamix · {booking.name ? `Guest: ${booking.name}` : ""}
              </p>
            </div>

            <div className="print:hidden">
              <Button className="w-full gap-2" onClick={handlePrint}>
                <Printer className="size-4" /> Print receipt
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
