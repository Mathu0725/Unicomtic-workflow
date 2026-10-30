import { describe, expect, it } from "vitest";
import { openApplicationForReference } from "../../src/lib/forms/application-entry";
import type { DatabaseStore } from "../../src/lib/data/store";

const form = (id: string, campaignId: string, mode: "open" | "invitation" = "open") => ({
  id,
  slug: id,
  type: "application",
  application_mode: mode,
  campaign_id: campaignId,
  is_active: true,
  submissions_count: 0,
});

describe("legacy application entry", () => {
  it("routes a known registration to its own open application", () => {
    const db = {
      customForms: [form("intake-a-application", "a"), form("intake-b-application", "b")],
      registrations: [{ reference_no: "REG-A", campaign_id: "a", status: "registered" }],
    } as unknown as DatabaseStore;
    expect(openApplicationForReference(db, "reg-a")?.slug).toBe("intake-a-application");
  });

  it("keeps restricted and closed forms on their existing access flow", () => {
    const db = {
      customForms: [form("restricted", "a", "invitation"), { ...form("closed", "a"), is_active: false }],
      registrations: [{ reference_no: "REG-A", campaign_id: "a", status: "registered" }],
    } as unknown as DatabaseStore;
    expect(openApplicationForReference(db, "REG-A")).toBeUndefined();
  });

  it("uses the only open form for a bare legacy link but avoids ambiguous routing", () => {
    const db = { customForms: [form("open", "a")], registrations: [] } as unknown as DatabaseStore;
    expect(openApplicationForReference(db)?.slug).toBe("open");
    db.customForms.push(form("another", "b") as DatabaseStore["customForms"][number]);
    expect(openApplicationForReference(db)).toBeUndefined();
  });
});
