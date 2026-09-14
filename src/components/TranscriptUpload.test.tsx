import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnsupportedFileTypeError } from "@/lib/transcript-file";
import { TranscriptUpload } from "./TranscriptUpload";

vi.mock("@/lib/transcript-file", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transcript-file")>();
  return { ...actual, extractTranscriptText: vi.fn() };
});

const { extractTranscriptText } = await import("@/lib/transcript-file");
const mockedExtract = vi.mocked(extractTranscriptText);

// jsdom doesn't implement a few DOM APIs Radix's AlertDialog touches on
// mount/focus — stub them so the dialog can render in tests.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  // @ts-expect-error -- minimal test-only stub, not a full ResizeObserver
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  mockedExtract.mockReset();
});

function selectFile(name = "transcript.txt") {
  const input = screen.getByTestId("transcript-file-input") as HTMLInputElement;
  const file = new File(["irrelevant"], name);
  fireEvent.change(input, { target: { files: [file] } });
  return { input, file };
}

describe("TranscriptUpload", () => {
  it("loads valid extracted text immediately into an empty editor", async () => {
    mockedExtract.mockResolvedValueOnce("Extracted transcript text.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={false} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile();

    await waitFor(() =>
      expect(onTranscriptLoaded).toHaveBeenCalledWith("Extracted transcript text."),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows an overwrite confirmation instead of loading immediately when content exists", async () => {
    mockedExtract.mockResolvedValueOnce("New text.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={true} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile();

    await screen.findByRole("alertdialog");
    expect(onTranscriptLoaded).not.toHaveBeenCalled();
  });

  it("cancelling the overwrite confirmation preserves existing content", async () => {
    mockedExtract.mockResolvedValueOnce("New text.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={true} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onTranscriptLoaded).not.toHaveBeenCalled();
  });

  it("confirming the overwrite loads the new text", async () => {
    mockedExtract.mockResolvedValueOnce("New text.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={true} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /replace/i }));

    expect(onTranscriptLoaded).toHaveBeenCalledWith("New text.");
  });

  it("shows a clear, user-safe error and preserves content when the file is rejected", async () => {
    mockedExtract.mockRejectedValueOnce(new UnsupportedFileTypeError("internal detail"));
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={true} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile("transcript.docx");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Only .txt and .vtt files are supported.");
    expect(alert.textContent).not.toMatch(/internal detail/);
    expect(onTranscriptLoaded).not.toHaveBeenCalled();
  });

  it("only applies the most recently selected file when two selections race", async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    mockedExtract.mockReturnValueOnce(first);
    mockedExtract.mockResolvedValueOnce("Second file's text.");

    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={false} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile("first.txt");
    selectFile("second.txt");

    await waitFor(() => expect(onTranscriptLoaded).toHaveBeenCalledWith("Second file's text."));

    // The slower first selection resolving afterward must not overwrite the second.
    resolveFirst("First file's text.");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onTranscriptLoaded).toHaveBeenCalledTimes(1);
    expect(onTranscriptLoaded).not.toHaveBeenCalledWith("First file's text.");
  });

  it("resets the file input so the same file can be selected again", async () => {
    mockedExtract.mockResolvedValue("Same text each time.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={false} onTranscriptLoaded={onTranscriptLoaded} />);

    const { input } = selectFile("same.txt");
    await waitFor(() => expect(onTranscriptLoaded).toHaveBeenCalledTimes(1));
    expect(input.value).toBe("");

    selectFile("same.txt");
    await waitFor(() => expect(onTranscriptLoaded).toHaveBeenCalledTimes(2));
  });

  it("does not trigger anything beyond loading the transcript text (no automatic analysis)", async () => {
    mockedExtract.mockResolvedValueOnce("Extracted text.");
    const onTranscriptLoaded = vi.fn();
    render(<TranscriptUpload hasExistingContent={false} onTranscriptLoaded={onTranscriptLoaded} />);

    selectFile();

    await waitFor(() => expect(onTranscriptLoaded).toHaveBeenCalledTimes(1));
    // The component exposes exactly one callback prop — a successful load
    // can only ever invoke onTranscriptLoaded; there is no code path in the
    // component that could trigger analysis itself.
    expect(onTranscriptLoaded).toHaveBeenCalledWith("Extracted text.");
  });
});
