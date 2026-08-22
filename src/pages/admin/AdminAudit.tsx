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
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eraser, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { EmptyNote, SortableHead, TablePaginationBar } from "./AdminUI";
import {
  useTablePagination,
  useSort,
  sortItems,
} from "@/lib/use-table-pagination";
import type { SortDirection } from "@/lib/use-table-pagination";

type AuditEntry = NonNullable<ReturnType<typeof useQuery<typeof api.admin.auditLog>>>[number];

import { api } from "@/convex/_generated/api";

type SortKey = "action" | "target" | "details" | "when";

function extractValue(row: AuditEntry, key: SortKey): string | number {
  switch (key) {
    case "action": return row.action;
    case "target": return row.targetUserId ? String(row.targetUserId) : "";
    case "details": return row.details ?? "";
    case "when": return row.createdAt;
  }
}

export default function AdminAudit() {
  const entries = useQuery(api.admin.auditLog);
  const clearAuditLog = useMutation(api.admin.clearAuditLog);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const { sort, toggleSort } = useSort<SortKey>({ key: "when", direction: "desc" });

  const sorted = useMemo(
    () => sortItems(entries ?? [], sort.key, sort.direction, extractValue),
    [entries, sort.key, sort.direction],
  );

  const { pageItems, page, setPage, totalPages, totalItems } = useTablePagination({
    items: sorted,
    sortKey: sort.key,
    sortDirection: sort.direction,
    pageSize: 25,
  });

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
            Record of admin actions ({entries.length} total). Clearing it is itself logged.
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
        <>
          <div className="rounded-2xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Action" sortKey="action" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                  <SortableHead label="Target" sortKey="target" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden md:table-cell" />
                  <SortableHead label="Details" sortKey="details" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                  <SortableHead label="When" sortKey="when" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((e) => (
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
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            showingCount={pageItems.length}
            onPageChange={setPage}
          />
        </>
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
