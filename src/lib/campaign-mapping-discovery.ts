import type { Prisma } from "@prisma/client";

import {
  getCampaignMappingFieldDefinitions,
  type CampaignMappingSourceValue,
  type CsvImportColumnMapping,
  type CsvImportFieldKey,
} from "@/lib/csv-import-mapping";
import { prisma } from "@/lib/db";
import { normalizeEmpty, normaliseMetaKey } from "@/lib/utils";

type DiscoverableMappingSource = Exclude<CampaignMappingSourceValue, "CSV">;

type DiscoveredFieldOrigin = "lead_sample" | "meta_form";

type FieldAccumulator = {
  value: string;
  label: string;
  occurrenceCount: number;
  sampleValues: Set<string>;
  origins: Set<DiscoveredFieldOrigin>;
};

export type CampaignDiscoveryField = {
  value: string;
  label: string;
  occurrenceCount: number;
  sampleValues: string[];
  origins: DiscoveredFieldOrigin[];
};

export type CampaignDiscoveryTarget = {
  formId: string | null;
  campaignName: string | null;
  pageId: string | null;
  leadCount: number;
  lastSeenAt: string;
  label: string;
};

export type CampaignFieldDiscoveryResult = {
  fields: CampaignDiscoveryField[];
  suggestedMapping: CsvImportColumnMapping;
  autoDetectedMapping: CsvImportColumnMapping;
  sampleLeadCount: number;
  resolvedBy: "formId" | "campaignName" | null;
  metaFormFetched: boolean;
};

const LEAD_SOURCE_BY_MAPPING_SOURCE: Record<DiscoverableMappingSource, string> =
  {
    META: "Meta Ads",
    GOOGLE: "Google Ads",
  };

const RECENT_TARGET_SCAN_LIMIT = 200;
const RECENT_TARGET_LIMIT = 12;
const SAMPLE_LEAD_LIMIT = 30;
const SAMPLE_VALUE_LIMIT = 3;

const GOOGLE_STANDARD_COLUMN_ID_TO_FIELD_KEY: Partial<
  Record<string, CsvImportFieldKey>
> = {
  FULL_NAME: "name",
  PHONE_NUMBER: "phone",
  EMAIL: "email",
  CITY: "city",
};

const META_QUESTION_TYPE_LABELS: Record<string, string> = {
  FULL_NAME: "Full Name",
  FIRST_NAME: "First Name",
  LAST_NAME: "Last Name",
  PHONE: "Phone",
  EMAIL: "Email",
  CITY: "City",
  CUSTOM: "Custom Question",
  DATE_TIME: "Date & Time",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? normalizeEmpty(value) : undefined;
}

function humanizeToken(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getBetterFieldLabel(currentLabel: string, nextLabel: string) {
  if (!currentLabel) {
    return nextLabel;
  }

  if (currentLabel === nextLabel) {
    return currentLabel;
  }

  if (
    currentLabel === humanizeToken(currentLabel) &&
    nextLabel !== currentLabel
  ) {
    return nextLabel;
  }

  if (currentLabel === nextLabel.toLowerCase()) {
    return nextLabel;
  }

  return currentLabel.length >= nextLabel.length ? currentLabel : nextLabel;
}

function registerDiscoveredField(
  target: Map<string, FieldAccumulator>,
  input: {
    value?: string | null;
    label?: string | null;
    sampleValue?: string | null;
    origin: DiscoveredFieldOrigin;
  },
) {
  const value = normalizeEmpty(input.value);

  if (!value) {
    return;
  }

  const mapKey = normaliseMetaKey(value);

  if (!mapKey) {
    return;
  }

  const label = normalizeEmpty(input.label) ?? value;
  const sampleValue = normalizeEmpty(input.sampleValue);
  const existing = target.get(mapKey);

  if (existing) {
    existing.occurrenceCount += 1;
    existing.label = getBetterFieldLabel(existing.label, label);
    existing.origins.add(input.origin);

    if (sampleValue && existing.sampleValues.size < SAMPLE_VALUE_LIMIT) {
      existing.sampleValues.add(sampleValue);
    }

    return;
  }

  target.set(mapKey, {
    value,
    label,
    occurrenceCount: 1,
    sampleValues: sampleValue ? new Set([sampleValue]) : new Set(),
    origins: new Set([input.origin]),
  });
}

function readMetaFieldSampleValue(values: unknown) {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const firstValue = values[0];

  if (typeof firstValue === "string") {
    return normalizeEmpty(firstValue);
  }

  if (isRecord(firstValue)) {
    return Object.values(firstValue)
      .map((value) => asTrimmedString(value))
      .find(Boolean);
  }

  return undefined;
}

function extractMetaFieldsFromPayload(
  rawPayload: Prisma.JsonValue,
  target: Map<string, FieldAccumulator>,
) {
  if (!isRecord(rawPayload)) {
    return;
  }

  const lead = rawPayload.lead;

  if (!isRecord(lead) || !Array.isArray(lead.field_data)) {
    return;
  }

  lead.field_data.forEach((field) => {
    if (!isRecord(field)) {
      return;
    }

    registerDiscoveredField(target, {
      value: asTrimmedString(field.name),
      label: asTrimmedString(field.name),
      sampleValue: readMetaFieldSampleValue(field.values),
      origin: "lead_sample",
    });
  });
}

function extractGoogleFieldsFromPayload(
  rawPayload: Prisma.JsonValue,
  target: Map<string, FieldAccumulator>,
  autoDetectedMapping: CsvImportColumnMapping,
) {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.google)) {
    return;
  }

  const googlePayload = rawPayload.google;

  if (Array.isArray(googlePayload.custom_question_answers)) {
    googlePayload.custom_question_answers.forEach((answer) => {
      if (!isRecord(answer)) {
        return;
      }

      registerDiscoveredField(target, {
        value: asTrimmedString(answer.question_text),
        label: asTrimmedString(answer.question_text),
        sampleValue: asTrimmedString(answer.answer),
        origin: "lead_sample",
      });
    });
  }

  const mergedColumns = [
    ...(Array.isArray(googlePayload.column_data)
      ? googlePayload.column_data
      : []),
    ...(Array.isArray(googlePayload.user_column_data)
      ? googlePayload.user_column_data
      : []),
  ];

  mergedColumns.forEach((column) => {
    if (!isRecord(column)) {
      return;
    }

    const columnId = asTrimmedString(column.column_id);

    if (!columnId) {
      return;
    }

    const fieldKey = GOOGLE_STANDARD_COLUMN_ID_TO_FIELD_KEY[columnId];

    if (fieldKey && !autoDetectedMapping[fieldKey]) {
      autoDetectedMapping[fieldKey] = columnId;
    }
  });
}

function buildSuggestedDiscoveryMapping(
  source: DiscoverableMappingSource,
  fields: CampaignDiscoveryField[],
) {
  const mapping: CsvImportColumnMapping = {};
  const normalizedFields = fields.map((field) => ({
    value: field.value,
    candidates: new Set(
      [field.value, field.label].map((candidate) =>
        normaliseMetaKey(candidate),
      ),
    ),
  }));

  getCampaignMappingFieldDefinitions(source).forEach((definition) => {
    const matchedField = normalizedFields.find((field) =>
      definition.aliases.some((alias) =>
        field.candidates.has(normaliseMetaKey(alias)),
      ),
    );

    if (matchedField) {
      mapping[definition.key] = matchedField.value;
    }
  });

  return mapping;
}

function sortDiscoveredFields(
  left: CampaignDiscoveryField,
  right: CampaignDiscoveryField,
) {
  if (right.occurrenceCount !== left.occurrenceCount) {
    return right.occurrenceCount - left.occurrenceCount;
  }

  return left.label.localeCompare(right.label);
}

function formatTargetLabel(target: {
  formId: string | null;
  campaignName: string | null;
}) {
  const parts = [];

  if (target.campaignName) {
    parts.push(target.campaignName);
  }

  if (target.formId) {
    parts.push(`Form ${target.formId}`);
  }

  return parts.join(" · ") || "Untitled form reference";
}

function buildDiscoveryWhere(
  source: DiscoverableMappingSource,
  identifiers: { formId?: string; campaignName?: string },
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    source: LEAD_SOURCE_BY_MAPPING_SOURCE[source],
  };

  const formId = normalizeEmpty(identifiers.formId);
  const campaignName = normalizeEmpty(identifiers.campaignName);

  if (formId) {
    where.formId = formId;
  } else if (campaignName) {
    where.campaignName = campaignName;
  }

  return where;
}

async function fetchMetaFormQuestions(
  formId: string,
  pageId?: string | null,
): Promise<CampaignDiscoveryField[]> {
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!accessToken) {
    return [];
  }

  const graphVersion = process.env.META_GRAPH_VERSION ?? "v25.0";
  const resourceCandidates = [
    pageId ? `${pageId}/${formId}` : null,
    formId,
  ].filter(Boolean) as string[];

  for (const resourcePath of resourceCandidates) {
    const url = new URL(
      `https://graph.facebook.com/${graphVersion}/${resourcePath}`,
    );
    url.searchParams.set("fields", "id,name,questions");
    url.searchParams.set("access_token", accessToken);

    try {
      const response = await fetch(url.toString(), { cache: "no-store" });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as {
        questions?: Array<Record<string, unknown>>;
      };

      if (!Array.isArray(body.questions)) {
        continue;
      }

      const parsedFields = body.questions
        .map((question): CampaignDiscoveryField | null => {
          const key = asTrimmedString(question.key);

          if (!key) {
            return null;
          }

          const type = asTrimmedString(question.type)?.toUpperCase();
          const label =
            asTrimmedString(question.label) ??
            (type ? META_QUESTION_TYPE_LABELS[type] : undefined) ??
            humanizeToken(key);

          return {
            value: key,
            label,
            occurrenceCount: 0,
            sampleValues: [],
            origins: ["meta_form"],
          };
        })
        .filter((field): field is CampaignDiscoveryField => field !== null);

      return parsedFields;
    } catch {
      continue;
    }
  }

  return [];
}

export async function listRecentCampaignDiscoveryTargets(
  source: DiscoverableMappingSource,
): Promise<CampaignDiscoveryTarget[]> {
  const rows = await prisma.lead.findMany({
    where: { source: LEAD_SOURCE_BY_MAPPING_SOURCE[source] },
    select: {
      formId: true,
      campaignName: true,
      pageId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: RECENT_TARGET_SCAN_LIMIT,
  });

  const targets = new Map<
    string,
    {
      formId: string | null;
      campaignName: string | null;
      pageId: string | null;
      leadCount: number;
      lastSeenAt: Date;
    }
  >();

  rows.forEach((row) => {
    const formId = normalizeEmpty(row.formId) ?? null;
    const campaignName = normalizeEmpty(row.campaignName) ?? null;

    if (!formId && !campaignName) {
      return;
    }

    const key = `${formId ?? ""}::${campaignName ?? ""}`;
    const existing = targets.get(key);

    if (existing) {
      existing.leadCount += 1;
      return;
    }

    targets.set(key, {
      formId,
      campaignName,
      pageId: normalizeEmpty(row.pageId) ?? null,
      leadCount: 1,
      lastSeenAt: row.createdAt,
    });
  });

  return [...targets.values()].slice(0, RECENT_TARGET_LIMIT).map((target) => ({
    ...target,
    lastSeenAt: target.lastSeenAt.toISOString(),
    label: formatTargetLabel(target),
  }));
}

export async function discoverCampaignFields(
  source: DiscoverableMappingSource,
  identifiers: { formId?: string; campaignName?: string },
): Promise<CampaignFieldDiscoveryResult> {
  const rows = await prisma.lead.findMany({
    where: buildDiscoveryWhere(source, identifiers),
    select: {
      rawPayload: true,
      pageId: true,
    },
    orderBy: { createdAt: "desc" },
    take: SAMPLE_LEAD_LIMIT,
  });

  const fieldMap = new Map<string, FieldAccumulator>();
  const autoDetectedMapping: CsvImportColumnMapping = {};

  rows.forEach((row) => {
    if (!row.rawPayload) {
      return;
    }

    if (source === "META") {
      extractMetaFieldsFromPayload(row.rawPayload, fieldMap);
      return;
    }

    extractGoogleFieldsFromPayload(
      row.rawPayload,
      fieldMap,
      autoDetectedMapping,
    );
  });

  let metaFormFetched = false;
  const formId = normalizeEmpty(identifiers.formId);

  if (source === "META" && formId) {
    const pageId = rows.map((row) => normalizeEmpty(row.pageId)).find(Boolean);
    const metaFields = await fetchMetaFormQuestions(formId, pageId);

    if (metaFields.length > 0) {
      metaFormFetched = true;

      metaFields.forEach((field) => {
        registerDiscoveredField(fieldMap, {
          value: field.value,
          label: field.label,
          origin: "meta_form",
        });
      });
    }
  }

  const fields = [...fieldMap.values()]
    .map((field) => ({
      value: field.value,
      label: field.label,
      occurrenceCount: field.occurrenceCount,
      sampleValues: [...field.sampleValues],
      origins: [...field.origins],
    }))
    .sort(sortDiscoveredFields);

  return {
    fields,
    suggestedMapping: buildSuggestedDiscoveryMapping(source, fields),
    autoDetectedMapping,
    sampleLeadCount: rows.length,
    resolvedBy: formId
      ? "formId"
      : normalizeEmpty(identifiers.campaignName)
        ? "campaignName"
        : null,
    metaFormFetched,
  };
}

export function isDiscoverableCampaignSource(
  value: string | null,
): value is DiscoverableMappingSource {
  return value === "META" || value === "GOOGLE";
}
