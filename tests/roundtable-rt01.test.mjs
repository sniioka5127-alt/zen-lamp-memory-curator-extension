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
  assertRoundtableCanonicalInputIntegrity,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 15, 0, n++));
}

async function createRoundtableSource({ platforms = ["gpt", "claude", "gemini"] } = {}) {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });
  const renderer = new ContextRenderer({ auditLog: audit, clock });
  const outbound = new OutboundHandoffBoundary(adapter, { auditLog: audit, clock });
  const rtInput = new RoundtableCanonicalInputBuilder({ auditLog: audit, clock });

  const project = await projects.create({ name: "RT-01 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Use the same canonical context for every Roundtable provider.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Compare independent AI analyses without context asymmetry",
    target: {
      mode: "roundtable",
      project_id: project.id,
      platforms
    },
    items: [approvedItem]
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const pkg = await packages.approve(draft.id, { actor: human });

  const plan = await redaction.propose(pkg, {}, { actor: ai });
  const view = await redaction.approveTransferView(pkg, plan, { actor: human });
  const roundtable = await renderer.renderRoundtable(pkg, view, { actor: ai });

  return { adapter, clock, audit, projects, items, packages, redaction, renderer, outbound, rtInput, project, pkg, view, roundtable };
}

test("RT-01: prepares one canonical semantic input for all configured providers without executing them", async () => {
  const source = await createRoundtableSource();
  const input = await source.rtInput.prepare(source.pkg, source.view, source.roundtable, { actor: ai });

  assert.equal(input.input_version, "RT-01");
  assert.equal(input.status, "prepared_not_executed");
  assert.equal(input.authority, "derived_from_human_approved_context");
  assert.deepEqual(new Set(input.providers), new Set(["gpt", "claude", "gemini"]));
  assert.equal(new Set(input.provider_inputs.map((entry) => entry.rendering_id)).size, 3);
  assert.equal(input.handoff_evidence.state, "not_provided");
  assert.equal(input.handoff_evidence.delivery_status, null);
  assert.equal("winner" in input, false);
  assert.equal("decision" in input, false);
  assert.equal("responses" in input, false);
  assert.equal(assertRoundtableCanonicalInputIntegrity(input, source.pkg, source.view, source.roundtable), true);

  const events = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => event.action === "roundtable_input_prepared");
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(events).includes("Use the same canonical context"), false);
});

test("RT-01: optional CB-05 receipts strengthen provenance but never become a provider-delivery claim", async () => {
  const source = await createRoundtableSource();
  const batch = await source.outbound.confirmRoundtableHandoff(source.pkg, source.view, source.roundtable, {
    actor: human,
    transport: "manual_paste"
  });
  const receipts = [];
  for (const id of batch.receipt_ids) receipts.push(await source.outbound.getReceipt(id));

  const input = await source.rtInput.prepare(source.pkg, source.view, source.roundtable, {
    actor: human,
    receipts
  });

  assert.equal(input.handoff_evidence.state, "human_confirmed_manual_handoff");
  assert.equal(input.handoff_evidence.delivery_status, "unverified");
  assert.equal(input.handoff_evidence.receipt_ids.length, 3);
  assert.equal(
    assertRoundtableCanonicalInputIntegrity(input, source.pkg, source.view, source.roundtable, { receipts }),
    true
  );
});

test("RT-01: rejects context asymmetry, provider coverage mismatch, and modified provider text", async () => {
  const source = await createRoundtableSource();

  const missingProvider = structuredClone(source.roundtable);
  missingProvider.renderings = missingProvider.renderings.slice(0, 2);
  missingProvider.providers = missingProvider.providers.slice(0, 2);
  await assert.rejects(
    () => source.rtInput.prepare(source.pkg, source.view, missingProvider),
    /provider coverage does not exactly match/
  );

  const tampered = structuredClone(source.roundtable);
  tampered.renderings[1].rendered_text += "\nprovider-only extra premise";
  await assert.rejects(
    () => source.rtInput.prepare(source.pkg, source.view, tampered),
    /presentation text was modified/
  );
});

test("RT-01: prepared input is revision-bound and detects post-preparation mutation", async () => {
  const source = await createRoundtableSource();
  const input = await source.rtInput.prepare(source.pkg, source.view, source.roundtable);

  const tampered = structuredClone(input);
  tampered.provider_inputs[0].rendered_text += "\nchanged later";
  assert.throws(
    () => assertRoundtableCanonicalInputIntegrity(tampered, source.pkg, source.view, source.roundtable),
    /provider input was modified/
  );

  const revised = await source.packages.revise(source.pkg.id, {
    purpose: "Different comparison purpose"
  }, { actor: human });
  await source.packages.submitForReview(revised.id, { actor: ai });
  const reapproved = await source.packages.approve(revised.id, { actor: human });

  assert.throws(
    () => assertRoundtableCanonicalInputIntegrity(input, reapproved, source.view, source.roundtable),
    /current ContextPackage revision|current approved source|does not match/
  );
});
