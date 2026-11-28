// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/client/api", () => ({ api: request }));
import { useLiveData } from "../../src/components/live-data";

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  request.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("pauses automatic polling in a hidden tab and refreshes when visible again", async () => {
  const { result } = renderHook(() => useLiveData("/api/admin/stats", 30000));
  await act(async () => {});
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(request).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(90000); });
  expect(request).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(request).toHaveBeenCalledTimes(3);
  await act(async () => { await result.current.reload(); });
  expect(request).toHaveBeenCalledTimes(4);
});

it("keeps manual-only data from automatically reloading on visibility changes", async () => {
  const { result } = renderHook(() => useLiveData("/api/admin/settings", 0));
  await act(async () => {});
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(90000); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.reload(); });
  expect(request).toHaveBeenCalledTimes(2);
});
