import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { stringifyCsv } from "@/lib/csv";
import { getLeadExportRows, type DashboardFilters } from "@/lib/lead-service";

function parseFilters(searchParams: URLSearchParams): DashboardFilters {
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const due = searchParams.get("due");

  return {
    q: searchParams.get("q") ?? undefined,
    status: status ? (status as DashboardFilters["status"]) : undefined,
    priority: priority ? (priority as DashboardFilters["priority"]) : undefined,
    assigned: searchParams.get("assigned") ?? undefined,
    due: due ? (due as DashboardFilters["due"]) : undefined,
  };
}

function toIso(value: Date | null) {
  return value?.toISOString() ?? "";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getLeadExportRows(
    user,
    parseFilters(request.nextUrl.searchParams),
  );
  const csv = stringifyCsv(
    [
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
      "status",
      "priority",
      "assignedTo",
      "campaignName",
      "source",
      "nextFollowUpAt",
      "lastContactedAt",
      "meetingScheduledAt",
      "activityCount",
      "createdAt",
      "updatedAt",
    ],
    rows.map((row) => ({
      ...row,
      nextFollowUpAt: toIso(row.nextFollowUpAt),
      lastContactedAt: toIso(row.lastContactedAt),
      meetingScheduledAt: toIso(row.meetingScheduledAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-list-${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
