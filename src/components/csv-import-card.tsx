"use client";

import { Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  buildCsvPreview,
  buildSuggestedCsvMapping,
  CSV_IMPORT_REQUIRED_FIELDS,
  getCsvImportFieldDefinitions,
  type CsvImportColumnMapping,
  type CsvImportFieldKey,
} from "@/lib/csv-import-mapping";
import type { CsvImportResult } from "@/lib/csv-import";
import type { DynamicLeadFieldLabels } from "@/lib/lead-field-labels";

type CsvImportCardProps = {
  templateHref: string;
  dynamicFieldLabels: DynamicLeadFieldLabels;
};

export function CsvImportCard({
  templateHref,
  dynamicFieldLabels,
}: CsvImportCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [defaultSource, setDefaultSource] = useState("CSV Import");
  const [defaultCampaignName, setDefaultCampaignName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<CsvImportColumnMapping>(
    {},
  );
  const [savedMappingLabel, setSavedMappingLabel] = useState<string | null>(
    null,
  );
  const [savingMapping, setSavingMapping] = useState(false);
  const fieldDefinitions = useMemo(
    () => getCsvImportFieldDefinitions(dynamicFieldLabels),
    [dynamicFieldLabels],
  );

  function getMissingRequiredMappings(mapping: CsvImportColumnMapping) {
    return CSV_IMPORT_REQUIRED_FIELDS.filter((fieldKey) => !mapping[fieldKey]);
  }

  function getPreviewValue(row: string[], fieldKey: CsvImportFieldKey) {
    const mappedHeader = columnMapping[fieldKey];

    if (!mappedHeader) {
      return "-";
    }

    const headerIndex = csvHeaders.indexOf(mappedHeader);

    if (headerIndex < 0) {
      return "-";
    }

    return row[headerIndex] || "-";
  }

  async function tryLoadSavedMapping(campaignName: string) {
    if (!campaignName) return null;

    try {
      const response = await fetch(
        `/api/campaign-mappings?source=CSV&campaignName=${encodeURIComponent(campaignName)}`,
      );

      if (!response.ok) return null;

      const body = await response.json();
      return body.mapping ?? null;
    } catch {
      return null;
    }
  }

  async function initializeMappingFromFile(selectedFile: File) {
    const content = await selectedFile.text();
    const preview = buildCsvPreview(content, 3);

    if (!preview.headers.length) {
      throw new Error("CSV file appears empty or missing headers.");
    }

    setCsvHeaders(preview.headers);
    setCsvPreviewRows(preview.rows);

    // Try to detect campaign name from CSV data or the default field
    const campaignForLookup = defaultCampaignName.trim();
    const suggested = buildSuggestedCsvMapping(preview.headers);
    let finalMapping = suggested;
    let loadedLabel: string | null = null;

    if (campaignForLookup) {
      const saved = await tryLoadSavedMapping(campaignForLookup);

      if (saved?.columnMapping) {
        // Merge: saved mapping wins, but only for headers present in this CSV
        const headerSet = new Set(preview.headers);
        const merged = { ...suggested };

        for (const [key, value] of Object.entries(
          saved.columnMapping as Record<string, string>,
        )) {
          if (headerSet.has(value)) {
            merged[key as CsvImportFieldKey] = value;
          }
        }

        finalMapping = merged;
        loadedLabel = saved.label;
      }
    }

    setColumnMapping(finalMapping);
    setSavedMappingLabel(loadedLabel);
    setMappingOpen(true);
  }

  async function saveCurrentMapping() {
    const campaign = defaultCampaignName.trim();

    if (!campaign) {
      setError("Enter a campaign name before saving the mapping.");
      return;
    }

    setSavingMapping(true);

    try {
      const response = await fetch("/api/campaign-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "CSV",
          label: campaign,
          campaignName: campaign,
          columnMapping,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Unable to save mapping.");
        return;
      }

      setSavedMappingLabel(campaign);
    } catch {
      setError("Unable to save mapping.");
    } finally {
      setSavingMapping(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="section-title">CSV Import</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Upload a CRM template or raw Meta leads export. Duplicate phones are
            skipped; Meta rows enrich existing leads.
          </p>
        </div>
        <a
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          href={templateHref}
          download
        >
          Download template
        </a>
      </div>

      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();

          if (!file) {
            setError("Choose a CSV file first.");
            return;
          }

          if (!csvHeaders.length) {
            setError("Open header mapping and confirm the required fields.");
            setMappingOpen(true);
            return;
          }

          const missingRequiredFields =
            getMissingRequiredMappings(columnMapping);

          if (missingRequiredFields.length > 0) {
            setError("Map required fields: Name and Phone.");
            setMappingOpen(true);
            return;
          }

          setError(null);

          startTransition(async () => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("defaultSource", defaultSource);
            formData.append("defaultCampaignName", defaultCampaignName);
            formData.append("columnMapping", JSON.stringify(columnMapping));

            const response = await fetch("/api/leads/import", {
              method: "POST",
              body: formData,
            });
            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
              setError(body.error ?? "Unable to import the CSV.");
              return;
            }

            setResult(body);
            setFile(null);
            setCsvHeaders([]);
            setCsvPreviewRows([]);
            setColumnMapping({});
            router.refresh();
          });
        }}
      >
        <div>
          <label className="field-label" htmlFor="csv-file">
            CSV File
          </label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] ?? null;
              setFile(selectedFile);
              setResult(null);

              if (!selectedFile) {
                setCsvHeaders([]);
                setCsvPreviewRows([]);
                setColumnMapping({});
                setMappingOpen(false);
                return;
              }

              void initializeMappingFromFile(selectedFile).catch(
                (mappingError) => {
                  setError(
                    mappingError instanceof Error
                      ? mappingError.message
                      : "Unable to prepare CSV mapping.",
                  );
                },
              );
            }}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="csv-source">
              Default Source
            </label>
            <input
              id="csv-source"
              value={defaultSource}
              onChange={(event) => setDefaultSource(event.target.value)}
              placeholder="CSV Import"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="csv-campaign">
              Default Campaign
            </label>
            <input
              id="csv-campaign"
              value={defaultCampaignName}
              onChange={(event) => setDefaultCampaignName(event.target.value)}
              placeholder="Delhi Counselling Batch"
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Header mapping is supported for variable campaign files (Meta, Google,
          and others). Required fields: <code>name</code> and <code>phone</code>
          .
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="button-secondary"
            disabled={!file}
            onClick={() => {
              if (!file) {
                return;
              }

              setMappingOpen(true);
            }}
          >
            Map Headers
          </button>
          <button
            className="button-primary"
            disabled={pending || !file}
            type="submit"
          >
            {pending ? "Importing..." : "Import CSV"}
          </button>
          {file ? <p className="text-sm text-slate-500">{file.name}</p> : null}
        </div>

        {error ? <div className="alert-error">{error}</div> : null}

        {result ? (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Rows
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {result.totalRows}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Created
                </p>
                <p className="mt-1 text-2xl font-semibold text-emerald-600">
                  {result.created}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Duplicates
                </p>
                <p className="mt-1 text-2xl font-semibold text-amber-600">
                  {result.duplicates}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Failed
                </p>
                <p className="mt-1 text-2xl font-semibold text-red-600">
                  {result.failed}
                </p>
              </div>
            </div>

            {result.errors.length > 0 ? (
              <div>
                <p className="field-label">Row Errors</p>
                <div className="space-y-1 text-sm text-red-600">
                  {result.errors.slice(0, 5).map((issue) => (
                    <p key={`${issue.row}-${issue.message}`}>
                      Row {issue.row}: {issue.message}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {result.duplicateRows.length > 0 ? (
              <div>
                <p className="field-label">Duplicates Skipped</p>
                <div className="space-y-1 text-sm text-amber-600">
                  {result.duplicateRows.slice(0, 5).map((duplicate) => (
                    <p key={`${duplicate.row}-${duplicate.phone}`}>
                      Row {duplicate.row}: {duplicate.name} ({duplicate.phone})
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      {mappingOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Map CSV Headers
                </h3>
                <p className="text-sm text-slate-500">
                  Match incoming columns to CRM fields before import.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                onClick={() => setMappingOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-140px)] space-y-5 overflow-y-auto p-5">
              {savedMappingLabel ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <Save className="h-4 w-4 shrink-0" />
                  Loaded saved mapping for &ldquo;{savedMappingLabel}&rdquo;
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {fieldDefinitions.map((field) => (
                  <label key={field.key} className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">
                      {field.label}
                      {field.required ? (
                        <span className="ml-1 text-red-600">*</span>
                      ) : null}
                    </span>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      value={columnMapping[field.key] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setColumnMapping((prev) => ({
                          ...prev,
                          [field.key]: value || undefined,
                        }));
                      }}
                    >
                      <option value="">Not mapped</option>
                      {csvHeaders.map((header) => (
                        <option key={`${field.key}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-medium text-slate-800">
                    Preview (first {csvPreviewRows.length} row
                    {csvPreviewRows.length === 1 ? "" : "s"})
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Field</th>
                        {csvPreviewRows.map((_, index) => (
                          <th key={`row-${index}`} className="px-4 py-2">
                            Row {index + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fieldDefinitions.map((field) => (
                        <tr
                          key={`preview-${field.key}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-4 py-2 font-medium text-slate-700">
                            {field.label}
                          </td>
                          {csvPreviewRows.map((row, index) => (
                            <td
                              key={`${field.key}-${index}`}
                              className="px-4 py-2 text-slate-600"
                            >
                              {getPreviewValue(row, field.key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {getMissingRequiredMappings(columnMapping).length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Please map required fields: Name and Phone.
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                className="button-secondary gap-1.5 text-xs"
                disabled={savingMapping}
                onClick={() => void saveCurrentMapping()}
              >
                <Save className="h-3.5 w-3.5" />
                {savingMapping ? "Saving..." : "Save mapping for campaign"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setMappingOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    const missingRequiredFields =
                      getMissingRequiredMappings(columnMapping);

                    if (missingRequiredFields.length > 0) {
                      setError("Map required fields: Name and Phone.");
                      return;
                    }

                    setError(null);
                    setMappingOpen(false);
                  }}
                >
                  Use Mapping
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
