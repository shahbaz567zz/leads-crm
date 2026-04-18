import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import {
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import type { DashboardReporting } from "@/lib/lead-service";
import { formatPercent } from "@/lib/utils";

type DashboardInsightsProps = {
  reporting: DashboardReporting;
  managerMode: boolean;
  reportExportHref: string;
  tableFilters: {
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
};

export function DashboardInsights({
  reporting,
  managerMode,
  reportExportHref,
  tableFilters,
}: DashboardInsightsProps) {
  function buildDashboardHref(next: {
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
  }) {
    const merged = { ...tableFilters, ...next };
    const params = new URLSearchParams();

    if (merged.q) {
      params.set("q", merged.q);
    }

    if (merged.status) {
      params.set("status", merged.status);
    }

    if (merged.priority) {
      params.set("priority", merged.priority);
    }

    if (merged.assigned) {
      params.set("assigned", merged.assigned);
    }

    if (merged.due && merged.due !== "all") {
      params.set("due", merged.due);
    }

    if (merged.sla) {
      params.set("sla", merged.sla);
    }

    return params.size ? `/dashboard?${params.toString()}` : "/dashboard";
  }

  const slaChips = [
    {
      label: "Overdue Open",
      count: reporting.slaSummary.overdueOpen,
      href: buildDashboardHref({
        sla: "overdue_open",
        due: "all",
        status: undefined,
      }),
      tone: "border-red-200 bg-red-50 text-red-700",
    },
    {
      label: "Due Today",
      count: reporting.slaSummary.dueTodayOpen,
      href: buildDashboardHref({
        sla: "due_today_open",
        due: "all",
        status: undefined,
      }),
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      label: "High Priority Uncontacted",
      count: reporting.slaSummary.highPriorityUncontacted,
      href: buildDashboardHref({
        sla: "high_priority_uncontacted",
        due: "all",
        status: undefined,
        priority: undefined,
      }),
      tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    {
      label: "No Contact 30m+",
      count: reporting.slaSummary.staleThirtyMinutes,
      href: buildDashboardHref({
        sla: "stale_30m",
        due: "all",
        status: undefined,
        priority: undefined,
      }),
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    },
    {
      label: "No Contact 2h+",
      count: reporting.slaSummary.staleTwoHours,
      href: buildDashboardHref({
        sla: "stale_2h",
        due: "all",
        status: undefined,
        priority: undefined,
      }),
      tone: "border-zinc-300 bg-zinc-100 text-zinc-800",
    },
  ];

  return (
    <div className="space-y-6">
      <article className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-700">
          <div>
            <h2 className="section-title">Pipeline &amp; Conversion</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Quality metrics and stage distribution
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              href={reportExportHref}
            >
              Export CSV
            </a>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {formatPercent(reporting.conversionRate)} conversion
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"></p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Click a chip to jump into the lead queue with that SLA lens.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {slaChips.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:brightness-95 ${chip.tone}`}
                  >
                    <span className="font-medium">{chip.label}</span>
                    <span className="text-base font-semibold">
                      {chip.count}
                    </span>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Overdue Share
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatPercent(
                      reporting.slaSummary.overdueOpen > 0
                        ? (reporting.slaSummary.overdueOpen /
                            Math.max(
                              1,
                              reporting.slaSummary.overdueOpen +
                                reporting.slaSummary.dueTodayOpen,
                            )) *
                            100
                        : 0,
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    First-Contact Risk
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {reporting.slaSummary.staleTwoHours}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    leads older than 2h
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {reporting.stageMix.map((item) => (
                <div key={item.status}>
                  <div className="mb-1.5 flex items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-3">
                      <StatusPill mode="status" value={item.status} />
                      <span>
                        {item.count} lead{item.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatPercent(item.share)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-indigo-600"
                      style={{
                        width: `${Math.max(item.count > 0 ? item.share : 0, item.count ? 5 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </article>

      <article className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="section-title">Campaign Snapshot</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Source and campaign yield
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {reporting.campaignSnapshot.map((campaign) => (
            <div
              key={campaign.label}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {campaign.label}
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {campaign.total} total &middot; {campaign.converted} converted
                  &middot; {campaign.overdue} overdue
                </p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {campaign.highPriority} high-priority
              </span>
            </div>
          ))}

          {reporting.campaignSnapshot.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              Campaign rollups will appear as leads accumulate.
            </div>
          ) : null}
        </div>
      </article>

      {managerMode ? (
        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h2 className="section-title">Team Scorecard</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Telecaller workload and delivery
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Telecaller</th>
                  <th>Assigned</th>
                  <th>Active</th>
                  <th>Overdue</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {reporting.telecallerScorecard.map((telecaller) => (
                  <tr key={telecaller.id}>
                    <td className="font-medium text-slate-900 dark:text-slate-100">
                      {telecaller.name}
                    </td>
                    <td>{telecaller.totalAssigned}</td>
                    <td>{telecaller.activeLeads}</td>
                    <td>{telecaller.overdue}</td>
                    <td>{telecaller.converted}</td>
                  </tr>
                ))}

                {reporting.telecallerScorecard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400">
                      No telecaller activity yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </div>
  );
}
