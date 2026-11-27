// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const toDataURL = vi.hoisted(() => vi.fn(async () => "data:image/png;base64,cXItY29kZQ=="));
vi.mock("qrcode", () => ({ toDataURL }));
import FormQrDownload from "../../src/components/form-qr-download";

afterEach(() => { cleanup(); toDataURL.mockClear(); });

it("generates and downloads a QR code for the selected form's public link", async () => {
  render(<div><section aria-label="First form"><FormQrDownload slug="registration-2027" title="Registration" active /></section><section aria-label="Second form"><FormQrDownload slug="application-2027" title="Application" active={false} /></section></div>);
  const second = within(screen.getByRole("region", { name: "Second form" }));
  fireEvent.click(second.getByRole("button", { name: "QR code & download" }));
  const download = await second.findByRole("link", { name: "Download PNG" });
  expect(toDataURL).toHaveBeenCalledWith(`${window.location.origin}/form/application-2027`, expect.objectContaining({ width: 768, margin: 4 }));
  expect(download.getAttribute("download")).toBe("application-2027-qr-code.png");
  expect(download.getAttribute("href")).toBe("data:image/png;base64,cXItY29kZQ==");
  expect(second.getByText(/This form is closed/)).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "First form" })).queryByRole("link", { name: "Download PNG" })).toBeNull();
});

it("lets the user retry if generation fails", async () => {
  toDataURL.mockRejectedValueOnce(new Error("failed"));
  render(<FormQrDownload slug="registration" title="Registration" active />);
  fireEvent.click(screen.getByRole("button", { name: "QR code & download" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Could not generate the QR code");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: "Download PNG" })).toBeTruthy();
});
