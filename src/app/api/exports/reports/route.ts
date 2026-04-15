import { format } from "date-fns";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { stringifyCsv } from "@/lib/csv";
import { getReportExportRows } from "@/lib/lead-service";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getReportExportRows(user);
  const csv = stringifyCsv(["section", "label", "metric", "value"], rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dashboard-report-${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
