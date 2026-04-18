import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getAutoAssignEnabled, setAutoAssignEnabled } from "@/lib/lead-service";

const updateAutoAssignSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const enabled = await getAutoAssignEnabled();
  return NextResponse.json({ enabled });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  try {
    const input = updateAutoAssignSchema.parse(await request.json());
    await setAutoAssignEnabled(input.enabled);

    revalidatePath("/dashboard");

    return NextResponse.json({ enabled: input.enabled, success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid automation payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update auto assignment.",
      },
      { status: 500 },
    );
  }
}
