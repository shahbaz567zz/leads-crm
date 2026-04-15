import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import { importLeadsFromCsv } from "@/lib/csv-import";
import { csvImportColumnMappingSchema } from "@/lib/validations";
import { normalizeEmpty } from "@/lib/utils";

function readTextField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? normalizeEmpty(value) : undefined;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageAssignments(user)) {
    return NextResponse.json(
      { error: "Only managers can import CSV leads." },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a valid CSV file." },
        { status: 400 },
      );
    }

    const columnMappingField = formData.get("columnMapping");
    const parsedColumnMapping =
      typeof columnMappingField === "string" && columnMappingField.trim()
        ? csvImportColumnMappingSchema.parse(JSON.parse(columnMappingField))
        : undefined;

    const result = await importLeadsFromCsv(await file.text(), user, {
      defaultSource: readTextField(formData.get("defaultSource")),
      defaultCampaignName: readTextField(formData.get("defaultCampaignName")),
      columnMapping: parsedColumnMapping,
    });

    revalidatePath("/dashboard");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid import mapping." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import CSV.",
      },
      { status: 400 },
    );
  }
}
