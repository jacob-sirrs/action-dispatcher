import { describe, expect, it, vi } from "vitest";
import {
  EmptyTranscriptError,
  extractTranscriptText,
  FileTooLargeError,
  MalformedVttError,
  MAX_TRANSCRIPT_FILE_BYTES,
  UnreadableFileError,
  UnsupportedFileTypeError,
} from "./transcript-file";

function makeFile(name: string, content: string | Uint8Array, type = "text/plain"): File {
  return new File([content], name, { type });
}

const VALID_VTT = [
  "WEBVTT",
  "",
  "1",
  "00:00:01.000 --> 00:00:03.000",
  "JACOB: So about that follow-up,",
  "",
  "2",
  "00:00:03.500 --> 00:00:06.000",
  "TOM: yeah, that's fine.",
  "",
].join("\n");

describe("extractTranscriptText — .txt", () => {
  it("returns valid .txt content exactly, unchanged", async () => {
    const content = "  Hello team.\nLet's ship Capability F.  \n";
    const result = await extractTranscriptText(makeFile("transcript.txt", content));
    expect(result).toBe(content);
  });

  it("rejects whitespace-only .txt content as empty, without altering the preservation rule", async () => {
    const file = makeFile("transcript.txt", "   \n\t\n   ");
    await expect(extractTranscriptText(file)).rejects.toBeInstanceOf(EmptyTranscriptError);
  });
});

describe("extractTranscriptText — .vtt", () => {
  it("extracts cue text from a valid .vtt file", async () => {
    const result = await extractTranscriptText(makeFile("transcript.vtt", VALID_VTT));
    expect(result).toBe("JACOB: So about that follow-up,\nTOM: yeah, that's fine.");
  });

  it("strips the WEBVTT header, cue identifiers, and timestamps", async () => {
    const result = await extractTranscriptText(makeFile("transcript.vtt", VALID_VTT));
    expect(result).not.toContain("WEBVTT");
    expect(result).not.toMatch(/-->/);
    expect(result).not.toMatch(/^\d+$/m);
  });

  it("preserves inline speaker labels", async () => {
    const result = await extractTranscriptText(makeFile("transcript.vtt", VALID_VTT));
    expect(result).toContain("JACOB:");
    expect(result).toContain("TOM:");
  });

  it("rejects a .vtt file missing the WEBVTT header", async () => {
    const noHeader = ["1", "00:00:01.000 --> 00:00:03.000", "Hello."].join("\n");
    await expect(
      extractTranscriptText(makeFile("transcript.vtt", noHeader)),
    ).rejects.toBeInstanceOf(MalformedVttError);
  });

  it("rejects a .vtt file with broken cue timing, with no partial result", async () => {
    const brokenTiming = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 -> 00:00:03.000",
      "This cue text must never appear in the result.",
    ].join("\n");
    await expect(
      extractTranscriptText(makeFile("transcript.vtt", brokenTiming)),
    ).rejects.toBeInstanceOf(MalformedVttError);
  });

  it("treats a valid .vtt with no cues as empty, not malformed", async () => {
    const noCues = "WEBVTT\n\nNOTE this file has a header but no cues\n";
    await expect(extractTranscriptText(makeFile("transcript.vtt", noCues))).rejects.toBeInstanceOf(
      EmptyTranscriptError,
    );
  });
});

describe("extractTranscriptText — file-level validation", () => {
  it("rejects an unsupported extension before reading", async () => {
    const file = makeFile("transcript.docx", "irrelevant");
    const textSpy = vi.spyOn(file, "text");
    await expect(extractTranscriptText(file)).rejects.toBeInstanceOf(UnsupportedFileTypeError);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5 MB before reading", async () => {
    const oversized = new Uint8Array(MAX_TRANSCRIPT_FILE_BYTES + 1);
    const file = makeFile("big.txt", oversized);
    const textSpy = vi.spyOn(file, "text");
    await expect(extractTranscriptText(file)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("rejects a zero-byte file as empty", async () => {
    await expect(extractTranscriptText(makeFile("empty.txt", ""))).rejects.toBeInstanceOf(
      EmptyTranscriptError,
    );
  });

  it("rejects unreadable/binary content with a safe error", async () => {
    const binary = new Uint8Array([0x00, 0xff, 0xfe, 0x00, 0x01, 0x02, 0xff, 0xff]);
    await expect(extractTranscriptText(makeFile("binary.txt", binary))).rejects.toBeInstanceOf(
      UnreadableFileError,
    );
  });
});

describe("privacy — no transcript content is ever logged", () => {
  it("does not call console.* with transcript content when handling failures", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const secretMarker = "SECRET_TRANSCRIPT_MARKER_DO_NOT_LOG";
    const scenarios: File[] = [
      makeFile("transcript.docx", secretMarker),
      makeFile("big.txt", new Uint8Array(MAX_TRANSCRIPT_FILE_BYTES + 1)),
      makeFile("empty.txt", ""),
      makeFile("bad.vtt", `NOT WEBVTT\n${secretMarker}`),
      makeFile("binary.txt", new Uint8Array([0x00, 0xff, 0xfe])),
    ];

    for (const file of scenarios) {
      await extractTranscriptText(file).catch(() => {});
    }

    for (const spy of [logSpy, warnSpy, errorSpy, infoSpy]) {
      expect(spy).not.toHaveBeenCalled();
    }

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
