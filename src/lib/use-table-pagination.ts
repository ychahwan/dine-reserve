import { useEffect, useMemo, useRef, useState } from "react";

export type SortDirection = "asc" | "desc";

export type SortState<T extends string> = {
  key: T;
  direction: SortDirection;
};

export function useTablePagination<TItem, TSortKey extends string>(options: {
  items: TItem[];
  sortKey: TSortKey;
  sortDirection: SortDirection;
  pageSize?: number;
  initialPage?: number;
  /** Extra reset trigger (e.g. serialized filter state). Changing it goes back to page 0. */
  resetKey?: string;
}) {
  const { items, sortKey, sortDirection, pageSize = 20, initialPage = 0, resetKey } = options;
  const [page, setPage] = useState(initialPage);

  // M-31: a stale page index after filtering/sorting shows clamped wrong rows —
  // go back to the first page whenever the data shape or filters change.
  const shapeKey = `${resetKey ?? ""}|${items.length}|${sortKey}|${sortDirection}`;
  const lastShapeKeyRef = useRef(shapeKey);
  useEffect(() => {
    if (lastShapeKeyRef.current !== shapeKey) {
      lastShapeKeyRef.current = shapeKey;
      setPage(initialPage);
    }
  }, [shapeKey, initialPage]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(() => {
    const start = safePage * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    pageItems,
    page: safePage,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    hasNext: safePage < totalPages - 1,
    hasPrev: safePage > 0,
  };
}

export function useSort<T extends string>(initial: SortState<T>) {
  const [sort, setSort] = useState<SortState<T>>(initial);

  const toggleSort = (key: T) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  return { sort, toggleSort, setSort };
}

export function sortItems<TItem, TSortKey extends string>(
  items: TItem[],
  sortKey: TSortKey,
  sortDirection: SortDirection,
  extractValue: (item: TItem, key: TSortKey) => string | number,
): TItem[] {
  const sorted = [...items].sort((a, b) => {
    const aVal = extractValue(a, sortKey);
    const bVal = extractValue(b, sortKey);

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    const cmp = aStr.localeCompare(bStr);
    return sortDirection === "asc" ? cmp : -cmp;
  });

  return sorted;
}
