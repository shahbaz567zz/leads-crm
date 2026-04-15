"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type TelecallerOption = {
  id: string;
  name: string;
};

type QuickLeadFormProps = {
  canChooseAssignee: boolean;
  telecallers: TelecallerOption[];
};

const initialState = {
  name: "",
  phone: "",
  city: "",
  courseInterest: "B.Tech Counselling",
  jeeRankRange: "",
  twelfthLocation: "",
  campaignName: "Manual Intake",
  assignedToId: "",
};

export function QuickLeadForm({
  canChooseAssignee,
  telecallers,
  onSuccess,
}: QuickLeadFormProps & { onSuccess?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState(initialState);

  const telecallerOptions = useMemo(() => telecallers, [telecallers]);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="section-title">Quick Add Lead</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Add a lead in under a minute
        </p>
      </div>

      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);

          startTransition(async () => {
            const response = await fetch("/api/leads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...state,
                source: "Manual Entry",
                assignedToId: canChooseAssignee
                  ? state.assignedToId
                  : undefined,
              }),
            });

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
              setError(body.error ?? "Unable to add the lead.");
              return;
            }

            setState(initialState);
            onSuccess?.();

            if (body.duplicate && body.lead?.id) {
              router.push(`/leads/${body.lead.id}`);
              router.refresh();
              return;
            }

            setMessage("Lead saved and routed.");
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="quick-name">
              Student Name
            </label>
            <input
              id="quick-name"
              value={state.name}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Aarav Sharma"
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-phone">
              Phone
            </label>
            <input
              id="quick-phone"
              value={state.phone}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="9876543210"
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-city">
              City
            </label>
            <input
              id="quick-city"
              value={state.city}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  city: event.target.value,
                }))
              }
              placeholder="Delhi"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-course">
              Course Interest
            </label>
            <input
              id="quick-course"
              value={state.courseInterest}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  courseInterest: event.target.value,
                }))
              }
              placeholder="B.Tech Counselling"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-rank">
              JEE Rank Range
            </label>
            <input
              id="quick-rank"
              value={state.jeeRankRange}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  jeeRankRange: event.target.value,
                }))
              }
              placeholder="Below 1,00,000"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-location">
              12th Location
            </label>
            <input
              id="quick-location"
              value={state.twelfthLocation}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  twelfthLocation: event.target.value,
                }))
              }
              placeholder="Delhi NCR"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="quick-campaign">
              Campaign Label
            </label>
            <input
              id="quick-campaign"
              value={state.campaignName}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  campaignName: event.target.value,
                }))
              }
              placeholder="Delhi B.Tech Meta Campaign"
            />
          </div>

          {canChooseAssignee ? (
            <div>
              <label className="field-label" htmlFor="quick-assignee">
                Assign Telecaller
              </label>
              <select
                id="quick-assignee"
                value={state.assignedToId}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    assignedToId: event.target.value,
                  }))
                }
              >
                <option value="">Leave unassigned</option>
                {telecallerOptions.map((telecaller) => (
                  <option key={telecaller.id} value={telecaller.id}>
                    {telecaller.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button className="button-primary" disabled={pending} type="submit">
            {pending ? "Saving..." : "Create Lead"}
          </button>
          {message ? (
            <p className="text-sm text-emerald-600">{message}</p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}
