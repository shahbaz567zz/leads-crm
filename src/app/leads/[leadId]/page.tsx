import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Phone, MessageCircle } from "lucide-react";

import { LeadDetailClient } from "@/components/lead-detail-client";
import { Sidebar } from "@/components/sidebar";
import { StatusPill } from "@/components/status-pill";
import { canManageAssignments, requireUser } from "@/lib/auth";
import { getLeadDetail, type TelecallerOption } from "@/lib/lead-service";
import { formatDateTime } from "@/lib/utils";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sidebar-collapsed")?.value === "true";

  const user = await requireUser();
  const { leadId } = await params;

  let detail: Awaited<ReturnType<typeof getLeadDetail>>;

  try {
    detail = await getLeadDetail(leadId, user);
  } catch {
    redirect("/dashboard");
  }

  if (!detail) {
    notFound();
  }

  const { lead, telecallers } = detail;
  const canReassign = canManageAssignments(user);

  return (
    <>
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        managerMode={canReassign}
        initialCollapsed={initialSidebarCollapsed}
      />

      <main className="main-content pt-14 lg:pt-0">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {/* Breadcrumb + actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="page-title">{lead.name}</h1>
                  <StatusPill mode="status" value={lead.status} />
                  <StatusPill mode="priority" value={lead.priority} />
                </div>
                <p className="mt-0.5 text-sm text-slate-500">
                  {lead.courseInterest ?? "B.Tech Counselling"}
                  {lead.city ? ` · ${lead.city}` : ""}
                  {lead.twelfthLocation
                    ? ` · 12th: ${lead.twelfthLocation}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a className="button-secondary" href={`tel:${lead.phone}`}>
                <Phone className="h-4 w-4" />
                {lead.phone}
              </a>
              <a
                className="button-secondary"
                href={`https://wa.me/91${lead.phoneNormalized}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <article className="metric-card">
              <p className="text-xs font-medium text-slate-500">Assigned To</p>
              <p className="text-sm font-semibold text-slate-900">
                {lead.assignedTo?.name ?? (
                  <span className="text-amber-600">Unassigned</span>
                )}
              </p>
            </article>
            <article className="metric-card">
              <p className="text-xs font-medium text-slate-500">
                Next Follow-up
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {lead.nextFollowUpAt
                  ? formatDateTime(lead.nextFollowUpAt)
                  : "Not set"}
              </p>
            </article>
            <article className="metric-card">
              <p className="text-xs font-medium text-slate-500">Meeting</p>
              <p className="text-sm font-semibold text-slate-900">
                {lead.meetingScheduledAt
                  ? formatDateTime(lead.meetingScheduledAt)
                  : "Not scheduled"}
              </p>
            </article>
            <article className="metric-card">
              <p className="text-xs font-medium text-slate-500">Source</p>
              <p className="text-sm font-semibold text-slate-900">
                {lead.campaignName ?? lead.source}
              </p>
            </article>
          </div>

          {/* Control + Activity forms */}
          <LeadDetailClient
            canReassign={canReassign}
            lead={{
              id: lead.id,
              status: lead.status,
              priority: lead.priority,
              nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
              meetingScheduledAt:
                lead.meetingScheduledAt?.toISOString() ?? null,
              assignedToId: lead.assignedToId,
              counsellorNotes: lead.counsellorNotes,
            }}
            telecallers={telecallers.map((tc: TelecallerOption) => ({
              id: tc.id,
              name: tc.name,
              isPriorityAgent: tc.isPriorityAgent,
            }))}
          />

          {/* Timeline + Side panels */}
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="section-title">Activity Timeline</h2>
              </div>

              <div className="divide-y divide-slate-100">
                {lead.activities.map((activity) => (
                  <div key={activity.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="badge">
                          {activity.type.replaceAll("_", " ")}
                        </span>
                        <span className="text-xs text-slate-400">
                          {activity.user?.name ?? "System"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(activity.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {activity.notes}
                    </p>
                    {(activity.statusAfter || activity.nextFollowUpAt) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {activity.statusAfter && (
                          <StatusPill
                            mode="status"
                            value={activity.statusAfter}
                          />
                        )}
                        {activity.nextFollowUpAt && (
                          <span className="text-xs text-slate-500">
                            Next: {formatDateTime(activity.nextFollowUpAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {lead.activities.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-slate-500">
                    No activity captured yet.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* Assignment trail */}
              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="section-title">Assignment Trail</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {lead.assignments.map((assignment) => (
                    <div key={assignment.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-slate-900">
                        {assignment.user?.name ?? "Unknown"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {assignment.strategy.replaceAll("_", " ")} ·{" "}
                        {formatDateTime(assignment.assignedAt)}
                      </p>
                    </div>
                  ))}
                  {lead.assignments.length === 0 && (
                    <div className="px-5 py-6 text-center text-sm text-slate-500">
                      No assignments yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Meeting history */}
              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="section-title">Meeting History</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {lead.meetings.map((meeting) => (
                    <div key={meeting.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">
                          {meeting.venue}
                        </p>
                        <span className="badge text-[10px]">
                          {meeting.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(meeting.scheduledAt)}
                      </p>
                      {meeting.notes && (
                        <p className="mt-1 text-sm text-slate-600">
                          {meeting.notes}
                        </p>
                      )}
                    </div>
                  ))}
                  {lead.meetings.length === 0 && (
                    <div className="px-5 py-6 text-center text-sm text-slate-500">
                      No meetings scheduled yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
