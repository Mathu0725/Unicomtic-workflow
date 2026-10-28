import type { NextRequest } from "next/server";
import { getSession } from "../security/session";
import { RequestError } from "../http";
export function requireWorkshopSheetAdmin(req: NextRequest) {
  const user = getSession(req);
  if (!user || !["admin", "super_admin"].includes(user.role))
    throw new RequestError(
      "Only admissions administrators can configure or export workshop Sheets.",
      403,
    );
  return user.email;
}
