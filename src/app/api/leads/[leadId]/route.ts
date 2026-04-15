import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { updateLead } from "@/lib/lead-service";
import { updateLeadSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = updateLeadSchema.parse(await request.json());
    const { leadId } = await params;
    const lead = await updateLead(leadId, payload, user);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    revalidatePath("/dashboard");
    revalidatePath(`/leads/${leadId}`);

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid update payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update lead.",
      },
      { status: 500 },
    );
  }
}
