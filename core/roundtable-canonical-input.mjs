import {
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertContextPackageTransferReady } from "./context-package-store.mjs";
import { assertRedactedTransferViewReady } from "./context-redaction-layer.mjs";
import {
  assertRenderedContextEquivalent,
  assertRenderedContextIntegrity
} from "./context-renderer.mjs";
import {
  assertHandoffReceiptBoundToRendering,
  assertRoundtableTransferReceiptsEquivalent
} from "./outbound-handoff-boundary.mjs";

export const ROUNDTABLE_CANONICAL_INPUT_VERSION = "RT-01";

function normalizeProvider(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("provider must be a non-empty string");
  }
  return value.trim().toLowerCase();
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const a = new Set(left);
  return right.every((value) => a.has(value));
}

function assertRoundtableSource(pkg, view, roundtable) {
  assertContextPackageTransferReady(pkg);
  assertRedactedTransferViewReady(view, pkg);

  if (pkg.target?.mode !== "roundtable") {
    throw new Error("RT-01 requires a ContextPackage with target.mode = roundtable");
  }
  if (!roundtable || roundtable.mode !== "roundtable" || !Array.isArray(roundtable.renderings)) {
    throw new TypeError("CB-04 Roundtable rendering is required");
  }
  if (roundtable.package_id !== pkg.id ||
      roundtable.package_revision !== pkg.revision ||
      roundtable.transfer_view_id !== view.id) {
    throw new Error("Roundtable rendering does not match the approved ContextPackage revision and TransferView");
  }

  assertRenderedContextEquivalent(roundtable.renderings);
  for (const rendering of roundtable.renderings) {
    assertRenderedContextIntegrity(rendering, pkg, view);
  }

  const configured = [...new Set((pkg.target?.platforms || []).map(normalizeProvider))];
  const rendered = [...new Set(roundtable.renderings.map((entry) => normalizeProvider(entry.provider)))];
  if (configured.length < 2 || !sameSet(configured, rendered)) {
    throw new Error("Roundtable provider coverage does not exactly match the approved ContextPackage target");
  }
  if (!sameSet(rendered, (roundtable.providers || []).map(normalizeProvider))) {
    throw new Error("Roundtable provider metadata does not match its renderings");
  }

  const first = roundtable.renderings[0];
  if (roundtable.canonical_json !== first.canonical_json ||
      roundtable.semantic_fingerprint?.algorithm !== first.semantic_fingerprint?.algorithm ||
      roundtable.semantic_fingerprint?.value !== first.semantic_fingerprint?.value) {
    throw new Error("Roundtable top-level canonical metadata does not match provider renderings");
  }

  return true;
}

function validateReceiptEvidence(receipts, renderings) {
  if (receipts == null) {
    return {
      state: "not_provided",
      delivery_status: null,
      receipt_ids: []
    };
  }
  if (!Array.isArray(receipts) || receipts.length !== renderings.length) {
    throw new Error("Roundtable handoff receipts must cover every provider rendering or be omitted");
  }

  assertRoundtableTransferReceiptsEquivalent(receipts);
  const receiptsByProvider = new Map(receipts.map((receipt) => [normalizeProvider(receipt.provider), receipt]));
  if (receiptsByProvider.size !== renderings.length) {
    throw new Error("Roundtable handoff receipt providers must be unique");
  }

  for (const rendering of renderings) {
    const receipt = receiptsByProvider.get(normalizeProvider(rendering.provider));
    if (!receipt) throw new Error(`Missing handoff receipt for provider: ${rendering.provider}`);
    assertHandoffReceiptBoundToRendering(receipt, rendering);
  }

  return {
    state: "human_confirmed_manual_handoff",
    delivery_status: "unverified",
    receipt_ids: renderings.map((rendering) => receiptsByProvider.get(normalizeProvider(rendering.provider)).id)
  };
}

export function assertRoundtableCanonicalInputIntegrity(input, pkg, view, roundtable, { receipts = null } = {}) {
  assertRoundtableSource(pkg, view, roundtable);
  if (!input || typeof input !== "object") throw new TypeError("Roundtable Canonical Input is required");
  if (input.input_version !== ROUNDTABLE_CANONICAL_INPUT_VERSION) {
    throw new Error("Roundtable Canonical Input was not produced by RT-01");
  }
  if (input.status !== "prepared_not_executed") {
    throw new Error("Roundtable Canonical Input must remain prepared_not_executed in RT-01");
  }
  if (input.project_id !== pkg.project_id ||
      input.package_id !== pkg.id ||
      input.package_revision !== pkg.revision ||
      input.transfer_view_id !== view.id) {
    throw new Error("Roundtable Canonical Input does not match the current approved source");
  }

  const first = roundtable.renderings[0];
  if (input.semantic_fingerprint?.algorithm !== first.semantic_fingerprint?.algorithm ||
      input.semantic_fingerprint?.value !== first.semantic_fingerprint?.value ||
      input.canonical_json !== first.canonical_json ||
      JSON.stringify(input.canonical_payload) !== JSON.stringify(first.canonical_payload)) {
    throw new Error("Roundtable Canonical Input canonical semantic source was modified");
  }

  if (!Array.isArray(input.provider_inputs) || input.provider_inputs.length !== roundtable.renderings.length) {
    throw new Error("Roundtable Canonical Input provider inputs are incomplete");
  }
  const byProvider = new Map(input.provider_inputs.map((entry) => [normalizeProvider(entry.provider), entry]));
  for (const rendering of roundtable.renderings) {
    const providerInput = byProvider.get(normalizeProvider(rendering.provider));
    if (!providerInput ||
        providerInput.rendering_id !== rendering.id ||
        providerInput.profile !== rendering.profile ||
        providerInput.rendered_text !== rendering.rendered_text) {
      throw new Error(`Roundtable provider input was modified: ${rendering.provider}`);
    }
  }

  const expectedEvidence = validateReceiptEvidence(receipts, roundtable.renderings);
  if (input.handoff_evidence?.state !== expectedEvidence.state ||
      input.handoff_evidence?.delivery_status !== expectedEvidence.delivery_status ||
      JSON.stringify(input.handoff_evidence?.receipt_ids || []) !== JSON.stringify(expectedEvidence.receipt_ids)) {
    throw new Error("Roundtable Canonical Input handoff evidence does not match CB-05 receipts");
  }
  return true;
}

export class RoundtableCanonicalInputBuilder {
  constructor({ auditLog = null, clock = () => new Date() } = {}) {
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async prepare(pkg, view, roundtable, {
    receipts = null,
    actor = { type: "system" }
  } = {}) {
    assertRoundtableSource(pkg, view, roundtable);
    const evidence = validateReceiptEvidence(receipts, roundtable.renderings);
    const first = roundtable.renderings[0];

    const input = {
      schema_version: "0.1",
      input_version: ROUNDTABLE_CANONICAL_INPUT_VERSION,
      id: makeId("rti"),
      mode: "canonical_context",
      authority: "derived_from_human_approved_context",
      status: "prepared_not_executed",
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      purpose: pkg.purpose,
      providers: roundtable.renderings.map((entry) => normalizeProvider(entry.provider)),
      semantic_fingerprint: deepClone(first.semantic_fingerprint),
      canonical_payload: deepClone(first.canonical_payload),
      canonical_json: first.canonical_json,
      provider_inputs: roundtable.renderings.map((rendering) => ({
        provider: normalizeProvider(rendering.provider),
        profile: rendering.profile,
        rendering_id: rendering.id,
        rendered_text: rendering.rendered_text
      })),
      handoff_evidence: evidence,
      provenance: {
        source: "context_bridge",
        context_package_id: pkg.id,
        context_package_revision: pkg.revision,
        transfer_view_id: view.id,
        renderer_version: roundtable.renderer_version
      },
      prepared_at: nowIso(this.clock)
    };

    assertRoundtableCanonicalInputIntegrity(input, pkg, view, roundtable, { receipts });

    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "roundtable_input_prepared",
      actor,
      entity_type: "roundtable_input",
      entity_id: input.id,
      metadata: {
        package_id: pkg.id,
        package_revision: pkg.revision,
        transfer_view_id: view.id,
        providers: deepClone(input.providers),
        semantic_fingerprint: `${input.semantic_fingerprint.algorithm}:${input.semantic_fingerprint.value}`,
        handoff_evidence_state: evidence.state,
        delivery_status: evidence.delivery_status
      }
    });

    return deepClone(input);
  }
}
