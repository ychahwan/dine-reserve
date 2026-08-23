import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Download, Eraser, Loader2, Trash2 } from "lucide-react";
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

/** Export rows to a CSV file and trigger download. */
function exportToCsv(entries: AuditEntry[]) {
  const headers = ["Action", "Target User ID", "Details", "Timestamp"];
  const rows = entries.map((e) => [
    e.action,
    e.targetUserId ?? "",
    e.details ?? "",
    new Date(e.createdAt).toISOString(),
  ]);
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminAudit() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const entries = useQuery(api.admin.auditLog, {
    search: search || undefined,
    action: actionFilter || undefined,
  });
  const clearAuditLog = useMutation(api.admin.clearAuditLog);
  const deleteEntries = useMutation(api.admin.deleteAuditEntries);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { sort, toggleSort } = useSort<SortKey>({ key: "when", direction: "desc" });

  // Get unique action values for the filter dropdown
  const allEntries = useQuery(api.admin.auditLog, {});
  const actionOptions = useMemo(() => {
    if (!allEntries) return [];
    const actions = new Set(allEntries.map((e) => e.action));
    return Array.from(actions).sort();
  }, [allEntries]);

  // Client-side date range filter
  const dateFiltered = useMemo(() => {
    let list = entries ?? [];
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00").getTime();
      list = list.filter((e) => e.createdAt >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      list = list.filter((e) => e.createdAt <= to);
    }
    return list;
  }, [entries, dateFrom, dateTo]);

  const sorted = useMemo(
    () => sortItems(dateFiltered, sort.key, sort.direction, extractValue),
    [dateFiltered, sort.key, sort.direction],
  );

  const { pageItems, page, setPage, totalPages, totalItems } = useTablePagination({
    items: sorted,
    sortKey: sort.key,
    sortDirection: sort.direction,
    pageSize: 25,
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === pageItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pageItems.map((e) => e._id)));
    }
  };

  const handleBulkDelete = async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      const res = await deleteEntries({ ids: Array.from(selected) as never[] });
      toast.success(`${res.deleted} entries deleted.`);
      setSelected(new Set());
      setConfirmDelete(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete entries.");
    } finally {
      setBusy(false);
    }
  };

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

  const handleExport = () => {
    const toExport = selected.size > 0
      ? sorted.filter((e) => selected.has(e._id))
      : sorted;
    exportToCsv(toExport);
    toast.success(`Exported ${toExport.length} entries to CSV.`);
  };

  if (entries === undefined || allEntries === undefined) {
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
            {entries.length} entries{search || actionFilter || dateFrom || dateTo ? ` (${dateFiltered.length} shown)` : ""}. Clearing it is itself logged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> Delete ({selected.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} disabled={entries.length === 0}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={entries?.length === 0 || busy}
            onClick={() => setConfirmClear(true)}
          >
            <Eraser className="size-4" /> Clear log
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search action, details, or target…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:max-w-xs rounded-full text-sm"
        />
        <Select value={actionFilter} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-full sm:w-auto rounded-full text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionOptions.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground" />
        <span className="text-xs text-muted-foreground">To</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground" />
        {(search || actionFilter || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => { setSearch(""); setActionFilter(""); setDateFrom(""); setDateTo(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {entries.length === 0 && !search && !actionFilter && !dateFrom && !dateTo ? (
        <EmptyNote>No admin actions recorded yet.</EmptyNote>
      ) : pageItems.length === 0 ? (
        <EmptyNote>No entries match your filters.</EmptyNote>
      ) : (
        <>
          <div className="rounded-2xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.size === pageItems.length && pageItems.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableCell>
                  <SortableHead label="Action" sortKey="action" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                  <SortableHead label="Target" sortKey="target" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden md:table-cell" />
                  <SortableHead label="Details" sortKey="details" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} className="hidden sm:table-cell" />
                  <SortableHead label="When" sortKey="when" activeSortKey={sort.key} direction={sort.direction} onToggle={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((e) => (
                  <TableRow key={e._id} className={selected.has(e._id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(e._id)}
                        onCheckedChange={() => toggleSelect(e._id)}
                        aria-label={`Select ${e.action}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">{e.action}</Badge>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {e.targetUserId ? String(e.targetUserId).slice(0, 12) + "…" : "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground sm:table-cell">
                      {e.details ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={(open) => !open && !busy && setConfirmDelete(false)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Delete {selected.size} entries?</AlertDialogTitle>
            <AlertDialogDescription>
              These entries will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void handleBulkDelete(); }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear all confirmation */}
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
              onClick={(e) => { e.preventDefault(); void handleClear(); }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Clear audit log"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
