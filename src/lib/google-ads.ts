import {
  inferLeadPriority,
  normalizeEmpty,
  normalizeIndianPhone,
  normaliseMetaKey,
} from "@/lib/utils";
import { findCampaignMapping } from "@/lib/campaign-mapping-service";
import type { CsvImportColumnMapping } from "@/lib/csv-import-mapping";

/* ---------- Types ---------- */

type GoogleColumnData = {
  column_id?: string;
  string_value?: string;
};

type GoogleCustomAnswer = {
  question_text?: string;
  answer?: string;
};

export type GoogleWebhookPayload = {
  google_key?: string;
  lead_id?: string;
  gcl_id?: string;
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adgroup_id?: string;
  adgroup_name?: string;
  creative_id?: string;
  column_data?: GoogleColumnData[];
  user_column_data?: GoogleColumnData[];
  custom_question_answers?: GoogleCustomAnswer[];
};

export type ParsedGoogleLead = {
  externalId: string;
  googleClickId?: string;
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
  adGroupName?: string;
  formId?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  rawPayload: Record<string, unknown>;
};

/* ---------- Verification ---------- */

export function verifyGoogleWebhook(payload: GoogleWebhookPayload): boolean {
  const expectedKey = process.env.GOOGLE_WEBHOOK_KEY;

  if (!expectedKey) {
    return false;
  }

  return payload.google_key === expectedKey;
}

/* ---------- Parser ---------- */

function getStandardValue(
  columns: GoogleColumnData[] | undefined,
  columnId: string,
): string | undefined {
  if (!columns?.length) return undefined;
  const entry = columns.find((c) => c.column_id === columnId);
  return normalizeEmpty(entry?.string_value);
}

function getCustomAnswer(
  answers: GoogleCustomAnswer[] | undefined,
  aliases: string[],
): string | undefined {
  if (!answers?.length) return undefined;
  const aliasSet = new Set(aliases.map((a) => normaliseMetaKey(a)));

  for (const answer of answers) {
    if (!answer.question_text) continue;
    if (aliasSet.has(normaliseMetaKey(answer.question_text))) {
      return normalizeEmpty(answer.answer);
    }
  }

  return undefined;
}

function resolveField(
  columns: GoogleColumnData[] | undefined,
  answers: GoogleCustomAnswer[] | undefined,
  mapping: CsvImportColumnMapping | undefined,
  fieldKey: string,
  standardColumnId?: string,
  defaultAnswerAliases: string[] = [],
): string | undefined {
  // 1. Check saved mapping first — the mapped name is treated as a
  //    question_text alias
  const mappedAlias = mapping?.[fieldKey as keyof CsvImportColumnMapping];

  if (mappedAlias) {
    const fromMapping = getCustomAnswer(answers, [mappedAlias]);
    if (fromMapping) return fromMapping;
  }

  // 2. Standard Google column
  if (standardColumnId) {
    const fromStandard = getStandardValue(columns, standardColumnId);
    if (fromStandard) return fromStandard;

    // Also check user_column_data (Google sometimes puts data there)
    const fromUser = getStandardValue(
      columns, // columns already merged in parseGoogleLead
      standardColumnId,
    );
    if (fromUser) return fromUser;
  }

  // 3. Default aliases in custom answers
  if (defaultAnswerAliases.length) {
    return getCustomAnswer(answers, defaultAnswerAliases);
  }

  return undefined;
}

export async function parseGoogleLead(
  payload: GoogleWebhookPayload,
): Promise<ParsedGoogleLead> {
  // Merge column_data and user_column_data
  const allColumns = [
    ...(payload.column_data ?? []),
    ...(payload.user_column_data ?? []),
  ];
  const answers = payload.custom_question_answers;

  // Try to load a saved campaign mapping
  let savedMapping: Awaited<ReturnType<typeof findCampaignMapping>> | null =
    null;
  let mapping: CsvImportColumnMapping | undefined;

  try {
    savedMapping = await findCampaignMapping("GOOGLE", {
      formId: payload.form_id,
      campaignName: payload.campaign_name,
    });

    if (savedMapping) {
      mapping = savedMapping.columnMapping;
    }
  } catch {
    // Non-fatal
  }

  const name =
    resolveField(allColumns, answers, mapping, "name", "FULL_NAME", [
      "name",
      "full_name",
      "student_name",
    ]) ?? "Google Lead";

  const phone =
    resolveField(allColumns, answers, mapping, "phone", "PHONE_NUMBER", [
      "phone",
      "phone_number",
      "mobile",
    ]) ?? "";

  const jeeRankRange = resolveField(
    allColumns,
    answers,
    mapping,
    "jeeRankRange",
    undefined,
    [
      "jee_rank",
      "jee_rank_range",
      "jee_main_rank",
      "rank_range",
      "what is your expected jee main rank",
      "what is your expected/actual jee main rank",
      "what is your expected/actual jee mains rank",
    ],
  );

  return {
    externalId: payload.lead_id ?? "",
    googleClickId: normalizeEmpty(payload.gcl_id),
    name,
    phone,
    phoneNormalized: normalizeIndianPhone(phone),
    email: resolveField(allColumns, answers, mapping, "email", "EMAIL", [
      "email",
      "email_address",
    ]),
    city: resolveField(allColumns, answers, mapping, "city", "CITY", [
      "city",
      "current_city",
      "location",
    ]),
    twelfthLocation: resolveField(
      allColumns,
      answers,
      mapping,
      "twelfthLocation",
      undefined,
      [
        "twelfth_location",
        "12th_location",
        "where did you complete your 12th from",
      ],
    ),
    jeeRankRange,
    courseInterest: resolveField(
      allColumns,
      answers,
      mapping,
      "courseInterest",
      undefined,
      ["course", "course_interest", "program", "preferred_course"],
    ),
    dynamicField1: resolveField(allColumns, answers, mapping, "dynamicField1"),
    dynamicField2: resolveField(allColumns, answers, mapping, "dynamicField2"),
    dynamicField3: resolveField(allColumns, answers, mapping, "dynamicField3"),
    campaignName:
      normalizeEmpty(payload.campaign_name) ??
      normalizeEmpty(savedMapping?.campaignName),
    adGroupName: normalizeEmpty(payload.adgroup_name),
    formId:
      normalizeEmpty(payload.form_id) ?? normalizeEmpty(savedMapping?.formId),
    priority: inferLeadPriority(jeeRankRange),
    rawPayload: {
      google: payload,
    },
  };
}
