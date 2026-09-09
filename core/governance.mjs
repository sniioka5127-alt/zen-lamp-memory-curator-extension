import {
  ACTOR_TYPE,
  FRESHNESS_STATE,
  MEMORY_POLICY,
  TRANSFER_POLICY,
  assertOneOf,
  deepClone
} from "./types.mjs";

export function normalizeSource(source = {}) {
  const actor_type = source.actor_type || "unknown";
  assertOneOf(actor_type, ACTOR_TYPE, "source.actor_type");
  return {
    actor_type,
    actor_name: source.actor_name ?? null,
    platform: source.platform ?? null,
    model: source.model ?? null,
    conversation_id: source.conversation_id ?? null,
    document_id: source.document_id ?? null,
    timestamp: source.timestamp ?? null
  };
}

export function normalizeProvenance(provenance = {}) {
  return {
    original_text: provenance.original_text ?? null,
    derived: Boolean(provenance.derived),
    derived_by: provenance.derived_by ?? null,
    source_refs: Array.isArray(provenance.source_refs)
      ? [...provenance.source_refs]
      : []
  };
}

export function normalizeMemoryPolicy(value = "review") {
  return assertOneOf(value, MEMORY_POLICY, "memory_policy");
}

export function normalizeTransferPolicy(value = "manual_only") {
  return assertOneOf(value, TRANSFER_POLICY, "transfer_policy");
}

export function normalizeFreshness(freshness = {}) {
  const state = freshness.state || "current";
  assertOneOf(state, FRESHNESS_STATE, "freshness.state");
  return {
    state,
    review_after: freshness.review_after ?? null,
    reason: freshness.reason ?? null
  };
}

export function isReviewDue(item, { now = new Date() } = {}) {
  const freshness = normalizeFreshness(item?.freshness || {});
  if (freshness.state === "review_due" || freshness.state === "stale") return true;
  if (!freshness.review_after) return false;
  const reviewAt = new Date(freshness.review_after);
  return Number.isFinite(reviewAt.getTime()) && reviewAt.getTime() <= now.getTime();
}

export function evaluateTransfer(item, {
  target_project_id = null,
  human_confirmed = false
} = {}) {
  const policy = normalizeTransferPolicy(item?.transfer_policy || "manual_only");

  if (item?.status !== "approved") {
    return { allowed: false, reason: "item_not_human_approved" };
  }
  if (item?.human_review?.state !== "approved") {
    return { allowed: false, reason: "human_gate_not_passed" };
  }
  if (policy === "deny") return { allowed: false, reason: "transfer_denied_by_policy" };
  if (policy === "project_only" && target_project_id !== item.project_id) {
    return { allowed: false, reason: "outside_project_scope" };
  }
  if (policy === "manual_only" && !human_confirmed) {
    return { allowed: false, reason: "manual_confirmation_required" };
  }
  return { allowed: true, reason: "allowed" };
}

export function snapshotGovernance(item) {
  return deepClone({
    source: item.source,
    provenance: item.provenance,
    memory_policy: item.memory_policy,
    transfer_policy: item.transfer_policy,
    freshness: item.freshness,
    human_review: item.human_review
  });
}
