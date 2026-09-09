import {
  CONTEXT_PACKAGE_HUMAN_GATE_STATE,
  CONTEXT_PACKAGE_TARGET_MODE,
  SCHEMA_VERSION,
  assertOneOf,
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import {
  evaluateTransfer,
  isReviewDue,
  normalizeTransferPolicy
} from "./governance.mjs";
import {
  assertContextPackageTransition,
  transitionContextPackage
} from "./context-package-state-machine.mjs";

const PREFIX = "context-package:";
const CONTEXT_ITEM_PREFIX = "context-item:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: this operation may only be confirmed by a human actor");
  }
}

function actorIdentity(actor) {
  return actor?.id ?? actor?.name ?? "human";
}

function normalizePlatforms(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("target.platforms must be an array");
  return [...new Set(value.map((entry) => assertRequiredString(entry, "target platform")))];
}

export function normalizeContextPackageTarget(target = {}, source_project_id) {
  const mode = target.mode || "generic";
  assertOneOf(mode, CONTEXT_PACKAGE_TARGET_MODE, "target.mode");

  const project_id = assertRequiredString(
    target.project_id ?? source_project_id,
    "target.project_id"
  );
  const platforms = normalizePlatforms(target.platforms);

  if (mode === "single" && platforms.length !== 1) {
    throw new Error("single target mode requires exactly one platform");
  }
  if (mode === "roundtable" && platforms.length < 2) {
    throw new Error("roundtable target mode requires at least two platforms");
  }

  return { mode, project_id, platforms };
}

function normalizeExcludedItems(items = []) {
  if (!Array.isArray(items)) throw new TypeError("excluded_items must be an array");
  const seen = new Set();
  return items.map((entry) => {
    const context_item_id = assertRequiredString(
      typeof entry === "string" ? entry : entry?.context_item_id,
      "excluded context_item_id"
    );
    if (seen.has(context_item_id)) {
      throw new Error(`Duplicate excluded ContextItem: ${context_item_id}`);
    }
    seen.add(context_item_id);
    return {
      context_item_id,
      reason: typeof entry === "string" ? null : entry?.reason ?? null
    };
  });
}

function assertItemEligibleForSnapshot(item, { package_project_id, target_project_id }) {
  if (!item || typeof item !== "object") throw new TypeError("ContextItem is required");
  assertRequiredString(item.id, "ContextItem id");
  assertRequiredString(item.project_id, "ContextItem project_id");
  assertRequiredString(item.content, "ContextItem content");
  assertRequiredString(item.kind, "ContextItem kind");

  if (item.project_id !== package_project_id) {
    throw new Error("ContextPackage v0.1 may contain ContextItems from only one source Project");
  }
  if (item.status !== "approved" || item.human_review?.state !== "approved") {
    throw new Error(`ContextItem is not Human-approved: ${item.id}`);
  }

  const policy = normalizeTransferPolicy(item.transfer_policy || "manual_only");
  if (policy === "deny") {
    throw new Error(`ContextItem transfer is denied by policy: ${item.id}`);
  }
  if (policy === "project_only" && target_project_id !== item.project_id) {
    throw new Error(`ContextItem is restricted to its Project: ${item.id}`);
  }
}

function snapshotItem(item, { package_project_id, target_project_id, snapshot_at }) {
  assertItemEligibleForSnapshot(item, { package_project_id, target_project_id });
  return {
    context_item_id: item.id,
    project_id: item.project_id,
    content: item.content,
    kind: item.kind,
    source: deepClone(item.source),
    provenance: deepClone(item.provenance),
    memory_policy: item.memory_policy ?? null,
    transfer_policy: item.transfer_policy,
    freshness: deepClone(item.freshness),
    human_review: {
      state: item.human_review.state,
      approved_at: item.human_review.approved_at ?? null,
      approved_by: item.human_review.approved_by ?? null
    },
    source_updated_at: item.updated_at ?? null,
    snapshot_at
  };
}

function snapshotItems(items, options) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const seen = new Set();
  return items.map((item) => {
    if (seen.has(item?.id)) throw new Error(`Duplicate ContextItem in package: ${item?.id}`);
    seen.add(item?.id);
    return snapshotItem(item, options);
  });
}

function emptyHumanGate() {
  return {
    required: true,
    state: "pending",
    approved_revision: null,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    revoked_at: null,
    revoked_by: null,
    reason: null
  };
}

export function assertContextPackageTransferReady(pkg) {
  if (!pkg || typeof pkg !== "object") throw new TypeError("ContextPackage is required");
  if (pkg.status !== "approved") {
    throw new Error("ContextPackage is not approved for transfer");
  }
  if (pkg.human_gate?.state !== "approved") {
    throw new Error("ContextPackage Human Gate has not been approved");
  }
  if (pkg.human_gate?.approved_revision !== pkg.revision) {
    throw new Error("ContextPackage approval does not match the current revision");
  }
  if (!Array.isArray(pkg.items) || pkg.items.length === 0) {
    throw new Error("ContextPackage contains no ContextItems");
  }
  return true;
}

export class ContextPackageStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async create({
    project_id,
    purpose,
    target = {},
    items = [],
    excluded_items = []
  }, { actor = { type: "system" } } = {}) {
    const sourceProjectId = assertRequiredString(project_id, "project_id");
    const normalizedTarget = normalizeContextPackageTarget(target, sourceProjectId);
    const timestamp = nowIso(this.clock);

    const pkg = {
      schema_version: SCHEMA_VERSION,
      id: makeId("cp"),
      project_id: sourceProjectId,
      revision: 1,
      purpose: assertRequiredString(purpose, "purpose"),
      target: normalizedTarget,
      items: snapshotItems(items, {
        package_project_id: sourceProjectId,
        target_project_id: normalizedTarget.project_id,
        snapshot_at: timestamp
      }),
      excluded_items: normalizeExcludedItems(excluded_items),
      status: "draft",
      human_gate: emptyHumanGate(),
      provenance: {
        created_by: "context_bridge",
        source: "human_agency_core",
        actor: deepClone(actor)
      },
      created_at: timestamp,
      updated_at: timestamp
    };

    await this.adapter.set(`${PREFIX}${pkg.id}`, pkg);
    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "create",
      actor,
      entity_type: "context_package",
      entity_id: pkg.id,
      after: pkg
    });
    return deepClone(pkg);
  }

  async get(id) {
    assertRequiredString(id, "ContextPackage id");
    return deepClone(await this.adapter.get(`${PREFIX}${id}`));
  }

  async listByProject(project_id, { statuses = null } = {}) {
    assertRequiredString(project_id, "project_id");
    const rows = (await this.adapter.entries(PREFIX)).map(([, value]) => value);
    return rows
      .filter((pkg) => pkg.project_id === project_id)
      .filter((pkg) => !statuses || statuses.includes(pkg.status))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(deepClone);
  }

  async submitForReview(id, { actor = { type: "system" }, reason = null } = {}) {
    const before = await this.#requirePackage(id);
    if (before.status !== "draft") {
      assertContextPackageTransition(before.status, "pending_review");
    }
    if (!before.items.length) throw new Error("Cannot submit an empty ContextPackage for review");
    await this.#assertSnapshotsStillCurrent(before);

    const after = transitionContextPackage(before, "pending_review", { clock: this.clock });
    after.human_gate = emptyHumanGate();
    await this.#saveAndAudit(before, after, {
      action: "submit_review",
      actor,
      reason
    });
    return deepClone(after);
  }

  async approve(id, {
    actor,
    reason = null,
    acknowledged_review_due_item_ids = []
  } = {}) {
    requireHuman(actor);
    const before = await this.#requirePackage(id);
    if (before.status !== "pending_review") {
      assertContextPackageTransition(before.status, "approved");
    }

    const acknowledged = new Set(acknowledged_review_due_item_ids || []);
    await this.#validateForHumanApproval(before, acknowledged);

    const after = transitionContextPackage(before, "approved", { clock: this.clock });
    const approvedAt = nowIso(this.clock);
    after.human_gate = {
      ...emptyHumanGate(),
      state: "approved",
      approved_revision: after.revision,
      approved_at: approvedAt,
      approved_by: actorIdentity(actor),
      reason
    };
    assertOneOf(after.human_gate.state, CONTEXT_PACKAGE_HUMAN_GATE_STATE, "human_gate.state");

    await this.#saveAndAudit(before, after, {
      action: "approve",
      actor,
      reason,
      metadata: {
        acknowledged_review_due_item_ids: [...acknowledged]
      }
    });
    return deepClone(after);
  }

  async reject(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    const before = await this.#requirePackage(id);
    if (before.status !== "pending_review") {
      assertContextPackageTransition(before.status, "rejected");
    }
    const after = transitionContextPackage(before, "rejected", { clock: this.clock });
    after.human_gate = {
      ...emptyHumanGate(),
      state: "rejected",
      rejected_at: nowIso(this.clock),
      rejected_by: actorIdentity(actor),
      reason
    };
    await this.#saveAndAudit(before, after, { action: "reject", actor, reason });
    return deepClone(after);
  }

  async revokeApproval(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    const before = await this.#requirePackage(id);
    if (before.status !== "approved") {
      assertContextPackageTransition(before.status, "revoked");
    }
    const after = transitionContextPackage(before, "revoked", { clock: this.clock });
    after.human_gate = {
      ...before.human_gate,
      state: "revoked",
      revoked_at: nowIso(this.clock),
      revoked_by: actorIdentity(actor),
      reason
    };
    await this.#saveAndAudit(before, after, {
      action: "revoke_approval",
      actor,
      reason
    });
    return deepClone(after);
  }

  async revise(id, patch = {}, { actor = { type: "system" }, reason = null } = {}) {
    const before = await this.#requirePackage(id);
    if (before.status === "archived") {
      throw new Error("Archived ContextPackages are immutable in v0.1");
    }
    if (before.status === "approved") requireHuman(actor);

    const after = deepClone(before);
    if (patch.purpose != null) after.purpose = assertRequiredString(patch.purpose, "purpose");

    const targetChanged = patch.target != null;
    if (targetChanged) {
      after.target = normalizeContextPackageTarget(patch.target, before.project_id);
    }

    const timestamp = nowIso(this.clock);
    if (patch.items != null) {
      after.items = snapshotItems(patch.items, {
        package_project_id: before.project_id,
        target_project_id: after.target.project_id,
        snapshot_at: timestamp
      });
    } else if (targetChanged) {
      const liveItems = await this.#loadLiveItems(before.items);
      after.items = snapshotItems(liveItems, {
        package_project_id: before.project_id,
        target_project_id: after.target.project_id,
        snapshot_at: timestamp
      });
    }

    if (patch.excluded_items != null) {
      after.excluded_items = normalizeExcludedItems(patch.excluded_items);
    }

    if (before.status !== "draft") assertContextPackageTransition(before.status, "draft");
    after.status = "draft";
    after.revision = before.revision + 1;
    after.human_gate = emptyHumanGate();
    after.updated_at = timestamp;

    await this.#saveAndAudit(before, after, { action: "update", actor, reason });
    return deepClone(after);
  }

  async archive(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    const before = await this.#requirePackage(id);
    const after = transitionContextPackage(before, "archived", { clock: this.clock });
    await this.#saveAndAudit(before, after, { action: "archive", actor, reason });
    return deepClone(after);
  }

  async #requirePackage(id) {
    const pkg = await this.get(id);
    if (!pkg) throw new Error(`ContextPackage not found: ${id}`);
    return pkg;
  }

  async #loadLiveItems(snapshots) {
    const items = [];
    for (const snapshot of snapshots) {
      const live = await this.adapter.get(`${CONTEXT_ITEM_PREFIX}${snapshot.context_item_id}`);
      if (!live) throw new Error(`Source ContextItem not found: ${snapshot.context_item_id}`);
      items.push(live);
    }
    return items;
  }

  async #assertSnapshotsStillCurrent(pkg) {
    for (const snapshot of pkg.items) {
      const live = await this.adapter.get(`${CONTEXT_ITEM_PREFIX}${snapshot.context_item_id}`);
      if (!live) throw new Error(`Source ContextItem not found: ${snapshot.context_item_id}`);
      if (live.updated_at !== snapshot.source_updated_at) {
        throw new Error(`Source ContextItem changed after package snapshot: ${snapshot.context_item_id}`);
      }
      assertItemEligibleForSnapshot(live, {
        package_project_id: pkg.project_id,
        target_project_id: pkg.target.project_id
      });
    }
  }

  async #validateForHumanApproval(pkg, acknowledgedReviewDueIds) {
    await this.#assertSnapshotsStillCurrent(pkg);

    for (const snapshot of pkg.items) {
      const live = await this.adapter.get(`${CONTEXT_ITEM_PREFIX}${snapshot.context_item_id}`);
      const transfer = evaluateTransfer(live, {
        target_project_id: pkg.target.project_id,
        human_confirmed: true
      });
      if (!transfer.allowed) {
        throw new Error(
          `ContextItem is not transferable: ${snapshot.context_item_id} (${transfer.reason})`
        );
      }
      if (isReviewDue(live, { now: this.clock() }) && !acknowledgedReviewDueIds.has(live.id)) {
        throw new Error(`Freshness acknowledgment required for ContextItem: ${live.id}`);
      }
    }
  }

  async #saveAndAudit(before, after, {
    action,
    actor,
    reason = null,
    metadata = null
  }) {
    await this.adapter.set(`${PREFIX}${after.id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action,
      actor,
      entity_type: "context_package",
      entity_id: after.id,
      before,
      after,
      reason,
      metadata
    });
  }
}
