// HIRAKU Tools — Human Agency Core v0.1
// Runtime-neutral reference types and helpers.

export const SCHEMA_VERSION = "0.1";

export const ENTITY_STATUS = Object.freeze([
  "proposed",
  "approved",
  "rejected",
  "needs_review",
  "stale",
  "archived"
]);

export const PROJECT_STATUS = Object.freeze([
  "active",
  "paused",
  "completed",
  "archived"
]);

export const CONTEXT_KIND = Object.freeze([
  "fact",
  "decision",
  "constraint",
  "project_context",
  "style_anchor",
  "discovery",
  "question",
  "hypothesis",
  "temporary",
  "avoid",
  "evidence_reference"
]);

export const ACTOR_TYPE = Object.freeze([
  "human",
  "ai",
  "document",
  "system",
  "unknown"
]);

export const MEMORY_POLICY = Object.freeze([
  "keep",
  "temporary",
  "review",
  "drop"
]);

export const TRANSFER_POLICY = Object.freeze([
  "allow",
  "project_only",
  "manual_only",
  "deny"
]);

export const FRESHNESS_STATE = Object.freeze([
  "current",
  "review_due",
  "stale",
  "not_applicable"
]);

export const HUMAN_REVIEW_STATE = Object.freeze([
  "pending",
  "approved",
  "rejected"
]);

// ContextPackage has its own lifecycle because package approval must bind to
// an exact package revision. It must not reuse ContextItem ENTITY_STATUS.
export const CONTEXT_PACKAGE_STATUS = Object.freeze([
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "revoked",
  "archived"
]);

export const CONTEXT_PACKAGE_HUMAN_GATE_STATE = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "revoked"
]);

export const CONTEXT_PACKAGE_TARGET_MODE = Object.freeze([
  "generic",
  "single",
  "roundtable"
]);

export const AUDIT_ACTION = Object.freeze([
  "create",
  "update",
  "approve",
  "reject",
  "mark_needs_review",
  "mark_stale",
  "archive",
  "policy_change",
  "submit_review",
  "revoke_approval",
  "redaction_plan_created",
  "redaction_view_approved",
  "redaction_view_revoked",
  "context_rendered",
  "transfer_attempt",
  "transfer_approved",
  "transfer_denied",
  "roundtable_input_prepared",
  "roundtable_response_captured",
  "roundtable_responses_compared"
]);

export function assertRequiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function assertOneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

export function makeId(prefix = "id") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
