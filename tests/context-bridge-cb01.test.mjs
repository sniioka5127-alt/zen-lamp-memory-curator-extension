import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ProjectStore,
  assertContextPackageTransferReady,
  canTransitionContextPackage,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_cb01" };
const ai = { type: "ai", name: "test-model" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 12, 30, n++));
}

async function fixture() {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const project = await projects.create({ name: "Context Bridge Test" }, { actor: human });
  return { adapter, clock, audit, projects, items, packages, project };
}

async function approvedItem(items, project, overrides = {}) {
  const item = await items.create({
    project_id: project.id,
    content: overrides.content || "Only Human-approved context may travel.",
    kind: overrides.kind || "constraint",
    source: { actor_type: "human" },
    memory_policy: overrides.memory_policy || "keep",
    transfer_policy: overrides.transfer_policy || "manual_only",
    freshness: overrides.freshness || { state: "current" }
  }, { actor: human });
  return items.approve(item.id, { actor: human });
}

test("CB-01: ContextPackage state machine is separate and approval is revocable", () => {
  assert.equal(canTransitionContextPackage("draft", "pending_review"), true);
  assert.equal(canTransitionContextPackage("pending_review", "approved"), true);
  assert.equal(canTransitionContextPackage("approved", "revoked"), true);
  assert.equal(canTransitionContextPackage("archived", "approved"), false);
});

test("CB-01: Human Gate binds transfer approval to an exact package revision", async () => {
  const { audit, items, packages, project } = await fixture();
  const item = await approvedItem(items, project);

  const pkg = await packages.create({
    project_id: project.id,
    purpose: "Continue the same project in another AI",
    target: { mode: "single", project_id: project.id, platforms: ["claude"] },
    items: [item]
  }, { actor: ai });

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.human_gate.state, "pending");
  assert.equal(pkg.revision, 1);
  assert.throws(() => assertContextPackageTransferReady(pkg), /not approved/);

  const pending = await packages.submitForReview(pkg.id, { actor: ai });
  assert.equal(pending.status, "pending_review");

  await assert.rejects(
    () => packages.approve(pkg.id, { actor: ai }),
    /Human Gate required/
  );

  const approved = await packages.approve(pkg.id, { actor: human });
  assert.equal(approved.status, "approved");
  assert.equal(approved.human_gate.state, "approved");
  assert.equal(approved.human_gate.approved_revision, 1);
  assert.equal(assertContextPackageTransferReady(approved), true);

  const revised = await packages.revise(
    pkg.id,
    { purpose: "Revised transfer purpose" },
    { actor: human }
  );
  assert.equal(revised.status, "draft");
  assert.equal(revised.revision, 2);
  assert.equal(revised.human_gate.state, "pending");
  assert.equal(revised.human_gate.approved_revision, null);
  assert.throws(() => assertContextPackageTransferReady(revised), /not approved/);

  const events = await audit.list({ project_id: project.id, entity_type: "context_package" });
  assert.ok(events.some((event) => event.action === "submit_review"));
  assert.ok(events.some((event) => event.action === "approve"));
  assert.ok(events.some((event) => event.action === "update"));
});

test("CB-01: package approval fails if a source ContextItem changed after snapshot", async () => {
  const { items, packages, project } = await fixture();
  const item = await approvedItem(items, project);

  const pkg = await packages.create({
    project_id: project.id,
    purpose: "Snapshot integrity test",
    items: [item]
  }, { actor: human });

  await packages.submitForReview(pkg.id, { actor: human });
  await items.revise(
    item.id,
    { content: "This approved source has now changed and needs review." },
    { actor: human }
  );

  await assert.rejects(
    () => packages.approve(pkg.id, { actor: human }),
    /changed after package snapshot|not Human-approved/
  );
});

test("CB-01: deny and project_only policies are enforced before Human approval", async () => {
  const { items, packages, project } = await fixture();

  const denied = await approvedItem(items, project, {
    content: "Never transfer this item.",
    transfer_policy: "deny"
  });
  await assert.rejects(
    () => packages.create({
      project_id: project.id,
      purpose: "Denied policy test",
      items: [denied]
    }, { actor: human }),
    /denied by policy/
  );

  const scoped = await approvedItem(items, project, {
    content: "This item is restricted to its Project.",
    transfer_policy: "project_only"
  });
  await assert.rejects(
    () => packages.create({
      project_id: project.id,
      purpose: "Cross-project policy test",
      target: { mode: "generic", project_id: "another-project" },
      items: [scoped]
    }, { actor: human }),
    /restricted to its Project/
  );
});

test("CB-01: review-due context requires explicit freshness acknowledgment", async () => {
  const { items, packages, project } = await fixture();
  const item = await approvedItem(items, project, {
    content: "Time-sensitive context needs explicit review.",
    freshness: {
      state: "review_due",
      review_after: "2026-09-01T00:00:00.000Z",
      reason: "Time-sensitive"
    }
  });

  const pkg = await packages.create({
    project_id: project.id,
    purpose: "Freshness gate test",
    items: [item]
  }, { actor: human });
  await packages.submitForReview(pkg.id, { actor: human });

  await assert.rejects(
    () => packages.approve(pkg.id, { actor: human }),
    /Freshness acknowledgment required/
  );

  const approved = await packages.approve(pkg.id, {
    actor: human,
    acknowledged_review_due_item_ids: [item.id]
  });
  assert.equal(assertContextPackageTransferReady(approved), true);
});

test("CB-01: revoked approval is no longer transfer-ready", async () => {
  const { items, packages, project } = await fixture();
  const item = await approvedItem(items, project, { transfer_policy: "allow" });
  const pkg = await packages.create({
    project_id: project.id,
    purpose: "Revocation test",
    items: [item]
  }, { actor: human });
  await packages.submitForReview(pkg.id, { actor: human });
  await packages.approve(pkg.id, { actor: human });

  const revoked = await packages.revokeApproval(pkg.id, {
    actor: human,
    reason: "Destination changed"
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.human_gate.state, "revoked");
  assert.throws(() => assertContextPackageTransferReady(revoked), /not approved/);
});
