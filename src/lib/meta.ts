import {
  inferLeadPriority,
  normalizeEmpty,
  normalizeIndianPhone,
  normaliseMetaKey,
} from "@/lib/utils";
import { findCampaignMapping } from "@/lib/campaign-mapping-service";
import type { CsvImportColumnMapping } from "@/lib/csv-import-mapping";

type MetaField = {
  name?: string;
  values?: Array<string | { [key: string]: string }>;
};

type MetaLeadResponse = {
  id: string;
  created_time?: string;
  field_data?: MetaField[];
};

type MetaWebhookValue = {
  leadgen_id?: string;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  created_time?: number;
};

export type ParsedMetaLead = {
  externalId: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email?: string;
  city?: string;
  twelfthLocation?: string;
  jeeRankRange?: string;
  courseInterest?: string;
  dynamicField1?: string;
  dynamicField2?: string;
  dynamicField3?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  formId?: string;
  pageId?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  rawPayload: Record<string, unknown>;
};

function extractValue(fields: MetaField[] | undefined, aliases: string[]) {
  if (!fields?.length) {
    return undefined;
  }

  const aliasSet = new Set(aliases.map((alias) => normaliseMetaKey(alias)));

  for (const field of fields) {
    const key = normaliseMetaKey(field.name ?? "");

    if (!aliasSet.has(key)) {
      continue;
    }

    const firstValue = field.values?.[0];

    if (typeof firstValue === "string") {
      return normalizeEmpty(firstValue);
    }

    if (firstValue && typeof firstValue === "object") {
      const nestedValue = Object.values(firstValue)[0];
      return normalizeEmpty(nestedValue);
    }
  }

  return undefined;
}

export async function fetchMetaLeadDetails(leadId: string) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v25.0";

  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN is missing.");
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${leadId}`);
  url.searchParams.set("fields", "id,created_time,field_data");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta lead fetch failed: ${body}`);
  }

  return (await response.json()) as MetaLeadResponse;
}

/**
 * Build alias list, optionally prepending the saved mapping header as the
 * highest-priority alias so that custom form field names resolve first.
 */
function buildAliases(
  defaults: string[],
  mapping: CsvImportColumnMapping | undefined,
  fieldKey: string,
): string[] {
  const mapped = mapping?.[fieldKey as keyof CsvImportColumnMapping];
  return mapped ? [mapped, ...defaults] : defaults;
}

export async function parseMetaLead(
  leadId: string,
  changeValue: MetaWebhookValue,
  payload: unknown,
): Promise<ParsedMetaLead> {
  const metaLead = await fetchMetaLeadDetails(leadId);
  const fields = metaLead.field_data;

  // Try to load a saved campaign mapping for this form / campaign
  let savedMapping: Awaited<ReturnType<typeof findCampaignMapping>> | null =
    null;
  let mapping: CsvImportColumnMapping | undefined;

  try {
    savedMapping = await findCampaignMapping("META", {
      formId: changeValue.form_id,
      campaignName: changeValue.campaign_name,
    });

    if (savedMapping) {
      mapping = savedMapping.columnMapping;
    }
  } catch {
    // Non-fatal — fall through to default aliases
  }

  const name =
    extractValue(
      fields,
      buildAliases(
        ["full_name", "name", "student_name", "candidate_name"],
        mapping,
        "name",
      ),
    ) ?? "Meta Lead";
  const phone =
    extractValue(
      fields,
      buildAliases(
        ["phone_number", "phone", "mobile", "mobile_number", "whatsapp_number"],
        mapping,
        "phone",
      ),
    ) ?? "";

  const jeeAliases = buildAliases(
    [
      "jee_rank",
      "jee_rank_range",
      "jee_main_rank",
      "jee_mains_rank",
      "rank_range",
    ],
    mapping,
    "jeeRankRange",
  );

  return {
    externalId: metaLead.id,
    name,
    phone,
    phoneNormalized: normalizeIndianPhone(phone),
    email: extractValue(
      fields,
      buildAliases(["email", "email_address"], mapping, "email"),
    ),
    city: extractValue(
      fields,
      buildAliases(
        ["city", "current_city", "location", "residence_city"],
        mapping,
        "city",
      ),
    ),
    twelfthLocation: extractValue(
      fields,
      buildAliases(
        [
          "twelfth_location",
          "12th_location",
          "twelfth_board_location",
          "board_location",
        ],
        mapping,
        "twelfthLocation",
      ),
    ),
    jeeRankRange: extractValue(fields, jeeAliases),
    courseInterest: extractValue(
      fields,
      buildAliases(
        ["course", "course_interest", "program", "preferred_course"],
        mapping,
        "courseInterest",
      ),
    ),
    dynamicField1: extractValue(
      fields,
      buildAliases([], mapping, "dynamicField1"),
    ),
    dynamicField2: extractValue(
      fields,
      buildAliases([], mapping, "dynamicField2"),
    ),
    dynamicField3: extractValue(
      fields,
      buildAliases([], mapping, "dynamicField3"),
    ),
    campaignName:
      normalizeEmpty(changeValue.campaign_name) ??
      normalizeEmpty(savedMapping?.campaignName),
    adsetName: normalizeEmpty(changeValue.adset_name),
    adName: normalizeEmpty(changeValue.ad_name),
    formId:
      normalizeEmpty(changeValue.form_id) ??
      normalizeEmpty(savedMapping?.formId),
    pageId: normalizeEmpty(changeValue.page_id),
    priority: inferLeadPriority(extractValue(fields, jeeAliases)),
    rawPayload: {
      webhook: changeValue,
      lead: metaLead,
      request: payload,
    },
  };
}
