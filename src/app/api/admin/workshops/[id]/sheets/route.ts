import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { databaseContext } from "@/lib/data/store";
import { readDatabase } from "@/lib/data/repository";
import { googleRequest } from "@/lib/google/oauth";
import { spreadsheetId } from "@/lib/google/sheets-service";
import { suggestedWorkshopTab } from "@/lib/workshops/sheet-config";
import { requireWorkshopSheetAdmin } from "@/lib/workshops/sheet-access";
export const dynamic = "force-dynamic";
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    requireWorkshopSheetAdmin(req);
    const db = await readDatabase(),
      workshop = db.workshops.find((item) => item.id === params.id);
    if (!workshop) throw new RequestError("Workshop not found.", 404);
    if (!db.integrations.google)
      throw new RequestError(
        "Connect your Google account in Google Integrations first.",
        409,
      );
    const input = z
      .object({
        action: z.enum(["inspect", "create"]),
        sheetId: z.string().max(500).optional(),
        title: z.string().trim().min(1).max(255).optional(),
      })
      .strict()
      .parse(await req.json());
    let result: any;
    if (input.action === "create") {
      try {
        result = await databaseContext.run(db, () =>
          googleRequest("https://sheets.googleapis.com/v4/spreadsheets", {
            method: "POST",
            body: JSON.stringify({
              properties: {
                title:
                  input.title || `${workshop.title} bookings`.slice(0, 255),
              },
              sheets: [
                { properties: { title: suggestedWorkshopTab(workshop) } },
              ],
            }),
          }),
        );
      } catch {
        throw new RequestError(
          "Spreadsheet creation was not confirmed. Check Google Drive before creating another; paste its URL here if it exists.",
          503,
          { code: "SHEET_CREATE_UNCONFIRMED" },
        );
      }
    } else {
      let selected: string;
      try {
        selected = spreadsheetId(input.sheetId || "");
      } catch {
        throw new RequestError("Enter a valid Google spreadsheet URL or ID.");
      }
      result = await databaseContext.run(db, () =>
        googleRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${selected}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
        ),
      );
    }
    return NextResponse.json({
      success: true,
      sheetId: result.spreadsheetId,
      url: result.spreadsheetUrl,
      title: result.properties?.title,
      worksheets: (result.sheets || []).map(
        (item: any) => item.properties.title,
      ),
      message:
        input.action === "create"
          ? "Spreadsheet created. Save the connection below to export this workshop's bookings."
          : "Spreadsheet read access verified. Choose a dedicated tab. The connected Google account also needs Editor access.",
    });
  },
  true,
  { database: false },
);
