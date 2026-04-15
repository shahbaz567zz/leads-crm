"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import {
  CSV_IMPORT_FIELD_DEFINITIONS,
  type CsvImportColumnMapping,
} from "@/lib/csv-import-mapping";

type MappingRow = {
  id: string;
  source: "META" | "GOOGLE" | "CSV";
  label: string;
  campaignName: string | null;
  formId: string | null;
  columnMapping: CsvImportColumnMapping;
  updatedAt: string | Date;
};

const SOURCE_COLORS: Record<string, string> = {
  META: "bg-blue-100 text-blue-700",
  GOOGLE: "bg-amber-100 text-amber-700",
  CSV: "bg-slate-100 text-slate-700",
};

const SOURCES = ["META", "GOOGLE", "CSV"] as const;

export function CampaignMappingList({
  initialMappings,
  isAdmin,
}: {
  initialMappings: MappingRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<MappingRow | null>(null);

  function handleDelete(id: string) {
    if (!window.confirm("Delete this campaign mapping?")) return;

    startDelete(async () => {
      const response = await fetch(`/api/campaign-mappings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error("Failed to delete mapping.");
        return;
      }

      toast.success("Mapping deleted.");
      router.refresh();
    });
  }

  function handleEdit(mapping: MappingRow) {
    setEditingMapping(mapping);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="button-primary gap-1.5 text-sm"
          onClick={() => {
            setEditingMapping(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Mapping
        </button>
      </div>

      {initialMappings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No campaign mappings saved yet. Create one to auto-map CSV headers
            or webhook fields for a specific campaign.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Label</th>
                <th>Campaign</th>
                <th>Form ID</th>
                <th>Fields</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialMappings.map((mapping) => {
                const fieldCount = Object.keys(
                  mapping.columnMapping ?? {},
                ).length;

                return (
                  <tr key={mapping.id}>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[mapping.source] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {mapping.source}
                      </span>
                    </td>
                    <td className="font-medium text-slate-900">
                      {mapping.label}
                    </td>
                    <td>{mapping.campaignName ?? "-"}</td>
                    <td className="font-mono text-xs">
                      {mapping.formId
                        ? mapping.formId.length > 16
                          ? `${mapping.formId.slice(0, 16)}…`
                          : mapping.formId
                        : "-"}
                    </td>
                    <td>{fieldCount} mapped</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit"
                          onClick={() => handleEdit(mapping)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                            disabled={deleting}
                            onClick={() => handleDelete(mapping.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <MappingFormModal
          existing={editingMapping}
          onClose={() => {
            setFormOpen(false);
            setEditingMapping(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal form for creating / editing a mapping                        */
/* ------------------------------------------------------------------ */

function MappingFormModal({
  existing,
  onClose,
}: {
  existing: MappingRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<"META" | "GOOGLE" | "CSV">(
    existing?.source ?? "META",
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [campaignName, setCampaignName] = useState(
    existing?.campaignName ?? "",
  );
  const [formId, setFormId] = useState(existing?.formId ?? "");
  const [columnMapping, setColumnMapping] = useState<CsvImportColumnMapping>(
    existing?.columnMapping ?? {},
  );

  function handleSubmit() {
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }

    if (!campaignName.trim() && !formId.trim()) {
      setError("Either Campaign Name or Form ID is required.");
      return;
    }

    setError(null);

    startSave(async () => {
      const response = await fetch("/api/campaign-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          label: label.trim(),
          campaignName: campaignName.trim() || undefined,
          formId: formId.trim() || undefined,
          columnMapping,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Unable to save mapping.");
        return;
      }

      toast.success(existing ? "Mapping updated." : "Mapping created.");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {existing ? "Edit Campaign Mapping" : "New Campaign Mapping"}
          </h3>
          <button
            type="button"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-140px)] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Source</label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as "META" | "GOOGLE" | "CSV")
                }
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Delhi Counselling 2026 - Meta"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Campaign Name</label>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Delhi Counselling Batch"
              />
            </div>
            <div>
              <label className="field-label">Form ID</label>
              <input
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="Meta/Google form ID"
              />
            </div>
          </div>

          <div>
            <p className="field-label mb-2">Column → Field Mapping</p>
            <p className="mb-3 text-xs text-slate-500">
              Enter the exact header name (CSV) or form field name (Meta/Google)
              that maps to each CRM field.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CSV_IMPORT_FIELD_DEFINITIONS.map((field) => (
                <label key={field.key} className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required ? (
                      <span className="ml-1 text-red-600">*</span>
                    ) : null}
                  </span>
                  <input
                    className="h-9 text-sm"
                    value={columnMapping[field.key] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setColumnMapping((prev) => ({
                        ...prev,
                        [field.key]: value || undefined,
                      }));
                    }}
                    placeholder={field.aliases[0]}
                  />
                </label>
              ))}
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : existing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
