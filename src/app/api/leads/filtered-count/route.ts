import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  countFilteredAssignableLeads,
  countFilteredLeads,
} from "@/lib/lead-service";
import { filteredCountSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can preview bulk action counts." },
      { status: 403 },
    );
  }

  try {
    const payload = filteredCountSchema.parse(await request.json());
    const matchedCount = await countFilteredLeads(user, payload.filters);
    const assignableCount = payload.telecallerId
      ? await countFilteredAssignableLeads(
          user,
          payload.filters,
          payload.telecallerId,
        )
      : matchedCount;

    return NextResponse.json({
      success: true,
      matchedCount,
      assignableCount,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid count preview payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to preview filtered lead count.",
      },
      { status: 500 },
    );
  }
}
