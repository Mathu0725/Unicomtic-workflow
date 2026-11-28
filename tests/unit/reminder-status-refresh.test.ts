// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import RemindersPage from "../../src/app/admin/reminders/page";

const mocks = vi.hoisted(() => ({ data: null as any, reload: vi.fn(async () => {}) }));
vi.mock("../../src/components/live-data", async (original) => ({
  ...(await original<any>()),
  useLiveData: () => ({ data: mocks.data, error: "", reload: mocks.reload, loading: false }),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); mocks.reload.mockClear(); });

it("refreshes pending delivery statuses without clearing another selected recipient", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const recipient = { id: "r1", name: "First Student", email: "first@example.com", reference: "REG-1", intake: "Intake", workshop: "", canQueue: false, lastStatus: "queued", reason: "Existing reminder is queued.", lastReminderAt: null, token: "one", actionUrl: "" };
  const second = { ...recipient, id: "r2", name: "Second Student", email: "second@example.com", canQueue: true, lastStatus: null, reason: "", token: "two" };
  mocks.data = { recipients: [recipient, second], counts: {}, campaigns: [], expiresAt: 1 };
  const page = render(createElement(RemindersPage));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Second Student" }));
  expect((screen.getByRole("checkbox", { name: "Select Second Student" }) as HTMLInputElement).checked).toBe(true);
  act(() => vi.advanceTimersByTime(15000));
  expect(mocks.reload).toHaveBeenCalledTimes(1);
  mocks.data = { ...mocks.data, expiresAt: 2, recipients: [{ ...recipient, lastStatus: "sent", reason: "A reminder was sent within the last 24 hours." }, second] };
  page.rerender(createElement(RemindersPage));
  expect(screen.getByText("Last: sent")).toBeTruthy();
  expect(screen.getByText("Sent", { exact: true })).toBeTruthy();
  expect(screen.getByText("A reminder was sent within the last 24 hours.")).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: "Select Second Student" }) as HTMLInputElement).checked).toBe(true);
  act(() => vi.advanceTimersByTime(30000));
  expect(mocks.reload).toHaveBeenCalledTimes(1);
});
