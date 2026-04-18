import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { reassignManagedUserLeads } from "@/lib/user-service";
import { reassignManagedUserLeadsSchema } from "@/lib/validations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const input = reassignManagedUserLeadsSchema.parse(await request.json());
    const result = await reassignManagedUserLeads(id, input, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid reassignment payload." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to reassign leads.";
    const status = message === "User not found." ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
