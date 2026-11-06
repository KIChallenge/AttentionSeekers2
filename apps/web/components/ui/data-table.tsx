"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  PlusSignCircleIcon,
  Search01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Column, ColumnDef, Table as TableInstance } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/*
 * Data table primitives after the shadcn/ui data-table example (TanStack Table v8):
 * the page owns `useReactTable`, these components render toolbar, header and body.
 */

export type { ColumnDef };

/** Search input, faceted filters and a reset button in one row above the table. */
export function DataTableToolbar<TData>({
  table,
  search,
  children,
  resetLabel,
  className,
}: {
  table: TableInstance<TData>;
  /** Column id of the text search and its placeholder. */
  search?: { column: string; placeholder: string; label: string };
  children?: ReactNode;
  resetLabel: string;
  className?: string;
}) {
  const filtered = table.getState().columnFilters.length > 0;
  const col = search ? table.getColumn(search.column) : undefined;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {col ? (
        <InputGroup className="h-8 w-full sm:w-64">
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={search?.label}
            placeholder={search?.placeholder}
            value={(col.getFilterValue() as string) ?? ""}
            onChange={(e) => col.setFilterValue(e.target.value)}
          />
        </InputGroup>
      ) : null}
      {children}
      {filtered ? (
        <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
          {resetLabel}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
}

/** Multi-select filter on one column, as a dashed outline button with a popover list. */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  searchPlaceholder,
  noResults,
  clearLabel,
  selectedLabel,
}: {
  column?: Column<TData, TValue>;
  title: string;
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  searchPlaceholder?: string;
  noResults: string;
  clearLabel: string;
  selectedLabel: (n: number) => string;
}) {
  if (!column) return null;
  const facets = column.getFacetedUniqueValues();
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <HugeiconsIcon icon={PlusSignCircleIcon} data-icon="inline-start" />
          {title}
          {selected.size > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selected.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selected.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedLabel(selected.size)}
                  </Badge>
                ) : (
                  options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge
                        key={o.value}
                        variant="secondary"
                        className="rounded-sm px-1 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {options.length > 6 ? <CommandInput placeholder={searchPlaceholder ?? title} /> : null}
          <CommandList>
            <CommandEmpty>{noResults}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = selected.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (on) next.delete(o.value);
                      else next.add(o.value);
                      const arr = [...next];
                      column.setFilterValue(arr.length ? arr : undefined);
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border border-foreground/40",
                        on ? "bg-foreground text-background" : "[&_svg]:invisible",
                      )}
                    >
                      <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={3} />
                    </span>
                    {o.icon}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {facets.get(o.value) ? (
                      <span className="num ml-auto text-xs text-muted-foreground">
                        {facets.get(o.value)}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    {clearLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Column header that toggles sorting when the column is sortable. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: ReactNode;
  className?: string;
}) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>;
  const dir = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(dir === "asc")}
      className={cn(
        "-ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
        dir && "text-foreground",
        className,
      )}
    >
      {title}
      <HugeiconsIcon
        icon={dir === "desc" ? ArrowDown01Icon : dir === "asc" ? ArrowUp01Icon : UnfoldMoreIcon}
        className="size-3.5"
      />
    </button>
  );
}

/** The table itself: header, rows, caption and empty row; the page passes the instance. */
export function DataTableBody<TData>({
  table,
  caption,
  empty,
  rowProps,
  className,
}: {
  table: TableInstance<TData>;
  caption?: ReactNode;
  empty: ReactNode;
  rowProps?: (row: TData) => Record<string, string | undefined>;
  className?: string;
}) {
  const columns = table.getAllColumns().length;
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", className)}>
      <Table>
        {caption ? <TableCaption className="mt-0 border-t py-3 text-xs">{caption}</TableCaption> : null}
        <TableHeader className="bg-muted/60 [&_tr]:hover:bg-transparent">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead
                  key={h.id}
                  className="h-10 text-xs font-medium text-muted-foreground"
                  style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}
                >
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} {...rowProps?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns} className="h-32 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
