"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITIES,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import { toDateTimeLocal } from "@/lib/utils";

type TelecallerOption = {
  id: string;
  name: string;
  isPriorityAgent: boolean;
};

type LeadEditorProps = {
  canReassign: boolean;
  lead: {
    id: string;
    status: LeadStatusValue;
    priority: LeadPriorityValue;
    nextFollowUpAt?: string | null;
    meetingScheduledAt?: string | null;
    assignedToId?: string | null;
    counsellorNotes?: string | null;
  };
  telecallers: TelecallerOption[];
};

export function LeadDetailClient({
  canReassign,
  lead,
  telecallers,
}: LeadEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadState, setLeadState] = useState({
    status: lead.status,
    priority: lead.priority,
    nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt),
    meetingScheduledAt: toDateTimeLocal(lead.meetingScheduledAt),
    assignedToId: lead.assignedToId ?? "",
    counsellorNotes: lead.counsellorNotes ?? "",
  });
  const [activityState, setActivityState] = useState({
    type: "CALL",
    notes: "",
    statusAfter: lead.status,
    nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt),
    meetingScheduledAt: "",
    venue: "CollegeTpoint Delhi Office",
  });

  async function submitLeadUpdate() {
    const response = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(leadState),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error ?? "Unable to update the lead.");
    }
  }

  async function submitActivity() {
    const response = await fetch(`/api/leads/${lead.id}/activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activityState),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error ?? "Unable to save the activity.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="section-title">Lead Control</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Update status, priority, and ownership
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="lead-status">
                Status
              </label>
              <select
                id="lead-status"
                value={leadState.status}
                onChange={(event) =>
                  setLeadState((current) => ({
                    ...current,
                    status: event.target.value as LeadStatusValue,
                  }))
                }
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="lead-priority">
                Priority
              </label>
              <select
                id="lead-priority"
                value={leadState.priority}
                onChange={(event) =>
                  setLeadState((current) => ({
                    ...current,
                    priority: event.target.value as LeadPriorityValue,
                  }))
                }
              >
                {LEAD_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {LEAD_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="lead-followup">
                Next Follow-up
              </label>
              <input
                id="lead-followup"
                type="datetime-local"
                value={leadState.nextFollowUpAt}
                onChange={(event) =>
                  setLeadState((current) => ({
                    ...current,
                    nextFollowUpAt: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="lead-meeting">
                Meeting Slot
              </label>
              <input
                id="lead-meeting"
                type="datetime-local"
                value={leadState.meetingScheduledAt}
                onChange={(event) =>
                  setLeadState((current) => ({
                    ...current,
                    meetingScheduledAt: event.target.value,
                  }))
                }
              />
            </div>

            {canReassign ? (
              <div className="md:col-span-2">
                <label className="field-label" htmlFor="lead-assignee">
                  Assigned Telecaller
                </label>
                <select
                  id="lead-assignee"
                  value={leadState.assignedToId}
                  onChange={(event) =>
                    setLeadState((current) => ({
                      ...current,
                      assignedToId: event.target.value,
                    }))
                  }
                >
                  <option value="">Keep current assignment</option>
                  {telecallers.map((telecaller) => (
                    <option key={telecaller.id} value={telecaller.id}>
                      {telecaller.name}
                      {telecaller.isPriorityAgent ? " · priority pool" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="md:col-span-2">
              <label className="field-label" htmlFor="lead-notes">
                Counsellor Notes
              </label>
              <textarea
                id="lead-notes"
                value={leadState.counsellorNotes}
                onChange={(event) =>
                  setLeadState((current) => ({
                    ...current,
                    counsellorNotes: event.target.value,
                  }))
                }
                placeholder="Objections, parent concerns, budget notes..."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="button-primary"
              disabled={pending}
              type="button"
              onClick={() => {
                setError(null);
                setUpdateMessage(null);
                startTransition(async () => {
                  try {
                    await submitLeadUpdate();
                    setUpdateMessage("Lead updated.");
                    router.refresh();
                  } catch (updateError) {
                    setError(
                      updateError instanceof Error
                        ? updateError.message
                        : "Unable to update the lead.",
                    );
                  }
                });
              }}
            >
              {pending ? "Saving..." : "Save Progress"}
            </button>
            {updateMessage ? (
              <p className="text-sm text-emerald-600">{updateMessage}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="section-title">Log Activity</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Capture each call, message, or meeting
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="activity-type">
                Type
              </label>
              <select
                id="activity-type"
                value={activityState.type}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="activity-status">
                Status After
              </label>
              <select
                id="activity-status"
                value={activityState.statusAfter}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    statusAfter: event.target.value as LeadStatusValue,
                  }))
                }
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="activity-followup">
                Next Follow-up
              </label>
              <input
                id="activity-followup"
                type="datetime-local"
                value={activityState.nextFollowUpAt}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    nextFollowUpAt: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="activity-meeting">
                Meeting Slot
              </label>
              <input
                id="activity-meeting"
                type="datetime-local"
                value={activityState.meetingScheduledAt}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    meetingScheduledAt: event.target.value,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="field-label" htmlFor="activity-venue">
                Meeting Venue
              </label>
              <input
                id="activity-venue"
                value={activityState.venue}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    venue: event.target.value,
                  }))
                }
                placeholder="CollegeTpoint Delhi Office"
              />
            </div>

            <div className="md:col-span-2">
              <label className="field-label" htmlFor="activity-notes">
                Notes
              </label>
              <textarea
                id="activity-notes"
                value={activityState.notes}
                onChange={(event) =>
                  setActivityState((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Summarize the call, objections raised, next step..."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="button-primary"
              disabled={pending}
              type="button"
              onClick={() => {
                setError(null);
                setActivityMessage(null);
                startTransition(async () => {
                  try {
                    await submitActivity();
                    setActivityMessage("Activity logged.");
                    setActivityState((current) => ({
                      ...current,
                      notes: "",
                      meetingScheduledAt: "",
                    }));
                    router.refresh();
                  } catch (activityError) {
                    setError(
                      activityError instanceof Error
                        ? activityError.message
                        : "Unable to save the activity.",
                    );
                  }
                });
              }}
            >
              {pending ? "Saving..." : "Log Activity"}
            </button>
            {activityMessage ? (
              <p className="text-sm text-emerald-600">{activityMessage}</p>
            ) : null}
          </div>

          {error ? (
            <div className="alert-error">{error}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
