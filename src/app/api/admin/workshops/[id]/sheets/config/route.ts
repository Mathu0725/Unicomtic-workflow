import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { spreadsheetId } from "@/lib/google/sheets-service";
import { workshopDestinationProblem } from "@/lib/workshops/sheet-config";
import { requireWorkshopSheetAdmin } from "@/lib/workshops/sheet-access";
import { queueWorkshopBookings } from "@/lib/workshops/sheet-sync";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    expectedVersion: z.string().max(128),
    enabled: z.boolean(),
    sheetId: z.string().trim().max(500),
    sheetName: z
      .string()
      .trim()
      .max(100)
      .refine(
        (value) =>
          !/[\[\]:*?/\\\x00-\x1f]/.test(value) &&
          !value.startsWith("'") &&
          !value.endsWith("'"),
        "Use a tab name without [ ] : * ? / \\ or leading/trailing apostrophes.",
      ),
    autoSync: z.boolean(),
    syncExisting: z.boolean(),
    clientAttemptId: z.string().uuid(),
  })
  .strict();
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    const actor = requireWorkshopSheetAdmin(req),
      key = req.headers.get("idempotency-key");
    if (!key) throw new RequestError("A connection retry key is required.");
    const input = schema.parse(await req.json()),
      db = getDb(),
      workshop = db.workshops.find((item) => item.id === params.id);
    if (!workshop) throw new RequestError("Workshop not found.", 404);
    const previous = workshop.google_sheets_config;
    if ((previous?.version || "") !== input.expectedVersion)
      throw new RequestError(
        "This workshop's Sheet settings changed. Reload before saving.",
        409,
        { code: "VERSION_CONFLICT" },
      );
    if (input.enabled && (!input.sheetId || !input.sheetName))
      throw new RequestError(
        "Enter a spreadsheet and a separate tab name for this workshop.",
      );
    if (input.enabled && !db.integrations.google)
      throw new RequestError(
        "Connect Google in Google Integrations first.",
        409,
      );
    let selected = "";
    if (input.sheetId) {
      try {
        selected = spreadsheetId(input.sheetId);
      } catch {
        throw new RequestError("Enter a valid Google spreadsheet URL or ID.");
      }
    }
    if (selected && input.sheetName) {
      const problem = workshopDestinationProblem(
        db,
        workshop.id,
        selected,
        input.sheetName,
      );
      if (problem)
        throw new RequestError(problem, 409, {
          code: "WORKSHOP_SHEET_CONFLICT",
        });
    }
    const values = {
      enabled: input.enabled,
      sheet_id: selected,
      sheet_name: input.sheetName,
      auto_sync: input.autoSync,
    };
    const changed =
      !previous ||
      Object.entries(values).some(
        ([key, value]) => previous[key as keyof typeof values] !== value,
      );
    if (
      changed &&
      db.outbox.some(
        (job) =>
          job.type === "sheet" &&
          job.status === "sending" &&
          job.payload.workshopId === workshop.id,
      )
    )
      throw new RequestError(
        "A workshop export is running. Wait for it to finish before changing the connection.",
        409,
      );
    if (changed)
      workshop.google_sheets_config = {
        ...values,
        version: randomUUID(),
        updated_at: new Date().toISOString(),
      };
    const queued =
      input.enabled && input.syncExisting
        ? queueWorkshopBookings(db, workshop.id, {
            manual: true,
            initiatedBy: actor,
            runId: `connect:${createHash("sha256").update(key).digest("hex")}`,
          })
        : 0;
    db.auditLogs.push({
      id: randomUUID(),
      user_email: actor,
      action: "WORKSHOP_SHEET_CONNECTION_UPDATED",
      entity_name: "workshops",
      entity_id: workshop.id,
      changes: { ...values, queued },
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      version: workshop.google_sheets_config!.version,
      queued,
      message: input.enabled
        ? `Workshop Sheet connection saved. ${queued} booking(s) queued; each booking uses a stable ID to prevent duplicate rows.`
        : "Workshop Sheet sync disabled. Existing spreadsheet rows are retained.",
    });
  },
  true,
  { submission: true, authorize: (req) => requireWorkshopSheetAdmin(req) },
);
