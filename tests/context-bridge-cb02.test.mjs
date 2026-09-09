import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextSelectionEngine,
  ProjectStore,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "selection-helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 12, 0, n++));
}

async function createApproved(items, input, actor = ai) {
  const item = await items.create(input, { actor });
  return items.approve(item.id, { actor: human });
}

test("CB-02: selection is proposal-only, explainable, and governance-filtered", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const selection = new ContextSelectionEngine(items, { clock });

  const project = await projects.create({ name: "HIRAKU Tools" }, { actor: human });

  const humanGate = await createApproved(items, {
    project_id: project.id,
    content: "Context BridgeではHuman Gateを維持し、AIが転送を自動承認しない。",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "manual_only"
  });

  const roundtable = await createApproved(items, {
    project_id: project.id,
    content: "Roundtable AIには同一のContextPackageを渡して比較する。",
    kind: "decision",
    memory_policy: "keep",
    transfer_policy: "allow"
  });

  const reviewDue = await createApproved(items, {
    project_id: project.id,
    content: "鮮度確認が必要な情報は明示的に再確認してから渡す。",
    kind: "fact",
    memory_policy: "keep",
    transfer_policy: "allow",
    freshness: {
      state: "current",
      review_after: "2026-09-09T11:00:00.000Z",
      reason: "time-sensitive"
    }
  });

  const lowPriority = await createApproved(items, {
    project_id: project.id,
    content: "旧画面の装飾メモ。",
    kind: "temporary",
    memory_policy: "temporary",
    transfer_policy: "allow"
  });

  const denied = await createApproved(items, {
    project_id: project.id,
    content: "この情報は外部へ渡してはいけない。",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "deny"
  });

  const unapproved = await items.create({
    project_id: project.id,
    content: "未承認の仮説。",
    kind: "hypothesis",
    transfer_policy: "allow"
  }, { actor: ai });

  const plan = await selection.propose({
    project_id: project.id,
    purpose: "Context BridgeのHuman Gateと鮮度確認を実装する",
    target: {
      mode: "single",
      project_id: project.id,
      platforms: ["claude"]
    }
  });

  assert.equal(plan.authority, "proposal_only");
  assert.equal(plan.project_id, project.id);
  assert.equal(plan.stats.scanned, 6);
  assert.equal(plan.stats.eligible, 4);
  assert.equal(plan.stats.blocked, 2);

  const humanGateCandidate = plan.candidates.find((entry) => entry.context_item_id === humanGate.id);
  assert.ok(humanGateCandidate);
  assert.ok(humanGateCandidate.reason_codes.includes("purpose_overlap"));
  assert.ok(humanGateCandidate.warning_codes.includes("manual_confirmation_required"));
  assert.equal(humanGateCandidate.recommendation, "suggest");

  const freshnessCandidate = plan.candidates.find((entry) => entry.context_item_id === reviewDue.id);
  assert.ok(freshnessCandidate.warning_codes.includes("freshness_review_due"));

  const deniedEntry = plan.blocked.find((entry) => entry.context_item_id === denied.id);
  assert.ok(deniedEntry.reason_codes.includes("transfer_denied_by_policy"));

  const unapprovedEntry = plan.blocked.find((entry) => entry.context_item_id === unapproved.id);
  assert.ok(unapprovedEntry.reason_codes.includes("context_item_not_approved"));

  assert.ok(plan.candidates.some((entry) => entry.context_item_id === roundtable.id));
  assert.ok(plan.candidates.some((entry) => entry.context_item_id === lowPriority.id));

  const after = await items.get(humanGate.id);
  assert.equal(after.status, "approved");
  assert.equal(after.transfer_policy, "manual_only");
});

test("CB-02: project_only scope and source changes cannot be bypassed", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const selection = new ContextSelectionEngine(items, { clock });

  const source = await projects.create({ name: "Source" }, { actor: human });
  const target = await projects.create({ name: "Target" }, { actor: human });

  const scoped = await createApproved(items, {
    project_id: source.id,
    content: "この項目はSource Project内だけで使う。",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "project_only"
  });

  const portable = await createApproved(items, {
    project_id: source.id,
    content: "移送可能な一般的な実装方針。",
    kind: "project_context",
    memory_policy: "keep",
    transfer_policy: "allow"
  });

  const plan = await selection.propose({
    project_id: source.id,
    purpose: "実装方針をTarget Projectへ引き継ぐ",
    target: {
      mode: "single",
      project_id: target.id,
      platforms: ["gpt"]
    }
  });

  assert.ok(plan.blocked.find((entry) =>
    entry.context_item_id === scoped.id && entry.reason_codes.includes("outside_project_scope")
  ));
  assert.ok(plan.candidates.find((entry) => entry.context_item_id === portable.id));

  await items.revise(portable.id, {
    content: "更新された移送可能な一般的実装方針。"
  }, { actor: human });

  await assert.rejects(
    () => selection.resolveSelectedItems(plan, [portable.id]),
    /changed after selection proposal/
  );
});

test("CB-02 integrates with CB-01 without turning recommendation into approval", async () => {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const selection = new ContextSelectionEngine(items, { clock });

  const project = await projects.create({ name: "Context Bridge Integration" }, { actor: human });
  const item = await createApproved(items, {
    project_id: project.id,
    content: "Human Gateを通過するまでContextPackageを転送可能とみなさない。",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "manual_only"
  });

  const plan = await selection.propose({
    project_id: project.id,
    purpose: "ContextPackageのHuman Gateを確認する"
  });
  const selected = await selection.resolveSelectedItems(plan, [item.id]);

  const pkg = await packages.create({
    project_id: project.id,
    purpose: plan.purpose,
    target: plan.target,
    items: selected
  }, { actor: ai });

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.human_gate.state, "pending");

  const pending = await packages.submitForReview(pkg.id, { actor: ai });
  assert.equal(pending.status, "pending_review");

  await assert.rejects(
    () => packages.approve(pkg.id, { actor: ai }),
    /Human Gate required/
  );

  const approved = await packages.approve(pkg.id, { actor: human });
  assert.equal(approved.status, "approved");
  assert.equal(approved.human_gate.state, "approved");
});
