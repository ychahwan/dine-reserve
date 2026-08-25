import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { MapPin, Hash, Users, CheckCircle, XCircle, Clock, QrCode } from "lucide-react";
import { toast } from "sonner";

interface WalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: Id<"restaurants">;
  restaurantName: string;
}

export function WalkInDialog({ open, onOpenChange, restaurantId, restaurantName }: WalkInDialogProps) {
  const [step, setStep] = useState<"select" | "enter_table" | "pending" | "approved" | "rejected">("select");
  const [tableNumber, setTableNumber] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [name, setName] = useState("");

  const walkInCheckIn = useMutation(api.walkIn.walkInCheckIn);
  const scanTableQR = useMutation(api.walkIn.scanTableQR);
  const myWalkInStatus = useQuery(
    api.walkIn.myWalkInStatus,
    open ? { restaurantId } : "skip"
  );

  // Check if there's already a pending request
  const hasPendingRequest = myWalkInStatus && myWalkInStatus.status === "pending";

  const handleSubmit = async (source: "app_check_in" | "qr_scan") => {
    if (!tableNumber.trim()) {
      toast.error("Please enter a table number");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (partySize < 1 || partySize > 20) {
      toast.error("Party size must be between 1 and 20");
      return;
    }

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
      setStep("pending");
      toast.success("Walk-in request sent! Waiting for host approval.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send walk-in request");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after dialog closes
    setTimeout(() => {
      setStep("select");
      setTableNumber("");
      setPartySize(1);
      setName("");
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Walk-in at {restaurantName}
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "How would you like to check in?"}
            {step === "enter_table" && "Enter your table number to get started"}
            {step === "pending" && "Waiting for host approval..."}
            {step === "approved" && "You're all set! Enjoy your meal."}
            {step === "rejected" && "Your request was not approved."}
          </DialogDescription>
        </DialogHeader>

        {hasPendingRequest && step === "select" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Request Pending</p>
                <p className="text-sm text-yellow-600">
                  You have a pending walk-in request for table {myWalkInStatus.tableNumber}
                </p>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : step === "select" ? (
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
                  <p className="font-medium">Enter Table Number</p>
                  <p className="text-sm text-muted-foreground">
                    Type the number shown on your table
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
                  <p className="font-medium">Scan Table QR Code</p>
                  <p className="text-sm text-muted-foreground">
                    Point your camera at the QR code on the table
                  </p>
                </div>
              </div>
            </button>

            <Button onClick={handleClose} variant="outline" className="w-full">
              Cancel
            </Button>
          </div>
        ) : step === "enter_table" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="walkInName">Your Name</Label>
              <Input
                id="walkInName"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkInTable">Table Number</Label>
              <Input
                id="walkInTable"
                placeholder="e.g., 12, A5, Bar-3"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkInParty">Party Size</Label>
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
                Back
              </Button>
              <Button onClick={() => handleSubmit("app_check_in")} className="flex-1">
                Check In
              </Button>
            </div>
          </div>
        ) : step === "pending" ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Waiting for host approval...</p>
              <p className="text-sm text-muted-foreground mt-1">
                You'll be notified once approved
              </p>
            </div>
            <Button onClick={handleClose} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        ) : step === "approved" ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <p className="text-lg font-medium">You're all set!</p>
              <p className="text-muted-foreground">
                Your booking has been created. You can now order food and split bills.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">
              Start Ordering
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-8">
              <XCircle className="h-16 w-16 text-red-500 mb-4" />
              <p className="text-lg font-medium">Request Not Approved</p>
              <p className="text-muted-foreground">
                The host was unable to approve your walk-in request.
              </p>
            </div>
            <Button onClick={handleClose} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
