import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import {
  getDynamicLeadFieldLabels,
  updateDynamicLeadFieldLabels,
} from "@/lib/lead-field-settings";

const updateLeadFieldLabelsSchema = z.object({
  dynamicField1: z.string().max(80).optional().nullable(),
  dynamicField2: z.string().max(80).optional().nullable(),
  dynamicField3: z.string().max(80).optional().nullable(),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user || !canManageAssignments(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const labels = await getDynamicLeadFieldLabels();
  return NextResponse.json({ labels });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user || !canManageAssignments(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = updateLeadFieldLabelsSchema.parse(await request.json());
    const labels = await updateDynamicLeadFieldLabels(input);

    revalidatePath("/dashboard");
    revalidatePath("/settings/campaign-mappings");

    return NextResponse.json({ labels, success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error:
            error.issues[0]?.message ?? "Invalid lead field label payload.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update lead field labels.",
      },
      { status: 500 },
    );
  }
}
