"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
} from "@/lib/crm-constants";

export function LeadQueueFilters({
  actions,
  managerMode,
  telecallers,
}: {
  actions?: ReactNode;
  managerMode: boolean;
  telecallers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const updateFilters = useCallback(
    (name: string, value: string) => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));
      if (!value || value === "all" || value === "") {
        current.delete(name);
      } else {
        current.set(name, value);
      }

      if (name !== "sla") {
        current.delete("sla");
      }

      current.delete("page");

      startTransition(() => {
        const next = current.size
          ? `${pathname}?${current.toString()}`
          : pathname;
        router.push(next);
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 w-full px-4 py-3 bg-white rounded-xl border border-slate-100 shadow-sm relative group overflow-hidden dark:bg-slate-800 dark:border-slate-700">
      {/* Subtle background gradient to make the search pop slightly */}
      <div className="absolute inset-0 bg-linear-to-r from-indigo-50/50 to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none dark:from-indigo-950/30 dark:to-purple-950/30" />

      {isPending && (
        <div className="absolute top-0 left-0 right-0 h-1 z-10">
          <div className="h-full bg-indigo-500 animate-pulse rounded-t-xl" />
        </div>
      )}

      <div className="relative min-w-40 max-w-56 z-10">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35m1.35-6.65a8 8 0 11-16 0 8 8 0 0116 0z"
          />
        </svg>
        <Input
          defaultValue={searchParams.get("q") || ""}
          placeholder="Search..."
          onChange={(e) => {
            const val = e.target.value;
            if (searchDebounceRef.current) {
              clearTimeout(searchDebounceRef.current);
            }

            searchDebounceRef.current = setTimeout(() => {
              updateFilters("q", val);
            }, 350);
          }}
          className="pl-8 h-9 text-xs"
        />
      </div>

      <Select
        value={searchParams.get("status") || ""}
        onChange={(e) => updateFilters("status", e.target.value)}
        className="w-auto h-9 min-w-28 text-xs z-10"
      >
        <option value="">All Statuses</option>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>

      <Select
        value={searchParams.get("priority") || ""}
        onChange={(e) => updateFilters("priority", e.target.value)}
        className="w-auto h-9 min-w-28 text-xs z-10"
      >
        <option value="">All Priorities</option>
        {LEAD_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {LEAD_PRIORITY_LABELS[p]}
          </option>
        ))}
      </Select>

      <Select
        value={searchParams.get("due") || "all"}
        onChange={(e) => updateFilters("due", e.target.value)}
        className="w-auto h-9 min-w-30 text-xs z-10"
      >
        <option value="all">All Follow-ups</option>
        <option value="today">Due Today</option>
        <option value="overdue">Overdue Only</option>
      </Select>

      <Select
        value={searchParams.get("sla") || ""}
        onChange={(e) => updateFilters("sla", e.target.value)}
        className="w-auto h-9 min-w-32 text-xs z-10"
      >
        <option value="">All SLA Lenses</option>
        <option value="overdue_open">SLA: Overdue</option>
        <option value="due_today_open">SLA: Due Today</option>
        <option value="high_priority_uncontacted">
          SLA: Hi-Pri Uncontacted
        </option>
        <option value="stale_30m">SLA: Stale 30m+</option>
        <option value="stale_2h">SLA: Stale 2h+</option>
      </Select>

      {managerMode && (
        <Select
          value={searchParams.get("assigned") || ""}
          onChange={(e) => updateFilters("assigned", e.target.value)}
          className="w-auto h-9 min-w-30 text-xs z-10"
        >
          <option value="">All Telecallers</option>
          <option value="unassigned">Unassigned</option>
          {telecallers.map((tc) => (
            <option key={tc.id} value={tc.id}>
              {tc.name}
            </option>
          ))}
        </Select>
      )}

      {actions ? (
        <div className="relative z-10 ml-auto flex items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
