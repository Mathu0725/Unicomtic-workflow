export interface PortalSettings {
    version: number;
    termsVersion: string;
    termsContent: string;
    institutionName: string;
    contactEmail: string;
    phone: string;
}
export const defaultSettings: PortalSettings = {
    version: 0, termsVersion: "v1.0",
    termsContent: "I hereby confirm that all details provided in this registration are accurate and true. I understand that any false information will disqualify my application. I agree to receive communications from Unicom TIC regarding workshops, examinations, and admissions.",
    institutionName: "Unicom TIC", contactEmail: "", phone: "",
};
