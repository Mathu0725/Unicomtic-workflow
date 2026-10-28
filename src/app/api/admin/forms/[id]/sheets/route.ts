import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { databaseContext } from "@/lib/data/store";
import { readDatabase } from "@/lib/data/repository";
import { googleRequest } from "@/lib/google/oauth";
import { spreadsheetId } from "@/lib/google/sheets-service";

export const dynamic = "force-dynamic";
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    const snapshot = await readDatabase(),
      form = snapshot.customForms.find((form) => form.id === params.id);
    if (!form) throw new RequestError("Form not found.", 404);
    if (!snapshot.integrations.google)
      throw new RequestError(
        "Connect your Google account in Google Integrations first.",
        409,
      );
    const body = z
      .object({
        action: z.enum(["inspect", "create"]),
        sheetId: z.string().max(500).optional(),
        title: z.string().trim().min(1).max(255).optional(),
      })
      .parse(await req.json());
    let result: any;
    if (body.action === "create") {
      try {
        result = await databaseContext.run(snapshot, () =>
          googleRequest("https://sheets.googleapis.com/v4/spreadsheets", {
            method: "POST",
            body: JSON.stringify({
              properties: { title: body.title || `${form.title} responses` },
              sheets: [{ properties: { title: "Responses" } }],
            }),
          }),
        );
      } catch {
        throw new RequestError(
          "Spreadsheet creation was not confirmed. Check Google Drive before creating another spreadsheet; paste its URL here if it was created.",
          503,
          { code: "SHEET_CREATE_UNCONFIRMED" },
        );
      }
    } else {
      if (!body.sheetId)
        throw new RequestError("Enter a spreadsheet URL or ID.");
      let selectedId: string;
      try {
        selectedId = spreadsheetId(body.sheetId);
      } catch {
        throw new RequestError("Enter a valid Google spreadsheet URL or ID.");
      }
      result = await databaseContext.run(snapshot, () =>
        googleRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${selectedId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
        ),
      );
    }
    return NextResponse.json({
      success: true,
      sheetId: result.spreadsheetId,
      url: result.spreadsheetUrl,
      title: result.properties?.title,
      worksheets: (result.sheets || []).map(
        (sheet: any) => sheet.properties.title,
      ),
      message:
        body.action === "create"
          ? "Spreadsheet created. Publish or update the form to use it. Other forms keep their destinations."
          : "Spreadsheet read access verified. Choose a worksheet. The Google account also needs Editor access to export responses.",
    });
  },
  true,
  { database: false },
);
