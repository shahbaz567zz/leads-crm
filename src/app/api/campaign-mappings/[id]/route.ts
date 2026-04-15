import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteCampaignMapping } from "@/lib/campaign-mapping-service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteCampaignMapping(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Mapping not found or already deleted." },
      { status: 404 },
    );
  }
}
