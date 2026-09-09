import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ProjectStore,
  assertRedactedTransferViewReady,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "redaction-helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 13, 0, n++));
}

async function createApprovedItem(items, input) {
  const item = await items.create(input, { actor: ai });
  return items.approve(item.id, { actor: human });
}

async function createApprovedPackage({ adapter, clock, audit, projects, items, packages, contents }) {
  const project = await projects.create({ name: "CB-03 Test" }, { actor: human });
  const approvedItems = [];
  for (const [index, content] of contents.entries()) {
    approvedItems.push(await createApprovedItem(items, {
      project_id: project.id,
      content,
      kind: index === 0 ? "project_context" : "fact",
      memory_policy: "keep",
      transfer_policy: "allow"
    }));
  }

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Prepare a privacy-safe transfer view",
    target: {
      mode: "single",
      project_id: project.id,
      platforms: ["gpt"]
    },
    items: approvedItems
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const approved = await packages.approve(draft.id, { actor: human });
  return { project, approved, approvedItems };
}

test("CB-03: findings are proposal-only and approved TransferView contains only sanitized content", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const rawContact = "連絡先 alice@example.com / 090-1234-5678 / 192.168.1.10 / sk-abcdefghijklmnop";
  const rawInternal = "担当者 新岡昌心。内部メモは外部へ渡さない。";
  const { project, approved } = await createApprovedPackage({
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    contents: [rawContact, rawInternal]
  });

  const plan = await redaction.propose(
    approved,
    { custom_literals: ["新岡昌心"] },
    { actor: ai }
  );

  assert.equal(plan.authority, "proposal_only");
  assert.ok(plan.operation_candidates.some((op) => op.category === "email"));
  assert.ok(plan.operation_candidates.some((op) => op.category === "phone"));
  assert.ok(plan.operation_candidates.some((op) => op.category === "credential_like"));
  assert.ok(plan.operation_candidates.some((op) => op.category === "custom"));

  const serializedPlan = JSON.stringify(plan);
  assert.equal(serializedPlan.includes("alice@example.com"), false);
  assert.equal(serializedPlan.includes("sk-abcdefghijklmnop"), false);
  assert.equal(serializedPlan.includes("新岡昌心"), false);

  await assert.rejects(
    () => redaction.approveTransferView(approved, plan, {
      actor: ai,
      selected_operation_ids: plan.operation_candidates.map((op) => op.id)
    }),
    /Human Gate required/
  );

  const internalItemId = approved.items[1].context_item_id;
  const contactOperationIds = plan.operation_candidates
    .filter((op) => op.context_item_id === approved.items[0].context_item_id)
    .map((op) => op.id);

  const view = await redaction.approveTransferView(approved, plan, {
    actor: human,
    selected_operation_ids: contactOperationIds,
    excluded_items: [{ context_item_id: internalItemId, reason: "not required for external task" }]
  });

  assert.equal(view.status, "approved");
  assert.equal(view.human_gate.state, "approved");
  assert.equal(view.items.length, 1);
  assert.equal(view.excluded_items[0].context_item_id, internalItemId);
  assert.equal(JSON.stringify(view).includes(rawInternal), false);
  assert.equal(JSON.stringify(view).includes("alice@example.com"), false);
  assert.equal(JSON.stringify(view).includes("090-1234-5678"), false);
  assert.equal(JSON.stringify(view).includes("192.168.1.10"), false);
  assert.equal(JSON.stringify(view).includes("sk-abcdefghijklmnop"), false);
  assert.match(view.items[0].content, /\[REDACTED:EMAIL\]/);
  assert.match(view.items[0].content, /\[REDACTED:PHONE\]/);
  assert.match(view.items[0].content, /\[REDACTED:CREDENTIAL\]/);
  assert.equal(assertRedactedTransferViewReady(view, approved), true);

  const events = await audit.list({ project_id: project.id });
  assert.ok(events.some((event) => event.action === "redaction_plan_created"));
  assert.ok(events.some((event) => event.action === "redaction_view_approved"));
});

test("CB-03: IPv4 detector is independently available", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const { approved } = await createApprovedPackage({
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    contents: ["内部IPは 10.20.30.40 です。"]
  });

  const plan = await redaction.propose(approved, {
    detectors: { phone: false }
  }, { actor: ai });
  const ip = plan.operation_candidates.find((op) => op.category === "ipv4");
  assert.ok(ip);

  const view = await redaction.approveTransferView(approved, plan, {
    actor: human,
    selected_operation_ids: [ip.id]
  });
  assert.match(view.items[0].content, /\[REDACTED:IP\]/);
  assert.equal(view.items[0].content.includes("10.20.30.40"), false);
});

test("CB-03: every detected finding must be redacted or explicitly acknowledged by a human", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const { approved } = await createApprovedPackage({
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    contents: ["連絡先は owner@example.org です。"]
  });

  const plan = await redaction.propose(approved, {}, { actor: ai });
  assert.equal(plan.operation_candidates.length, 1);
  const findingId = plan.operation_candidates[0].id;

  await assert.rejects(
    () => redaction.approveTransferView(approved, plan, { actor: human }),
    /Human acknowledgment required for unredacted finding/
  );

  const acknowledged = await redaction.approveTransferView(approved, plan, {
    actor: human,
    acknowledged_unredacted_operation_ids: [findingId],
    reason: "Human explicitly chose to keep this public contact address"
  });

  assert.equal(acknowledged.items[0].content.includes("owner@example.org"), true);
  assert.deepEqual(acknowledged.acknowledged_unredacted_operation_ids, [findingId]);
  assert.equal(assertRedactedTransferViewReady(acknowledged, approved), true);
});

test("CB-03: manual redaction supports names without pretending local regex is a person-name classifier", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const content = "担当者は新岡昌心です。設計方針のみ共有する。";
  const { approved } = await createApprovedPackage({
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    contents: [content]
  });

  const plan = await redaction.propose(approved, {
    detectors: { email: false, phone: false, ipv4: false, credential_like: false }
  }, { actor: ai });
  assert.equal(plan.operation_candidates.length, 0);

  const name = "新岡昌心";
  const start = content.indexOf(name);
  const view = await redaction.approveTransferView(approved, plan, {
    actor: human,
    manual_operations: [{
      context_item_id: approved.items[0].context_item_id,
      start,
      end: start + name.length
    }]
  });

  assert.equal(view.items[0].content.includes(name), false);
  assert.match(view.items[0].content, /担当者は\[REDACTED\]です/);
  assert.deepEqual(view.items[0].redaction_categories, ["manual"]);
});

test("CB-03: approved TransferView cannot survive ContextPackage revision changes or Human revocation", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const { approved } = await createApprovedPackage({
    adapter,
    clock,
    audit,
    projects,
    items,
    packages,
    contents: ["共有可能な設計情報。"]
  });

  const plan = await redaction.propose(approved, {}, { actor: ai });
  const view = await redaction.approveTransferView(approved, plan, { actor: human });
  assert.equal(assertRedactedTransferViewReady(view, approved), true);

  const revoked = await redaction.revokeTransferView(view.id, {
    actor: human,
    reason: "Transfer cancelled"
  });
  assert.throws(
    () => assertRedactedTransferViewReady(revoked, approved),
    /has not passed its Human Gate/
  );

  const revised = await packages.revise(approved.id, {
    purpose: "Revised transfer purpose"
  }, { actor: human });
  await packages.submitForReview(revised.id, { actor: ai });
  const reapproved = await packages.approve(revised.id, { actor: human });

  assert.throws(
    () => assertRedactedTransferViewReady(view, reapproved),
    /does not match the current ContextPackage revision/
  );
});
