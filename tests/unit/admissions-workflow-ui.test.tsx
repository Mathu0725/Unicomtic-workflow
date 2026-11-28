// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Interviews from "../../src/app/admin/interviews/page";
import Results from "../../src/app/admin/final-results/page";
const mocks = vi.hoisted(() => ({ apiResponse: vi.fn() }));
vi.mock("../../src/lib/client/api", () => mocks);
const campaigns = [{ id: "old", title: "Old intake", is_active: false }, { id: "new", title: "Current intake", is_active: true }];
const candidate = { studentId: "student", campaignId: "new", studentName: "Audit Student", email: "audit@example.com", reference: "REG-AUDIT", utNumber: "UT011001" };
const postBody = () => JSON.parse(mocks.apiResponse.mock.calls.find(call => call[1]?.method === "POST")![1].body);
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});
afterEach(cleanup);

it("keeps the draft and displays the API error when saving fails", async () => {
  mocks.apiResponse.mockImplementation(async (_url, options) => {
    if (options) throw new Error("These records changed. Reload and review before saving again.");
    return { json: async () => ({ campaigns, decisions: [], candidates: [candidate] }) };
  });
  render(<Results />); await screen.findByText(/No decisions recorded yet/);
  fireEvent.click(screen.getByRole("button", { name: "Create draft decision" }));
  fireEvent.change(screen.getByLabelText("Candidate"), { target: { value: "student" } });
  fireEvent.change(screen.getByLabelText("Decision notes (optional)"), { target: { value: "Preserve these notes" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create draft decision" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Decision notes (optional)") as HTMLTextAreaElement).value).toBe("Preserve these notes");
  expect(screen.getByRole("button", { name: "Save draft decision" }).hasAttribute("disabled")).toBe(false);
});

it("R8 resets all rubric values when opening an unscored candidate", async () => {
  const evaluation = { communication_score: 25, technical_score: 35, analytical_score: 25, overall_score: 15, recommendation: "strongly_recommend", notes: "Private notes belonging only to candidate A" };
  mocks.apiResponse.mockResolvedValue({ json: async () => ({ campaigns, interviews: [{ id: "session", campaign_id: "new", status: "scheduled", title: "Audit", date: "2026-11-01", venue: "Jaffna", panel_members: ["Panel"], totalCandidates: 2, candidates: [{ id: "a", studentName: "Candidate A", time_slot: "2026-11-01", evaluation }, { id: "b", studentName: "Candidate B", time_slot: "2026-11-01", evaluation: null }] }] }) });
  render(<Interviews />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit Rubric" }));
  expect((screen.getByLabelText("Confidential Interviewer Notes") as HTMLTextAreaElement).value).toBe(evaluation.notes);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Score Rubric" }));
  expect((screen.getByLabelText("Confidential Interviewer Notes") as HTMLTextAreaElement).value).toBe("");
  for (const input of screen.getAllByRole("spinbutton")) expect((input as HTMLInputElement).value).toBe("0");
  expect((screen.getByLabelText("Panel Recommendation") as HTMLSelectElement).value).toBe("neutral");
});

it("R9 edits the exact selected intake decision and sends its version", async () => {
  const decisions = campaigns.map((campaign, index) => ({ id: `decision-${index}`, student_id: "student", campaign_id: campaign.id, campaignTitle: campaign.title, studentName: "Audit", email: "audit@example.com", final_status: "selected", revision: 4, notification_status: "pending" }));
  mocks.apiResponse.mockImplementation(async (_url, options) => ({ json: async () => options ? { success: true } : { campaigns, decisions } }));
  render(<Results />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Decision for Audit (Current intake)" }), { target: { value: "waiting_list" } });
  await waitFor(() => expect(mocks.apiResponse.mock.calls.some(call => call[1]?.method === "POST")).toBe(true));
  expect(postBody()).toMatchObject({ campaignId: "new", expectedDecisionId: "decision-1", expectedRevision: 4, expectedStatus: "selected", studentId: "student", finalStatus: "waiting_list" });
});

it("R10 can create the first interview session from an empty intake", async () => {
  mocks.apiResponse.mockImplementation(async (_url, options) => ({ json: async () => options ? { success: true, message: "Created" } : { campaigns, interviews: [] } }));
  render(<Interviews />);
  await screen.findByText("No interview sessions yet");
  fireEvent.click(screen.getByRole("button", { name: "Create interview session" }));
  fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Admissions panel" } });
  fireEvent.change(screen.getByLabelText("Date and start time (Sri Lanka)"), { target: { value: "2026-11-05T09:00" } });
  fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "Jaffna campus" } });
  fireEvent.change(screen.getByLabelText("Panel members"), { target: { value: "Panel One, Panel Two" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create interview session" }));
  await waitFor(() => expect(postBody()).toMatchObject({ action: "create_session", campaignId: "new", date: "2026-11-05T03:30:00.000Z", panelMembers: ["Panel One", "Panel Two"] }));
});

it("R10 assigns only selected candidates in this intake and previews invitation slots", async () => {
  mocks.apiResponse.mockImplementation(async (_url, options) => ({ json: async () => options ? { success: true } : { campaigns, candidates: [candidate, { ...candidate, campaignId: "old", studentId: "old-student", studentName: "Old Student" }], interviews: [{ id: "session", campaign_id: "new", status: "scheduled", title: "Panel", date: "2026-11-05T03:30:00Z", venue: "Campus", panel_members: [], candidates: [], totalCandidates: 0 }] } }));
  render(<Interviews />);
  fireEvent.click(await screen.findByRole("button", { name: "Assign candidates" }));
  expect(screen.queryByText("Old Student")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /Audit Student/ }));
  fireEvent.click(screen.getByRole("button", { name: "Assign 1 & queue invitations" }));
  await waitFor(() => expect(postBody()).toMatchObject({ action: "assign_candidates", interviewId: "session", studentIds: ["student"], startTime: "2026-11-05T03:30:00.000Z" }));
});

it("R10 creates a pending draft without sending emails", async () => {
  mocks.apiResponse.mockImplementation(async (_url, options) => ({ json: async () => options ? { success: true } : { campaigns, decisions: [], candidates: [candidate] } }));
  render(<Results />);
  await screen.findByText(/No decisions recorded yet/);
  fireEvent.click(screen.getByRole("button", { name: "Create draft decision" }));
  fireEvent.change(screen.getByLabelText("Candidate"), { target: { value: "student" } });
  fireEvent.change(screen.getByLabelText("Composite score (optional)"), { target: { value: "0" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create draft decision" }));
  await waitFor(() => expect(postBody()).toMatchObject({ action: "update_decision", campaignId: "new", finalStatus: "pending_decision", expectedDecisionId: null, compositeScore: 0 }));
  expect(mocks.apiResponse.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
});

it("result dispatch requires a review click and includes the visible intake", async () => {
  const decisions = [{ id: "decision", student_id: "student", campaign_id: "new", campaignTitle: "Current intake", studentName: "Audit", email: "audit@example.com", final_status: "waiting_list", notification_status: "pending" }];
  mocks.apiResponse.mockImplementation(async (_url, options) => ({ json: async () => options ? { success: true, message: "Queued" } : { campaigns, decisions } }));
  render(<Results />); await screen.findByText("Audit");
  fireEvent.click(screen.getByRole("button", { name: "Send Waiting List Emails" }));
  expect(mocks.apiResponse.mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
  fireEvent.click(within(screen.getByRole("region", { name: "Review result emails" })).getByRole("button", { name: "Queue reviewed result emails" }));
  await waitFor(() => expect(postBody()).toMatchObject({ action: "send_notifications", campaignId: "new", statusFilter: "waiting_list" }));
});
