import { redirect } from "next/navigation";
import { readDatabase } from "@/lib/data/repository";
import { openApplicationForReference } from "@/lib/forms/application-entry";
import LegacyApplyPage from "./legacy-apply-client";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { ref } = await searchParams;
  const reference = typeof ref === "string" ? ref : undefined;
  const form = openApplicationForReference(await readDatabase(), reference);
  if (form) redirect(`/form/${form.slug}`);

  return <LegacyApplyPage />;
}
