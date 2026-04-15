import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authenticateUser, createSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const user = await authenticateUser(payload.email, payload.password);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    await createSession(user);

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid login payload." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Unable to complete login right now." },
      { status: 500 },
    );
  }
}
