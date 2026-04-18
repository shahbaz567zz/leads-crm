"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import {
  getCampaignMappingFieldDefinitions,
  getCampaignMappingFieldKeys,
  type CampaignMappingSourceValue,
  type CsvImportColumnMapping,
} from "@/lib/csv-import-mapping";
import type { DynamicLeadFieldLabels } from "@/lib/lead-field-labels";

type DiscoveryField = {
  value: string;
  label: string;
  occurrenceCount: number;
  sampleValues: string[];
  origins: Array<"lead_sample" | "meta_form">;
};

type DiscoveryTarget = {
  formId: string | null;
  campaignName: string | null;
  pageId: string | null;
  leadCount: number;
  lastSeenAt: string;
  label: string;
};

type DiscoverySummary = {
  sampleLeadCount: number;
  resolvedBy: "formId" | "campaignName" | null;
  metaFormFetched: boolean;
};

type MappingRow = {
  id: string;
  source: CampaignMappingSourceValue;
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

const SOURCES: CampaignMappingSourceValue[] = ["META", "GOOGLE", "CSV"];

function countFilledMappingFields(
  mapping: CsvImportColumnMapping,
  source: CampaignMappingSourceValue,
) {
  return getCampaignMappingFieldKeys(source).filter((fieldKey) =>
    Boolean(mapping[fieldKey]?.trim()),
  ).length;
}

function sanitizeMappingForSource(
  source: CampaignMappingSourceValue,
  mapping: CsvImportColumnMapping,
) {
  const next: CsvImportColumnMapping = {};

  getCampaignMappingFieldKeys(source).forEach((fieldKey) => {
    const value = mapping[fieldKey]?.trim();

    if (value) {
      next[fieldKey] = value;
    }
  });

  return next;
}

function buildTargetValue(target: {
  formId: string | null;
  campaignName: string | null;
}) {
  return `${target.formId ?? ""}::${target.campaignName ?? ""}`;
}

function getDiscoverySummaryText(
  source: CampaignMappingSourceValue,
  summary: DiscoverySummary,
  fieldCount: number,
) {
  const parts = [];

  if (fieldCount > 0) {
    parts.push(
      `Detected ${fieldCount} exact field${fieldCount === 1 ? "" : "s"}`,
    );
  } else {
    parts.push("No custom fields detected yet");
  }

  if (summary.sampleLeadCount > 0) {
    parts.push(
      `from ${summary.sampleLeadCount} recent ${source === "META" ? "Meta" : "Google"} lead${summary.sampleLeadCount === 1 ? "" : "s"}`,
    );
  }

  if (summary.metaFormFetched) {
    parts.push("plus live Meta form questions");
  }

  return parts.join(" ");
}

export function CampaignMappingList({
  initialMappings,
  isAdmin,
  dynamicFieldLabels,
}: {
  initialMappings: MappingRow[];
  isAdmin: boolean;
  dynamicFieldLabels: DynamicLeadFieldLabels;
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
                const fieldCount = countFilledMappingFields(
                  mapping.columnMapping ?? {},
                  mapping.source,
                );

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
          dynamicFieldLabels={dynamicFieldLabels}
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
  dynamicFieldLabels,
  existing,
  onClose,
}: {
  dynamicFieldLabels: DynamicLeadFieldLabels;
  existing: MappingRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const discoveredFieldListId = useId();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<CampaignMappingSourceValue>(
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
  const [recentTargets, setRecentTargets] = useState<DiscoveryTarget[]>([]);
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveryField[]>(
    [],
  );
  const [discoverySummary, setDiscoverySummary] =
    useState<DiscoverySummary | null>(null);
  const [autoDetectedMapping, setAutoDetectedMapping] =
    useState<CsvImportColumnMapping>({});
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [discoveringFields, setDiscoveringFields] = useState(false);
  const [discoveryLoaded, setDiscoveryLoaded] = useState(false);

  const fieldDefinitions = getCampaignMappingFieldDefinitions(
    source,
    dynamicFieldLabels,
  );
  const isWebhookSource = source !== "CSV";
  const selectedTargetValue = recentTargets.find(
    (target) =>
      target.formId === (formId.trim() || null) &&
      target.campaignName === (campaignName.trim() || null),
  )
    ? buildTargetValue({
        formId: formId.trim() || null,
        campaignName: campaignName.trim() || null,
      })
    : "";

  useEffect(() => {
    let cancelled = false;

    if (!isWebhookSource) {
      setRecentTargets([]);
      setDiscoveredFields([]);
      setDiscoverySummary(null);
      setAutoDetectedMapping({});
      setDiscoveryLoaded(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingTargets(true);

    void fetch(`/api/campaign-mappings/discovery?source=${source}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          return;
        }

        if (!cancelled) {
          setRecentTargets(
            Array.isArray(body.recentTargets) ? body.recentTargets : [],
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentTargets([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTargets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isWebhookSource, source]);

  async function handleDiscoverFields() {
    if (!isWebhookSource) {
      return;
    }

    if (!formId.trim() && !campaignName.trim()) {
      setError("Enter Form ID or Campaign Name before detecting fields.");
      return;
    }

    const searchParams = new URLSearchParams({ source });

    if (formId.trim()) {
      searchParams.set("formId", formId.trim());
    }

    if (campaignName.trim()) {
      searchParams.set("campaignName", campaignName.trim());
    }

    setError(null);
    setDiscoveringFields(true);

    try {
      const response = await fetch(
        `/api/campaign-mappings/discovery?${searchParams.toString()}`,
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Unable to detect source fields.");
        return;
      }

      const nextFields = Array.isArray(body.fields) ? body.fields : [];
      const nextRecentTargets = Array.isArray(body.recentTargets)
        ? body.recentTargets
        : [];
      const nextSuggestedMapping = sanitizeMappingForSource(
        source,
        (body.suggestedMapping as CsvImportColumnMapping | undefined) ?? {},
      );
      const nextAutoDetectedMapping = sanitizeMappingForSource(
        source,
        (body.autoDetectedMapping as CsvImportColumnMapping | undefined) ?? {},
      );
      const nextSummary: DiscoverySummary = {
        sampleLeadCount:
          typeof body.sampleLeadCount === "number" ? body.sampleLeadCount : 0,
        resolvedBy:
          body.resolvedBy === "formId" || body.resolvedBy === "campaignName"
            ? body.resolvedBy
            : null,
        metaFormFetched: Boolean(body.metaFormFetched),
      };

      setRecentTargets(nextRecentTargets);
      setDiscoveredFields(nextFields);
      setAutoDetectedMapping(nextAutoDetectedMapping);
      setDiscoverySummary(nextSummary);
      setDiscoveryLoaded(true);

      let appliedCount = 0;

      setColumnMapping((previous) => {
        const next = { ...previous };

        getCampaignMappingFieldKeys(source).forEach((fieldKey) => {
          const suggestedValue = nextSuggestedMapping[fieldKey];

          if (!next[fieldKey]?.trim() && suggestedValue) {
            next[fieldKey] = suggestedValue;
            appliedCount += 1;
          }
        });

        return next;
      });

      if (nextFields.length > 0) {
        toast.success(
          appliedCount > 0
            ? `Detected ${nextFields.length} fields. Auto-filled ${appliedCount} CRM mapping${appliedCount === 1 ? "" : "s"}.`
            : `Detected ${nextFields.length} fields for mapping.`,
        );
        return;
      }

      if (source === "GOOGLE" && nextSummary.sampleLeadCount > 0) {
        toast(
          "No custom Google questions were found. Standard fields like name, phone, email, and city are already captured automatically.",
        );
        return;
      }

      toast("No fields were detected for this form or campaign yet.");
    } catch {
      setError("Unable to detect source fields.");
    } finally {
      setDiscoveringFields(false);
    }
  }

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

    const sanitizedMapping = sanitizeMappingForSource(source, columnMapping);

    startSave(async () => {
      const response = await fetch("/api/campaign-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          label: label.trim(),
          campaignName: campaignName.trim() || undefined,
          formId: formId.trim() || undefined,
          columnMapping: sanitizedMapping,
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
                  setSource(e.target.value as CampaignMappingSourceValue)
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

          {isWebhookSource ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Fetch Source Fields
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose a recent form or campaign, or enter identifiers
                    manually, then detect the exact external field keys before
                    mapping them to the CRM.
                  </p>
                </div>
                <button
                  type="button"
                  className="button-secondary gap-1.5 text-sm"
                  disabled={discoveringFields}
                  onClick={() => void handleDiscoverFields()}
                >
                  <Search className="h-4 w-4" />
                  {discoveringFields ? "Detecting..." : "Detect Fields"}
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label">
                    Recent Forms / Campaigns
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
                    disabled={loadingTargets || recentTargets.length === 0}
                    value={selectedTargetValue}
                    onChange={(event) => {
                      const target = recentTargets.find(
                        (item) => buildTargetValue(item) === event.target.value,
                      );

                      if (!target) {
                        return;
                      }

                      setFormId(target.formId ?? "");
                      setCampaignName(target.campaignName ?? "");
                    }}
                  >
                    <option value="">
                      {loadingTargets
                        ? "Loading recent forms..."
                        : recentTargets.length > 0
                          ? "Select a recent form or campaign"
                          : "No recent forms detected yet"}
                    </option>
                    {recentTargets.map((target) => (
                      <option
                        key={`${target.lastSeenAt}-${buildTargetValue(target)}`}
                        value={buildTargetValue(target)}
                      >
                        {`${target.label} · ${target.leadCount} lead${target.leadCount === 1 ? "" : "s"}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Campaign Name</label>
                  <input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="Delhi Counselling Batch"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Form ID</label>
                <input
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="Meta or Google form ID"
                />
              </div>

              {discoverySummary ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {getDiscoverySummaryText(
                    source,
                    discoverySummary,
                    discoveredFields.length,
                  )}
                </div>
              ) : null}

              {discoveredFields.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-800">
                    Detected Fields
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    These are the exact keys that can be selected from the
                    mapping inputs below.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {discoveredFields.map((field) => (
                      <div
                        key={field.value}
                        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {field.label}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-500">
                          {field.value}
                        </p>
                        {field.sampleValues[0] ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Sample: {field.sampleValues[0]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {discoveryLoaded && discoveredFields.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {source === "GOOGLE"
                    ? "No custom Google questions were found for this selection. Standard Google fields like name, phone, email, and city are already captured automatically."
                    : "No Meta fields were detected for this selection yet. Try another form or campaign, or fetch again after at least one lead arrives."}
                </div>
              ) : null}
            </div>
          ) : (
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
                  placeholder="CSV batch or external form reference"
                />
              </div>
            </div>
          )}

          <div>
            <p className="field-label mb-2">CRM Field Mapping</p>
            <p className="mb-3 text-xs text-slate-500">
              {isWebhookSource
                ? "Pick a detected field key or type it manually. Campaign, ad, and source metadata are already captured automatically for webhook leads."
                : "Enter the exact CSV header that maps to each CRM field."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fieldDefinitions.map((field) => {
                const detectedField = discoveredFields.find(
                  (item) => item.value === columnMapping[field.key],
                );
                const autoDetectedValue = autoDetectedMapping[field.key];

                return (
                  <label key={field.key} className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">
                      {field.label}
                      {!isWebhookSource && field.required ? (
                        <span className="ml-1 text-red-600">*</span>
                      ) : null}
                    </span>
                    <input
                      className="h-9 text-sm"
                      list={
                        isWebhookSource && discoveredFields.length > 0
                          ? discoveredFieldListId
                          : undefined
                      }
                      value={columnMapping[field.key] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setColumnMapping((prev) => ({
                          ...prev,
                          [field.key]: value || undefined,
                        }));
                      }}
                      placeholder={
                        isWebhookSource
                          ? "Select detected key or type exact field name"
                          : field.aliases[0]
                      }
                    />
                    {detectedField &&
                    detectedField.label !== detectedField.value ? (
                      <p className="text-xs text-slate-500">
                        Selected label: {detectedField.label}
                      </p>
                    ) : null}
                    {autoDetectedValue && !columnMapping[field.key] ? (
                      <p className="text-xs text-emerald-700">
                        Auto-captured from Google standard field{" "}
                        {autoDetectedValue}. Add a custom mapping only if your
                        form uses a custom question instead.
                      </p>
                    ) : null}
                  </label>
                );
              })}
            </div>

            {isWebhookSource && discoveredFields.length > 0 ? (
              <datalist id={discoveredFieldListId}>
                {discoveredFields.map((field) => (
                  <option
                    key={field.value}
                    value={field.value}
                    label={
                      field.label !== field.value
                        ? `${field.label}`
                        : (field.sampleValues[0] ?? undefined)
                    }
                  />
                ))}
              </datalist>
            ) : null}
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
