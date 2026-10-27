import { resolveFormMessages, type FormMessages } from "@/lib/forms/messages";

export default function FormSubmitMessages({ messages, enabled = true }: { messages?: Partial<FormMessages>; enabled?: boolean }) {
  if (!enabled) return null;
  const copy = resolveFormMessages(messages);
  return <div className="space-y-1 text-center">
    {copy.submitEnglish && <p className="whitespace-pre-wrap break-words text-[11px] font-semibold text-slate-600">{copy.submitEnglish}</p>}
    {copy.submitTamil && <p lang="ta" className="whitespace-pre-wrap break-words text-[11px] text-slate-500">{copy.submitTamil}</p>}
    {copy.autoSaveMessage && <p className="whitespace-pre-wrap break-words pt-1 text-[10px] text-slate-400">{copy.autoSaveMessage}</p>}
  </div>;
}
