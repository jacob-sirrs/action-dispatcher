import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORY_STORAGE_KEY } from "@/lib/history-storage";
import type { ConnectedAccount, ExecutionResult, ProposedAction } from "@/lib/zapier-dispatch";
import {
  analyzeTranscriptStream,
  executeActions,
  getConnectedAccounts,
  getConnections,
  getSdkStatus,
} from "@/lib/zapier-dispatch";
import { ActionHistory, buildHistoryEntries, Connected, DispatchApp } from "./index";

const { mockSampleTranscript } = vi.hoisted(() => ({
  mockSampleTranscript:
    "Mock transcript text long enough to satisfy the forty character minimum requirement.",
}));

vi.mock("@/lib/zapier-dispatch", () => ({
  getSdkStatus: vi.fn(),
  getConnections: vi.fn(),
  getConnectedAccounts: vi.fn(),
  analyzeTranscriptStream: vi.fn(),
  executeActions: vi.fn(),
  SAMPLE_TRANSCRIPT_TEXT: mockSampleTranscript,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

function makeAccount(overrides: Partial<ConnectedAccount>): ConnectedAccount {
  return {
    connectionId: overrides.appKey ?? "conn",
    appKey: "app",
    appName: "App",
    accountLabel: "user@example.com",
    category: "Test",
    actionCount: 3,
    isShared: false,
    isLegacy: false,
    connectedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const ACCOUNTS: ConnectedAccount[] = [
  makeAccount({ appKey: "gmail", appName: "Gmail" }),
  makeAccount({ appKey: "google-calendar", appName: "Google Calendar" }),
  makeAccount({ appKey: "slack", appName: "Slack" }),
  makeAccount({ appKey: "trello", appName: "Trello" }),
];

function renderConnected(props: Partial<React.ComponentProps<typeof Connected>> = {}) {
  const defaultProps: React.ComponentProps<typeof Connected> = {
    accounts: ACCOUNTS,
    transcript: "",
    onTranscriptChange: vi.fn(),
    selectedByApp: {},
    onToggleApp: vi.fn(),
    onChooseAccount: vi.fn(),
    onClearAll: vi.fn(),
    onAnalyze: vi.fn(),
  };
  return render(<Connected {...defaultProps} {...props} />);
}

describe("Connected — app search", () => {
  it("has an accessible search input above the app list", () => {
    renderConnected();
    // getByLabelText throws if no labelled input exists — its return alone
    // proves both the input and its accessible label are present.
    const input = screen.getByLabelText(/search.*app/i);
    expect(input.tagName).toBe("INPUT");
  });

  it("shows all apps when the search query is empty", () => {
    renderConnected();
    expect(screen.queryByText("Gmail")).not.toBeNull();
    expect(screen.queryByText("Google Calendar")).not.toBeNull();
    expect(screen.queryByText("Slack")).not.toBeNull();
    expect(screen.queryByText("Trello")).not.toBeNull();
  });

  it("filters to apps whose name partially matches, case-insensitively", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i);
    fireEvent.change(input, { target: { value: "goo" } });

    expect(screen.queryByText("Google Calendar")).not.toBeNull();
    expect(screen.queryByText("Gmail")).toBeNull();
    expect(screen.queryByText("Slack")).toBeNull();
    expect(screen.queryByText("Trello")).toBeNull();
  });

  it("matches regardless of case", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i);
    fireEvent.change(input, { target: { value: "SLACK" } });

    expect(screen.queryByText("Slack")).not.toBeNull();
    expect(screen.queryByText("Gmail")).toBeNull();
  });

  it("preserves alphabetical order among filtered results", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i);
    fireEvent.change(input, { target: { value: "g" } });

    // Gmail must precede Google Calendar in the DOM (alphabetical: "Gmail" < "Google Calendar").
    const gmailEl = screen.getByText("Gmail");
    const googleEl = screen.getByText("Google Calendar");
    expect(
      gmailEl.compareDocumentPosition(googleEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows an explicit no-results state when nothing matches", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i);
    fireEvent.change(input, { target: { value: "zzz-no-such-app" } });

    // Matches both the visible empty-state block and the sr-only live
    // region, which is expected — both must say so.
    expect(screen.getAllByText(/no apps match/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Gmail")).toBeNull();
  });

  it("has a clear control that resets the search and restores the full list", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "goo" } });
    expect(screen.queryByText("Gmail")).toBeNull();

    const clearButton = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearButton);

    expect(input.value).toBe("");
    expect(screen.queryByText("Gmail")).not.toBeNull();
    expect(screen.queryByText("Slack")).not.toBeNull();
  });

  it("does not render a clear control when the query is empty", () => {
    renderConnected();
    expect(screen.queryByRole("button", { name: /clear search/i })).toBeNull();
  });

  it("keeps a filtered-out app's selection intact, restored on clearing the filter", () => {
    renderConnected({ selectedByApp: { gmail: "gmail" } });
    const input = screen.getByLabelText(/search.*app/i);

    // Filter to hide the selected app (Gmail) entirely.
    fireEvent.change(input, { target: { value: "slack" } });
    expect(screen.queryByText("Gmail")).toBeNull();
    // Selection count (derived from the selectedByApp prop, not the visible
    // list) must still reflect the hidden selection.
    expect(screen.queryByText(/1 app/i)).not.toBeNull();

    // Clearing the filter must show Gmail's row still checked.
    fireEvent.change(input, { target: { value: "" } });
    const gmailButton = screen.getByText("Gmail").closest("button");
    expect(gmailButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("announces result feedback via an aria-live region for screen readers", () => {
    renderConnected();
    const input = screen.getByLabelText(/search.*app/i);
    fireEvent.change(input, { target: { value: "zzz-no-such-app" } });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toMatch(/no apps match/i);
  });

  it("does not show the no-results state when accounts are empty and query is empty (no regression)", () => {
    renderConnected({ accounts: [] });
    expect(screen.queryByText(/no apps match/i)).toBeNull();
  });
});

/* ─────────────────────── Session Action History ─────────────────────── */

function makeProposedAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    id: "action-1",
    appId: "gmail",
    appName: "Gmail",
    accountLabel: "user@example.com",
    actionType: "Send Email",
    summary: "Send a follow-up email",
    params: [],
    sourceQuote: "irrelevant",
    confidence: 0.9,
    ...overrides,
  };
}

function makeExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    actionId: "action-1",
    status: "succeeded",
    message: "Send Email completed via Gmail (user@example.com).",
    ranAt: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildHistoryEntries", () => {
  it("pairs each executed action with its result into a history entry", () => {
    const action = makeProposedAction({
      id: "a1",
      appName: "Gmail",
      actionType: "Send Email",
      accountLabel: "user@example.com",
    });
    const result = makeExecutionResult({
      actionId: "a1",
      status: "succeeded",
      message: "Send Email completed via Gmail (user@example.com).",
      ranAt: "2026-09-24T10:00:00.000Z",
    });

    const entries = buildHistoryEntries([action], [result]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      appName: "Gmail",
      actionType: "Send Email",
      accountLabel: "user@example.com",
      status: "succeeded",
      message: "Send Email completed via Gmail (user@example.com).",
      ranAt: "2026-09-24T10:00:00.000Z",
    });
  });

  it("carries a failed status and its safe message through unchanged", () => {
    const action = makeProposedAction({ id: "a2" });
    const result = makeExecutionResult({
      actionId: "a2",
      status: "failed",
      message: "Zapier action failed.",
    });

    const [entry] = buildHistoryEntries([action], [result]);
    expect(entry.status).toBe("failed");
    expect(entry.message).toBe("Zapier action failed.");
  });

  it("gives each entry a unique id, even for the same actionId run twice", () => {
    const action = makeProposedAction({ id: "a1" });
    const first = buildHistoryEntries(
      [action],
      [makeExecutionResult({ actionId: "a1", ranAt: "2026-09-24T10:00:00.000Z" })],
    );
    const second = buildHistoryEntries(
      [action],
      [makeExecutionResult({ actionId: "a1", ranAt: "2026-09-24T11:00:00.000Z" })],
    );
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("never carries transcript-derived or raw param values into the entry", () => {
    const action = makeProposedAction({
      sourceQuote: "SECRET TRANSCRIPT LINE",
      params: [{ key: "body", label: "Body", value: "SECRET BODY", required: false }],
    });
    const [entry] = buildHistoryEntries([action], [makeExecutionResult()]);
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("SECRET TRANSCRIPT LINE");
    expect(serialized).not.toContain("SECRET BODY");
  });
});

describe("ActionHistory", () => {
  it("shows an empty state before anything has executed", () => {
    render(<ActionHistory entries={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/no actions executed yet/i)).toBeTruthy();
  });

  it("labels the view as this-browser-only, distinct from a persisted admin audit log", () => {
    render(<ActionHistory entries={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/this browser/i)).toBeTruthy();
    // The old, now-inaccurate "session only" wording must be gone — history
    // now persists across reloads, so it should never claim otherwise.
    expect(screen.queryByText(/this session only/i)).toBeNull();
  });

  it("renders app, action, status, and time for a succeeded entry", () => {
    render(
      <ActionHistory
        entries={[
          {
            id: "e1",
            appName: "Gmail",
            actionType: "Send Email",
            accountLabel: "user@example.com",
            status: "succeeded",
            message: "Send Email completed via Gmail (user@example.com).",
            ranAt: "2026-09-24T10:00:00.000Z",
          },
        ]}
        onBack={vi.fn()}
      />,
    );
    // The app/action label is its own element — matched by exact combined
    // text, since "Gmail" and "Send Email" alone also appear inside the
    // (separately asserted) message text below.
    expect(screen.getByText((_, el) => el?.textContent === "Gmail · Send Email")).toBeTruthy();
    expect(screen.getByText("Succeeded")).toBeTruthy();
  });

  it("renders a failed entry's status and safe message without a stack trace", () => {
    render(
      <ActionHistory
        entries={[
          {
            id: "e2",
            appName: "Slack",
            actionType: "Post Message",
            accountLabel: "team-workspace",
            status: "failed",
            message: "Zapier action failed.",
            ranAt: "2026-09-24T10:05:00.000Z",
          },
        ]}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Zapier action failed.")).toBeTruthy();
    expect(screen.queryByText(/at Object\.|\.tsx?:\d+|Error:/)).toBeNull();
  });

  it("renders one list item per entry", () => {
    render(
      <ActionHistory
        entries={[
          { ...makeHistoryEntry(), id: "e1" },
          { ...makeHistoryEntry(), id: "e2" },
        ]}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

function makeHistoryEntry() {
  return {
    id: "e1",
    appName: "Gmail",
    actionType: "Send Email",
    accountLabel: "user@example.com",
    status: "succeeded" as const,
    message: "Send Email completed via Gmail (user@example.com).",
    ranAt: "2026-09-24T10:00:00.000Z",
  };
}

function mockConnectedSdk() {
  vi.mocked(getSdkStatus).mockResolvedValue({ connected: true, email: "user@example.com" });
  vi.mocked(getConnections).mockResolvedValue([
    {
      id: "gmail",
      name: "Gmail",
      category: "Email",
      actionCount: 5,
      accountCount: 1,
      connectedAt: "2026-01-01T00:00:00Z",
    },
  ]);
  vi.mocked(getConnectedAccounts).mockResolvedValue([
    makeAccount({ appKey: "gmail", appName: "Gmail", connectionId: "conn-1" }),
  ]);
}

function mockAnalysis(action: ProposedAction) {
  vi.mocked(analyzeTranscriptStream).mockResolvedValueOnce(
    (async function* () {
      yield {
        connectionId: "conn-1",
        appId: "gmail",
        appName: "Gmail",
        accountLabel: "user@example.com",
        status: "done" as const,
        actions: [action],
      };
    })(),
  );
}

async function runOneCycle(
  actionId: string,
  resultOverrides: Partial<ExecutionResult>,
  selectApp: boolean,
) {
  const action = makeProposedAction({
    id: actionId,
    appName: "Gmail",
    accountLabel: "user@example.com",
  });
  mockAnalysis(action);
  vi.mocked(executeActions).mockResolvedValueOnce([
    makeExecutionResult({ actionId, ranAt: new Date().toISOString(), ...resultOverrides }),
  ]);

  if (selectApp) {
    fireEvent.click(screen.getByText("Gmail").closest("button")!);
  }
  fireEvent.click(screen.getByRole("button", { name: /analyze transcript/i }));

  const runButton = await screen.findByRole("button", { name: /run 1 queued action/i });
  fireEvent.click(runButton);

  await screen.findByText(/ran 1 action/i);
}

describe("DispatchApp — session action history", () => {
  it("accumulates history across execution cycles and survives a return to Connected", async () => {
    mockConnectedSdk();
    render(<DispatchApp />);

    await screen.findByText(/prioritize apps to analyze/i);
    expect(screen.getByRole("button", { name: /^history/i }).textContent).not.toMatch(/\d/);

    await runOneCycle("run-1-action", { status: "succeeded" }, true);
    expect(screen.getByRole("button", { name: /^history/i }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("button", { name: /analyze another transcript/i }));
    await screen.findByText(/prioritize apps to analyze/i);
    // Returning to Connected must not have cleared history from the first cycle.
    expect(screen.getByRole("button", { name: /^history/i }).textContent).toContain("1");

    await runOneCycle(
      "run-2-action",
      { status: "failed", message: "Zapier action failed." },
      false,
    );
    expect(screen.getByRole("button", { name: /^history/i }).textContent).toContain("2");

    fireEvent.click(screen.getByRole("button", { name: /^history/i }));
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Succeeded")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
  });
});

describe("DispatchApp — persisted history (localStorage POC)", () => {
  it("loads previously persisted history on mount, before any execution", async () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            id: "prior-1",
            appName: "Gmail",
            actionType: "Send Email",
            accountLabel: "user@example.com",
            status: "succeeded",
            message: "Send Email completed via Gmail (user@example.com).",
            ranAt: "2026-09-29T09:00:00.000Z",
          },
        ],
      }),
    );
    mockConnectedSdk();
    render(<DispatchApp />);

    await screen.findByText(/prioritize apps to analyze/i);
    expect(screen.getByRole("button", { name: /^history/i }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("button", { name: /^history/i }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText((_, el) => el?.textContent === "Gmail · Send Email")).toBeTruthy();
  });

  it("persists a new execution so a freshly mounted instance (simulating a reload) still shows it", async () => {
    mockConnectedSdk();
    const { unmount } = render(<DispatchApp />);
    await screen.findByText(/prioritize apps to analyze/i);
    await runOneCycle("persisted-action", { status: "succeeded" }, true);
    unmount();

    render(<DispatchApp />);
    await screen.findByText(/prioritize apps to analyze/i);
    // A fresh mount — standing in for a page reload — must still see the
    // execution recorded by the previous (now-unmounted) instance.
    expect(screen.getByRole("button", { name: /^history/i }).textContent).toContain("1");
  });
});
