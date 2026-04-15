import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { ingestMetaWebhook } from "@/lib/lead-service";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    process.env.META_VERIFY_TOKEN &&
    token === process.env.META_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const entryCount = Array.isArray((payload as { entry?: unknown[] }).entry)
      ? (payload as { entry: unknown[] }).entry.length
      : 0;

    console.info("[meta-webhook] Received payload", {
      entryCount,
    });

    const result = await ingestMetaWebhook(payload);

    console.info("[meta-webhook] Processed payload", {
      processed: result.length,
      createdOrMatchedLeadIds: result
        .map((entry) => entry.leadId)
        .filter(Boolean),
      duplicateCount: result.filter((entry) => entry.duplicate).length,
      skippedCount: result.filter((entry) => entry.skipped).length,
    });

    revalidatePath("/dashboard");
    result.forEach((entry) => {
      if (entry.leadId) {
        revalidatePath(`/leads/${entry.leadId}`);
      }
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[meta-webhook] Processing failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Meta webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
