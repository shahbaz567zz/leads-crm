"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import {
  normalizeDynamicLeadFieldLabels,
  type DynamicLeadFieldLabels,
} from "@/lib/lead-field-labels";
import { normalizeIndianPhone } from "@/lib/utils";

type LeadRow = {
  id: string;
  leadNumber?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  courseInterest?: string | null;
  dynamicField1?: string | null;
  dynamicField2?: string | null;
  dynamicField3?: string | null;
  status: LeadStatusValue;
  priority: LeadPriorityValue;
  nextFollowUpAt?: Date | string | null;
  createdAt?: Date | string | null;
  campaignName?: string | null;
  source?: string | null;
  jeeRankRange?: string | null;
  twelfthLocation?: string | null;
  assignedTo?: {
    id: string;
    name: string;
  } | null;
  _count: {
    activities: number;
  };
};

export interface DataTableProps {
  data: LeadRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  sorting?: {
    sortBy: string;
    sortDirection: "asc" | "desc";
  } | null;
  telecallers: { id: string; name: string }[];
  managerMode: boolean;
  adminMode: boolean;
  dynamicFieldLabels: DynamicLeadFieldLabels;
  initialColumnVisibilityPreference?: string | null;
  currentFilters: {
    q?: string;
    status?: LeadStatusValue;
    priority?: LeadPriorityValue;
    assigned?: string;
    due?: "all" | "today" | "overdue";
    sla?:
      | "overdue_open"
      | "due_today_open"
      | "high_priority_uncontacted"
      | "stale_30m"
      | "stale_2h";
  };
}

export type DataTableHandle = {
  openColumnPicker: () => void;
};

type ColumnPreferenceOption = {
  id: string;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
};

const COLUMN_VISIBILITY_COOKIE = "lead-table-columns";

const COLUMN_PREFERENCE_OPTIONS: ColumnPreferenceOption[] = [
  { id: "leadNumber", label: "Lead No.", defaultVisible: true },
  { id: "name", label: "Lead Info", defaultVisible: true, alwaysVisible: true },
  { id: "email", label: "Email", defaultVisible: false },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "priority", label: "Priority", defaultVisible: true },
  { id: "jeeRankRange", label: "Rank", defaultVisible: true },
  { id: "twelfthLocation", label: "Domicile", defaultVisible: true },
  { id: "courseInterest", label: "Course Interest", defaultVisible: false },
  { id: "dynamicField1", label: "Dynamic 1", defaultVisible: false },
  { id: "dynamicField2", label: "Dynamic 2", defaultVisible: false },
  { id: "dynamicField3", label: "Dynamic 3", defaultVisible: false },
  { id: "assignedTo", label: "Assigned To", defaultVisible: true },
  { id: "createdAt", label: "Created", defaultVisible: true },
  { id: "nextFollowUpAt", label: "Follow-up", defaultVisible: true },
  { id: "campaignName", label: "Campaign", defaultVisible: true },
  { id: "actions", label: "Actions", defaultVisible: false },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function getColumnPreferenceOptions(
  dynamicFieldLabels: DynamicLeadFieldLabels,
) {
  return COLUMN_PREFERENCE_OPTIONS.map((option) => {
    if (option.id === "dynamicField1") {
      return { ...option, label: dynamicFieldLabels.dynamicField1 };
    }

    if (option.id === "dynamicField2") {
      return { ...option, label: dynamicFieldLabels.dynamicField2 };
    }

    if (option.id === "dynamicField3") {
      return { ...option, label: dynamicFieldLabels.dynamicField3 };
    }

    return option;
  });
}

function buildDefaultColumnVisibility(): VisibilityState {
  return COLUMN_PREFERENCE_OPTIONS.reduce<VisibilityState>(
    (accumulator, option) => {
      accumulator[option.id] =
        option.defaultVisible || Boolean(option.alwaysVisible);
      return accumulator;
    },
    {},
  );
}

function normalizeColumnVisibilityPreference(
  rawPreference: unknown,
): VisibilityState {
  const defaults = buildDefaultColumnVisibility();

  if (
    !rawPreference ||
    typeof rawPreference !== "object" ||
    Array.isArray(rawPreference)
  ) {
    return defaults;
  }

  const storedPreference = rawPreference as Record<string, unknown>;

  return COLUMN_PREFERENCE_OPTIONS.reduce<VisibilityState>(
    (accumulator, option) => {
      const storedValue = storedPreference[option.id];

      accumulator[option.id] = option.alwaysVisible
        ? true
        : typeof storedValue === "boolean"
          ? storedValue
          : option.defaultVisible;

      return accumulator;
    },
    {},
  );
}

function parseInitialColumnVisibilityPreference(preference?: string | null) {
  if (!preference) {
    return buildDefaultColumnVisibility();
  }

  try {
    return normalizeColumnVisibilityPreference(
      JSON.parse(decodeURIComponent(preference)),
    );
  } catch {
    return buildDefaultColumnVisibility();
  }
}

function toDateTimeLocal(date?: Date | string | null) {
  if (!date) {
    return "";
  }

  return format(new Date(date), "yyyy-MM-dd'T'HH:mm");
}

function relativeTime(date?: Date | string | null) {
  if (!date) return null;
  const target = new Date(date);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const label = formatDistanceToNow(target, { addSuffix: true });
  return { label, isFuture: diffMs > 0 };
}

function leadAgeDays(createdAt?: Date | string | null) {
  if (!createdAt) return 0;
  return Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function copyPhone(phone: string) {
  navigator.clipboard.writeText(phone).then(
    () => toast.success("Phone number copied!"),
    () => toast.error("Failed to copy"),
  );
}

export const DataTable = forwardRef<DataTableHandle, DataTableProps>(
  function DataTable(
    {
      data: initialData,
      pagination,
      sorting: activeSorting,
      telecallers,
      managerMode,
      adminMode,
      dynamicFieldLabels,
      initialColumnVisibilityPreference,
      currentFilters,
    }: DataTableProps,
    ref,
  ) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const resolvedDynamicFieldLabels = useMemo(
      () => normalizeDynamicLeadFieldLabels(dynamicFieldLabels),
      [dynamicFieldLabels],
    );
    const columnPreferenceOptions = useMemo(
      () => getColumnPreferenceOptions(resolvedDynamicFieldLabels),
      [resolvedDynamicFieldLabels],
    );
    const [data, setData] = useState<LeadRow[]>(initialData);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
      () =>
        parseInitialColumnVisibilityPreference(
          initialColumnVisibilityPreference,
        ),
    );
    const [bulkPendingAction, setBulkPendingAction] = useState<string | null>(
      null,
    );
    const [bulkTelecallerId, setBulkTelecallerId] = useState("");
    const [columnPickerOpen, setColumnPickerOpen] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        openColumnPicker: () => setColumnPickerOpen(true),
      }),
      [],
    );

    useEffect(() => {
      setData(initialData);
      setRowSelection({});
    }, [initialData]);

    useEffect(() => {
      if (!bulkTelecallerId && telecallers.length) {
        setBulkTelecallerId(telecallers[0].id);
      }
    }, [bulkTelecallerId, telecallers]);

    useEffect(() => {
      const serializedPreference = encodeURIComponent(
        JSON.stringify(normalizeColumnVisibilityPreference(columnVisibility)),
      );

      localStorage.setItem(COLUMN_VISIBILITY_COOKIE, serializedPreference);
      document.cookie = `${COLUMN_VISIBILITY_COOKIE}=${serializedPreference}; path=/; max-age=31536000; samesite=lax`;
    }, [columnVisibility]);

    const updateLead = useCallback(
      async (
        leadId: string,
        patchObj: Partial<{
          status: LeadStatusValue;
          priority: LeadPriorityValue;
          nextFollowUpAt: string | null;
          assignedToId: string | null;
        }>,
      ) => {
        const updatingToast = toast.loading("Updating lead...");

        try {
          const res = await fetch(`/api/leads/${leadId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchObj),
          });

          const body = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(body.error ?? "Failed to update lead");
          }

          toast.success("Lead updated successfully", { id: updatingToast });
          setData((old) =>
            old.map((row) => {
              if (row.id !== leadId) {
                return row;
              }

              const merged = {
                ...row,
                ...patchObj,
              } as LeadRow;

              if (patchObj.assignedToId !== undefined) {
                merged.assignedTo =
                  patchObj.assignedToId === null
                    ? null
                    : (telecallers.find(
                        (t) => t.id === patchObj.assignedToId,
                      ) ?? null);
              }

              if (patchObj.nextFollowUpAt !== undefined) {
                merged.nextFollowUpAt = patchObj.nextFollowUpAt;
              }

              return merged;
            }),
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Error updating lead",
            { id: updatingToast },
          );
        }
      },
      [telecallers],
    );

    const runBulkDelete = useCallback(
      async (mode: "selected" | "filtered", ids?: string[]) => {
        setBulkPendingAction(`delete-${mode}`);

        try {
          const response = await fetch("/api/leads", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              mode === "selected"
                ? { mode, ids }
                : { mode, filters: currentFilters },
            ),
          });
          const body = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(body.error ?? "Unable to delete leads.");
          }

          setRowSelection({});
          toast.success(`Deleted ${body.deletedCount ?? 0} lead(s).`);
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Unable to delete leads.",
          );
        } finally {
          setBulkPendingAction(null);
        }
      },
      [currentFilters, router],
    );

    const runBulkAssign = useCallback(
      async (mode: "selected" | "filtered", ids?: string[]) => {
        if (!bulkTelecallerId) {
          toast.error("Select a telecaller first.");
          return;
        }

        setBulkPendingAction(`assign-${mode}`);

        try {
          const response = await fetch("/api/leads/bulk-assign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              mode === "selected"
                ? { mode, ids, telecallerId: bulkTelecallerId }
                : {
                    mode,
                    filters: currentFilters,
                    telecallerId: bulkTelecallerId,
                  },
            ),
          });
          const body = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(body.error ?? "Unable to assign leads.");
          }

          setRowSelection({});
          toast.success(`Assigned ${body.assignedCount ?? 0} lead(s).`);
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Unable to assign leads.",
          );
        } finally {
          setBulkPendingAction(null);
        }
      },
      [bulkTelecallerId, currentFilters, router],
    );

    const fetchFilteredPreview = useCallback(
      async (telecallerId?: string) => {
        const response = await fetch("/api/leads/filtered-count", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: currentFilters,
            telecallerId,
          }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            body.error ?? "Unable to preview filtered lead count.",
          );
        }

        return {
          matchedCount: Number(body.matchedCount ?? 0),
          assignableCount: Number(
            body.assignableCount ?? body.matchedCount ?? 0,
          ),
        };
      },
      [currentFilters],
    );

    const sortingState = useMemo<SortingState>(
      () =>
        activeSorting
          ? [
              {
                id: activeSorting.sortBy,
                desc: activeSorting.sortDirection === "desc",
              },
            ]
          : [],
      [activeSorting],
    );

    const updatePagination = useCallback(
      (nextPage: number, nextPageSize = pagination.pageSize) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        const page = Math.min(
          Math.max(1, nextPage),
          Math.max(1, pagination.totalPages),
        );

        if (page <= 1) {
          params.delete("page");
        } else {
          params.set("page", String(page));
        }

        if (nextPageSize === PAGE_SIZE_OPTIONS[0]) {
          params.delete("pageSize");
        } else {
          params.set("pageSize", String(nextPageSize));
        }

        router.push(
          params.size ? `${pathname}?${params.toString()}` : pathname,
        );
      },
      [
        pagination.pageSize,
        pagination.totalPages,
        pathname,
        router,
        searchParams,
      ],
    );

    const updateSorting = useCallback(
      (
        updaterOrValue:
          | SortingState
          | ((currentState: SortingState) => SortingState),
      ) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        const nextSorting =
          typeof updaterOrValue === "function"
            ? updaterOrValue(sortingState)
            : updaterOrValue;
        const nextSort = nextSorting[0];

        params.delete("page");

        if (!nextSort) {
          params.delete("sortBy");
          params.delete("sortDirection");
        } else {
          params.set("sortBy", nextSort.id);
          params.set("sortDirection", nextSort.desc ? "desc" : "asc");
        }

        router.push(
          params.size ? `${pathname}?${params.toString()}` : pathname,
        );
      },
      [pathname, router, searchParams, sortingState],
    );

    const columns = useMemo<ColumnDef<LeadRow>[]>(
      () => [
        ...(adminMode
          ? [
              {
                id: "select",
                enableHiding: false,
                header: ({ table }) => (
                  <label className="flex h-8 w-8 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={table.getIsAllPageRowsSelected()}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate =
                            table.getIsSomePageRowsSelected() &&
                            !table.getIsAllPageRowsSelected();
                        }
                      }}
                      onChange={table.getToggleAllPageRowsSelectedHandler()}
                      aria-label="Select all rows on this page"
                    />
                  </label>
                ),
                cell: ({ row }) => (
                  <label className="flex h-8 w-8 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                      aria-label={`Select lead ${row.original.name}`}
                    />
                  </label>
                ),
                enableSorting: false,
              } satisfies ColumnDef<LeadRow>,
            ]
          : []),
        {
          accessorKey: "leadNumber",
          header: "Lead No.",
          cell: ({ row }) => {
            const leadNumber = row.original.leadNumber;

            return (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-300">
                {leadNumber ?? "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "name",
          header: "Lead Info",
          cell: ({ row }) => {
            const lead = row.original;
            const age = lead.status === "NEW" ? leadAgeDays(lead.createdAt) : 0;

            return (
              <div>
                <Link href={`/leads/${lead.id}`} className="group block">
                  <p className="font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                    {lead.name}
                  </p>
                </Link>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                    title="Click to copy phone"
                    onClick={() => copyPhone(lead.phone)}
                  >
                    {lead.phone}
                  </button>
                  {lead.city ? <span>· {lead.city}</span> : null}
                </p>
                {age >= 2 ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {age}d old
                  </span>
                ) : age >= 1 ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {age}d old
                  </span>
                ) : null}
              </div>
            );
          },
        },
        {
          accessorKey: "email",
          header: "Email",
          cell: ({ row }) => {
            const email = row.original.email;

            return (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {email || "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => {
            const lead = row.original;

            return (
              <Select
                className="h-8 min-w-35 border-transparent bg-slate-50 py-1 text-xs transition-colors hover:border-slate-300"
                value={lead.status}
                onChange={(e) =>
                  updateLead(lead.id, {
                    status: e.target.value as LeadStatusValue,
                  })
                }
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            );
          },
        },
        {
          accessorKey: "priority",
          header: "Priority",
          cell: ({ row }) => {
            const lead = row.original;

            return (
              <Select
                className="h-8 min-w-30 border-transparent bg-slate-50 py-1 text-xs transition-colors hover:border-slate-300"
                value={lead.priority}
                onChange={(e) =>
                  updateLead(lead.id, {
                    priority: e.target.value as LeadPriorityValue,
                  })
                }
              >
                {LEAD_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {LEAD_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            );
          },
        },
        {
          accessorKey: "jeeRankRange",
          header: "Rank",
          cell: ({ row }) => {
            const rank = row.original.jeeRankRange;
            return (
              <span className="text-sm text-slate-600">{rank || "-"}</span>
            );
          },
        },
        {
          accessorKey: "twelfthLocation",
          header: "Domicile",
          cell: ({ row }) => {
            const domicile = row.original.twelfthLocation;
            return (
              <span className="text-sm text-slate-600">{domicile || "-"}</span>
            );
          },
        },
        {
          accessorKey: "courseInterest",
          header: "Course",
          cell: ({ row }) => {
            const courseInterest = row.original.courseInterest;

            return (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {courseInterest || "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "dynamicField1",
          header: resolvedDynamicFieldLabels.dynamicField1,
          cell: ({ row }) => {
            const value = row.original.dynamicField1;

            return (
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {value || "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "dynamicField2",
          header: resolvedDynamicFieldLabels.dynamicField2,
          cell: ({ row }) => {
            const value = row.original.dynamicField2;

            return (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {value || "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "dynamicField3",
          header: resolvedDynamicFieldLabels.dynamicField3,
          cell: ({ row }) => {
            const value = row.original.dynamicField3;

            return (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {value || "-"}
              </span>
            );
          },
        },
        {
          accessorKey: "assignedTo",
          header: "Assigned To",
          sortingFn: (rowA, rowB) => {
            const a = rowA.original.assignedTo?.name ?? "";
            const b = rowB.original.assignedTo?.name ?? "";
            return a.localeCompare(b);
          },
          cell: ({ row }) => {
            const lead = row.original;

            if (!managerMode) {
              return (
                <span className="text-sm text-slate-600">
                  {lead.assignedTo?.name ?? (
                    <span className="text-amber-600">Unassigned</span>
                  )}
                </span>
              );
            }

            return (
              <Select
                className="h-8 min-w-37.5 border-transparent bg-slate-50 py-1 text-xs transition-colors hover:border-slate-300"
                value={lead.assignedTo?.id ?? "unassigned"}
                onChange={(e) => {
                  const value = e.target.value;

                  updateLead(lead.id, {
                    assignedToId: value === "unassigned" ? null : value,
                  });
                }}
              >
                <option value="unassigned">Unassigned</option>
                {telecallers.map((telecaller) => (
                  <option key={telecaller.id} value={telecaller.id}>
                    {telecaller.name}
                  </option>
                ))}
              </Select>
            );
          },
        },
        {
          accessorKey: "createdAt",
          header: "Created",
          cell: ({ row }) => {
            const lead = row.original;

            if (!lead.createdAt)
              return <span className="text-sm text-slate-400">-</span>;

            return (
              <span className="whitespace-nowrap text-xs text-slate-500">
                {format(new Date(lead.createdAt), "dd MMM yyyy, hh:mm a")}
              </span>
            );
          },
        },
        {
          accessorKey: "nextFollowUpAt",
          header: "Follow-up",
          cell: ({ row }) => {
            const lead = row.original;
            const rel = relativeTime(lead.nextFollowUpAt);

            return (
              <div>
                <input
                  type="datetime-local"
                  className="h-8 rounded-md border border-transparent bg-slate-50 px-2 text-xs outline-none transition-colors hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-slate-500 dark:focus:border-indigo-400"
                  value={toDateTimeLocal(lead.nextFollowUpAt)}
                  onChange={(e) => {
                    const value = e.target.value;

                    updateLead(lead.id, {
                      nextFollowUpAt: value
                        ? new Date(value).toISOString()
                        : null,
                    });
                  }}
                />
                {rel && (
                  <p
                    className={`mt-0.5 text-[10px] font-medium ${
                      rel.isFuture
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {rel.label}
                  </p>
                )}
              </div>
            );
          },
        },
        {
          accessorKey: "campaignName",
          header: "Campaign",
          cell: ({ row }) => {
            const lead = row.original;

            return (
              <div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {lead.campaignName ?? lead.source ?? "-"}
                </p>
                {/* <p className="text-xs text-slate-400 dark:text-slate-500">
                  {lead._count.activities} touchpoint
                  {lead._count.activities === 1 ? "" : "s"}
                </p> */}
              </div>
            );
          },
        },
        {
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => {
            const lead = row.original;
            const phone = normalizeIndianPhone(lead.phone);
            const waNumber = phone.startsWith("91") ? phone : `91${phone}`;
            const waLink = `https://wa.me/${waNumber}`;

            return (
              <div className="flex items-center gap-2">
                <Link
                  href={`/leads/${lead.id}`}
                  className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                  title="View details"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </Link>

                <a
                  href={`tel:${lead.phone}`}
                  className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                  title="Call"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </a>

                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 text-slate-500 hover:bg-green-50 hover:text-green-600"
                  title="WhatsApp"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
                  </svg>
                </a>
              </div>
            );
          },
        },
      ],
      [
        adminMode,
        managerMode,
        resolvedDynamicFieldLabels,
        telecallers,
        updateLead,
      ],
    );

    const table = useReactTable({
      data,
      columns,
      state: {
        sorting: sortingState,
        pagination: {
          pageIndex: pagination.page - 1,
          pageSize: pagination.pageSize,
        },
        rowSelection,
        columnVisibility,
      },
      onSortingChange: updateSorting,
      onRowSelectionChange: setRowSelection,
      onColumnVisibilityChange: setColumnVisibility,
      enableRowSelection: adminMode,
      manualPagination: true,
      manualSorting: true,
      pageCount: pagination.totalPages,
      getRowId: (row) => row.id,
      getCoreRowModel: getCoreRowModel(),
    });

    const selectedLeadIds = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.id);
    const selectedCount = selectedLeadIds.length;
    const pageIndex = pagination.page - 1;
    const pageSize = pagination.pageSize;
    const pageRowsCount = table.getRowModel().rows.length;
    const totalRows = pagination.totalCount;
    const pageStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
    const pageEnd =
      totalRows === 0 ? 0 : Math.min(pageStart + pageRowsCount - 1, totalRows);
    const activeFilterCount = [
      currentFilters.q,
      currentFilters.status,
      currentFilters.priority,
      currentFilters.assigned,
      currentFilters.due && currentFilters.due !== "all"
        ? currentFilters.due
        : undefined,
      currentFilters.sla,
    ].filter(Boolean).length;
    const visibleColumnCount = columnPreferenceOptions.filter(
      (option) => columnVisibility[option.id] !== false,
    ).length;

    return (
      <div className="space-y-3">
        {adminMode && (selectedCount > 0 || activeFilterCount > 0) ? (
          <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>
                  Selected: <strong>{selectedCount}</strong>
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Active filters: {activeFilterCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0 || Boolean(bulkPendingAction)}
                  onClick={() => setRowSelection({})}
                >
                  Clear Selection
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={selectedCount === 0 || Boolean(bulkPendingAction)}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${selectedCount} selected lead(s)? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }

                    void runBulkDelete("selected", selectedLeadIds);
                  }}
                >
                  {bulkPendingAction === "delete-selected"
                    ? "Deleting..."
                    : "Delete Selected"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={Boolean(bulkPendingAction)}
                  onClick={() => {
                    void (async () => {
                      try {
                        const preview = await fetchFilteredPreview();

                        if (preview.matchedCount < 1) {
                          toast.error("No leads match current filters.");
                          return;
                        }

                        const expectedPhrase = `DELETE ${preview.matchedCount}`;
                        const confirmation = window.prompt(
                          `You are about to delete ${preview.matchedCount} filtered lead(s). Type ${expectedPhrase} to confirm.`,
                        );

                        if (confirmation !== expectedPhrase) {
                          return;
                        }

                        await runBulkDelete("filtered");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to preview filtered lead count.",
                        );
                      }
                    })();
                  }}
                >
                  {bulkPendingAction === "delete-filtered"
                    ? "Deleting..."
                    : `Delete All Filtered (${totalRows})`}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-50"
                  value={bulkTelecallerId}
                  onChange={(event) => setBulkTelecallerId(event.target.value)}
                >
                  {telecallers.map((telecaller) => (
                    <option key={telecaller.id} value={telecaller.id}>
                      {telecaller.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    selectedCount === 0 ||
                    !bulkTelecallerId ||
                    Boolean(bulkPendingAction)
                  }
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Assign ${selectedCount} selected lead(s) to chosen telecaller?`,
                      )
                    ) {
                      return;
                    }

                    void runBulkAssign("selected", selectedLeadIds);
                  }}
                >
                  {bulkPendingAction === "assign-selected"
                    ? "Assigning..."
                    : "Assign Selected"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!bulkTelecallerId || Boolean(bulkPendingAction)}
                  onClick={() => {
                    void (async () => {
                      try {
                        const preview =
                          await fetchFilteredPreview(bulkTelecallerId);

                        if (preview.matchedCount < 1) {
                          toast.error("No leads match current filters.");
                          return;
                        }

                        if (preview.assignableCount < 1) {
                          toast.error(
                            "All filtered leads are already assigned to this telecaller.",
                          );
                          return;
                        }

                        if (
                          !window.confirm(
                            `Assign ${preview.assignableCount} of ${preview.matchedCount} filtered lead(s) to selected telecaller?`,
                          )
                        ) {
                          return;
                        }

                        await runBulkAssign("filtered");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to preview filtered lead count.",
                        );
                      }
                    })();
                  }}
                >
                  {bulkPendingAction === "assign-filtered"
                    ? "Assigning..."
                    : `Assign All Filtered (${totalRows})`}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="p-4 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={
                        header.column.getCanSort()
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div
                        className={`flex items-center gap-1 ${
                          header.column.getCanSort() ? "cursor-pointer" : ""
                        }`}
                      >
                        <span>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        {{
                          asc: <span>↑</span>,
                          desc: <span>↓</span>,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {table.getRowModel().rows.map((row) => {
                const isUnassigned = !row.original.assignedTo;
                const isAssignedForTelecaller =
                  !managerMode &&
                  !adminMode &&
                  row.original.status === "ASSIGNED";

                return (
                  <tr
                    key={row.id}
                    className={
                      row.getIsSelected()
                        ? "bg-indigo-50/60 dark:bg-indigo-900/30"
                        : isAssignedForTelecaller
                          ? "bg-sky-50/80 border-l-2 border-l-sky-500 dark:bg-sky-950/30 dark:border-l-sky-400"
                          : isUnassigned
                            ? "bg-amber-100/60 border-l-2 border-l-amber-400 dark:bg-amber-900/20 dark:border-l-amber-500"
                            : ""
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, table.getVisibleLeafColumns().length)}
                    className="p-8 text-center text-slate-500 dark:text-slate-400"
                  >
                    No leads found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {pageStart}-{pageEnd} of {totalRows} lead
            {totalRows === 1 ? "" : "s"}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              Rows
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                value={pagination.pageSize}
                onChange={(event) => {
                  updatePagination(1, Number(event.target.value));
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePagination(pagination.page - 1)}
                disabled={!pagination.hasPreviousPage}
              >
                Prev
              </Button>
              <span>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePagination(pagination.page + 1)}
                disabled={!pagination.hasNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {columnPickerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Choose Visible Columns
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {visibleColumnCount} column
                    {visibleColumnCount === 1 ? "" : "s"} currently shown in the
                    lead table.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setColumnPickerOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {columnPreferenceOptions.map((option) => {
                  const checked = columnVisibility[option.id] !== false;

                  return (
                    <label
                      key={option.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={checked}
                        disabled={option.alwaysVisible}
                        onChange={(event) => {
                          setColumnVisibility((current) => ({
                            ...current,
                            [option.id]: option.alwaysVisible
                              ? true
                              : event.target.checked,
                          }));
                        }}
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {option.alwaysVisible
                            ? "Always visible"
                            : option.defaultVisible
                              ? "Shown by default"
                              : "Hidden by default"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setColumnVisibility(buildDefaultColumnVisibility())
                  }
                >
                  Reset Defaults
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setColumnPickerOpen(false)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

DataTable.displayName = "DataTable";
