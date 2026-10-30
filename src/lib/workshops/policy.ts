import type { Workshop, WorkshopFormConfig } from "../data/store";

export type WorkshopOption = Pick<
  Workshop,
  | "id"
  | "title"
  | "start_time"
  | "end_time"
  | "venue"
  | "address"
  | "google_maps_url"
> & {
  remaining: number | null;
  bookable: boolean;
  unavailableReason: string;
};

export function workshopAttached(
  workshop: Workshop,
  campaignId?: string,
  config?: WorkshopFormConfig,
) {
  if (campaignId && workshop.campaign_id !== campaignId) return false;
  if (!config) return true;
  if (!config.enabled || config.hidden_ids?.includes(workshop.id)) return false;
  return config.selection_mode === "explicit" || config.workshop_ids.length > 0
    ? config.workshop_ids.includes(workshop.id)
    : true;
}

/** Shared by the builder preview, public display and final transactional booking. */
export function workshopOptions(
  workshops: (Workshop & { bookedCount?: number })[],
  campaignId?: string,
  config?: WorkshopFormConfig,
  now = Date.now(),
): WorkshopOption[] {
  return workshops
    .filter(
      (w) =>
        workshopAttached(w, campaignId, config) &&
        Date.parse(w.start_time) > now,
    )
    .map((w) => {
      const remaining = w.capacity
        ? Math.max(0, w.capacity - (w.bookedCount || 0))
        : null;
      const unavailableReason =
        !w.is_active ||
        (w.booking_deadline && Date.parse(w.booking_deadline) <= now)
          ? "Booking closed"
          : remaining === 0
            ? "Full"
            : "";
      return {
        id: w.id,
        title: w.title,
        start_time: w.start_time,
        end_time: w.end_time,
        venue: w.venue,
        address: w.address,
        google_maps_url: w.google_maps_url,
        remaining,
        bookable: !unavailableReason,
        unavailableReason,
      };
    });
}

export function explicitWorkshopConfig(
  config: WorkshopFormConfig | undefined,
  workshops: Workshop[],
  campaignId?: string,
): WorkshopFormConfig {
  const current = config || {
    enabled: false,
    required: false,
    workshop_ids: [],
    selection_mode: "explicit" as const,
  };
  return {
    ...current,
    selection_mode: "explicit",
    workshop_ids:
      current.selection_mode !== "explicit" && !current.workshop_ids.length
        ? workshops
            .filter((w) => !campaignId || w.campaign_id === campaignId)
            .map((w) => w.id)
        : current.workshop_ids,
  };
}
