export const DYNAMIC_LEAD_FIELD_KEYS = [
  "dynamicField1",
  "dynamicField2",
  "dynamicField3",
] as const;

export type DynamicLeadFieldKey = (typeof DYNAMIC_LEAD_FIELD_KEYS)[number];

export type DynamicLeadFieldLabels = Record<DynamicLeadFieldKey, string>;

export const DEFAULT_DYNAMIC_LEAD_FIELD_LABELS: DynamicLeadFieldLabels = {
  dynamicField1: "Dynamic 1",
  dynamicField2: "Dynamic 2",
  dynamicField3: "Dynamic 3",
};

function normalizeLabelValue(
  value: string | null | undefined,
  fallback: string,
) {
  const trimmed = value?.trim();

  return trimmed || fallback;
}

export function isDynamicLeadFieldKey(
  value: string,
): value is DynamicLeadFieldKey {
  return DYNAMIC_LEAD_FIELD_KEYS.includes(value as DynamicLeadFieldKey);
}

export function normalizeDynamicLeadFieldLabels(
  labels?: Partial<
    Record<DynamicLeadFieldKey, string | null | undefined>
  > | null,
): DynamicLeadFieldLabels {
  return {
    dynamicField1: normalizeLabelValue(
      labels?.dynamicField1,
      DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField1,
    ),
    dynamicField2: normalizeLabelValue(
      labels?.dynamicField2,
      DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField2,
    ),
    dynamicField3: normalizeLabelValue(
      labels?.dynamicField3,
      DEFAULT_DYNAMIC_LEAD_FIELD_LABELS.dynamicField3,
    ),
  };
}
