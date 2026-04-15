import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createLeadActivity } from "@/lib/lead-service";
import { createActivitySchema } from "@/lib/validations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = createActivitySchema.parse(await request.json());
    const { leadId } = await params;
    const activity = await createLeadActivity(leadId, payload, user);

    if (!activity) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    revalidatePath("/dashboard");
    revalidatePath(`/leads/${leadId}`);

    return NextResponse.json({ success: true, activity }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid activity payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to log activity.",
      },
      { status: 500 },
    );
  }
}
