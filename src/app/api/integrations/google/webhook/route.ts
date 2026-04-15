import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  parseGoogleLead,
  verifyGoogleWebhook,
  type GoogleWebhookPayload,
} from "@/lib/google-ads";
import { ingestGoogleWebhook } from "@/lib/lead-service";

/** Google's handshake probe — must return 200. */
export async function GET() {
  return new NextResponse("OK", { status: 200 });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as GoogleWebhookPayload;

    if (!verifyGoogleWebhook(payload)) {
      return NextResponse.json(
        { error: "Invalid google_key." },
        { status: 403 },
      );
    }

    if (!payload.lead_id) {
      return NextResponse.json({ error: "Missing lead_id." }, { status: 400 });
    }

    const parsed = await parseGoogleLead(payload);
    const result = await ingestGoogleWebhook(parsed);

    revalidatePath("/dashboard");

    if (result.leadId) {
      revalidatePath(`/leads/${result.leadId}`);
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
