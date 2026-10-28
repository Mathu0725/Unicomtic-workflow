export const defaultFormMessages = {
  popupTitle: "Before you begin",
  popupSubtitle: "விண்ணப்ப வழிமுறைகள்",
  submitEnglish: "Press apply at the bottom of the page to complete the application.",
  submitTamil: "விண்ணப்பத்தை பூர்த்தி செய்ய இப்பக்கத்தின் கீழே உள்ள apply என்பதை அழுத்தவும்.",
  popupNotes: "Please use your OWN initiative and words to complete the application.\n\nCan be completed in either English or Tamil\nவிண்ணப்பத்தை ஆங்கிலத்தில் அல்லது தமிழில் நிரப்பலாம்\n\nComplete the application as soon as possible as spaces on the workshops are limited.",
  autoSaveMessage: "Partially completed Application Form is saved automatically. (முழுமையாக பூர்த்தி செய்யப்படாத விண்ணப்பப் படிவத்தை சேமித்து பின்னர் தொடரலாம்).",
  draftRestoredMessage: "Partially completed Application Form restored. (முழுமையாக பூர்த்தி செய்யப்படாத விண்ணப்பப் படிவம் மீளமைக்கப்பட்டது).",
  submitButtonLabel: "Apply / விண்ணப்பிக்கவும்",
  viewInstructionsLabel: "View instructions",
  continueButtonLabel: "Continue / தொடரவும்",
};
export type FormMessages = typeof defaultFormMessages;
export type FormMessageKey = keyof FormMessages;

export const defaultFormMessageDisplay = {
  popup_enabled: true,
  bottom_messages_enabled: true,
};
export type FormMessageDisplay = typeof defaultFormMessageDisplay;

export function resolveFormMessageDisplay(saved?: Partial<FormMessageDisplay> | null): FormMessageDisplay {
  return {
    popup_enabled: typeof saved?.popup_enabled === "boolean" ? saved.popup_enabled : defaultFormMessageDisplay.popup_enabled,
    bottom_messages_enabled: typeof saved?.bottom_messages_enabled === "boolean" ? saved.bottom_messages_enabled : defaultFormMessageDisplay.bottom_messages_enabled,
  };
}

export function resolveFormMessages(saved?: Partial<FormMessages> | null): FormMessages {
  return Object.fromEntries(Object.entries(defaultFormMessages).map(([key, value]) => [key, typeof saved?.[key as FormMessageKey] === "string" ? saved[key as FormMessageKey] : value])) as FormMessages;
}

export const formMessageFields: { key: FormMessageKey; label: string; maxLength: number; rows?: number; required?: boolean; hint?: string }[] = [
  { key: "popupTitle", label: "Popup title", maxLength: 160, required: true },
  { key: "popupSubtitle", label: "Popup subtitle / Tamil heading", maxLength: 300 },
  { key: "submitEnglish", label: "Submit instructions — English", maxLength: 1500, rows: 3, hint: "Shown in the popup and below the submit button." },
  { key: "submitTamil", label: "Submit instructions — Tamil", maxLength: 1500, rows: 3 },
  { key: "popupNotes", label: "Additional popup instructions", maxLength: 8000, rows: 7, hint: "Use English or Tamil. Separate bullet points with a blank line." },
  { key: "autoSaveMessage", label: "Automatic draft saving message", maxLength: 1500, rows: 3, hint: "Shown below the submit instructions. Editing this text does not change automatic draft saving." },
  { key: "draftRestoredMessage", label: "Restored draft message", maxLength: 1500, rows: 3 },
  { key: "submitButtonLabel", label: "Submit button text", maxLength: 100, required: true, hint: "Keep the submit instructions consistent with this button text." },
  { key: "viewInstructionsLabel", label: "View instructions button text", maxLength: 100, hint: "Optional. Leave empty to hide this button. When the popup is enabled, it still opens automatically." },
  { key: "continueButtonLabel", label: "Popup continue button text", maxLength: 100, required: true },
];
