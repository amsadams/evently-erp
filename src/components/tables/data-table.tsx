"use client";
import * as React from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui/primitives";

export interface FilterDef<T> { key: string; label: string; options: string[]; get: (row: T) => string }

export function DataTable<T>({
  data, columns, searchPlaceholder = "Search…", filters = [], onRowClick, pageSize = 10, empty, toolbar, csvName, searchText, initialSort,
}: {
  data: T[]; columns: ColumnDef<T, unknown>[]; searchPlaceholder?: string; filters?: FilterDef<T>[]; onRowClick?: (row: T) => void; pageSize?: number;
  empty?: { title: string; description?: string; action?: React.ReactNode }; toolbar?: React.ReactNode; csvName?: string; searchText?: (row: T) => string; initialSort?: SortingState;
}) {
  const [q, setQ] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>(initialSort ?? []);
  const [active, setActive] = React.useState<Record<string, string>>({});

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((r) => {
      for (const f of filters) if (active[f.key] && f.get(r) !== active[f.key]) return false;
      if (!needle) return true;
      const text = searchText ? searchText(r) : JSON.stringify(r);
      return text.toLowerCase().includes(needle);
    });
  }, [data, q, active, filters, searchText]);

  const table = useReactTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(), getFilteredRowModel: getFilteredRowModel(), initialState: { pagination: { pageSize } },
  });
  React.useEffect(() => { table.setPageIndex(0); }, [q, active, table]);

  const activeChips = Object.entries(active).filter(([, v]) => v);
  const exportCsv = () => {
    const cols = columns.filter((c) => (c as { accessorKey?: string; accessorFn?: unknown }).accessorKey || (c as { accessorFn?: unknown }).accessorFn);
    const header = cols.map((c) => String(typeof c.header === "string" ? c.header : (c as { accessorKey?: string }).accessorKey));
    const body = table.getSortedRowModel().rows.map((r) => cols.map((c) => {
      const v = r.getValue((c as { id?: string; accessorKey?: string }).id ?? (c as { accessorKey: string }).accessorKey);
      return `"${String(v ?? "").replace(/"/g, '""')}"`;
    }).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${csvName ?? "export"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const pageCount = table.getPageCount();
  const pi = table.getState().pagination.pageIndex;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search table" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        {filters.map((f) => (
          <Select key={f.key} aria-label={f.label} className="w-auto min-w-[8.5rem]" value={active[f.key] ?? ""} onChange={(e) => setActive((a) => ({ ...a, [f.key]: e.target.value }))}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {csvName && <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" />CSV</Button>}
        </div>
      </div>
      {(activeChips.length > 0 || q) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/60 px-3 py-2 text-xs">
          <span className="text-muted">{rows.length} result{rows.length === 1 ? "" : "s"}</span>
          {activeChips.map(([k, v]) => (
            <button key={k} onClick={() => setActive((a) => ({ ...a, [k]: "" }))} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary">
              {filters.find((f) => f.key === k)?.label}: {v}<X className="h-3 w-3" aria-label="Remove filter" />
            </button>
          ))}
          <button className="text-muted underline" onClick={() => { setQ(""); setActive({}); }}>Clear all</button>
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-canvas/70 text-xs text-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th key={h.id} className="whitespace-nowrap px-3 py-2.5 font-medium" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                      {canSort ? (
                        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : null}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-line">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id} tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick?.(row.original)} onKeyDown={(e) => { if (onRowClick && (e.key === "Enter")) onRowClick(row.original); }}
                className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-canvas/80 focus-visible:bg-canvas")}
              >
                {row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={<Search className="h-5 w-5" />} title={empty?.title ?? "No results"} description={empty?.description ?? "Try changing the search or filters."} action={empty?.action} />}
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
          <span>Showing {pi * pageSize + 1}–{Math.min((pi + 1) * pageSize, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-2">Page {pi + 1} / {pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}
