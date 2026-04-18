import { NextResponse } from "next/server";

import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import {
  discoverCampaignFields,
  isDiscoverableCampaignSource,
  listRecentCampaignDiscoveryTargets,
} from "@/lib/campaign-mapping-discovery";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user || !canManageAssignments(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get("source");

  if (!isDiscoverableCampaignSource(sourceParam)) {
    return NextResponse.json(
      { error: "Field discovery is only available for Meta and Google." },
      { status: 400 },
    );
  }

  const formId = searchParams.get("formId")?.trim() || undefined;
  const campaignName = searchParams.get("campaignName")?.trim() || undefined;
  const recentTargets = await listRecentCampaignDiscoveryTargets(sourceParam);

  if (!formId && !campaignName) {
    return NextResponse.json({ recentTargets });
  }

  const discovery = await discoverCampaignFields(sourceParam, {
    formId,
    campaignName,
  });

  return NextResponse.json({
    recentTargets,
    ...discovery,
  });
}
