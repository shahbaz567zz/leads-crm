import type { MappingSource } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { CsvImportColumnMapping } from "@/lib/csv-import-mapping";

export type CampaignMappingRow = {
  id: string;
  source: MappingSource;
  label: string;
  campaignName: string | null;
  formId: string | null;
  columnMapping: CsvImportColumnMapping;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Look up a saved mapping by source + formId (preferred) or campaignName.
 */
export async function findCampaignMapping(
  source: MappingSource,
  identifiers: { formId?: string; campaignName?: string },
): Promise<CampaignMappingRow | null> {
  if (identifiers.formId) {
    const byForm = await prisma.campaignMapping.findUnique({
      where: {
        source_formId: { source, formId: identifiers.formId },
      },
    });

    if (byForm) {
      return byForm as CampaignMappingRow;
    }
  }

  if (identifiers.campaignName) {
    const byCampaign = await prisma.campaignMapping.findUnique({
      where: {
        source_campaignName: { source, campaignName: identifiers.campaignName },
      },
    });

    if (byCampaign) {
      return byCampaign as CampaignMappingRow;
    }
  }

  return null;
}

/**
 * Create or update a mapping. Uses formId as the primary upsert key when
 * present, otherwise campaignName.
 */
export async function upsertCampaignMapping(input: {
  source: MappingSource;
  label: string;
  campaignName?: string;
  formId?: string;
  columnMapping: CsvImportColumnMapping;
}): Promise<CampaignMappingRow> {
  const { source, label, campaignName, formId, columnMapping } = input;

  if (formId) {
    return prisma.campaignMapping.upsert({
      where: { source_formId: { source, formId } },
      update: { label, campaignName, columnMapping, updatedAt: new Date() },
      create: { source, label, campaignName, formId, columnMapping },
    }) as Promise<CampaignMappingRow>;
  }

  if (campaignName) {
    return prisma.campaignMapping.upsert({
      where: { source_campaignName: { source, campaignName } },
      update: { label, formId, columnMapping, updatedAt: new Date() },
      create: { source, label, campaignName, formId, columnMapping },
    }) as Promise<CampaignMappingRow>;
  }

  throw new Error("Either formId or campaignName is required.");
}

/**
 * List all saved campaign mappings, most recently updated first.
 */
export async function listCampaignMappings(
  source?: MappingSource,
): Promise<CampaignMappingRow[]> {
  return prisma.campaignMapping.findMany({
    where: source ? { source } : undefined,
    orderBy: { updatedAt: "desc" },
  }) as Promise<CampaignMappingRow[]>;
}

/**
 * Delete a campaign mapping by id.
 */
export async function deleteCampaignMapping(id: string): Promise<void> {
  await prisma.campaignMapping.delete({ where: { id } });
}
