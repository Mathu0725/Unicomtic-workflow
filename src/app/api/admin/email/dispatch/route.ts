import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { readDatabase } from "@/lib/data/repository";
import { processOutbox } from "@/lib/jobs/outbox";
import { emailJobStatus } from "@/lib/email/job-status";
export const dynamic = "force-dynamic";
export const POST = route(async req => {
  const { jobId } = await req.json();
  const saved = (await readDatabase()).outbox.find(job => job.id === jobId && job.type === "email");
  if (!saved) throw new RequestError("Email job not found.", 404);
  await processOutbox(1, 15000, saved.id);
  const job = (await readDatabase()).outbox.find(job => job.id === saved.id)!;
  const delivery = emailJobStatus(job);
  return NextResponse.json({ success: true, jobId: job.id, status: job.status, deliveryStatus: delivery.filter, message: `Email ${delivery.label.toLowerCase()}.${job.error ? ` ${job.error}` : ""}` });
}, true, { database: false });
