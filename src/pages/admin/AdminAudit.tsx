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
import { Badge } from "@/components/ui/badge";
import { Eraser, Loader2 } from "lucide-react";
import { useState } from "react";
import { EmptyNote } from "./AdminUI";
import { toast } from "sonner";

export default function AdminAudit() {
  const entries = useQuery(api.admin.auditLog);
  const clearAuditLog = useMutation(api.admin.clearAuditLog);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await clearAuditLog();
      toast.success(`Audit log cleared (${res.cleared} entries removed).`);
      setConfirmClear(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the audit log.");
      setConfirmClear(false);
    } finally {
      setBusy(false);
    }
  };

  if (entries === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading audit log…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record of admin actions (last 50). Clearing it is itself logged.
          </p>
        </div>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={entries?.length === 0 || busy}
          onClick={() => setConfirmClear(true)}
        >
          <Eraser className="size-4" /> Clear log
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyNote>No admin actions recorded yet.</EmptyNote>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Target</TableHead>
                <TableHead className="hidden sm:table-cell">Details</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e._id}>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[11px]">{e.action}</Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {e.targetUserId ? String(e.targetUserId).slice(0, 12) + "…" : "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground sm:table-cell">
                    {e.details ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmClear} onOpenChange={(open) => !open && !busy && setConfirmClear(false)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Clear the audit log?</AlertDialogTitle>
            <AlertDialogDescription>
              All {entries?.length ?? 0} entries are permanently deleted. A single
              "clearAuditLog" entry is kept so the clearing itself stays on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleClear();
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Clear audit log"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
