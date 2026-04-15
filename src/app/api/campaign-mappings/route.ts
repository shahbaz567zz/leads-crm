import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import {
  listCampaignMappings,
  upsertCampaignMapping,
} from "@/lib/campaign-mapping-service";
import { campaignMappingSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user || !canManageAssignments(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") as "META" | "GOOGLE" | "CSV" | null;
  const campaignName = searchParams.get("campaignName");

  if (campaignName && source) {
    const { findCampaignMapping } =
      await import("@/lib/campaign-mapping-service");
    const mapping = await findCampaignMapping(source, { campaignName });
    return NextResponse.json({ mapping });
  }

  const mappings = await listCampaignMappings(source ?? undefined);
  return NextResponse.json({ mappings });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user || !canManageAssignments(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = campaignMappingSchema.parse(body);

    if (!input.formId && !input.campaignName) {
      return NextResponse.json(
        { error: "Either formId or campaignName is required." },
        { status: 400 },
      );
    }

    const mapping = await upsertCampaignMapping(input);
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save mapping.",
      },
      { status: 400 },
    );
  }
}
