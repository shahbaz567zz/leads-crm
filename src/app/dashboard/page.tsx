import Link from "next/link";
import { cookies } from "next/headers";

import { AddLeadModal } from "@/components/add-lead-modal";
import { AutoAssignToggle } from "@/components/auto-assign-toggle";
import { DashboardBottomSection } from "@/components/dashboard-bottom-section";
import { CsvImportCard } from "@/components/csv-import-card";
import { DashboardInsights } from "@/components/dashboard-insights";
import { LeadQueueSection } from "@/components/lead-queue-section";
import { Sidebar } from "@/components/sidebar";
import { canManageAssignments, requireUser } from "@/lib/auth";
import {
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import {
  getAutoAssignEnabled,
  getDashboardData,
  type TelecallerOption,
} from "@/lib/lead-service";
import { getDynamicLeadFieldLabels } from "@/lib/lead-field-settings";

function readSingle(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sidebar-collapsed")?.value === "true";
  const initialColumnVisibilityPreference =
    cookieStore.get("lead-table-columns")?.value ?? null;

  const user = await requireUser();
  const query = await searchParams;

  const filters = {
    q: readSingle(query.q),
    status: readSingle(query.status) as LeadStatusValue | undefined,
    priority: readSingle(query.priority) as LeadPriorityValue | undefined,
    assigned: readSingle(query.assigned),
    due:
      (readSingle(query.due) as "all" | "today" | "overdue" | undefined) ??
      "all",
    sla: readSingle(query.sla) as
      | "overdue_open"
      | "due_today_open"
      | "high_priority_uncontacted"
      | "stale_30m"
      | "stale_2h"
      | undefined,
  };

  function buildDashboardHref({
    q,
    status,
    priority,
    assigned,
    due,
    sla,
  }: {
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
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
    }

    if (status) {
      params.set("status", status);
    }

    if (priority) {
      params.set("priority", priority);
    }

    if (assigned) {
      params.set("assigned", assigned);
    }

    if (due && due !== "all") {
      params.set("due", due);
    }

    if (sla) {
      params.set("sla", sla);
    }

    return params.size ? `/dashboard?${params.toString()}` : "/dashboard";
  }

  const [
    { leads, stats, telecallers, reporting },
    autoAssignEnabled,
    dynamicFieldLabels,
  ] = await Promise.all([
    getDashboardData(user, filters),
    user.role === "ADMIN" ? getAutoAssignEnabled() : Promise.resolve(false),
    getDynamicLeadFieldLabels(),
  ]);
  const managerMode = canManageAssignments(user);
  const adminMode = user.role === "ADMIN";

  const filteredExportParams = new URLSearchParams();

  if (filters.q) {
    filteredExportParams.set("q", filters.q);
  }

  if (filters.status) {
    filteredExportParams.set("status", filters.status);
  }

  if (filters.priority) {
    filteredExportParams.set("priority", filters.priority);
  }

  if (filters.assigned) {
    filteredExportParams.set("assigned", filters.assigned);
  }

  if (filters.due && filters.due !== "all") {
    filteredExportParams.set("due", filters.due);
  }

  if (filters.sla) {
    filteredExportParams.set("sla", filters.sla);
  }

  const filteredExportHref = filteredExportParams.size
    ? `/api/exports/leads?${filteredExportParams.toString()}`
    : "/api/exports/leads";
  const reportExportHref = "/api/exports/reports";

  return (
    <>
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        managerMode={managerMode}
        initialCollapsed={initialSidebarCollapsed}
      />

      <main className="main-content pt-14 lg:pt-0">
        <div className="mx-auto space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="page-title">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {user.role === "TELECALLER"
                  ? "Your active counselling pipeline"
                  : "Meta ads lead command center"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a className="button-secondary text-xs" href={filteredExportHref}>
                Export leads
              </a>
              <AddLeadModal
                canChooseAssignee={managerMode}
                telecallers={telecallers.map((tc: TelecallerOption) => ({
                  id: tc.id,
                  name: tc.name,
                }))}
              />
              {managerMode && (
                <a className="button-secondary text-xs" href={reportExportHref}>
                  Export report
                </a>
              )}
              {adminMode && (
                <AutoAssignToggle initialEnabled={autoAssignEnabled} />
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 mb-4">
            <Link href={buildDashboardHref({ due: "all" })}>
              <article
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 ${!filters.status && filters.due === "all" ? "ring-2 ring-indigo-300" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Leads
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.totalLeads}
                </p>
              </article>
            </Link>

            <Link
              href={buildDashboardHref({ status: "CONVERTED", due: "all" })}
            >
              <article
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 ${filters.status === "CONVERTED" ? "ring-2 ring-emerald-300" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Converted
                </p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.converted}
                </p>
              </article>
            </Link>

            <Link href={buildDashboardHref({ status: "NEW", due: "all" })}>
              <article
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 ${filters.status === "NEW" ? "ring-2 ring-indigo-200" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  New
                </p>
                <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {stats.newLeads}
                </p>
              </article>
            </Link>

            <Link
              href={buildDashboardHref({ status: undefined, due: "today" })}
            >
              <article
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 ${filters.due === "today" ? "ring-2 ring-amber-200" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Due
                </p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {stats.dueToday}
                </p>
              </article>
            </Link>

            <Link
              href={buildDashboardHref({ status: undefined, due: "overdue" })}
            >
              <article
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-red-50 px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-red-900/20 ${filters.due === "overdue" ? "ring-2 ring-red-200" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Overdue
                </p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">
                  {stats.overdue}
                </p>
              </article>
            </Link>
          </div>

          {/* Lead Queue Section (Moved to top) */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 tracking-tight dark:text-slate-100">
                  Lead Queue
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {leads.length} lead{leads.length === 1 ? "" : "s"} matched
                  your criteria
                </p>
              </div>
            </div>

            <LeadQueueSection
              data={leads}
              telecallers={telecallers.map((tc: TelecallerOption) => ({
                id: tc.id,
                name: tc.name,
              }))}
              managerMode={managerMode}
              adminMode={adminMode}
              dynamicFieldLabels={dynamicFieldLabels}
              initialColumnVisibilityPreference={
                initialColumnVisibilityPreference
              }
              currentFilters={filters}
            />
          </section>

          {/* Analytics & Tools (collapsible) */}
          <DashboardBottomSection>
            <div
              className={
                managerMode
                  ? "grid gap-6 xl:grid-cols-[1fr_380px]"
                  : "space-y-6"
              }
            >
              {/* Insights */}
              <div className="space-y-6">
                <DashboardInsights
                  managerMode={managerMode}
                  reportExportHref={reportExportHref}
                  reporting={reporting}
                  tableFilters={filters}
                />
              </div>

              {/* Auxiliary tools */}
              {managerMode ? (
                <div className="space-y-6">
                  <CsvImportCard
                    templateHref="/lead-import-template.csv"
                    dynamicFieldLabels={dynamicFieldLabels}
                  />
                </div>
              ) : null}
            </div>
          </DashboardBottomSection>
        </div>
      </main>
    </>
  );
}
