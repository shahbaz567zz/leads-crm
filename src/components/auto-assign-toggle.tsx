"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import toast from "react-hot-toast";

export function AutoAssignToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    startTransition(async () => {
      try {
        const res = await fetch("/api/automation/auto-assign", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body.error ?? "Failed to update.");

        setEnabled(body.enabled);
        toast.success(
          body.enabled ? "Auto-assign enabled." : "Auto-assign disabled.",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title="Toggle automatic lead assignment"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      <Zap className={`h-3.5 w-3.5 ${enabled ? "fill-current" : ""}`} />
      Auto-assign: {isPending ? "…" : enabled ? "ON" : "OFF"}
    </button>
  );
}
