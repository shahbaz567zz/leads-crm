"use client";

import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_DYNAMIC_LEAD_FIELD_LABELS,
  type DynamicLeadFieldLabels,
} from "@/lib/lead-field-labels";

export function LeadFieldSettingsCard({
  initialLabels,
}: {
  initialLabels: DynamicLeadFieldLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [labels, setLabels] = useState(initialLabels);

  useEffect(() => {
    setLabels(initialLabels);
  }, [initialLabels]);

  function updateLabel(key: keyof DynamicLeadFieldLabels, value: string) {
    setLabels((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/lead-field-labels", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(labels),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to update field labels.");
        }

        toast.success("Dynamic field labels updated.");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to update field labels.",
        );
      }
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Dynamic Field Labels
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Rename the three extra lead slots so the dashboard, lead detail page,
          and mapping screens use business-friendly labels.
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Dynamic Field 1
            </span>
            <Input
              value={labels.dynamicField1}
              maxLength={80}
              onChange={(event) =>
                updateLabel("dynamicField1", event.target.value)
              }
              placeholder={DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField1}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Dynamic Field 2
            </span>
            <Input
              value={labels.dynamicField2}
              maxLength={80}
              onChange={(event) =>
                updateLabel("dynamicField2", event.target.value)
              }
              placeholder={DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField2}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Dynamic Field 3
            </span>
            <Input
              value={labels.dynamicField3}
              maxLength={80}
              onChange={(event) =>
                updateLabel("dynamicField3", event.target.value)
              }
              placeholder={DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField3}
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Clear any label and save to restore its default name.
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setLabels(DEFAULT_DYNAMIC_LEAD_FIELD_LABELS)}
          >
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </Button>

          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={pending}
            onClick={handleSave}
          >
            <Save className="h-4 w-4" />
            {pending ? "Saving..." : "Save Labels"}
          </Button>
        </div>
      </div>
    </section>
  );
}
