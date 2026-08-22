import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/use-table-pagination";

export function roleBadge(role?: string) {
  switch (role) {
    case "admin":
      return <Badge variant="destructive">Admin</Badge>;
    case "owner":
      return <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">Owner</Badge>;
    case "customer":
      return <Badge variant="secondary">Diner</Badge>;
    default:
      return <Badge variant="outline">{role ?? "—"}</Badge>;
  }
}

export function bookingStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: { label: "Confirmed", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
    completed: { label: "Completed", cls: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
    no_show: { label: "No-show", cls: "bg-rose-600/10 text-rose-700 dark:text-rose-400" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge className={m.cls}>{m.label}</Badge>;
}

export function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
    preparing: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
    served: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
    completed: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <Badge className={map[status] ?? "bg-muted text-muted-foreground"}>{status}</Badge>;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="rounded-2xl border-border/70 p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={cn("mt-1.5 text-2xl font-bold tracking-tight", accent)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-3.5", i <= Math.round(rating) ? "fill-current text-amber-500" : "text-muted-foreground/25")}
        />
      ))}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold tracking-tight">{children}</h2>;
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/* ─── Sortable column header ──────────────────────────────────────────── */

export function SortableHead<T extends string>({
  label,
  sortKey,
  activeSortKey,
  direction,
  onToggle,
  className,
}: {
  label: string;
  sortKey: T;
  activeSortKey: T;
  direction: SortDirection;
  onToggle: (key: T) => void;
  className?: string;
}) {
  const active = sortKey === activeSortKey;
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-foreground", className)}
      onClick={() => onToggle(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3 text-primary" />
          ) : (
            <ArrowDown className="size-3 text-primary" />
          )
        ) : null}
      </span>
    </TableHead>
  );
}

/* ─── Pagination bar ─────────────────────────────────────────────────── */

export function TablePaginationBar({
  page,
  totalPages,
  totalItems,
  showingCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  showingCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <p className="text-xs text-muted-foreground">
        Page {page + 1} of {totalPages} · {showingCount} of {totalItems} rows
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page === 0}
          onClick={() => onPageChange(0)}
          aria-label="First page"
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
          aria-label="Last page"
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
