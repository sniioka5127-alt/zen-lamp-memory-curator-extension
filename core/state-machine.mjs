import { ENTITY_STATUS, assertOneOf } from "./types.mjs";

// Updates are revisions recorded in the Audit Log, not a separate status.
// This keeps status semantic and prevents "updated" from being confused
// with human approval.
export const ENTITY_TRANSITIONS = Object.freeze({
  proposed: Object.freeze(["approved", "rejected", "needs_review", "archived"]),
  needs_review: Object.freeze(["approved", "rejected", "archived"]),
  approved: Object.freeze(["needs_review", "stale", "archived"]),
  stale: Object.freeze(["needs_review", "approved", "archived"]),
  rejected: Object.freeze(["needs_review", "archived"]),
  archived: Object.freeze([])
});

export function canTransition(from, to) {
  assertOneOf(from, ENTITY_STATUS, "from status");
  assertOneOf(to, ENTITY_STATUS, "to status");
  return ENTITY_TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal Human Agency state transition: ${from} -> ${to}`);
  }
  return true;
}

export function transitionEntity(entity, to, { clock = () => new Date() } = {}) {
  if (!entity || typeof entity !== "object") throw new TypeError("entity is required");
  assertTransition(entity.status, to);
  return {
    ...entity,
    status: to,
    updated_at: clock().toISOString()
  };
}
