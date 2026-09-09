import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { assertContextPackageTransferReady } from "./context-package-store.mjs";
import { assertRedactedTransferViewReady } from "./context-redaction-layer.mjs";
import {
  assertRenderedContextEquivalent,
  assertRenderedContextIntegrity
} from "./context-renderer.mjs";

export const OUTBOUND_HANDOFF_BOUNDARY_VERSION = "CB-05";

export const MANUAL_HANDOFF_TRANSPORT = Object.freeze([
  "manual_paste",
  "file_handoff",
  "other_manual"
]);

const ATTEMPT_PREFIX = "handoff-attempt:";
const RECEIPT_PREFIX = "handoff-receipt:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: outbound handoff confirmation may only be performed by a human actor");
  }
}

function actorIdentity(actor) {
  return actor?.id ?? actor?.name ?? "human";
}

function normalizeTransport(value) {
  const transport = assertRequiredString(value ?? "manual_paste", "transport");
  if (!MANUAL_HANDOFF_TRANSPORT.includes(transport)) {
    throw new Error(`Unsupported CB-05 transport: ${transport}`);
  }
  return transport;
}

function normalizeProvider(value) {
  return assertRequiredString(value, "provider").toLowerCase();
}

function validateTargetProvider(pkg, provider) {
  const configured = Array.isArray(pkg.target?.platforms)
    ? pkg.target.platforms.map((value) => String(value).toLowerCase())
    : [];
  if ((pkg.target?.mode === "single" || pkg.target?.mode === "roundtable") &&
      configured.length > 0 &&
      !configured.includes(provider)) {
    throw new Error(`Provider is outside the approved ContextPackage target: ${provider}`);
  }
}

function metadataFromRendering(pkg, view, rendering) {
  return {
    package_id: pkg.id,
    package_revision: pkg.revision,
    transfer_view_id: view.id,
    rendering_id: rendering.id,
    provider: rendering.provider,
    profile: rendering.profile,
    semantic_fingerprint: `${rendering.semantic_fingerprint.algorithm}:${rendering.semantic_fingerprint.value}`
  };
}

function assertOutboundSourceReady(pkg, view, rendering) {
  assertContextPackageTransferReady(pkg);
  assertRedactedTransferViewReady(view, pkg);
  assertRenderedContextIntegrity(rendering, pkg, view);
  validateTargetProvider(pkg, normalizeProvider(rendering.provider));
  return true;
}

export function assertHandoffReceiptBoundToRendering(receipt, rendering) {
  if (!receipt || typeof receipt !== "object") throw new TypeError("Handoff receipt is required");
  if (receipt.boundary_version !== OUTBOUND_HANDOFF_BOUNDARY_VERSION) {
    throw new Error("Handoff receipt was not produced by CB-05");
  }
  if (receipt.status !== "handoff_confirmed" || receipt.delivery_status !== "unverified") {
    throw new Error("Handoff receipt is not a confirmed manual handoff record");
  }
  if (receipt.rendering_id !== rendering?.id ||
      receipt.package_id !== rendering?.package_id ||
      receipt.package_revision !== rendering?.package_revision ||
      receipt.transfer_view_id !== rendering?.transfer_view_id ||
      receipt.provider !== rendering?.provider ||
      receipt.semantic_fingerprint?.algorithm !== rendering?.semantic_fingerprint?.algorithm ||
      receipt.semantic_fingerprint?.value !== rendering?.semantic_fingerprint?.value) {
    throw new Error("Handoff receipt does not match the rendered context");
  }
  return true;
}

export function assertRoundtableTransferReceiptsEquivalent(receipts) {
  if (!Array.isArray(receipts) || receipts.length < 2) {
    throw new TypeError("At least two handoff receipts are required for Roundtable equivalence");
  }
  const [first, ...rest] = receipts;
  const providers = new Set([first.provider]);
  for (const receipt of rest) {
    if (providers.has(receipt.provider)) {
      throw new Error(`Duplicate Roundtable provider receipt: ${receipt.provider}`);
    }
    providers.add(receipt.provider);
    if (receipt.package_id !== first.package_id ||
        receipt.package_revision !== first.package_revision ||
        receipt.transfer_view_id !== first.transfer_view_id ||
        receipt.semantic_fingerprint?.algorithm !== first.semantic_fingerprint?.algorithm ||
        receipt.semantic_fingerprint?.value !== first.semantic_fingerprint?.value) {
      throw new Error("Roundtable handoff receipts do not share the same approved context source");
    }
  }
  return true;
}

export class OutboundHandoffBoundary {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async recordAttempt(pkg, view, rendering, {
    actor = { type: "system" },
    transport = "manual_paste",
    destination_label = null
  } = {}) {
    assertOutboundSourceReady(pkg, view, rendering);
    const normalizedTransport = normalizeTransport(transport);
    const timestamp = nowIso(this.clock);
    const attempt = {
      schema_version: "0.1",
      boundary_version: OUTBOUND_HANDOFF_BOUNDARY_VERSION,
      id: makeId("handoff_attempt"),
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      rendering_id: rendering.id,
      provider: rendering.provider,
      profile: rendering.profile,
      semantic_fingerprint: deepClone(rendering.semantic_fingerprint),
      transport: normalizedTransport,
      destination_label: destination_label == null ? null : String(destination_label),
      status: "attempted_not_confirmed",
      authority: "no_delivery_claim",
      created_at: timestamp
    };

    await this.adapter.set(`${ATTEMPT_PREFIX}${attempt.id}`, attempt);
    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "transfer_attempt",
      actor,
      entity_type: "handoff_attempt",
      entity_id: attempt.id,
      metadata: {
        ...metadataFromRendering(pkg, view, rendering),
        transport: normalizedTransport,
        destination_label: attempt.destination_label,
        delivery_claim: "none"
      }
    });
    return deepClone(attempt);
  }

  async confirmManualHandoff(pkg, view, rendering, {
    actor,
    transport = "manual_paste",
    destination_label = null,
    attempt_id = null,
    reason = null
  } = {}) {
    requireHuman(actor);
    assertOutboundSourceReady(pkg, view, rendering);
    const normalizedTransport = normalizeTransport(transport);

    let attempt = null;
    if (attempt_id != null) {
      attempt = await this.getAttempt(attempt_id);
      if (!attempt) throw new Error(`Handoff attempt not found: ${attempt_id}`);
      if (attempt.rendering_id !== rendering.id ||
          attempt.package_id !== pkg.id ||
          attempt.package_revision !== pkg.revision ||
          attempt.transfer_view_id !== view.id ||
          attempt.provider !== rendering.provider ||
          attempt.transport !== normalizedTransport) {
        throw new Error("Handoff attempt does not match the current rendered context");
      }
    }

    const timestamp = nowIso(this.clock);
    const receipt = {
      schema_version: "0.1",
      boundary_version: OUTBOUND_HANDOFF_BOUNDARY_VERSION,
      id: makeId("handoff_receipt"),
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      rendering_id: rendering.id,
      attempt_id: attempt?.id ?? null,
      provider: rendering.provider,
      profile: rendering.profile,
      semantic_fingerprint: deepClone(rendering.semantic_fingerprint),
      transport: normalizedTransport,
      destination_label: destination_label == null
        ? attempt?.destination_label ?? null
        : String(destination_label),
      status: "handoff_confirmed",
      delivery_status: "unverified",
      authority: "human_confirmed_outbound_handoff",
      confirmed_at: timestamp,
      confirmed_by: actorIdentity(actor),
      reason: reason ?? null,
      created_at: timestamp
    };

    await this.adapter.set(`${RECEIPT_PREFIX}${receipt.id}`, receipt);
    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "transfer_approved",
      actor,
      entity_type: "handoff_receipt",
      entity_id: receipt.id,
      reason,
      metadata: {
        ...metadataFromRendering(pkg, view, rendering),
        attempt_id: receipt.attempt_id,
        transport: normalizedTransport,
        destination_label: receipt.destination_label,
        handoff_confirmed_by: receipt.confirmed_by,
        delivery_status: "unverified"
      }
    });
    return deepClone(receipt);
  }

  async confirmRoundtableHandoff(pkg, view, roundtable, {
    actor,
    transport = "manual_paste",
    destination_labels = {},
    reason = null
  } = {}) {
    requireHuman(actor);
    assertContextPackageTransferReady(pkg);
    assertRedactedTransferViewReady(view, pkg);
    if (!roundtable || roundtable.mode !== "roundtable" || !Array.isArray(roundtable.renderings)) {
      throw new TypeError("CB-04 Roundtable rendering is required");
    }
    if (roundtable.package_id !== pkg.id ||
        roundtable.package_revision !== pkg.revision ||
        roundtable.transfer_view_id !== view.id) {
      throw new Error("Roundtable rendering does not match the current approved transfer source");
    }
    assertRenderedContextEquivalent(roundtable.renderings);
    for (const rendering of roundtable.renderings) {
      assertOutboundSourceReady(pkg, view, rendering);
    }

    const receipts = [];
    for (const rendering of roundtable.renderings) {
      receipts.push(await this.confirmManualHandoff(pkg, view, rendering, {
        actor,
        transport,
        destination_label: destination_labels?.[rendering.provider] ?? null,
        reason
      }));
    }
    assertRoundtableTransferReceiptsEquivalent(receipts);

    return {
      schema_version: "0.1",
      boundary_version: OUTBOUND_HANDOFF_BOUNDARY_VERSION,
      id: makeId("handoff_batch"),
      mode: "roundtable",
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      semantic_fingerprint: deepClone(receipts[0].semantic_fingerprint),
      providers: receipts.map((receipt) => receipt.provider),
      receipt_ids: receipts.map((receipt) => receipt.id),
      status: "handoff_confirmed",
      delivery_status: "unverified",
      confirmed_at: nowIso(this.clock),
      confirmed_by: actorIdentity(actor)
    };
  }

  async getAttempt(id) {
    assertRequiredString(id, "handoff attempt id");
    return deepClone(await this.adapter.get(`${ATTEMPT_PREFIX}${id}`));
  }

  async getReceipt(id) {
    assertRequiredString(id, "handoff receipt id");
    return deepClone(await this.adapter.get(`${RECEIPT_PREFIX}${id}`));
  }

  async listReceiptsByProject(project_id) {
    assertRequiredString(project_id, "project_id");
    const rows = (await this.adapter.entries(RECEIPT_PREFIX)).map(([, value]) => value);
    return rows
      .filter((receipt) => receipt.project_id === project_id)
      .sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at))
      .map(deepClone);
  }
}
