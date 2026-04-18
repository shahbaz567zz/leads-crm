import { normaliseMetaKey } from "@/lib/utils";
import {
  isDynamicLeadFieldKey,
  normalizeDynamicLeadFieldLabels,
  type DynamicLeadFieldLabels,
} from "@/lib/lead-field-labels";

export const CSV_IMPORT_FIELD_KEYS = [
  "name",
  "phone",
  "email",
  "city",
  "twelfthLocation",
  "jeeRankRange",
  "courseInterest",
  "dynamicField1",
  "dynamicField2",
  "dynamicField3",
  "source",
  "campaignName",
  "priority",
  "assignedToEmail",
  "assignedToId",
] as const;

export type CsvImportFieldKey = (typeof CSV_IMPORT_FIELD_KEYS)[number];

export type CsvImportColumnMapping = Partial<Record<CsvImportFieldKey, string>>;

export type CsvImportFieldDefinition = {
  key: CsvImportFieldKey;
  label: string;
  required?: boolean;
  aliases: string[];
};

export type CampaignMappingSourceValue = "META" | "GOOGLE" | "CSV";

const BASE_CSV_IMPORT_FIELD_DEFINITIONS: CsvImportFieldDefinition[] = [
  {
    key: "name",
    label: "Name",
    required: true,
    aliases: ["name", "full_name", "student_name"],
  },
  {
    key: "phone",
    label: "Phone",
    required: true,
    aliases: ["phone", "phone_number", "mobile", "mobile_number"],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email_address"],
  },
  {
    key: "city",
    label: "City",
    aliases: ["city", "location", "current_city"],
  },
  {
    key: "twelfthLocation",
    label: "12th Location / Domicile",
    aliases: [
      "twelfth_location",
      "12th_location",
      "board_location",
      "where_did_you_complete_your_12th_from",
    ],
  },
  {
    key: "jeeRankRange",
    label: "JEE Rank Range",
    aliases: [
      "jee_rank_range",
      "jee_rank",
      "rank_range",
      "what_is_your_expected_actual_jee_main_rank",
      "what_is_your_expected_actual_jee_mains_rank",
      "what_is_your_expected_actual_jee_rank",
    ],
  },
  {
    key: "courseInterest",
    label: "Course Interest",
    aliases: ["course_interest", "course", "program"],
  },
  {
    key: "dynamicField1",
    label: "Dynamic 1",
    aliases: ["dynamic_1", "dynamic1", "extra_field_1", "custom_field_1"],
  },
  {
    key: "dynamicField2",
    label: "Dynamic 2",
    aliases: ["dynamic_2", "dynamic2", "extra_field_2", "custom_field_2"],
  },
  {
    key: "dynamicField3",
    label: "Dynamic 3",
    aliases: ["dynamic_3", "dynamic3", "extra_field_3", "custom_field_3"],
  },
  {
    key: "source",
    label: "Source",
    aliases: ["source", "lead_source"],
  },
  {
    key: "campaignName",
    label: "Campaign Name",
    aliases: ["campaign_name", "campaign", "meta_campaign"],
  },
  {
    key: "priority",
    label: "Priority",
    aliases: ["priority"],
  },
  {
    key: "assignedToEmail",
    label: "Assigned To Email",
    aliases: ["assigned_to_email", "telecaller_email", "owner_email"],
  },
  {
    key: "assignedToId",
    label: "Assigned To ID",
    aliases: ["assigned_to_id"],
  },
];

function applyDynamicLeadFieldLabel(
  field: CsvImportFieldDefinition,
  dynamicLeadFieldLabels: DynamicLeadFieldLabels,
) {
  if (!isDynamicLeadFieldKey(field.key)) {
    return field;
  }

  return {
    ...field,
    label: dynamicLeadFieldLabels[field.key],
  };
}

export function getCsvImportFieldDefinitions(
  dynamicLeadFieldLabels?: Partial<DynamicLeadFieldLabels>,
) {
  const resolvedLabels = normalizeDynamicLeadFieldLabels(
    dynamicLeadFieldLabels,
  );

  return BASE_CSV_IMPORT_FIELD_DEFINITIONS.map((field) =>
    applyDynamicLeadFieldLabel(field, resolvedLabels),
  );
}

export const CSV_IMPORT_FIELD_DEFINITIONS = getCsvImportFieldDefinitions();

export const CSV_IMPORT_REQUIRED_FIELDS =
  BASE_CSV_IMPORT_FIELD_DEFINITIONS.filter((field) => field.required).map(
    (field) => field.key,
  );

export const WEBHOOK_CAMPAIGN_MAPPING_FIELD_KEYS = [
  "name",
  "phone",
  "email",
  "city",
  "twelfthLocation",
  "jeeRankRange",
  "courseInterest",
  "dynamicField1",
  "dynamicField2",
  "dynamicField3",
] as const satisfies readonly CsvImportFieldKey[];

export const CAMPAIGN_MAPPING_FIELD_KEYS_BY_SOURCE: Record<
  CampaignMappingSourceValue,
  readonly CsvImportFieldKey[]
> = {
  META: WEBHOOK_CAMPAIGN_MAPPING_FIELD_KEYS,
  GOOGLE: WEBHOOK_CAMPAIGN_MAPPING_FIELD_KEYS,
  CSV: CSV_IMPORT_FIELD_KEYS,
};

export function getCampaignMappingFieldKeys(
  source: CampaignMappingSourceValue,
) {
  return CAMPAIGN_MAPPING_FIELD_KEYS_BY_SOURCE[source];
}

export function getCampaignMappingFieldDefinitions(
  source: CampaignMappingSourceValue,
  dynamicLeadFieldLabels?: Partial<DynamicLeadFieldLabels>,
) {
  const allowedKeys = new Set(getCampaignMappingFieldKeys(source));

  return getCsvImportFieldDefinitions(dynamicLeadFieldLabels).filter((field) =>
    allowedKeys.has(field.key),
  );
}

export function getCsvFieldAliases(fieldKey: CsvImportFieldKey) {
  return (
    BASE_CSV_IMPORT_FIELD_DEFINITIONS.find((field) => field.key === fieldKey)
      ?.aliases ?? []
  );
}

function normalizeHeader(value: string) {
  return normaliseMetaKey(value);
}

export function buildSuggestedCampaignMapping(
  source: CampaignMappingSourceValue,
  sourceFields: string[],
) {
  const mapping: CsvImportColumnMapping = {};
  const allowedKeys = new Set(getCampaignMappingFieldKeys(source));
  const normalizedFields = sourceFields.map((field) => normalizeHeader(field));

  BASE_CSV_IMPORT_FIELD_DEFINITIONS.forEach((field) => {
    if (!allowedKeys.has(field.key)) {
      return;
    }

    const matchedIndex = field.aliases
      .map((alias) => normalizeHeader(alias))
      .map((alias) => normalizedFields.indexOf(alias))
      .find((index) => index >= 0);

    if (matchedIndex !== undefined && matchedIndex >= 0) {
      mapping[field.key] = sourceFields[matchedIndex];
    }
  });

  return mapping;
}

export function parseCsvRows(content: string) {
  const rows: string[][] = [];
  const normalized = content.replace(/^\uFEFF/, "");

  let currentValue = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue.trim());

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function buildSuggestedCsvMapping(headers: string[]) {
  return buildSuggestedCampaignMapping("CSV", headers);
}

export function buildCsvPreview(content: string, previewRows = 3) {
  const rows = parseCsvRows(content);
  const [headers = [], ...dataRows] = rows;

  return {
    headers,
    rows: dataRows.slice(0, previewRows),
    totalRows: dataRows.length,
  };
}
