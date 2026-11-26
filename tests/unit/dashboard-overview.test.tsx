// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("../../src/lib/client/api", () => ({ api: vi.fn(async () => ({
  stats: { registrations: 15, applications: 8 },
  activity: { days: [
    { date: "2026-11-25", registrations: 3, applications: 2 },
    { date: "2026-11-26", registrations: 1, applications: 1 },
  ], recentApplications: [{ id: "1", name: "Test applicant", reference: "APP-1", createdAt: "2026-11-26T04:00:00Z", status: "submitted" }] },
  workshops: [{ id: "w1", title: "Introduction", start_time: "2026-12-01T04:00:00Z", venue: "Jaffna", bookings: 6, capacity: 10, is_active: true }],
})) }));

import Dashboard from "../../src/app/admin/page";

afterEach(cleanup);

it("shows yesterday and weekly counts, recent application preview, and workshop seats", async () => {
  render(<Dashboard />);
  expect(await screen.findByText("Test applicant")).toBeTruthy();
  expect(screen.getByText("3 registrations · 2 applications")).toBeTruthy();
  expect(screen.getByText("4 registrations · 3 applications")).toBeTruthy();
  expect(screen.getByText("6 booked · 10 total · 4 available")).toBeTruthy();
  expect(within(screen.getByRole("progressbar", { name: "Introduction seats booked" })).queryByText("6")).toBeNull();
  expect(screen.getByRole("progressbar", { name: "Introduction seats booked" }).getAttribute("aria-valuenow")).toBe("6");
  expect(screen.getByText(/APP-1/)).toBeTruthy();
});
