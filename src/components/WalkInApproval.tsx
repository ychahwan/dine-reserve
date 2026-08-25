import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { CheckCircle, XCircle, Clock, Users, MapPin, Hash } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface WalkInApprovalProps {
  restaurantId: Id<"restaurants">;
}

export function WalkInApproval({ restaurantId }: WalkInApprovalProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<Id<"walkInRequests"> | null>(null);

  const pendingWalkIns = useQuery(api.walkIn.pendingWalkIns, { restaurantId });
  const approveWalkIn = useMutation(api.walkIn.approveWalkIn);
  const rejectWalkIn = useMutation(api.walkIn.rejectWalkIn);

  const handleApprove = async (requestId: Id<"walkInRequests">) => {
    try {
      const result = await approveWalkIn({ requestId });
      toast.success(`Walk-in approved! Booking code: ${result.code}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to approve walk-in");
    }
  };

  const handleReject = async () => {
    if (!selectedRequestId) return;

    try {
      await rejectWalkIn({
        requestId: selectedRequestId,
        reason: rejectReason || undefined,
      });
      toast.success("Walk-in request rejected");
      setRejectDialogOpen(false);
      setRejectReason("");
      setSelectedRequestId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to reject walk-in");
    }
  };

  const openRejectDialog = (requestId: Id<"walkInRequests">) => {
    setSelectedRequestId(requestId);
    setRejectDialogOpen(true);
  };

  if (!pendingWalkIns) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading walk-in requests...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Walk-in Requests
        </h3>
        <Badge variant="secondary">
          {pendingWalkIns.length} pending
        </Badge>
      </div>

      {pendingWalkIns.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-muted-foreground">No pending walk-in requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingWalkIns.map((request) => (
            <Card key={request._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{request.userName || request.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {request.source === "qr_scan" ? "QR Scan" : "App Check-in"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="h-4 w-4" />
                        Table {request.tableNumber}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        Party of {request.partySize}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatDistanceToNow(request.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(request._id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openRejectDialog(request._id)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Walk-in Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason (optional)</Label>
              <Input
                id="rejectReason"
                placeholder="e.g., Restaurant is full, Table not available"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setRejectDialogOpen(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                variant="destructive"
                className="flex-1"
              >
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
