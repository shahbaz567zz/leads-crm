import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  assignLeadsBulkFiltered,
  assignLeadsBulkSelected,
} from "@/lib/lead-service";
import { bulkAssignSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can assign leads in bulk." },
      { status: 403 },
    );
  }

  try {
    const payload = bulkAssignSchema.parse(await request.json());
    const result =
      payload.mode === "selected"
        ? await assignLeadsBulkSelected(payload.ids, payload.telecallerId, user)
        : await assignLeadsBulkFiltered(
            payload.filters,
            payload.telecallerId,
            user,
          );

    revalidatePath("/dashboard");
    result.assignedLeadIds.slice(0, 25).forEach((leadId) => {
      revalidatePath(`/leads/${leadId}`);
    });

    return NextResponse.json({
      success: true,
      assignedCount: result.assignedCount,
      assignedLeadIds: result.assignedLeadIds,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid bulk assign payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to assign leads.",
      },
      { status: 500 },
    );
  }
}
