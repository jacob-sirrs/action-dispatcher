import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyTranscriptError,
  extractTranscriptText,
  FileTooLargeError,
  MalformedVttError,
  UnreadableFileError,
  UnsupportedFileTypeError,
} from "@/lib/transcript-file";

function toUserSafeMessage(error: unknown): string {
  if (error instanceof UnsupportedFileTypeError) {
    return "Only .txt and .vtt files are supported.";
  }
  if (error instanceof FileTooLargeError) {
    return "This file is larger than 5 MB — choose a smaller file.";
  }
  if (error instanceof EmptyTranscriptError) {
    return "No text was found in this file.";
  }
  if (error instanceof MalformedVttError) {
    return "This .vtt file doesn't look like a valid transcript.";
  }
  if (error instanceof UnreadableFileError) {
    return "This file couldn't be read.";
  }
  return "Something went wrong reading this file.";
}

export function TranscriptUpload({
  hasExistingContent,
  onTranscriptLoaded,
}: {
  /** Whether the transcript editor currently holds non-whitespace content. */
  hasExistingContent: boolean;
  /** Called with extracted text only when it should replace the editor's
   * content. This is the component's only side effect — it never triggers
   * analysis itself. */
  onTranscriptLoaded: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionTokenRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so selecting the same file again still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    // A new selection immediately supersedes any prior pending state — both
    // the async result below and any confirmation dialog already open.
    const token = ++selectionTokenRef.current;
    setError(null);
    setConfirmOpen(false);
    setPendingText(null);

    try {
      const text = await extractTranscriptText(file);
      if (token !== selectionTokenRef.current) return; // superseded by a later selection
      if (hasExistingContent) {
        setPendingText(text);
        setConfirmOpen(true);
      } else {
        onTranscriptLoaded(text);
      }
    } catch (err) {
      if (token !== selectionTokenRef.current) return; // superseded by a later selection
      setError(toUserSafeMessage(err));
    }
  }

  return (
    <div className="inline-flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.vtt"
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="transcript-file-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-describedby={error ? "transcript-upload-error" : undefined}
        className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        ↑ Upload transcript file
      </button>
      {error && (
        <p id="transcript-upload-error" role="alert" className="text-[11px] text-status-fail">
          {error}
        </p>
      )}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingText(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing transcript?</AlertDialogTitle>
            <AlertDialogDescription>
              The transcript editor already has content. Uploading this file will replace it — this
              can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingText !== null) onTranscriptLoaded(pendingText);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
