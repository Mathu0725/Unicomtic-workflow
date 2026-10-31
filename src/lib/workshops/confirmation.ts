import type { Workshop } from "../data/store";

export type WorkshopConfirmation = Pick<Workshop, "title" | "start_time" | "venue"> &
  Partial<Pick<Workshop, "end_time" | "address" | "google_maps_url">>;

export function workshopConfirmation(workshop: Workshop): WorkshopConfirmation {
  const { title, start_time, end_time, venue, address, google_maps_url } = workshop;
  return { title, start_time, end_time, venue, address, google_maps_url };
}

export function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    return url.hostname === "maps.app.goo.gl" ||
      url.hostname === "maps.google.com" ||
      (["google.com", "www.google.com"].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
      (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"));
  } catch { return false; }
}

export const workshopTemplateVariables = ["name", "email", "reference", "intake", "institution", "workshop", "date", "startTime", "endTime", "venue", "address", "mapsUrl", "daysBefore"];
export function workshopValues(w: WorkshopConfirmation) {
  const time = (value: string) => new Date(value).toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" });
  return {
    workshop: w.title,
    date: new Date(w.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }),
    startTime: time(w.start_time), endTime: w.end_time ? time(w.end_time) : "",
    venue: w.venue, address: w.address || "", mapsUrl: w.google_maps_url || "",
  };
}
