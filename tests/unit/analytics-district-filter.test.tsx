// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../../src/lib/client/api", () => ({
  api: vi.fn(async () => ({ districts: [
    { district: "Jaffna", province: "Northern", registrations: 10, applications: 4, attendance: 2, passed: 1 },
    { district: "Mannar", province: "Northern", registrations: 5, applications: 2, attendance: 1, passed: 0 },
    { district: "Colombo", province: "Western", registrations: 20, applications: 10, attendance: 3, passed: 2 },
  ] })),
}));

import Analytics from "../../src/app/admin/analytics/page";

afterEach(cleanup);

it("filters district rows and totals and resets an incompatible district when the province changes", async () => {
  render(<Analytics />);
  await screen.findByRole("cell", { name: "Jaffna" });
  const province = screen.getByRole("combobox", { name: "Filter by province" });
  const district = screen.getByRole("combobox", { name: "Filter by district" }) as HTMLSelectElement;
  const table = screen.getByRole("table");

  fireEvent.change(province, { target: { value: "Northern" } });
  expect(within(district).queryByRole("option", { name: "Colombo" })).toBeNull();
  expect(within(table).queryByRole("cell", { name: "Colombo" })).toBeNull();
  expect(screen.getByText("Registrations", { selector: "span" }).nextElementSibling?.textContent).toBe("15");

  fireEvent.change(district, { target: { value: "Jaffna" } });
  expect(within(table).getByRole("cell", { name: "Jaffna" })).toBeTruthy();
  expect(within(table).queryByRole("cell", { name: "Mannar" })).toBeNull();
  expect(screen.getByText("Registrations", { selector: "span" }).nextElementSibling?.textContent).toBe("10");
  expect(screen.getByText("Applications Submitted").nextElementSibling?.textContent).toBe("4");

  fireEvent.change(province, { target: { value: "Western" } });
  expect(district.value).toBe("All");
  expect(within(table).getByRole("cell", { name: "Colombo" })).toBeTruthy();
  expect(screen.getByText("Registrations", { selector: "span" }).nextElementSibling?.textContent).toBe("20");
});
