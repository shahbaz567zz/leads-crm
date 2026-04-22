import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { bulkDeleteSchema, createLeadSchema } from "@/lib/validations";
import {
  createLead,
  deleteLeadsBulkFiltered,
  deleteLeadsBulkSelected,
  getDashboardData,
  normalizeLeadPagination,
} from "@/lib/lead-service";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const pagination = normalizeLeadPagination({
    page: Number.parseInt(searchParams.get("page") ?? "", 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "", 10),
  });
  const data = await getDashboardData(
    user,
    {
      q: searchParams.get("q") ?? undefined,
      status:
        (searchParams.get("status") as
          | "NEW"
          | "ASSIGNED"
          | "CONTACTED"
          | "INTERESTED"
          | "MEETING_SCHEDULED"
          | "VISITED"
          | "CONVERTED"
          | "NOT_INTERESTED"
          | "LOST"
          | null) ?? undefined,
      priority:
        (searchParams.get("priority") as "HIGH" | "MEDIUM" | "LOW" | null) ??
        undefined,
      assigned: searchParams.get("assigned") ?? undefined,
      due:
        (searchParams.get("due") as "all" | "today" | "overdue" | null) ??
        "all",
      sla:
        (searchParams.get("sla") as
          | "overdue_open"
          | "due_today_open"
          | "high_priority_uncontacted"
          | "stale_30m"
          | "stale_2h"
          | null) ?? undefined,
    },
    pagination,
  );

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = createLeadSchema.parse(await request.json());
    const result = await createLead(payload, user);

    revalidatePath("/dashboard");

    if (result.lead?.id) {
      revalidatePath(`/leads/${result.lead.id}`);
    }

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid lead payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create lead.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can delete leads in bulk." },
      { status: 403 },
    );
  }

  try {
    const payload = bulkDeleteSchema.parse(await request.json());
    const result =
      payload.mode === "selected"
        ? await deleteLeadsBulkSelected(payload.ids, user)
        : await deleteLeadsBulkFiltered(payload.filters, user);

    revalidatePath("/dashboard");
    result.deletedIds.slice(0, 25).forEach((leadId) => {
      revalidatePath(`/leads/${leadId}`);
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      deletedIds: result.deletedIds,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid bulk delete payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete leads.",
      },
      { status: 500 },
    );
  }
}
