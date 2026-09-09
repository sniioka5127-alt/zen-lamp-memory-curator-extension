import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ProjectStore,
  canTransition,
  createMemoryAdapter,
  evaluateTransfer
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "test-model" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 12, 0, n++));
}

test("HC-01: state transitions preserve Human Gate semantics", () => {
  assert.equal(canTransition("proposed", "approved"), true);
  assert.equal(canTransition("approved", "stale"), true);
  assert.equal(canTransition("archived", "approved"), false);
});

test("HC-02..05: project, ContextItem, governance and audit work together", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });

  await assert.rejects(
    () => projects.create({ name: "AI-owned project" }, { actor: ai }),
    /Human Gate required/
  );

  const project = await projects.create({ name: "HIRAKU Tools Test" }, { actor: human });
  assert.equal(project.status, "active");
  assert.equal(project.settings.local_first, true);
  assert.equal(project.settings.human_gate_required, true);

  await assert.rejects(
    () => projects.update(
      project.id,
      { settings: { human_gate_required: false } },
      { actor: human }
    ),
    /human_gate_required cannot be disabled/
  );

  await assert.rejects(
    () => projects.setStatus(project.id, "paused", { actor: ai }),
    /Human Gate required/
  );

  const item = await items.create({
    project_id: project.id,
    content: "Human authority remains with the user.",
    kind: "constraint",
    source: { actor_type: "ai", platform: "test" },
    memory_policy: "review",
    transfer_policy: "manual_only"
  }, { actor: ai });

  assert.equal(item.status, "proposed");
  assert.equal(item.human_review.state, "pending");
  assert.deepEqual(evaluateTransfer(item, { human_confirmed: true }), {
    allowed: false,
    reason: "item_not_human_approved"
  });

  await assert.rejects(
    () => items.approve(item.id, { actor: ai }),
    /Human Gate required/
  );

  const approved = await items.approve(item.id, { actor: human });
  assert.equal(approved.status, "approved");
  assert.equal(approved.human_review.state, "approved");

  assert.deepEqual(evaluateTransfer(approved, { human_confirmed: false }), {
    allowed: false,
    reason: "manual_confirmation_required"
  });
  assert.deepEqual(evaluateTransfer(approved, { human_confirmed: true }), {
    allowed: true,
    reason: "allowed"
  });

  const scoped = await items.setTransferPolicy(
    item.id,
    "project_only",
    { actor: human, reason: "Limit to current project" }
  );
  assert.deepEqual(evaluateTransfer(scoped, { target_project_id: "another-project" }), {
    allowed: false,
    reason: "outside_project_scope"
  });
  assert.deepEqual(evaluateTransfer(scoped, { target_project_id: project.id }), {
    allowed: true,
    reason: "allowed"
  });

  const revised = await items.revise(
    item.id,
    { content: "Human authority and final judgment remain with the user." },
    { actor: human }
  );
  assert.equal(revised.status, "needs_review");
  assert.equal(revised.human_review.state, "pending");

  const reapproved = await items.approve(item.id, { actor: human });
  const stale = await items.markStale(item.id, {
    actor: { type: "system" },
    reason: "Freshness review due"
  });
  assert.equal(reapproved.status, "approved");
  assert.equal(stale.status, "stale");
  assert.equal(stale.freshness.state, "stale");
  assert.equal(stale.human_review.state, "pending");

  const events = await audit.list({ project_id: project.id });
  assert.ok(events.length >= 7);
  assert.equal(events[0].action, "create");
  assert.ok(events.some((event) => event.action === "approve"));
  assert.ok(events.some((event) => event.action === "policy_change"));
  assert.ok(events.some((event) => event.action === "mark_stale"));
});
