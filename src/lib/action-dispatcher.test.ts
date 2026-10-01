import { describe, expect, it } from "vitest";
import {
  buildActionParams,
  matchProposalParamsToSchema,
  type ParamChoice,
  type ProposalParam,
} from "./action-dispatcher";

// Reproduces the live-tested Slack "Send Channel Message" bug: the AI
// proposes a free-text param (key "message") for the message body, while
// Slack's real schema field is "message_text" — both happen to carry the
// same human label "Message Text". Before the fix, these were treated as two
// independent fields (one ghost, one real-but-empty); only the real
// "message_text" key is ever sent to Zapier, so the AI-generated text was
// silently lost while an empty required field was left for the operator to
// fill in by hand.
const SLACK_SCHEMA_KEYS = ["channel", "message_text"];
const SLACK_FIELD_LABELS = { channel: "Channel", message_text: "Message Text" };
const SLACK_REQUIRED_KEYS = ["channel", "message_text"];
const SLACK_DYNAMIC_KEYS = ["channel"];
const AI_MESSAGE_TEXT = "The wider account team is aware we're moving to procurement.";

describe("matchProposalParamsToSchema", () => {
  it("matches an AI param onto the real schema key via normalized label when the AI's own key differs (the Slack duplicate-field bug)", () => {
    const proposalParams: ProposalParam[] = [
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
    ];

    const matched = matchProposalParamsToSchema(
      SLACK_SCHEMA_KEYS,
      SLACK_FIELD_LABELS,
      proposalParams,
    );

    // Must be keyed by the REAL schema key, not the AI's invented "message".
    expect(matched.get("message_text")?.value).toBe(AI_MESSAGE_TEXT);
    expect(matched.has("message")).toBe(false);
  });

  it("prefers an exact key match over a label match", () => {
    const proposalParams: ProposalParam[] = [
      { key: "message_text", label: "Something else entirely", value: AI_MESSAGE_TEXT },
    ];

    const matched = matchProposalParamsToSchema(
      SLACK_SCHEMA_KEYS,
      SLACK_FIELD_LABELS,
      proposalParams,
    );

    expect(matched.get("message_text")?.value).toBe(AI_MESSAGE_TEXT);
  });

  it("leaves a required schema field unmatched when no AI param matches by key or label", () => {
    const proposalParams: ProposalParam[] = [
      { key: "channel", label: "Channel", value: "general" },
    ];

    const matched = matchProposalParamsToSchema(
      SLACK_SCHEMA_KEYS,
      SLACK_FIELD_LABELS,
      proposalParams,
    );

    expect(matched.has("message_text")).toBe(false);
  });

  it("drops an AI param that matches no schema key and no schema label", () => {
    const proposalParams: ProposalParam[] = [
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
      { key: "unrelated_garbage", label: "Something Random", value: "should not survive" },
    ];

    const matched = matchProposalParamsToSchema(
      SLACK_SCHEMA_KEYS,
      SLACK_FIELD_LABELS,
      proposalParams,
    );

    expect([...matched.values()].some((p) => p.value === "should not survive")).toBe(false);
  });
});

describe("buildActionParams", () => {
  function buildSlackParams(
    proposalParams: ProposalParam[],
    choicesByKey = new Map<string, ParamChoice[]>(),
  ) {
    const matchedParams = matchProposalParamsToSchema(
      SLACK_SCHEMA_KEYS,
      SLACK_FIELD_LABELS,
      proposalParams,
    );
    return buildActionParams({
      schemaKeys: SLACK_SCHEMA_KEYS,
      requiredKeys: SLACK_REQUIRED_KEYS,
      fieldLabels: SLACK_FIELD_LABELS,
      dynamicKeys: SLACK_DYNAMIC_KEYS,
      matchedParams,
      choicesByKey,
    });
  }

  it("produces exactly ONE 'Message Text' field, pre-filled with the AI value, under the real schema key — not two", () => {
    const params = buildSlackParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
    ]);

    const messageFields = params.filter((p) => p.label === "Message Text");
    expect(messageFields).toHaveLength(1);
    expect(messageFields[0].key).toBe("message_text");
    expect(messageFields[0].value).toBe(AI_MESSAGE_TEXT);

    // Exactly one param per real schema field — no ghost entries.
    expect(params).toHaveLength(SLACK_SCHEMA_KEYS.length);
    expect(params.map((p) => p.key).sort()).toEqual([...SLACK_SCHEMA_KEYS].sort());
  });

  it("leaves a required field with no AI value empty, not dropped from the queue", () => {
    const params = buildSlackParams([{ key: "channel", label: "Channel", value: "general" }]);

    const messageField = params.find((p) => p.key === "message_text");
    expect(messageField).toBeDefined();
    expect(messageField?.value).toBe("");
    expect(messageField?.required).toBe(true);
  });

  it("never includes an unmatched AI param as its own field", () => {
    const params = buildSlackParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
      { key: "unrelated_garbage", label: "Something Random", value: "should not survive" },
    ]);

    expect(params.some((p) => p.key === "unrelated_garbage")).toBe(false);
    expect(params.some((p) => p.value === "should not survive")).toBe(false);
  });

  it("produces execution inputs containing only real, reconciled schema keys", () => {
    const params = buildSlackParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
      { key: "unrelated_garbage", label: "Something Random", value: "should not survive" },
    ]);

    // Mirrors executeActions' construction of the Zapier call's `inputs`.
    const inputs = Object.fromEntries(params.map((p) => [p.key, p.value]));

    expect(Object.keys(inputs).sort()).toEqual([...SLACK_SCHEMA_KEYS].sort());
    expect(inputs.message_text).toBe(AI_MESSAGE_TEXT);
    expect(inputs.message).toBeUndefined();
    expect(inputs.unrelated_garbage).toBeUndefined();
  });

  it("still resolves a dynamic resource field's choices unchanged by the reconciliation fix", () => {
    const choicesByKey = new Map<string, ParamChoice[]>([
      ["channel", [{ value: "C123", label: "general" }]],
    ]);
    const params = buildSlackParams(
      [
        { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
        { key: "channel", label: "Channel", value: "general" },
      ],
      choicesByKey,
    );

    const channelField = params.find((p) => p.key === "channel");
    expect(channelField?.dynamic).toBe(true);
    expect(channelField?.value).toBe("C123");
  });
});

// Mirrors Slack's real "Send Channel Message" schema shape: two required
// fields (channel, message_text) plus a long tail of optional fields that
// are irrelevant to a typical proposed action (bot identity, scheduling,
// link-unfurling toggles, the Zap's own id, …). Rendering all of them was a
// regression introduced by the schema-authoritative duplicate-field fix —
// schema keys became authoritative for which fields exist, but every schema
// key was rendered unconditionally instead of only matched/required ones.
const FULL_SLACK_SCHEMA_KEYS = [
  "channel",
  "message_text",
  "as_bot",
  "username",
  "icon_url",
  "unfurl_links",
  "link_names",
  "schedule_at",
  "file",
  "thread_ts",
  "zap_id",
];
const FULL_SLACK_FIELD_LABELS: Record<string, string> = {
  channel: "Channel",
  message_text: "Message Text",
  as_bot: "Send as a Bot?",
  username: "Bot Name",
  icon_url: "Bot Icon",
  unfurl_links: "Auto-Expand Links?",
  link_names: "Link Usernames and Channel Names?",
  schedule_at: "Schedule At",
  file: "File",
  thread_ts: "Thread",
  zap_id: "Zap ID",
};
const FULL_SLACK_REQUIRED_KEYS = ["channel", "message_text"];
const FULL_SLACK_DYNAMIC_KEYS = ["channel"];

describe("buildActionParams — optional field filtering", () => {
  function buildFullSchemaParams(
    proposalParams: ProposalParam[],
    choicesByKey = new Map<string, ParamChoice[]>(),
  ) {
    const matchedParams = matchProposalParamsToSchema(
      FULL_SLACK_SCHEMA_KEYS,
      FULL_SLACK_FIELD_LABELS,
      proposalParams,
    );
    return buildActionParams({
      schemaKeys: FULL_SLACK_SCHEMA_KEYS,
      requiredKeys: FULL_SLACK_REQUIRED_KEYS,
      fieldLabels: FULL_SLACK_FIELD_LABELS,
      dynamicKeys: FULL_SLACK_DYNAMIC_KEYS,
      matchedParams,
      choicesByKey,
    });
  }

  it("includes an optional schema field when the AI actually matched it", () => {
    const params = buildFullSchemaParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
      { key: "username", label: "Bot Name", value: "Procurement Bot" },
    ]);

    const usernameField = params.find((p) => p.key === "username");
    expect(usernameField).toBeDefined();
    expect(usernameField?.value).toBe("Procurement Bot");
  });

  it("includes a required schema field with no AI value, left empty for the user to fill in", () => {
    const params = buildFullSchemaParams([{ key: "channel", label: "Channel", value: "general" }]);

    const messageField = params.find((p) => p.key === "message_text");
    expect(messageField).toBeDefined();
    expect(messageField?.value).toBe("");
    expect(messageField?.required).toBe(true);
  });

  it("excludes optional schema fields the AI never proposed or matched", () => {
    const params = buildFullSchemaParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
    ]);

    const renderedKeys = params.map((p) => p.key);
    for (const unrelatedKey of [
      "as_bot",
      "username",
      "icon_url",
      "unfurl_links",
      "link_names",
      "schedule_at",
      "file",
      "thread_ts",
      "zap_id",
    ]) {
      expect(renderedKeys).not.toContain(unrelatedKey);
    }
    // Only Channel (required) and Message Text (required + matched) survive.
    expect(renderedKeys.sort()).toEqual(["channel", "message_text"]);
  });

  it("still drops an unknown AI-invented param with no schema key or label match", () => {
    const params = buildFullSchemaParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
      { key: "unrelated_garbage", label: "Something Random", value: "should not survive" },
    ]);

    expect(params.some((p) => p.key === "unrelated_garbage")).toBe(false);
    expect(params.some((p) => p.value === "should not survive")).toBe(false);
  });

  it("still reconciles the AI's 'message' param onto the real 'message_text' key as a single field (no duplicate-field regression)", () => {
    const params = buildFullSchemaParams([
      { key: "message", label: "Message Text", value: AI_MESSAGE_TEXT },
      { key: "channel", label: "Channel", value: "general" },
    ]);

    const messageFields = params.filter((p) => p.label === "Message Text");
    expect(messageFields).toHaveLength(1);
    expect(messageFields[0].key).toBe("message_text");
    expect(messageFields[0].value).toBe(AI_MESSAGE_TEXT);
  });
});
