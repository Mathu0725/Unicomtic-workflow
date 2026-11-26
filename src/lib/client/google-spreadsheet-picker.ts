import { api } from "@/lib/client/api";

type PickedSpreadsheet = { id: string; name: string };

let pickerLoad: Promise<void> | undefined;

async function loadGooglePicker() {
  const browser = window as Window & { gapi?: any; google?: any };
  if (!pickerLoad) {
    pickerLoad = new Promise<void>((resolve, reject) => {
      const loaded = () => {
        if (!browser.gapi) {
          reject(new Error("Google Drive picker could not load."));
          return;
        }
        browser.gapi.load("picker", {
          callback: resolve,
          onerror: () => reject(new Error("Google Drive picker could not load.")),
        });
      };
      const existing = document.getElementById("google-api-loader") as HTMLScriptElement | null;
      if (existing) {
        if (browser.gapi) loaded();
        else {
          existing.addEventListener("load", loaded, { once: true });
          existing.addEventListener("error", () => reject(new Error("Google Drive picker could not load.")), { once: true });
        }
        return;
      }
      const script = document.createElement("script");
      script.id = "google-api-loader";
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.onload = loaded;
      script.onerror = () => reject(new Error("Google Drive picker could not load."));
      document.head.appendChild(script);
    }).catch((error) => {
      pickerLoad = undefined;
      throw error;
    });
  }
  await pickerLoad;
}

export async function chooseGoogleSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const pickerConfig = await api("/api/admin/google-picker", undefined, "GET");
  await loadGooglePicker();
  const google = (window as Window & { google?: any }).google;
  return new Promise((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(pickerConfig.accessToken)
      .setDeveloperKey(pickerConfig.developerKey)
      .setAppId(pickerConfig.appId)
      .setOrigin(window.location.origin)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]?.id) return;
        resolve({ id: data.docs[0].id, name: data.docs[0].name || "Google spreadsheet" });
      })
      .build();
    picker.setVisible(true);
  });
}

