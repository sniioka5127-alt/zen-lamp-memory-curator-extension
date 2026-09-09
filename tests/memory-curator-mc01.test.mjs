import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCuratorPrompt,
  parseCuratorResponse,
  toContextItemInput
} from "../memory-curator/contract.mjs";

const sample = `\`\`\`json
{
  "contract_version": "mc-01",
  "context_items": [
    {
      "content": "Human authority remains with the user.",
      "kind": "constraint",
      "memory_policy": "keep",
      "transfer_policy": "manual_only",
      "freshness": { "state": "not_applicable", "review_after": null, "reason": null },
      "source": { "actor_type": "human", "actor_name": null, "platform": null },
      "provenance": { "original_text": "Human authority remains with the user.", "source_refs": ["chat:1"] },
      "rationale": "Stable project principle"
    }
  ],
  "conflicts": [],
  "questions_for_human": []
}
\`\`\``;

test("MC-01 prompt excludes handoff responsibility and requires machine-readable candidates", () => {
  const prompt = buildCuratorPrompt({
    depth: "power",
    mode: "initial",
    projectName: "HIRAKU Tools",
    conversation: "A long conversation"
  });

  assert.match(prompt, /context_items/);
  assert.match(prompt, /Do NOT generate \"Next Chat Handoff\"/);
  assert.match(prompt, /Human Authority rule/);
  assert.match(prompt, /transfer_policy must default to \"manual_only\"/);
});

test("MC-01 parses fenced JSON and forces derived provenance", () => {
  const result = parseCuratorResponse(sample);
  assert.equal(result.context_items.length, 1);
  const candidate = result.context_items[0];
  assert.equal(candidate.content, "Human authority remains with the user.");
  assert.equal(candidate.kind, "constraint");
  assert.equal(candidate.memory_policy, "keep");
  assert.equal(candidate.transfer_policy, "manual_only");
  assert.equal(candidate.provenance.derived, true);
  assert.equal(candidate.provenance.derived_by, "memory_curator");
  assert.deepEqual(candidate.provenance.source_refs, ["chat:1"]);
});

test("MC-01 ignores invalid AI policy values by falling back to safe defaults", () => {
  const result = parseCuratorResponse(JSON.stringify({
    context_items: [{
      content: "Candidate",
      kind: "hypothesis",
      memory_policy: "auto_approve",
      transfer_policy: "send_everywhere",
      freshness: { state: "forever_fresh" },
      source: { actor_type: "ai" }
    }]
  }));

  assert.equal(result.context_items[0].memory_policy, "review");
  assert.equal(result.context_items[0].transfer_policy, "manual_only");
  assert.equal(result.context_items[0].freshness.state, "current");
});

test("MC-01 ContextItem input contains no AI-controlled approval fields", () => {
  const candidate = parseCuratorResponse(sample).context_items[0];
  const input = toContextItemInput(candidate, { projectId: "prj_test" });
  assert.equal(input.project_id, "prj_test");
  assert.equal("status" in input, false);
  assert.equal("human_review" in input, false);
  assert.equal("approved_at" in input, false);
});
