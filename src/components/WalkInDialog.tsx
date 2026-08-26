import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { MapPin, Hash, CheckCircle, XCircle, Clock, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Cross-agent contract: the backend exposes the caller's latest walk-in
// request for this restaurant in ANY status (or null), unlike the legacy
// pending-only query.
const walkInApi = api.walkIn as typeof api.walkIn & {
  myLatestWalkIn: FunctionReference<"query">;
};

type LatestWalkIn = {
  _id: string;
  status: "pending" | "approved" | "rejected";
  tableNumber?: string;
} | null;

interface WalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: Id<"restaurants">;
  restaurantName: string;
}

export function WalkInDialog({ open, onOpenChange, restaurantId, restaurantName }: WalkInDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"select" | "enter_table">("select");
  const [tableNumber, setTableNumber] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Terminal requests the diner has already seen are acknowledged so the
  // dialog can offer a fresh attempt instead of re-showing the old verdict.
  const [ackedId, setAckedId] = useState<string | null>(null);

  const walkInCheckIn = useMutation(api.walkIn.walkInCheckIn);
  const scanTableQR = useMutation(api.walkIn.scanTableQR);
  const latestRaw = useQuery(
    walkInApi.myLatestWalkIn,
    open ? { restaurantId } : "skip"
  ) as LatestWalkIn | undefined;

  const latest = latestRaw && latestRaw._id === ackedId ? null : latestRaw;
  const serverScreen = latest?.status ?? null;

  // Success/failure feedback is driven by the request's own terminal state,
  // never by local timeouts.
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !latestRaw) return;
    if (
      (latestRaw.status === "approved" || latestRaw.status === "rejected") &&
      prevStatusRef.current !== latestRaw.status
    ) {
      setJustSubmitted(false);
      toast.success(
        latestRaw.status === "approved"
          ? t("walkin.approvedToast")
          : t("walkin.rejectedToast"),
      );
    }
    prevStatusRef.current = latestRaw.status ?? null;
  }, [latestRaw, open, t]);

  // L-26: the deferred form reset must not fire after unmount.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const resetForm = () => {
    setStep("select");
    setTableNumber("");
    setPartySize(1);
    setName("");
  };

  const handleClose = () => {
    onOpenChange(false);
    if (latest && (latest.status === "approved" || latest.status === "rejected")) {
      setAckedId(latest._id);
    }
    setJustSubmitted(false);
    setSubmitting(false);
    resetTimer.current = setTimeout(resetForm, 200);
  };

  const handleSubmit = async (source: "app_check_in" | "qr_scan") => {
    if (!tableNumber.trim()) {
      toast.error(t("walkin.errTableNumber"));
      return;
    }
    if (!name.trim()) {
      toast.error(t("walkin.errName"));
      return;
    }
    if (partySize < 1 || partySize > 20) {
      toast.error(t("walkin.errPartySize"));
      return;
    }

    setSubmitting(true);
    try {
      if (source === "qr_scan") {
        await scanTableQR({
          restaurantId,
          tableNumber: tableNumber.trim(),
          partySize,
          name: name.trim(),
        });
      } else {
        await walkInCheckIn({
          restaurantId,
          tableNumber: tableNumber.trim(),
          partySize,
          name: name.trim(),
        });
      }
      setJustSubmitted(true);
      toast.success(t("walkin.sentToast"));
    } catch (error: any) {
      toast.error(error.message || t("walkin.errSubmit"));
    } finally {
      setSubmitting(false);
    }
  };

  // Screen resolution: the server's record wins (pending/approved/rejected);
  // right after submit we keep showing the waiting screen until it syncs;
  // otherwise the local select/enter-table flow drives.
  const screen =
    serverScreen ?? (justSubmitted ? "pending" : step === "enter_table" ? "enter_table" : "select");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t("walkin.title", { name: restaurantName })}
          </DialogTitle>
          <DialogDescription>
            {screen === "select" && t("walkin.howCheckIn")}
            {screen === "enter_table" && t("walkin.enterTableDesc")}
            {screen === "pending" && t("walkin.waitingDesc")}
            {screen === "approved" && t("walkin.approvedDesc")}
            {screen === "rejected" && t("walkin.rejectedDesc")}
          </DialogDescription>
        </DialogHeader>

        {screen === "pending" ? (
          <div className="space-y-4">
            {latest?.status === "pending" && latest.tableNumber ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800">{t("walkin.requestPending")}</p>
                    <p className="text-sm text-yellow-600">
                      {t("walkin.pendingTable", { table: latest.tableNumber })}
                    </p>
                  </div>
                </div>
                <Button onClick={handleClose} variant="outline" className="w-full">
                  {t("common.close")}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col items-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                  <p className="text-muted-foreground">{t("walkin.waitingDesc")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("walkin.waitingHint")}
                  </p>
                </div>
                <Button onClick={handleClose} variant="outline" className="w-full">
                  {t("common.close")}
                </Button>
              </div>
            )}
          </div>
        ) : screen === "approved" ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <p className="text-lg font-medium">{t("walkin.approvedTitle")}</p>
              <p className="text-muted-foreground text-center">
                {t("walkin.approvedBody")}
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">
              {t("walkin.startOrdering")}
            </Button>
          </div>
        ) : screen === "rejected" ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8">
              <XCircle className="h-16 w-16 text-red-500 mb-4" />
              <p className="text-lg font-medium">{t("walkin.rejectedTitle")}</p>
              <p className="text-muted-foreground text-center">
                {t("walkin.rejectedBody")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1"
              >
                {t("common.close")}
              </Button>
              <Button
                onClick={() => {
                  if (latest) setAckedId(latest._id);
                  setJustSubmitted(false);
                  resetForm();
                }}
                className="flex-1"
              >
                {t("walkin.tryAgain")}
              </Button>
            </div>
          </div>
        ) : screen === "enter_table" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="walkInName">{t("walkin.yourName")}</Label>
              <Input
                id="walkInName"
                placeholder={t("walkin.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkInTable">{t("walkin.tableNumber")}</Label>
              <Input
                id="walkInTable"
                placeholder={t("walkin.tablePlaceholder")}
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkInParty">{t("walkin.partySize")}</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  disabled={partySize <= 1}
                >
                  -
                </Button>
                <span className="text-lg font-medium w-8 text-center">{partySize}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPartySize(Math.min(20, partySize + 1))}
                  disabled={partySize >= 20}
                >
                  +
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep("select")} variant="outline" className="flex-1">
                {t("common.back")}
              </Button>
              <Button
                onClick={() => handleSubmit("app_check_in")}
                className="flex-1"
                disabled={submitting}
              >
                {t("walkin.checkInButton")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Option A: Enter table number */}
            <button
              onClick={() => setStep("enter_table")}
              className="w-full p-4 text-left border rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Hash className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{t("walkin.enterTableOption")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("walkin.enterTableHint")}
                  </p>
                </div>
              </div>
            </button>

            {/* Option B: Scan QR (placeholder - would use camera) */}
            <button
              onClick={() => setStep("enter_table")} // For now, same as entering table #
              className="w-full p-4 text-left border rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{t("walkin.scanQROption")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("walkin.scanQRHint")}
                  </p>
                </div>
              </div>
            </button>

            <Button onClick={handleClose} variant="outline" className="w-full">
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
