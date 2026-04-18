"use client";

import { useState, useTransition } from "react";
import { GitBranchPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";

export function DashboardAutoAssignCard({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const nextEnabled = !enabled;

    startTransition(async () => {
      try {
        const response = await fetch("/api/automation/auto-assign", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextEnabled }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to update auto assignment.");
        }

        setEnabled(body.enabled);
        toast.success(
          body.enabled
            ? "Auto lead assignment enabled."
            : "Auto lead assignment disabled.",
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to update auto assignment.",
        );
      }
    });
  }

  return (
    <article className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Lead Automation</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Control whether new unassigned leads get routed automatically.
            </p>
          </div>
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <GitBranchPlus className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Auto-assign incoming leads
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Applies to manual lead creation without an assignee and to Meta or
              Google webhook leads that arrive unassigned.
            </p>
          </div>
          <span
            className={
              enabled
                ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                : "inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
            }
          >
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            High-priority leads still prefer the priority telecaller pool when
            the switch is on.
          </p>
          <Button type="button" onClick={handleToggle} disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : enabled ? (
              "Turn Off"
            ) : (
              "Turn On"
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}
