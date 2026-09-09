import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  ProjectStore,
  assertRenderedContextEquivalent,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const ai = { type: "ai", name: "renderer-helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 14, 0, n++));
}

async function createApprovedItem(items, input) {
  const item = await items.create(input, { actor: ai });
  return items.approve(item.id, { actor: human });
}

async function prepareApprovedTransferView({ roundtable = false } = {}) {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });

  const project = await projects.create({ name: "CB-04 Test" }, { actor: human });
  const architecture = await createApprovedItem(items, {
    project_id: project.id,
    content: "Human Gateを通過した同一Contextを各AIへ渡す。連絡先 renderer@example.com は転送時に伏せる。",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  });
  const decision = await createApprovedItem(items, {
    project_id: project.id,
    content: "Roundtableでは多数決を真実として扱わない。",
    kind: "decision",
    memory_policy: "keep",
    transfer_policy: "allow"
  });

  const target = roundtable
    ? { mode: "roundtable", project_id: project.id, platforms: ["gpt", "claude", "gemini"] }
    : { mode: "single", project_id: project.id, platforms: ["gpt"] };

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Human Agency Coreの実装監査を継続する",
    target,
    items: [architecture, decision]
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const pkg = await packages.approve(draft.id, { actor: human });

  const plan = await redaction.propose(pkg, {}, { actor: ai });
  const selectedIds = plan.operation_candidates.map((entry) => entry.id);
  const view = await redaction.approveTransferView(pkg, plan, {
    actor: human,
    selected_operation_ids: selectedIds
  });

  return { adapter, clock, audit, projects, items, packages, redaction, project, pkg, view };
}

test("CB-04: provider renderings preserve one identical canonical semantic payload", async () => {
  const fixture = await prepareApprovedTransferView();
  const renderer = new ContextRenderer({ auditLog: fixture.audit, clock: fixture.clock });

  const generic = await renderer.render(fixture.pkg, fixture.view, { provider: "generic" });
  const gpt = await renderer.render(fixture.pkg, fixture.view, { provider: "gpt" });
  const claude = await renderer.render(fixture.pkg, fixture.view, { provider: "claude" });
  const gemini = await renderer.render(fixture.pkg, fixture.view, { provider: "gemini" });

  const renderings = [generic, gpt, claude, gemini];
  assert.equal(assertRenderedContextEquivalent(renderings), true);

  for (const rendering of renderings) {
    assert.equal(rendering.status, "rendered_not_sent");
    assert.equal(rendering.authority, "derived_from_human_approved_transfer_view");
    assert.equal(rendering.package_revision, fixture.pkg.revision);
    assert.equal(rendering.transfer_view_id, fixture.view.id);
    assert.equal(rendering.canonical_json, generic.canonical_json);
    assert.deepEqual(rendering.canonical_payload, generic.canonical_payload);
    assert.equal(rendering.semantic_fingerprint.value, generic.semantic_fingerprint.value);
    assert.equal(rendering.rendered_text.includes("renderer@example.com"), false);
    assert.match(rendering.rendered_text, /\[REDACTED:EMAIL\]/);
    assert.match(rendering.rendered_text, /Roundtableでは多数決を真実として扱わない/);
  }

  assert.notEqual(gpt.rendered_text, claude.rendered_text);
  assert.notEqual(claude.rendered_text, gemini.rendered_text);

  const renderEvents = (await fixture.audit.list({ project_id: fixture.project.id }))
    .filter((event) => event.action === "context_rendered");
  assert.equal(renderEvents.length, 4);
  for (const event of renderEvents) {
    assert.equal(JSON.stringify(event).includes("Roundtableでは多数決"), false);
    assert.equal(JSON.stringify(event).includes("[REDACTED:EMAIL]"), false);
  }
});

test("CB-04: repeated rendering is semantically deterministic even when render artifact ids differ", async () => {
  const fixture = await prepareApprovedTransferView();
  const renderer = new ContextRenderer({ clock: fixture.clock });

  const first = await renderer.render(fixture.pkg, fixture.view, { provider: "chatgpt" });
  const second = await renderer.render(fixture.pkg, fixture.view, { provider: "openai" });

  assert.notEqual(first.id, second.id);
  assert.equal(first.profile, "gpt");
  assert.equal(second.profile, "gpt");
  assert.equal(first.canonical_json, second.canonical_json);
  assert.deepEqual(first.semantic_fingerprint, second.semantic_fingerprint);
});

test("CB-04: Roundtable rendering gives every provider the same canonical context", async () => {
  const fixture = await prepareApprovedTransferView({ roundtable: true });
  const renderer = new ContextRenderer({ auditLog: fixture.audit, clock: fixture.clock });

  const roundtable = await renderer.renderRoundtable(fixture.pkg, fixture.view);
  assert.equal(roundtable.mode, "roundtable");
  assert.deepEqual(roundtable.providers, ["gpt", "claude", "gemini"]);
  assert.equal(roundtable.renderings.length, 3);
  assert.equal(assertRenderedContextEquivalent(roundtable.renderings), true);

  const [first, ...rest] = roundtable.renderings;
  for (const rendering of rest) {
    assert.equal(rendering.canonical_json, first.canonical_json);
    assert.deepEqual(rendering.semantic_fingerprint, first.semantic_fingerprint);
  }
  assert.equal(roundtable.semantic_fingerprint.value, first.semantic_fingerprint.value);
});

test("CB-04: rendering cannot bypass CB-03 Human approval or survive package revision changes", async () => {
  const fixture = await prepareApprovedTransferView();
  const renderer = new ContextRenderer({ clock: fixture.clock });

  const unapprovedPlan = await fixture.redaction.propose(fixture.pkg, {}, { actor: ai });
  await assert.rejects(
    () => renderer.render(fixture.pkg, unapprovedPlan, { provider: "gpt" }),
    /TransferView/
  );

  const valid = await renderer.render(fixture.pkg, fixture.view, { provider: "gpt" });
  assert.equal(valid.status, "rendered_not_sent");

  const revised = await fixture.packages.revise(fixture.pkg.id, {
    purpose: "Revision changed after rendering"
  }, { actor: human });
  await fixture.packages.submitForReview(revised.id, { actor: ai });
  const reapproved = await fixture.packages.approve(revised.id, { actor: human });

  await assert.rejects(
    () => renderer.render(reapproved, fixture.view, { provider: "gpt" }),
    /does not match the current ContextPackage revision/
  );
});

test("CB-04: unknown providers fall back to generic formatting without changing canonical content", async () => {
  const fixture = await prepareApprovedTransferView();
  const renderer = new ContextRenderer({ clock: fixture.clock });

  const known = await renderer.render(fixture.pkg, fixture.view, { provider: "generic" });
  const local = await renderer.render(fixture.pkg, fixture.view, { provider: "local-ai" });

  assert.equal(local.profile, "generic");
  assert.equal(local.provider, "local-ai");
  assert.equal(local.canonical_json, known.canonical_json);
  assert.deepEqual(local.semantic_fingerprint, known.semantic_fingerprint);
});
