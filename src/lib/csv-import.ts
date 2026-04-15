import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import type { SessionUser } from "@/lib/auth";
import { LEAD_PRIORITIES, type LeadPriorityValue } from "@/lib/crm-constants";
import {
  type CsvImportColumnMapping,
  type CsvImportFieldKey,
  getCsvFieldAliases,
  parseCsvRows,
} from "@/lib/csv-import-mapping";
import { prisma } from "@/lib/db";
import { createLead } from "@/lib/lead-service";
import { createLeadSchema } from "@/lib/validations";
import {
  inferLeadPriority,
  normalizeEmpty,
  normalizeIndianPhone,
  normaliseMetaKey,
  parseOptionalDate,
} from "@/lib/utils";

const MAX_IMPORT_ROWS = 500;
const META_TEST_MARKER = "<test lead:";
const GENERIC_SOURCE_LABELS = new Set(["csv import", "manual entry"]);
const META_CSV_SIGNALS = new Set([
  "created_time",
  "lead_status",
  "platform",
  "is_organic",
  "ad_id",
  "adset_id",
  "campaign_id",
  "form_id",
  "where_did_you_complete_your_12th_from",
  "what_is_your_expected_actual_jee_main_rank",
]);

type CsvImportOptions = {
  defaultSource?: string;
  defaultCampaignName?: string;
  columnMapping?: CsvImportColumnMapping;
};

type CsvLeadPayloadDraft = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  twelfthLocation?: string;
  jeeRankRange?: string;
  courseInterest?: string;
  source?: string;
  campaignName?: string;
  priority?: LeadPriorityValue;
  assignedToId?: string;
};

type ImportedCsvLead = {
  payload: CsvLeadPayloadDraft;
  metaLeadId?: string;
  createdAt?: Date;
  adsetName?: string;
  adName?: string;
  formId?: string;
  rawPayload?: Record<string, unknown>;
  isMetaCsv: boolean;
};

type CsvImportIssue = {
  row: number;
  message: string;
};

type CsvImportDuplicate = {
  row: number;
  name: string;
  phone: string;
};

export type CsvImportResult = {
  totalRows: number;
  created: number;
  duplicates: number;
  failed: number;
  createdLeadIds: string[];
  duplicateRows: CsvImportDuplicate[];
  errors: CsvImportIssue[];
};

function getField(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = normalizeEmpty(record[normaliseMetaKey(alias)]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getMappedField(
  record: Record<string, string>,
  mapping: CsvImportColumnMapping | undefined,
  fieldKey: CsvImportFieldKey,
) {
  const mappedHeader = mapping?.[fieldKey];

  if (mappedHeader) {
    const mappedValue = normalizeEmpty(record[normaliseMetaKey(mappedHeader)]);

    if (mappedValue) {
      return mappedValue;
    }
  }

  return getField(record, getCsvFieldAliases(fieldKey));
}

function normalizePriority(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]+/g, "_");

  return LEAD_PRIORITIES.includes(normalized as LeadPriorityValue)
    ? (normalized as LeadPriorityValue)
    : undefined;
}

function toRecord(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>(
    (accumulator, header, index) => {
      accumulator[header] = row[index] ?? "";
      return accumulator;
    },
    {},
  );
}

function detectMetaCsv(headers: string[]) {
  const signalCount = headers.filter((header) =>
    META_CSV_SIGNALS.has(header),
  ).length;

  return signalCount >= 2;
}

function parseBooleanish(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function isMetaTestValue(value?: string) {
  return value?.toLowerCase().includes(META_TEST_MARKER) ?? false;
}

function deriveMetaSource(record: Record<string, string>, fallback?: string) {
  const platform = getField(record, ["platform"])?.toLowerCase();
  const isOrganic = parseBooleanish(getField(record, ["is_organic"]));

  if (isOrganic) {
    if (platform === "ig") {
      return "Meta Organic - Instagram";
    }

    if (platform === "fb") {
      return "Meta Organic - Facebook";
    }

    return "Meta Organic";
  }

  if (platform === "ig") {
    return "Meta Ads - Instagram";
  }

  if (platform === "fb") {
    return "Meta Ads - Facebook";
  }

  return fallback ?? "Meta Ads";
}

function buildImportPayload(
  record: Record<string, string>,
  options: CsvImportOptions,
  assignedToId: string | undefined,
  isMetaCsv: boolean,
): ImportedCsvLead {
  const twelfthLocation = getMappedField(
    record,
    options.columnMapping,
    "twelfthLocation",
  );
  const jeeRankRange = getMappedField(
    record,
    options.columnMapping,
    "jeeRankRange",
  );
  const campaignName =
    getMappedField(record, options.columnMapping, "campaignName") ??
    options.defaultCampaignName;
  const source = isMetaCsv
    ? deriveMetaSource(record, options.defaultSource)
    : (getMappedField(record, options.columnMapping, "source") ??
      options.defaultSource);
  const priority =
    normalizePriority(
      getMappedField(record, options.columnMapping, "priority"),
    ) ?? (isMetaCsv ? inferLeadPriority(jeeRankRange) : undefined);

  return {
    payload: {
      name: getMappedField(record, options.columnMapping, "name"),
      phone: getMappedField(record, options.columnMapping, "phone"),
      email: getMappedField(record, options.columnMapping, "email"),
      city: getMappedField(record, options.columnMapping, "city"),
      twelfthLocation,
      jeeRankRange,
      courseInterest: getMappedField(
        record,
        options.columnMapping,
        "courseInterest",
      ),
      source,
      campaignName,
      priority,
      assignedToId,
    },
    metaLeadId: isMetaCsv
      ? getField(record, ["meta_lead_id", "lead_id", "leadgen_id", "id"])
      : undefined,
    createdAt: isMetaCsv
      ? parseOptionalDate(getField(record, ["created_time"]))
      : undefined,
    adsetName: isMetaCsv ? getField(record, ["adset_name"]) : undefined,
    adName: isMetaCsv ? getField(record, ["ad_name"]) : undefined,
    formId: isMetaCsv ? getField(record, ["form_id"]) : undefined,
    rawPayload: isMetaCsv
      ? {
          importSource: "meta-csv",
          row: record,
        }
      : undefined,
    isMetaCsv,
  };
}

async function findExistingLeadForImport(
  phoneNormalized: string,
  metaLeadId?: string,
) {
  const filters: Array<Record<string, string>> = [{ phoneNormalized }];

  if (metaLeadId) {
    filters.unshift({ metaLeadId });
  }

  return prisma.lead.findFirst({
    where: {
      OR: filters,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      twelfthLocation: true,
      jeeRankRange: true,
      courseInterest: true,
      source: true,
      campaignName: true,
      adsetName: true,
      adName: true,
      formId: true,
      metaLeadId: true,
      rawPayload: true,
      createdAt: true,
    },
  });
}

function shouldOverwriteSource(existingSource: string, nextSource?: string) {
  if (!nextSource) {
    return false;
  }

  const normalizedExisting = existingSource.trim().toLowerCase();
  const normalizedNext = nextSource.trim().toLowerCase();

  if (normalizedExisting === normalizedNext) {
    return false;
  }

  return (
    GENERIC_SOURCE_LABELS.has(normalizedExisting) ||
    normalizedExisting.startsWith("meta ads") ||
    normalizedExisting.startsWith("meta organic")
  );
}

async function enrichLeadFromMetaCsv(
  leadId: string,
  importedLead: ImportedCsvLead,
) {
  const updateData: Prisma.LeadUpdateInput = {};

  if (importedLead.metaLeadId) {
    updateData.metaLeadId = importedLead.metaLeadId;
  }

  if (importedLead.adsetName) {
    updateData.adsetName = importedLead.adsetName;
  }

  if (importedLead.adName) {
    updateData.adName = importedLead.adName;
  }

  if (importedLead.formId) {
    updateData.formId = importedLead.formId;
  }

  if (importedLead.createdAt) {
    updateData.createdAt = importedLead.createdAt;
  }

  if (importedLead.rawPayload) {
    updateData.rawPayload = importedLead.rawPayload as Prisma.InputJsonValue;
  }

  if (Object.keys(updateData).length === 0) {
    return;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: updateData,
  });
}

async function mergeExistingLeadFromMetaCsv(
  existingLead: Awaited<ReturnType<typeof findExistingLeadForImport>>,
  importedLead: ImportedCsvLead,
) {
  if (!existingLead) {
    return;
  }

  const nextCreatedAt =
    importedLead.createdAt && importedLead.createdAt < existingLead.createdAt
      ? importedLead.createdAt
      : undefined;

  await prisma.lead.update({
    where: { id: existingLead.id },
    data: {
      metaLeadId: existingLead.metaLeadId ?? importedLead.metaLeadId,
      name:
        existingLead.name.trim().toLowerCase() === "meta lead"
          ? importedLead.payload.name
          : undefined,
      phone: existingLead.phone || importedLead.payload.phone,
      email: existingLead.email ?? importedLead.payload.email,
      city: existingLead.city ?? importedLead.payload.city,
      twelfthLocation:
        existingLead.twelfthLocation ?? importedLead.payload.twelfthLocation,
      jeeRankRange:
        existingLead.jeeRankRange ?? importedLead.payload.jeeRankRange,
      courseInterest:
        existingLead.courseInterest ?? importedLead.payload.courseInterest,
      source: shouldOverwriteSource(
        existingLead.source,
        importedLead.payload.source,
      )
        ? importedLead.payload.source
        : undefined,
      campaignName:
        importedLead.payload.campaignName ?? existingLead.campaignName,
      adsetName: importedLead.adsetName ?? existingLead.adsetName,
      adName: importedLead.adName ?? existingLead.adName,
      formId: importedLead.formId ?? existingLead.formId,
      rawPayload:
        existingLead.rawPayload ??
        (importedLead.rawPayload as Prisma.InputJsonValue | undefined),
      createdAt: nextCreatedAt,
    },
  });
}

export async function importLeadsFromCsv(
  content: string,
  actor: SessionUser,
  options: CsvImportOptions,
): Promise<CsvImportResult> {
  const rows = parseCsvRows(content);

  if (rows.length < 2) {
    throw new Error(
      "The CSV file must contain a header row and at least one lead row.",
    );
  }

  const [headerRow, ...dataRows] = rows;

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `CSV import is limited to ${MAX_IMPORT_ROWS} rows at a time.`,
    );
  }

  const headers = headerRow.map((header) => normaliseMetaKey(header));
  const isMetaCsv = detectMetaCsv(headers);
  const telecallers = await prisma.user.findMany({
    where: {
      role: "TELECALLER",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
    },
  });
  const telecallerByEmail = new Map(
    telecallers.map((telecaller) => [
      telecaller.email.toLowerCase(),
      telecaller.id,
    ]),
  );

  const result: CsvImportResult = {
    totalRows: dataRows.length,
    created: 0,
    duplicates: 0,
    failed: 0,
    createdLeadIds: [],
    duplicateRows: [],
    errors: [],
  };

  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;

    try {
      const record = toRecord(headers, row);
      const assignedToEmail = getMappedField(
        record,
        options.columnMapping,
        "assignedToEmail",
      )?.toLowerCase();
      const assignedToIdFromCsv = getMappedField(
        record,
        options.columnMapping,
        "assignedToId",
      );
      const assignedToId = assignedToIdFromCsv
        ? assignedToIdFromCsv
        : assignedToEmail
          ? telecallerByEmail.get(assignedToEmail)
          : undefined;

      if (assignedToEmail && !assignedToId) {
        throw new Error(`No active telecaller found for ${assignedToEmail}.`);
      }

      const importedLead = buildImportPayload(
        record,
        options,
        assignedToId,
        isMetaCsv,
      );

      if (
        importedLead.isMetaCsv &&
        (isMetaTestValue(importedLead.payload.name) ||
          isMetaTestValue(importedLead.payload.phone))
      ) {
        throw new Error("Meta test lead row skipped.");
      }

      const payload = createLeadSchema.parse(importedLead.payload);

      const phoneNormalized = normalizeIndianPhone(payload.phone);

      if (phoneNormalized.length !== 10) {
        throw new Error("A valid 10-digit phone number is required.");
      }

      if (importedLead.isMetaCsv) {
        const existingLead = await findExistingLeadForImport(
          phoneNormalized,
          importedLead.metaLeadId,
        );

        if (existingLead) {
          await mergeExistingLeadFromMetaCsv(existingLead, importedLead);

          result.duplicates += 1;
          result.duplicateRows.push({
            row: rowNumber,
            name: payload.name,
            phone: payload.phone,
          });
          continue;
        }
      }

      const createResult = await createLead(payload, actor);

      if (createResult.duplicate) {
        if (importedLead.isMetaCsv && createResult.lead?.id) {
          const existingLead = await findExistingLeadForImport(
            phoneNormalized,
            importedLead.metaLeadId,
          );

          await mergeExistingLeadFromMetaCsv(existingLead, importedLead);
        }

        result.duplicates += 1;
        result.duplicateRows.push({
          row: rowNumber,
          name: payload.name,
          phone: payload.phone,
        });
        continue;
      }

      result.created += 1;

      if (createResult.lead?.id) {
        if (importedLead.isMetaCsv) {
          await enrichLeadFromMetaCsv(createResult.lead.id, importedLead);
        }

        result.createdLeadIds.push(createResult.lead.id);
      }
    } catch (error) {
      result.failed += 1;

      if (error instanceof ZodError) {
        result.errors.push({
          row: rowNumber,
          message: error.issues[0]?.message ?? "Invalid row.",
        });
        continue;
      }

      result.errors.push({
        row: rowNumber,
        message:
          error instanceof Error ? error.message : "Unable to import row.",
      });
    }
  }

  return result;
}
