import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { deleteManagedUser, updateManagedUser } from "@/lib/user-service";
import { updatePortalUserSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const input = updatePortalUserSchema.parse(await request.json());
    const updatedUser = await updateManagedUser(id, input, user);
    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid user update payload." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to update user.";
    const status = message === "User not found." ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deletedUser = await deleteManagedUser(id, user);
    return NextResponse.json({ deletedUser, success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete user.";
    const status = message === "User not found." ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
