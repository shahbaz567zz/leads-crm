import { prisma } from "@/lib/db";
import {
  normalizeDynamicLeadFieldLabels,
  type DynamicLeadFieldLabels,
} from "@/lib/lead-field-labels";

const LEAD_FIELD_SETTINGS_ID = "lead-field-labels";

export async function getDynamicLeadFieldLabels(): Promise<DynamicLeadFieldLabels> {
  const row = await prisma.leadFieldSetting.findUnique({
    where: { id: LEAD_FIELD_SETTINGS_ID },
    select: {
      dynamicField1Label: true,
      dynamicField2Label: true,
      dynamicField3Label: true,
    },
  });

  return normalizeDynamicLeadFieldLabels({
    dynamicField1: row?.dynamicField1Label,
    dynamicField2: row?.dynamicField2Label,
    dynamicField3: row?.dynamicField3Label,
  });
}

export async function updateDynamicLeadFieldLabels(
  labels: Partial<
    Record<keyof DynamicLeadFieldLabels, string | null | undefined>
  >,
): Promise<DynamicLeadFieldLabels> {
  const normalized = normalizeDynamicLeadFieldLabels(labels);

  await prisma.leadFieldSetting.upsert({
    where: { id: LEAD_FIELD_SETTINGS_ID },
    update: {
      dynamicField1Label: normalized.dynamicField1,
      dynamicField2Label: normalized.dynamicField2,
      dynamicField3Label: normalized.dynamicField3,
    },
    create: {
      id: LEAD_FIELD_SETTINGS_ID,
      dynamicField1Label: normalized.dynamicField1,
      dynamicField2Label: normalized.dynamicField2,
      dynamicField3Label: normalized.dynamicField3,
    },
  });

  return normalized;
}
