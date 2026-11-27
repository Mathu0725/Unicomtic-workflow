// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("../../src/lib/client/api", () => ({ api: vi.fn(async () => ({ user: { name: "Staff", email: "staff@example.com", role: "admin" } })) }));
vi.mock("../../src/components/brand-logo", () => ({ default: () => <span>Logo</span> }));
vi.mock("../../src/components/admin-navigation", () => ({ default: () => <nav id="admin-navigation"><a href="/admin">Dashboard</a></nav> }));

import AdminLayout from "../../src/app/admin/layout";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps mobile navigation keyboard focus inside the open menu and returns it on Escape", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  render(<AdminLayout><p>Page content</p></AdminLayout>);
  const open = await screen.findByRole("button", { name: "Open navigation" });
  fireEvent.click(open);
  const sidebar = screen.getByRole("complementary");
  const close = within(sidebar).getByRole("button", { name: "Close navigation" });
  await waitFor(() => expect(document.activeElement).toBe(close));
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(within(sidebar).getByRole("button", { name: "Sign out" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(open.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(open);
});
