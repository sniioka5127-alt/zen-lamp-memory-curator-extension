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
  assertHandoffReceiptBoundToRendering,
  assertRoundtableTransferReceiptsEquivalent,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "handoff-helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 14, 0, n++));
}

async function createApprovedItem(items, input) {
  const item = await items.create(input, { actor: ai });
  return items.approve(item.id, { actor: human });
}

async function createTransferSource({
  target = { mode: "single", platforms: ["gpt"] },
  content = "CB-05 transfer audit test context."
} = {}) {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });
  const renderer = new ContextRenderer({ auditLog: audit, clock });
  const outbound = new OutboundHandoffBoundary(adapter, { auditLog: audit, clock });

  const project = await projects.create({ name: "CB-05 Test" }, { actor: human });
  const item = await createApprovedItem(items, {
    project_id: project.id,
    content,
    kind: "project_context",
    memory_policy: "keep",
    transfer_policy: "allow"
  });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Transfer approved project context",
    target: {
      ...target,
      project_id: target.project_id ?? project.id
    },
    items: [item]
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const pkg = await packages.approve(draft.id, { actor: human });

  const plan = await redaction.propose(pkg, {}, { actor: ai });
  const view = await redaction.approveTransferView(pkg, plan, { actor: human });

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
    project,
    item,
    pkg,
    view
  };
}

test("CB-05: attempt is not delivery, and only a human can confirm a manual outbound handoff", async () => {
  const source = await createTransferSource({
    content: "Sensitive working context token: CONTEXT-PHRASE-ONLY-IN-SOURCE"
  });
  const rendering = await source.renderer.render(source.pkg, source.view, {
    provider: "gpt",
    actor: ai
  });

  const attempt = await source.outbound.recordAttempt(source.pkg, source.view, rendering, {
    actor: ai,
    transport: "manual_paste",
    destination_label: "ChatGPT work chat"
  });

  assert.equal(attempt.status, "attempted_not_confirmed");
  assert.equal(attempt.authority, "no_delivery_claim");
  assert.equal(JSON.stringify(attempt).includes("CONTEXT-PHRASE-ONLY-IN-SOURCE"), false);

  await assert.rejects(
    () => source.outbound.confirmManualHandoff(source.pkg, source.view, rendering, {
      actor: ai,
      transport: "manual_paste",
      attempt_id: attempt.id
    }),
    /Human Gate required/
  );

  const receipt = await source.outbound.confirmManualHandoff(source.pkg, source.view, rendering, {
    actor: human,
    transport: "manual_paste",
    attempt_id: attempt.id,
    reason: "Human pasted the rendered context into the destination chat"
  });

  assert.equal(receipt.status, "handoff_confirmed");
  assert.equal(receipt.delivery_status, "unverified");
  assert.equal(receipt.confirmed_by, human.id);
  assert.equal(receipt.rendering_id, rendering.id);
  assert.equal(assertHandoffReceiptBoundToRendering(receipt, rendering), true);
  assert.equal(JSON.stringify(receipt).includes("CONTEXT-PHRASE-ONLY-IN-SOURCE"), false);
  assert.equal(JSON.stringify(receipt).includes(rendering.rendered_text), false);

  const transferEvents = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => ["transfer_attempt", "transfer_approved"].includes(event.action));
  assert.equal(transferEvents.length, 2);
  assert.equal(JSON.stringify(transferEvents).includes("CONTEXT-PHRASE-ONLY-IN-SOURCE"), false);
});

test("CB-05: modified or stale renderings cannot cross the outbound boundary", async () => {
  const source = await createTransferSource();
  const rendering = await source.renderer.render(source.pkg, source.view, { provider: "gpt" });

  const tampered = structuredClone(rendering);
  tampered.rendered_text += "\nINJECTED AFTER HUMAN APPROVAL";
  await assert.rejects(
    () => source.outbound.confirmManualHandoff(source.pkg, source.view, tampered, {
      actor: human
    }),
    /presentation text was modified/
  );

  const revised = await source.packages.revise(source.pkg.id, {
    purpose: "Revised transfer purpose"
  }, { actor: human });
  await source.packages.submitForReview(revised.id, { actor: ai });
  const reapproved = await source.packages.approve(revised.id, { actor: human });

  await assert.rejects(
    () => source.outbound.confirmManualHandoff(reapproved, source.view, rendering, {
      actor: human
    }),
    /does not match the current ContextPackage revision|current approved transfer source/
  );
});

test("CB-05: v0.1 rejects API-like transports instead of pretending to send", async () => {
  const source = await createTransferSource();
  const rendering = await source.renderer.render(source.pkg, source.view, { provider: "gpt" });

  await assert.rejects(
    () => source.outbound.recordAttempt(source.pkg, source.view, rendering, {
      actor: human,
      transport: "api_connector"
    }),
    /Unsupported CB-05 transport/
  );
});

test("CB-05: Roundtable handoff receipts prove the same approved context was handed off to every provider", async () => {
  const source = await createTransferSource({
    target: {
      mode: "roundtable",
      platforms: ["gpt", "claude", "gemini"]
    }
  });
  const roundtable = await source.renderer.renderRoundtable(source.pkg, source.view, {
    actor: ai
  });

  await assert.rejects(
    () => source.outbound.confirmRoundtableHandoff(source.pkg, source.view, roundtable, {
      actor: ai
    }),
    /Human Gate required/
  );

  const batch = await source.outbound.confirmRoundtableHandoff(source.pkg, source.view, roundtable, {
    actor: human,
    transport: "manual_paste",
    destination_labels: {
      gpt: "GPT comparison chat",
      claude: "Claude comparison chat",
      gemini: "Gemini comparison chat"
    }
  });

  assert.equal(batch.status, "handoff_confirmed");
  assert.equal(batch.delivery_status, "unverified");
  assert.deepEqual(new Set(batch.providers), new Set(["gpt", "claude", "gemini"]));

  const receipts = [];
  for (const id of batch.receipt_ids) {
    receipts.push(await source.outbound.getReceipt(id));
  }
  assert.equal(assertRoundtableTransferReceiptsEquivalent(receipts), true);
  assert.equal(new Set(receipts.map((receipt) => receipt.semantic_fingerprint.value)).size, 1);

  const forged = structuredClone(receipts);
  forged[1].semantic_fingerprint.value = "deadbeef";
  assert.throws(
    () => assertRoundtableTransferReceiptsEquivalent(forged),
    /do not share the same approved context source/
  );
});
