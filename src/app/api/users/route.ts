import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createManagedUser, listManagedUsers } from "@/lib/user-service";
import { createPortalUserSchema } from "@/lib/validations";

export async function GET() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const users = await listManagedUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  try {
    const input = createPortalUserSchema.parse(await request.json());
    const createdUser = await createManagedUser(input, user);
    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid user payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create user.",
      },
      { status: 400 },
    );
  }
}
