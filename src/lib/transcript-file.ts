/**
 * Pure, client-side transcript file validation and parsing for Capability F.
 *
 * No network calls, no persistence, no server endpoint. File content is
 * treated as untrusted input and is never logged — only these typed error
 * classes (never raw file content) should reach any log or console call.
 */

export const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export class UnsupportedFileTypeError extends Error {}
export class FileTooLargeError extends Error {}
export class EmptyTranscriptError extends Error {}
export class MalformedVttError extends Error {}
export class UnreadableFileError extends Error {}

const NUL_CHARACTER = String.fromCharCode(0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

function isSupportedTranscriptFile(file: File): boolean {
  return /\.(txt|vtt)$/i.test(file.name);
}

function isVttFile(file: File): boolean {
  return /\.vtt$/i.test(file.name);
}

/** Cheap heuristic for binary/undecodable content masquerading as text: a
 * NUL byte, or a meaningful share of U+FFFD replacement characters, means
 * `file.text()` produced garbage rather than real text. */
function looksUndecodable(text: string): boolean {
  if (text.includes(NUL_CHARACTER)) return true;
  if (text.length === 0) return false;
  let replacementCount = 0;
  for (const char of text) {
    if (char === REPLACEMENT_CHARACTER) replacementCount++;
  }
  return replacementCount / text.length > 0.1;
}

const VTT_TIMESTAMP = String.raw`(?:\d{2}:)?\d{2}:\d{2}\.\d{3}`;
const VTT_TIMING_LINE = new RegExp(`^${VTT_TIMESTAMP}\\s*-->\\s*${VTT_TIMESTAMP}(?:[ \\t].*)?$`);

/**
 * Extracts cue text from WEBVTT content, stripping the header, cue
 * identifiers, and timestamp lines. Inline speaker labels (e.g. "JACOB:")
 * are left exactly as they appear in the cue text — never detected or
 * removed.
 *
 * Rejects the entire file outright on any structural problem (missing
 * header, a block that isn't a valid cue/comment) — no partial extraction.
 * A well-formed header with zero cues is not an error here; it returns an
 * empty string and lets the caller apply the same emptiness rule used for
 * `.txt` files.
 */
export function parseVttCues(rawText: string): string {
  const withoutBom = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const normalized = withoutBom.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);

  const headerLine = (blocks[0] ?? "").split("\n")[0].trim();
  if (headerLine !== "WEBVTT" && !headerLine.startsWith("WEBVTT ")) {
    throw new MalformedVttError("Missing WEBVTT header.");
  }

  const cues: string[] = [];

  for (const block of blocks.slice(1)) {
    const lines = block.split("\n").filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    // NOTE / STYLE / REGION blocks are valid WEBVTT structure but not cues.
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;

    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1 || timingIndex > 1) {
      throw new MalformedVttError("Cue block is missing a valid timing line.");
    }
    if (!VTT_TIMING_LINE.test(lines[timingIndex].trim())) {
      throw new MalformedVttError("Cue block has malformed cue timing.");
    }

    const cueText = lines
      .slice(timingIndex + 1)
      .join(" ")
      .trim();
    if (cueText.length > 0) cues.push(cueText);
  }

  return cues.join("\n");
}

/**
 * Validates and extracts usable transcript text from a `.txt` or `.vtt`
 * File selected in the browser. Fully client-side: reads the file with
 * `File.prototype.text()` and never sends it anywhere.
 *
 * Rejection order — extension and size are checked before any read is
 * attempted (`file.text()` is never called for an unsupported or
 * oversized file).
 */
export async function extractTranscriptText(file: File): Promise<string> {
  if (!isSupportedTranscriptFile(file)) {
    throw new UnsupportedFileTypeError("Only .txt and .vtt files are supported.");
  }

  if (file.size > MAX_TRANSCRIPT_FILE_BYTES) {
    throw new FileTooLargeError("File is larger than 5 MB.");
  }

  let raw: string;
  try {
    raw = await file.text();
  } catch {
    throw new UnreadableFileError("Couldn't read this file.");
  }
  if (looksUndecodable(raw)) {
    throw new UnreadableFileError("Couldn't read this file.");
  }

  // Emptiness is judged on trimmed content, but the value returned for a
  // valid .txt file below is always the untrimmed original — trim() here
  // only answers "is there usable text at all?".
  if (raw.trim().length === 0) {
    throw new EmptyTranscriptError("No text found in this file.");
  }

  if (!isVttFile(file)) {
    return raw;
  }

  const cueText = parseVttCues(raw);
  if (cueText.trim().length === 0) {
    throw new EmptyTranscriptError("No text found in this file.");
  }
  return cueText;
}
