import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectedAccount } from "@/lib/zapier-dispatch";
import { Connected } from "./index";

afterEach(() => {
  cleanup();
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
