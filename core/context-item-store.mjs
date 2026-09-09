import {
  CONTEXT_KIND,
  HUMAN_REVIEW_STATE,
  MEMORY_POLICY,
  SCHEMA_VERSION,
  TRANSFER_POLICY,
  assertOneOf,
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { transitionEntity } from "./state-machine.mjs";
import {
  normalizeFreshness,
  normalizeMemoryPolicy,
  normalizeProvenance,
  normalizeSource,
  normalizeTransferPolicy
} from "./governance.mjs";

const PREFIX = "context-item:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: this operation may only be confirmed by a human actor");
  }
}

export class ContextItemStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async create({
    project_id,
    content,
    kind,
    source = {},
    provenance = {},
    memory_policy = "review",
    transfer_policy = "manual_only",
    freshness = {}
  }, { actor = { type: "system" } } = {}) {
    assertRequiredString(project_id, "project_id");
    assertRequiredString(content, "content");
    assertOneOf(kind, CONTEXT_KIND, "kind");

    const timestamp = nowIso(this.clock);
    const item = {
      schema_version: SCHEMA_VERSION,
      id: makeId("ctx"),
      project_id,
      content: content.trim(),
      kind,
      status: "proposed",
      source: normalizeSource(source),
      provenance: normalizeProvenance(provenance),
      memory_policy: normalizeMemoryPolicy(memory_policy),
      transfer_policy: normalizeTransferPolicy(transfer_policy),
      freshness: normalizeFreshness(freshness),
      human_review: {
        required: true,
        state: "pending",
        approved_at: null,
        approved_by: null
      },
      created_at: timestamp,
      updated_at: timestamp
    };

    await this.adapter.set(`${PREFIX}${item.id}`, item);
    await this.auditLog?.append({
      project_id,
      action: "create",
      actor,
      entity_type: "context_item",
      entity_id: item.id,
      after: item
    });
    return deepClone(item);
  }

  async get(id) {
    assertRequiredString(id, "context item id");
    return deepClone(await this.adapter.get(`${PREFIX}${id}`));
  }

  async listByProject(project_id, { statuses = null, kinds = null } = {}) {
    assertRequiredString(project_id, "project_id");
    const rows = (await this.adapter.entries(PREFIX)).map(([, value]) => value);
    return rows
      .filter((item) => item.project_id === project_id)
      .filter((item) => !statuses || statuses.includes(item.status))
      .filter((item) => !kinds || kinds.includes(item.kind))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(deepClone);
  }

  async approve(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    return this.#transition(id, "approved", {
      actor,
      action: "approve",
      reason,
      reviewPatch: {
        state: "approved",
        approved_at: nowIso(this.clock),
        approved_by: actor?.id ?? actor?.name ?? "human"
      }
    });
  }

  async reject(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    return this.#transition(id, "rejected", {
      actor,
      action: "reject",
      reason,
      reviewPatch: { state: "rejected", approved_at: null, approved_by: null }
    });
  }

  async markNeedsReview(id, { actor = { type: "system" }, reason = null } = {}) {
    return this.#transition(id, "needs_review", {
      actor,
      action: "mark_needs_review",
      reason,
      reviewPatch: { state: "pending", approved_at: null, approved_by: null }
    });
  }

  async markStale(id, { actor = { type: "system" }, reason = null } = {}) {
    const item = await this.get(id);
    if (!item) throw new Error(`ContextItem not found: ${id}`);
    if (item.status !== "approved") {
      throw new Error("Only approved ContextItems may be marked stale in v0.1");
    }
    const before = item;
    const after = transitionEntity(before, "stale", { clock: this.clock });
    after.freshness = { ...after.freshness, state: "stale", reason: reason ?? after.freshness.reason };
    after.human_review = { ...after.human_review, state: "pending", approved_at: null, approved_by: null };
    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action: "mark_stale",
      actor,
      entity_type: "context_item",
      entity_id: id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }

  async archive(id, { actor = { type: "human" }, reason = null } = {}) {
    return this.#transition(id, "archived", {
      actor,
      action: "archive",
      reason
    });
  }

  async revise(id, patch, { actor = { type: "human" }, reason = null } = {}) {
    const before = await this.get(id);
    if (!before) throw new Error(`ContextItem not found: ${id}`);
    if (before.status === "archived") throw new Error("Archived ContextItems are immutable in v0.1");

    const after = deepClone(before);
    if (patch?.content != null) after.content = assertRequiredString(patch.content, "content");
    if (patch?.kind != null) after.kind = assertOneOf(patch.kind, CONTEXT_KIND, "kind");
    if (patch?.source != null) after.source = normalizeSource(patch.source);
    if (patch?.provenance != null) after.provenance = normalizeProvenance(patch.provenance);
    if (patch?.freshness != null) after.freshness = normalizeFreshness(patch.freshness);

    if (["approved", "stale"].includes(before.status)) {
      after.status = "needs_review";
      after.human_review = { ...after.human_review, state: "pending", approved_at: null, approved_by: null };
    }
    after.updated_at = nowIso(this.clock);

    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action: "update",
      actor,
      entity_type: "context_item",
      entity_id: id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }

  async setMemoryPolicy(id, policy, { actor, reason = null } = {}) {
    requireHuman(actor);
    assertOneOf(policy, MEMORY_POLICY, "memory_policy");
    return this.#setPolicy(id, "memory_policy", policy, { actor, reason });
  }

  async setTransferPolicy(id, policy, { actor, reason = null } = {}) {
    requireHuman(actor);
    assertOneOf(policy, TRANSFER_POLICY, "transfer_policy");
    return this.#setPolicy(id, "transfer_policy", policy, { actor, reason });
  }

  async #setPolicy(id, field, value, { actor, reason }) {
    const before = await this.get(id);
    if (!before) throw new Error(`ContextItem not found: ${id}`);
    if (before.status === "archived") throw new Error("Archived ContextItems are immutable in v0.1");
    const after = { ...before, [field]: value, updated_at: nowIso(this.clock) };
    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action: "policy_change",
      actor,
      entity_type: "context_item",
      entity_id: id,
      before,
      after,
      reason,
      metadata: { field }
    });
    return deepClone(after);
  }

  async #transition(id, to, { actor, action, reason, reviewPatch = null }) {
    const before = await this.get(id);
    if (!before) throw new Error(`ContextItem not found: ${id}`);
    const after = transitionEntity(before, to, { clock: this.clock });
    if (reviewPatch) {
      after.human_review = {
        ...after.human_review,
        ...reviewPatch
      };
      assertOneOf(after.human_review.state, HUMAN_REVIEW_STATE, "human_review.state");
    }
    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action,
      actor,
      entity_type: "context_item",
      entity_id: id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }
}
