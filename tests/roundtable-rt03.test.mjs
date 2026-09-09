import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  ProjectStore,
  RoundtableCanonicalInputBuilder,
  RoundtableComparisonEngine,
  RoundtableResponseStore,
  assertRoundtableComparisonIntegrity,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 16, 0, n++));
}

async function createSource() {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });
  const renderer = new ContextRenderer({ auditLog: audit, clock });
  const inputBuilder = new RoundtableCanonicalInputBuilder({ auditLog: audit, clock });
  const responses = new RoundtableResponseStore(adapter, { auditLog: audit, clock });
  const comparison = new RoundtableComparisonEngine({ auditLog: audit, clock });

  const project = await projects.create({ name: "RT-03 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Compare provider responses without treating majority agreement as truth.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Compare independent analyses while preserving disagreement",
    target: {
      mode: "roundtable",
      project_id: project.id,
      platforms: ["gpt", "claude", "gemini"]
    },
    items: [approvedItem]
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const pkg = await packages.approve(draft.id, { actor: human });
  const plan = await redaction.propose(pkg, {}, { actor: ai });
  const view = await redaction.approveTransferView(pkg, plan, { actor: human });
  const roundtable = await renderer.renderRoundtable(pkg, view, { actor: ai });
  const input = await inputBuilder.prepare(pkg, view, roundtable, { actor: ai });

  const rawByProvider = {
    gpt: "Shared premise.\n\nGPT unique: inspect operational risk before rollout.",
    claude: "Shared premise.\n\nClaude unique: preserve a reversible fallback path.",
    gemini: "Shared premise.\n\nGemini unique: validate with a staged pilot first."
  };
  const captured = [];
  for (const provider of input.providers) {
    captured.push(await responses.capture(input, pkg, view, roundtable, {
      provider,
      raw_response: rawByProvider[provider],
      actor: human,
      source_label: `${provider} manual comparison chat`
    }));
  }

  return { adapter, audit, project, pkg, view, roundtable, input, captured, comparison };
}

test("RT-03: builds a descriptive disagreement matrix without deciding truth or a winner", async () => {
  const source = await createSource();
  const result = await source.comparison.compare(source.input, source.captured, { actor: ai });

  assert.equal(result.comparison_version, "RT-03");
  assert.equal(result.status, "compared_not_decided");
  assert.equal(result.authority, "descriptive_no_truth_claim");
  assert.equal(result.interpretive_review.required, true);
  assert.equal(result.pairwise_matrix.length, 3);
  assert.equal(result.exact_shared_wording.length, 1);
  assert.match(result.exact_shared_wording[0].preview, /shared premise/i);
  assert.deepEqual(new Set(result.providers), new Set(["gpt", "claude", "gemini"]));
  assert.equal(result.provider_unique_segments.every((entry) => entry.segments.length >= 1), true);
  assert.equal("winner" in result, false);
  assert.equal("decision" in result, false);
  assert.equal("majority_choice" in result, false);
  assert.equal("model_ranking" in result, false);
  assert.equal(assertRoundtableComparisonIntegrity(result, source.input, source.captured), true);
});

test("RT-03: lexical overlap is explicitly diagnostic and never upgraded to semantic agreement", async () => {
  const source = await createSource();
  const result = await source.comparison.compare(source.input, source.captured);

  for (const pair of result.pairwise_matrix) {
    assert.equal(typeof pair.lexical_overlap, "number");
    assert.match(pair.relationship, /lexical_overlap$/);
    assert.equal("semantic_agreement" in pair, false);
    assert.equal("truth" in pair, false);
  }
  assert.match(result.interpretive_review.reason, /semantic agreement, factual correctness/i);
});

test("RT-03: requires exactly one intact RT-02 response for every RT-01 provider", async () => {
  const source = await createSource();
  await assert.rejects(
    () => source.comparison.compare(source.input, source.captured.slice(0, 2)),
    /coverage must exactly match/
  );

  const duplicate = [source.captured[0], source.captured[0], source.captured[2]];
  await assert.rejects(
    () => source.comparison.compare(source.input, duplicate),
    /exactly one selected response per provider/
  );

  const tampered = structuredClone(source.captured);
  tampered[1].raw_response += " altered after capture";
  await assert.rejects(
    () => source.comparison.compare(source.input, tampered),
    /raw response content or fingerprint was modified/
  );
});

test("RT-03: integrity validation detects comparison mutation", async () => {
  const source = await createSource();
  const result = await source.comparison.compare(source.input, source.captured);
  const tampered = structuredClone(result);
  tampered.pairwise_matrix[0].lexical_overlap = 1;
  assert.throws(
    () => assertRoundtableComparisonIntegrity(tampered, source.input, source.captured),
    /comparison data was modified/
  );
});

test("RT-03: audit is metadata-only and does not duplicate provider response bodies", async () => {
  const source = await createSource();
  await source.comparison.compare(source.input, source.captured, { actor: ai });
  const events = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => event.action === "roundtable_responses_compared");
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("GPT unique: inspect operational risk"), false);
  assert.equal(serialized.includes("Claude unique: preserve a reversible fallback path"), false);
  assert.equal(serialized.includes("Gemini unique: validate with a staged pilot first"), false);
});
