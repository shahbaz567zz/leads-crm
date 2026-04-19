import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/user-service";
import { changeOwnPasswordSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = changeOwnPasswordSchema.parse(await request.json());
    await changeOwnPassword(payload, user);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid password payload." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to change password.";
    const status = message === "Current password is incorrect." ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
