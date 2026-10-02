import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppAnalysisResult,
  ConnectedAccount,
  ExecutionResult,
  ProposedAction,
} from "@/lib/zapier-dispatch";

vi.mock("@/lib/zapier-dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/zapier-dispatch")>();
  return {
    ...actual,
    getSdkStatus: vi.fn(),
    getConnections: vi.fn(),
    getConnectedAccounts: vi.fn(),
    analyzeTranscriptStream: vi.fn(),
    executeActions: vi.fn(),
  };
});

const {
  getSdkStatus,
  getConnections,
  getConnectedAccounts,
  analyzeTranscriptStream,
  executeActions,
} = await import("@/lib/zapier-dispatch");
const { DispatchApp } = await import("./index");

const mockedGetSdkStatus = vi.mocked(getSdkStatus);
const mockedGetConnections = vi.mocked(getConnections);
const mockedGetConnectedAccounts = vi.mocked(getConnectedAccounts);
const mockedAnalyzeStream = vi.mocked(analyzeTranscriptStream);
const mockedExecuteActions = vi.mocked(executeActions);

const ACCOUNT: ConnectedAccount = {
  connectionId: "conn-1",
  appKey: "slack",
  appName: "Slack",
  accountLabel: "workspace",
  category: "Messaging",
  actionCount: 3,
  isShared: false,
  isLegacy: false,
  connectedAt: "2026-01-01T00:00:00Z",
};

const ACTION: ProposedAction = {
  id: "action-1",
  appId: "slack",
  appName: "Slack",
  accountLabel: "workspace",
  actionType: "Send Message",
  summary: "Send a message",
  params: [],
  sourceQuote: "let's send a message",
  confidence: 0.9,
};

/** A single-item async iterable, matching what analyzeTranscriptStreamFn
 * returns to the client (a server-side async generator delivered as an
 * async iterable). */
function makeStream(result: AppAnalysisResult): AsyncIterable<AppAnalysisResult> {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next: async () => {
          if (done) return { value: undefined, done: true };
          done = true;
          return { value: result, done: false };
        },
      };
    },
  };
}

beforeEach(() => {
  mockedGetSdkStatus.mockResolvedValue({ connected: true, email: "test@example.com" });
  mockedGetConnections.mockResolvedValue([]);
  mockedGetConnectedAccounts.mockResolvedValue([ACCOUNT]);
  mockedAnalyzeStream.mockResolvedValue(
    makeStream({
      connectionId: ACCOUNT.connectionId,
      appId: ACCOUNT.appKey,
      appName: ACCOUNT.appName,
      accountLabel: ACCOUNT.accountLabel,
      status: "done",
      actions: [ACTION],
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

/** Drives the app from load through to the review queue with one queued,
 * runnable action, and returns the "Run" button. */
async function renderToReview() {
  render(<DispatchApp />);
  const slackToggle = (await screen.findByText("Slack")).closest("button");
  if (!slackToggle) throw new Error("Slack app toggle not found");
  fireEvent.click(slackToggle);
  const analyzeButton = await screen.findByRole("button", { name: /analyze transcript/i });
  fireEvent.click(analyzeButton);
  return screen.findByRole("button", { name: /run 1 queued action/i });
}

describe("Run button — duplicate-execution guard (D2)", () => {
  it("calls executeActions exactly once when the run control is triggered twice while in flight", async () => {
    let resolveExec!: (r: ExecutionResult[]) => void;
    mockedExecuteActions.mockReturnValue(
      new Promise((resolve) => {
        resolveExec = resolve;
      }),
    );
    const runButton = await renderToReview();

    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(mockedExecuteActions).toHaveBeenCalledTimes(1);

    resolveExec([
      { actionId: ACTION.id, status: "succeeded", message: "ok", ranAt: "2026-01-01T00:00:00Z" },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /run 1 queued action/i })).toBeNull(),
    );
  });

  it("disables the run control immediately once execution starts", async () => {
    mockedExecuteActions.mockReturnValue(new Promise(() => {}));
    const runButton = (await renderToReview()) as HTMLButtonElement;

    fireEvent.click(runButton);

    expect(runButton.disabled).toBe(true);
  });

  it("resets the guard when execution rejects, so the control does not stay permanently disabled", async () => {
    mockedExecuteActions.mockRejectedValueOnce(new Error("boom"));
    const runButton = (await renderToReview()) as HTMLButtonElement;

    fireEvent.click(runButton);
    await waitFor(() => expect(runButton.disabled).toBe(false));

    mockedExecuteActions.mockResolvedValueOnce([
      { actionId: ACTION.id, status: "succeeded", message: "ok", ranAt: "2026-01-01T00:00:00Z" },
    ]);
    fireEvent.click(runButton);
    await waitFor(() => expect(mockedExecuteActions).toHaveBeenCalledTimes(2));
  });

  it("keeps the existing zero-queued disabled behavior unchanged", async () => {
    render(<DispatchApp />);
    const slackToggle = (await screen.findByText("Slack")).closest("button");
    if (!slackToggle) throw new Error("Slack app toggle not found");
    fireEvent.click(slackToggle);
    const analyzeButton = await screen.findByRole("button", { name: /analyze transcript/i });
    fireEvent.click(analyzeButton);

    // Uncheck the only queued action so queuedCount is 0.
    const includeCheckbox = await screen.findByLabelText(`Include ${ACTION.actionType}`);
    fireEvent.click(includeCheckbox);

    const runButton = (await screen.findByRole("button", {
      name: /run.*queued action/i,
    })) as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);

    fireEvent.click(runButton);
    expect(mockedExecuteActions).not.toHaveBeenCalled();
  });
});
