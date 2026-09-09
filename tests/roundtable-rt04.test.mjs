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
  RoundtableInterpretiveExtractionEngine,
  RoundtableResponseStore,
  assertRoundtableInterpretiveExtractionIntegrity,
  buildRoundtableInterpretiveExtractionPrompt,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 17, 0, n++));
}

async function createSource({ repeatedQuote = false } = {}) {
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
  const comparisonEngine = new RoundtableComparisonEngine({ auditLog: audit, clock });
  const extraction = new RoundtableInterpretiveExtractionEngine({ auditLog: audit, clock });

  const project = await projects.create({ name: "RT-04 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Extract claims and assumptions without deciding which provider is correct.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Surface model claims, assumptions, and possible conflicts for Human review",
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
    gpt: repeatedQuote
      ? "Check operational risk first. Check operational risk first. A staged rollout may be safer."
      : "Check operational risk first. A staged rollout may be safer than a full launch.",
    claude: "Keep a reversible fallback path. Irreversible rollout increases recovery cost.",
    gemini: "Run a limited pilot first. Early validation can reduce deployment uncertainty."
  };

  const captured = [];
  for (const provider of input.providers) {
    captured.push(await responses.capture(input, pkg, view, roundtable, {
      provider,
      raw_response: rawByProvider[provider],
      actor: human,
      source_label: `${provider} RT-04 test response`
    }));
  }
  const comparison = await comparisonEngine.compare(input, captured, { actor: ai });

  return {
    adapter,
    audit,
    project,
    pkg,
    view,
    roundtable,
    input,
    captured,
    comparison,
    extraction,
    rawByProvider
  };
}

function proposalFor(source) {
  return {
    contract_version: "rt-04-proposal-v0.1",
    roundtable_input_id: source.input.id,
    comparison_id: source.comparison.id,
    semantic_fingerprint: source.input.semantic_fingerprint,
    claims: [
      {
        id: "c1",
        provider: "gpt",
        statement: "GPT recommends examining operational risk before broader rollout.",
        evidence: [{ quote: "Check operational risk first." }]
      },
      {
        id: "c2",
        provider: "claude",
        statement: "Claude recommends keeping a reversible fallback path.",
        evidence: [{ quote: "Keep a reversible fallback path." }]
      },
      {
        id: "c3",
        provider: "gemini",
        statement: "Gemini recommends a limited pilot before broader deployment.",
        evidence: [{ quote: "Run a limited pilot first." }]
      }
    ],
    assumptions: [
      {
        id: "a1",
        provider: "gpt",
        statement: "GPT appears to assume a staged rollout can lower risk.",
        evidence: [{ quote: "A staged rollout may be safer than a full launch." }]
      },
      {
        id: "a2",
        provider: "claude",
        statement: "Claude appears to assume reversibility lowers recovery cost.",
        evidence: [{ quote: "Irreversible rollout increases recovery cost." }]
      },
      {
        id: "a3",
        provider: "gemini",
        statement: "Gemini appears to assume early validation reduces uncertainty.",
        evidence: [{ quote: "Early validation can reduce deployment uncertainty." }]
      }
    ],
    conflicts: [
      {
        id: "x1",
        topic: "Primary rollout safeguard",
        conflict_type: "priority_difference",
        reason: "The providers emphasize different first-line safeguards.",
        sides: [
          { provider: "gpt", claim_ids: ["c1"], assumption_ids: ["a1"] },
          { provider: "claude", claim_ids: ["c2"], assumption_ids: ["a2"] },
          { provider: "gemini", claim_ids: ["c3"], assumption_ids: ["a3"] }
        ]
      }
    ]
  };
}

test("RT-04: builds an extraction prompt that preserves Human authority and exact-evidence requirements", async () => {
  const source = await createSource();
  const prompt = buildRoundtableInterpretiveExtractionPrompt(source.input, source.comparison, source.captured);
  assert.match(prompt, /RT-04 Claim \/ Assumption \/ Conflict Extraction/);
  assert.match(prompt, /NOT the decision-maker/);
  assert.match(prompt, /exact verbatim quote/);
  assert.match(prompt, /Preserve minority and provider-unique views/);
  assert.match(prompt, /rt-04-proposal-v0\.1/);
  assert.match(prompt, /Check operational risk first/);
});

test("RT-04: ingests evidence-bound claims, assumptions, and unresolved conflict proposals without deciding truth", async () => {
  const source = await createSource();
  const result = await source.extraction.ingest(
    source.input,
    source.comparison,
    source.captured,
    proposalFor(source),
    { actor: ai, extractor_label: "external comparison model" }
  );

  assert.equal(result.extraction_version, "RT-04");
  assert.equal(result.status, "proposed_not_human_reviewed");
  assert.equal(result.authority, "interpretive_proposal_only");
  assert.equal(result.human_review.required, true);
  assert.equal(result.human_review.state, "pending");
  assert.equal(result.provenance.source_authenticity, "unverified_interpretive_output");
  assert.equal(result.claims.length, 3);
  assert.equal(result.assumptions.length, 3);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].resolution, "unresolved");
  assert.equal(result.conflicts[0].truth_status, "not_evaluated");
  assert.equal("winner" in result, false);
  assert.equal("decision" in result, false);
  assert.equal("recommended_provider" in result, false);

  const gptClaim = result.claims.find((entry) => entry.provider === "gpt");
  const gptResponse = source.captured.find((entry) => entry.provider === "gpt");
  assert.equal(gptResponse.raw_response.slice(gptClaim.evidence[0].start, gptClaim.evidence[0].end), gptClaim.evidence[0].quote);
  assert.equal(assertRoundtableInterpretiveExtractionIntegrity(result, source.input, source.comparison, source.captured), true);
});

test("RT-04: rejects fabricated evidence, provider-crossed conflict references, and decision fields", async () => {
  const source = await createSource();

  const fabricated = proposalFor(source);
  fabricated.claims[0].evidence[0].quote = "This quote was never in the GPT response.";
  await assert.rejects(
    () => source.extraction.ingest(source.input, source.comparison, source.captured, fabricated),
    /was not found verbatim/
  );

  const crossed = proposalFor(source);
  crossed.conflicts[0].sides[0].claim_ids = ["c2"];
  await assert.rejects(
    () => source.extraction.ingest(source.input, source.comparison, source.captured, crossed),
    /cannot reference claude proposal/
  );

  const deciding = proposalFor(source);
  deciding.winner = "gpt";
  await assert.rejects(
    () => source.extraction.ingest(source.input, source.comparison, source.captured, deciding),
    /must not contain decision field/
  );
});

test("RT-04: repeated verbatim evidence requires an explicit occurrence to avoid ambiguous provenance", async () => {
  const source = await createSource({ repeatedQuote: true });
  const proposal = proposalFor(source);
  proposal.claims[0].evidence = [{ quote: "Check operational risk first." }];
  proposal.assumptions = proposal.assumptions.filter((entry) => entry.provider !== "gpt");
  proposal.conflicts[0].sides[0].assumption_ids = [];

  await assert.rejects(
    () => source.extraction.ingest(source.input, source.comparison, source.captured, proposal),
    /ambiguous.*occurrence is required/
  );

  proposal.claims[0].evidence[0].occurrence = 2;
  const result = await source.extraction.ingest(source.input, source.comparison, source.captured, proposal);
  assert.equal(result.claims[0].evidence[0].occurrence, 2);
  assert.equal(result.claims[0].evidence[0].match_count, 2);
});

test("RT-04: integrity validation detects post-extraction mutation and source-response substitution", async () => {
  const source = await createSource();
  const result = await source.extraction.ingest(source.input, source.comparison, source.captured, proposalFor(source));

  const changedStatement = structuredClone(result);
  changedStatement.claims[0].statement = "Mutated interpretation";
  assert.throws(
    () => assertRoundtableInterpretiveExtractionIntegrity(changedStatement, source.input, source.comparison, source.captured),
    /interpretive extraction content was modified/
  );

  const changedSource = structuredClone(result);
  changedSource.source_responses[0].response_id = "rtr_forged";
  assert.throws(
    () => assertRoundtableInterpretiveExtractionIntegrity(changedSource, source.input, source.comparison, source.captured),
    /source response binding was modified/
  );
});

test("RT-04: audit remains metadata-only and does not duplicate claim text, evidence quotes, or raw responses", async () => {
  const source = await createSource();
  await source.extraction.ingest(source.input, source.comparison, source.captured, proposalFor(source), { actor: ai });

  const events = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => event.action === "roundtable_interpretive_extraction_proposed");
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("GPT recommends examining operational risk"), false);
  assert.equal(serialized.includes("Check operational risk first"), false);
  assert.equal(serialized.includes("Keep a reversible fallback path"), false);
  assert.equal(serialized.includes("Run a limited pilot first"), false);
});
