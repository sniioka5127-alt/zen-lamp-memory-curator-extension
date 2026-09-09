import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  OutboundHandoffBoundary,
  ProjectStore,
  RoundtableCanonicalInputBuilder,
  RoundtableResponseStore,
  assertRoundtableResponseIntegrity,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 16, 0, n++));
}

async function createRt02Source({ withReceipts = false } = {}) {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });
  const renderer = new ContextRenderer({ auditLog: audit, clock });
  const outbound = new OutboundHandoffBoundary(adapter, { auditLog: audit, clock });
  const inputBuilder = new RoundtableCanonicalInputBuilder({ auditLog: audit, clock });
  const responses = new RoundtableResponseStore(adapter, { auditLog: audit, clock });

  const project = await projects.create({ name: "RT-02 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Preserve disagreement and do not majority-vote provider responses.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Capture independent provider responses without interpretation",
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

  let receipts = null;
  if (withReceipts) {
    const batch = await outbound.confirmRoundtableHandoff(pkg, view, roundtable, {
      actor: human,
      transport: "manual_paste"
    });
    receipts = [];
    for (const id of batch.receipt_ids) receipts.push(await outbound.getReceipt(id));
  }

  const input = await inputBuilder.prepare(pkg, view, roundtable, {
    actor: human,
    receipts
  });

  return {
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    redaction,
    renderer,
    outbound,
    inputBuilder,
    responses,
    project,
    pkg,
    view,
    roundtable,
    receipts,
    input
  };
}

test("RT-02: captures exact raw provider text as uninterpreted evidence bound to RT-01", async () => {
  const source = await createRt02Source();
  const raw = "  Provider answer line 1.\n\nProvider answer line 2.  \n";

  const response = await source.responses.capture(
    source.input,
    source.pkg,
    source.view,
    source.roundtable,
    {
      provider: "gpt",
      raw_response: raw,
      actor: human,
      capture_method: "manual_paste",
      source_label: "ChatGPT comparison tab",
      claimed_model: "user-visible model label"
    }
  );

  assert.equal(response.capture_version, "RT-02");
  assert.equal(response.status, "captured_raw_uninterpreted");
  assert.equal(response.authority, "evidence_only_no_interpretation");
  assert.equal(response.raw_response, raw);
  assert.equal(response.raw_response_length, raw.length);
  assert.equal(response.provider, "gpt");
  assert.equal(response.roundtable_input_id, source.input.id);
  assert.deepEqual(response.semantic_fingerprint, source.input.semantic_fingerprint);
  assert.equal(response.source_provenance.source_authenticity, "human_attested_unverified");
  assert.equal(response.source_provenance.provider_delivery_status, null);
  assert.equal("analysis" in response, false);
  assert.equal("winner" in response, false);
  assert.equal("decision" in response, false);
  assert.equal(assertRoundtableResponseIntegrity(response, source.input), true);

  const events = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => event.action === "roundtable_response_captured");
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(events).includes("Provider answer line 1"), false);
  assert.equal(JSON.stringify(events).includes("ChatGPT comparison tab"), false);
});

test("RT-02: manual provider attribution requires a Human and rejects API-like capture claims", async () => {
  const source = await createRt02Source();

  await assert.rejects(
    () => source.responses.capture(source.input, source.pkg, source.view, source.roundtable, {
      provider: "claude",
      raw_response: "Claude-like response",
      actor: ai
    }),
    /Human Gate required/
  );

  await assert.rejects(
    () => source.responses.capture(source.input, source.pkg, source.view, source.roundtable, {
      provider: "claude",
      raw_response: "Claude-like response",
      actor: human,
      capture_method: "provider_api"
    }),
    /Unsupported RT-02 capture method/
  );

  await assert.rejects(
    () => source.responses.capture(source.input, source.pkg, source.view, source.roundtable, {
      provider: "unknown-provider",
      raw_response: "Not part of the approved Roundtable",
      actor: human
    }),
    /not uniquely present/
  );
});

test("RT-02: optional CB-05 evidence is bound to the same provider but remains delivery-unverified", async () => {
  const source = await createRt02Source({ withReceipts: true });

  const response = await source.responses.capture(
    source.input,
    source.pkg,
    source.view,
    source.roundtable,
    {
      provider: "gemini",
      raw_response: "Gemini raw response retained exactly.",
      actor: human,
      receipts: source.receipts
    }
  );

  const geminiReceipt = source.receipts.find((receipt) => receipt.provider === "gemini");
  assert.equal(response.source_provenance.handoff_receipt_id, geminiReceipt.id);
  assert.equal(response.source_provenance.provider_delivery_status, "unverified");
  assert.equal(response.source_provenance.source_authenticity, "human_attested_unverified");
});

test("RT-02: raw response mutation is detectable and source records are append-only", async () => {
  const source = await createRt02Source();

  const first = await source.responses.capture(
    source.input,
    source.pkg,
    source.view,
    source.roundtable,
    {
      provider: "claude",
      raw_response: "First manually captured response.",
      actor: human
    }
  );

  const tampered = structuredClone(first);
  tampered.raw_response += " silently changed";
  assert.throws(
    () => assertRoundtableResponseIntegrity(tampered, source.input),
    /raw response content or fingerprint was modified/
  );

  const second = await source.responses.capture(
    source.input,
    source.pkg,
    source.view,
    source.roundtable,
    {
      provider: "claude",
      raw_response: "Corrected second capture; first remains historical evidence.",
      actor: human,
      supersedes_response_id: first.id
    }
  );

  assert.equal(second.supersedes_response_id, first.id);
  const storedFirst = await source.responses.get(first.id);
  assert.equal(storedFirst.raw_response, "First manually captured response.");
  const history = await source.responses.listByInput(source.input.id, { provider: "claude" });
  assert.equal(history.length, 2);
  assert.equal(history[0].id, first.id);
  assert.equal(history[1].id, second.id);
});

test("RT-02: rejects a modified RT-01 canonical input before accepting a response", async () => {
  const source = await createRt02Source();
  const tamperedInput = structuredClone(source.input);
  tamperedInput.provider_inputs[0].rendered_text += "\nprovider-only changed premise";

  await assert.rejects(
    () => source.responses.capture(tamperedInput, source.pkg, source.view, source.roundtable, {
      provider: "gpt",
      raw_response: "Would otherwise be captured",
      actor: human
    }),
    /provider input was modified/
  );
});
